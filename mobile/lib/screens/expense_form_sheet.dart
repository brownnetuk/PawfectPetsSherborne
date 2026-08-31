import 'dart:convert';
import 'dart:io';
import 'package:cunning_document_scanner/cunning_document_scanner.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image/image.dart' as img;
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/expense.dart';

/// Downscales a receipt image to at most 1600px wide and re-encodes it as
/// JPEG (quality 70), keeping the base64 payload small. Runs in a background
/// isolate via `compute`. Falls back to the original bytes if decoding fails.
Uint8List _compressReceipt(Uint8List input) {
  final decoded = img.decodeImage(input);
  if (decoded == null) return input;
  final resized = decoded.width > 1600 ? img.copyResize(decoded, width: 1600) : decoded;
  return Uint8List.fromList(img.encodeJpg(resized, quality: 70));
}

/// Bottom sheet for creating or editing an expense. Pops `true` on save.
/// When [expense] is set it edits that expense (PATCH); else it creates one.
class ExpenseFormSheet extends StatefulWidget {
  final Expense? expense;
  const ExpenseFormSheet({super.key, this.expense});

  bool get isEditing => expense != null;

  @override
  State<ExpenseFormSheet> createState() => _ExpenseFormSheetState();
}

class _ExpenseFormSheetState extends State<ExpenseFormSheet> {
  final _descriptionController = TextEditingController();
  final _amountController = TextEditingController();
  DateTime _date = DateTime.now();
  ExpenseCategory? _category;
  Vendor? _payee;
  BankAccountRef? _account;
  String? _receipt;
  bool _submitting = false;
  late Future<(List<ExpenseCategory>, List<Vendor>, List<BankAccountRef>)> _lookups;

  @override
  void initState() {
    super.initState();
    final e = widget.expense;
    if (e != null) {
      _descriptionController.text = e.description;
      _amountController.text = e.amount.toStringAsFixed(2);
      _date = e.date;
      _receipt = e.receipt;
    }
    final repo = context.read<Repository>();
    _lookups = () async {
      final categories = await repo.listExpenseCategories();
      final vendors = await repo.listVendors();
      final accounts = await repo.listBankAccounts();
      return (categories, vendors, accounts);
    }();
    // Pre-select the dropdowns for edit mode once the lookups have loaded.
    _lookups.then((data) {
      if (!mounted || e == null) return;
      final (categories, vendors, accounts) = data;
      setState(() {
        for (final c in categories) {
          if (c.name == e.category) _category = c;
        }
        if (e.payee != null) {
          for (final v in vendors) {
            if (v.name == e.payee) _payee = v;
          }
        }
        for (final a in accounts) {
          if (a.id == e.accountId || a.name == e.accountName) _account = a;
        }
      });
    }).catchError((_) {});
  }

  @override
  void dispose() {
    _descriptionController.dispose();
    _amountController.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
    );
    if (picked != null) setState(() => _date = picked);
  }

  void _setReceiptFromBytes(List<int> bytes) {
    setState(() => _receipt = 'data:image/jpeg;base64,${base64Encode(bytes)}');
  }

  Future<void> _scanReceipt() async {
    try {
      final paths = await CunningDocumentScanner.getPictures();
      if (paths != null && paths.isNotEmpty) {
        // The scanner returns a full-resolution image; downscale/re-encode it
        // (off the UI thread) so the base64 payload stays well under the API's
        // body-size limit — the same shrinking image_picker does for us above.
        final raw = await File(paths.first).readAsBytes();
        final compressed = await compute(_compressReceipt, raw);
        _setReceiptFromBytes(compressed);
      }
    } catch (e) {
      _snack('Could not scan the document.');
    }
  }

  Future<void> _pickImage(ImageSource source) async {
    try {
      final file = await ImagePicker().pickImage(source: source, imageQuality: 70, maxWidth: 1600);
      if (file != null) _setReceiptFromBytes(await file.readAsBytes());
    } catch (e) {
      _snack('Could not attach the image.');
    }
  }

  void _snack(String m) {
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }

  Future<void> _submit() async {
    final amount = double.tryParse(_amountController.text.trim());
    if (_category == null) {
      _snack('Choose a category.');
      return;
    }
    if (_descriptionController.text.trim().isEmpty) {
      _snack('Enter a description.');
      return;
    }
    if (amount == null || amount <= 0) {
      _snack('Enter a valid amount.');
      return;
    }
    setState(() => _submitting = true);
    try {
      final repo = context.read<Repository>();
      if (widget.isEditing) {
        await repo.updateExpense(widget.expense!.id, {
          'date': _date.toIso8601String(),
          'category': _category!.name,
          'description': _descriptionController.text.trim(),
          'amount': amount,
          if (_payee != null) 'payee': _payee!.name,
          if (_account != null) 'account': _account!.id,
          'receipt': _receipt ?? '',
        });
      } else {
        await repo.createExpense(
          date: _date,
          category: _category!.name,
          description: _descriptionController.text.trim(),
          amount: amount,
          payee: _payee?.name,
          accountId: _account?.id,
          receipt: _receipt,
        );
      }
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      _snack(e is ApiException ? e.message : 'Failed to save expense');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final dateFmt = DateFormat('d MMM yyyy');
    return Padding(
      padding: const EdgeInsets.all(20),
      child: FutureBuilder<(List<ExpenseCategory>, List<Vendor>, List<BankAccountRef>)>(
        future: _lookups,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const SizedBox(height: 160, child: Center(child: CircularProgressIndicator()));
          }
          if (snapshot.hasError) {
            final message = snapshot.error is ApiException
                ? (snapshot.error as ApiException).message
                : 'Failed to load categories';
            return SizedBox(height: 160, child: Center(child: Text(message, textAlign: TextAlign.center)));
          }
          final (categories, vendors, accounts) = snapshot.data!;
          if (categories.isEmpty) {
            return const SizedBox(
              height: 160,
              child: Center(
                child: Text(
                  'No expense categories set up yet. Add them in the admin app first.',
                  textAlign: TextAlign.center,
                ),
              ),
            );
          }
          return SingleChildScrollView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(widget.isEditing ? 'Edit expense' : 'Record expense',
                    style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 16),
                InkWell(
                  onTap: _pickDate,
                  child: InputDecorator(
                    decoration: const InputDecoration(labelText: 'Date'),
                    child: Text(dateFmt.format(_date)),
                  ),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<ExpenseCategory>(
                  initialValue: _category,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Category'),
                  hint: const Text('Choose a category'),
                  items: categories.map((c) => DropdownMenuItem(value: c, child: Text(c.name))).toList(),
                  onChanged: (c) => setState(() => _category = c),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _descriptionController,
                  decoration: const InputDecoration(labelText: 'Description'),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<Vendor>(
                  initialValue: _payee,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Payee', hintText: 'Optional'),
                  items: [
                    const DropdownMenuItem<Vendor>(value: null, child: Text('No payee')),
                    ...vendors.map((v) => DropdownMenuItem(value: v, child: Text(v.name))),
                  ],
                  onChanged: (v) => setState(() => _payee = v),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _amountController,
                  decoration: const InputDecoration(labelText: 'Amount', prefixText: '£'),
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
                  onTapOutside: (_) => FocusManager.instance.primaryFocus?.unfocus(),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<BankAccountRef>(
                  initialValue: _account,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Paid from', hintText: 'Optional'),
                  items: [
                    const DropdownMenuItem<BankAccountRef>(value: null, child: Text('None')),
                    ...accounts.map((a) => DropdownMenuItem(value: a, child: Text(a.name))),
                  ],
                  onChanged: (a) => setState(() => _account = a),
                ),
                const SizedBox(height: 16),
                Text('Receipt',
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.grey.shade600)),
                const SizedBox(height: 8),
                if (_receipt != null && _receipt!.isNotEmpty)
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: Image.memory(
                          base64Decode(_receipt!.split(',').last),
                          width: 72,
                          height: 72,
                          fit: BoxFit.cover,
                        ),
                      ),
                      const SizedBox(width: 8),
                      TextButton.icon(
                        onPressed: () => setState(() => _receipt = null),
                        icon: const Icon(Icons.close, size: 18),
                        label: const Text('Remove'),
                        style: TextButton.styleFrom(foregroundColor: Colors.red.shade400),
                      ),
                    ],
                  )
                else
                  Wrap(
                    spacing: 8,
                    runSpacing: 4,
                    children: [
                      OutlinedButton.icon(
                        onPressed: _scanReceipt,
                        icon: const Icon(Icons.document_scanner_outlined, size: 18),
                        label: const Text('Scan'),
                      ),
                      OutlinedButton.icon(
                        onPressed: () => _pickImage(ImageSource.camera),
                        icon: const Icon(Icons.photo_camera_outlined, size: 18),
                        label: const Text('Camera'),
                      ),
                      OutlinedButton.icon(
                        onPressed: () => _pickImage(ImageSource.gallery),
                        icon: const Icon(Icons.photo_library_outlined, size: 18),
                        label: const Text('Library'),
                      ),
                    ],
                  ),
                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _submitting ? null : _submit,
                    child: Text(_submitting
                        ? 'Saving…'
                        : (widget.isEditing ? 'Save changes' : 'Save expense')),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

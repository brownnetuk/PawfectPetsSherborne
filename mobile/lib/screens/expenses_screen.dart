import 'dart:convert';
import 'dart:io';
import 'package:cunning_document_scanner/cunning_document_scanner.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/expense.dart';
import 'home_shell.dart';

class ExpensesScreen extends StatefulWidget {
  const ExpensesScreen({super.key});

  @override
  State<ExpensesScreen> createState() => _ExpensesScreenState();
}

class _ExpensesScreenState extends State<ExpensesScreen> {
  late Future<List<Expense>> _future;

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    _future = context.read<Repository>().listExpenses();
  }

  Future<void> _refresh() async {
    setState(_load);
    await _future;
  }

  Future<void> _createExpense() async {
    final created = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: const _CreateExpenseSheet(),
      ),
    );
    if (created == true) _refresh();
  }

  @override
  Widget build(BuildContext context) {
    final dateFmt = DateFormat('d MMM yyyy');
    final money = NumberFormat.currency(locale: 'en_GB', symbol: '£');
    return Scaffold(
      appBar: AppBar(title: const Text('Expenses'), actions: const [LogoutAction()]),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _createExpense,
        icon: const Icon(Icons.add),
        label: const Text('Create Expense'),
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: FutureBuilder<List<Expense>>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) {
              final message = snapshot.error is ApiException
                  ? (snapshot.error as ApiException).message
                  : 'Failed to load expenses';
              return ListView(
                children: [
                  const SizedBox(height: 80),
                  Center(child: Text(message, textAlign: TextAlign.center)),
                ],
              );
            }
            final expenses = snapshot.data ?? [];
            if (expenses.isEmpty) {
              return ListView(
                children: const [
                  SizedBox(height: 80),
                  Center(child: Text('No expenses yet.')),
                ],
              );
            }
            return ListView.separated(
              padding: const EdgeInsets.symmetric(vertical: 8),
              itemCount: expenses.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (context, i) {
                final e = expenses[i];
                return ListTile(
                  title: Text(e.description),
                  subtitle: Text(
                    '${e.category}${e.payee != null && e.payee!.isNotEmpty ? ' · ${e.payee}' : ''} · '
                    '${dateFmt.format(e.date)}',
                  ),
                  trailing: Text(
                    money.format(e.amount),
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }
}

class _CreateExpenseSheet extends StatefulWidget {
  const _CreateExpenseSheet();

  @override
  State<_CreateExpenseSheet> createState() => _CreateExpenseSheetState();
}

class _CreateExpenseSheetState extends State<_CreateExpenseSheet> {
  final _descriptionController = TextEditingController();
  final _amountController = TextEditingController();
  DateTime _date = DateTime.now();
  ExpenseCategory? _category;
  Vendor? _payee;
  BankAccountRef? _account;
  String? _receipt; // base64 data URI of the attached receipt image
  bool _submitting = false;
  late Future<(List<ExpenseCategory>, List<Vendor>, List<BankAccountRef>)> _lookups;

  @override
  void initState() {
    super.initState();
    final repo = context.read<Repository>();
    _lookups = () async {
      final categories = await repo.listExpenseCategories();
      final vendors = await repo.listVendors();
      final accounts = await repo.listBankAccounts();
      return (categories, vendors, accounts);
    }();
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
        _setReceiptFromBytes(await File(paths.first).readAsBytes());
      }
    } catch (e) {
      _snack('Could not scan the document.');
    }
  }

  Future<void> _pickImage(ImageSource source) async {
    try {
      final file = await ImagePicker().pickImage(
        source: source,
        imageQuality: 70,
        maxWidth: 1600,
      );
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
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Choose a category.')));
      return;
    }
    if (_descriptionController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Enter a description.')));
      return;
    }
    if (amount == null || amount <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Enter a valid amount.')));
      return;
    }
    setState(() => _submitting = true);
    try {
      await context.read<Repository>().createExpense(
            date: _date,
            category: _category!.name,
            description: _descriptionController.text.trim(),
            amount: amount,
            payee: _payee?.name,
            accountId: _account?.id,
            receipt: _receipt,
          );
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        final message = e is ApiException ? e.message : 'Failed to record expense';
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
      }
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
            child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Record expense', style: Theme.of(context).textTheme.titleMedium),
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
                items: categories
                    .map((c) => DropdownMenuItem(value: c, child: Text(c.name)))
                    .toList(),
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
              Text('Receipt', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.grey.shade600)),
              const SizedBox(height: 8),
              if (_receipt != null)
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
                  child: Text(_submitting ? 'Saving…' : 'Save expense'),
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

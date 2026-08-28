import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/bank_transfer.dart';
import '../models/expense.dart';

/// Add or edit a bank transfer between two of the business's own accounts.
/// Uses the same fields as the admin app's transfer modal: Date, Reference,
/// Source Account, Destination Account and Amount. Pops `true` when saved.
class BankTransferFormSheet extends StatefulWidget {
  final BankTransfer? transfer;
  const BankTransferFormSheet({super.key, this.transfer});

  bool get isEdit => transfer != null;

  @override
  State<BankTransferFormSheet> createState() => _BankTransferFormSheetState();
}

class _BankTransferFormSheetState extends State<BankTransferFormSheet> {
  final _referenceController = TextEditingController();
  final _amountController = TextEditingController();
  DateTime _date = DateTime.now();
  BankAccountRef? _fromAccount;
  BankAccountRef? _toAccount;
  bool _submitting = false;
  late Future<List<BankAccountRef>> _accountsFuture;

  @override
  void initState() {
    super.initState();
    final t = widget.transfer;
    if (t != null) {
      _date = t.date;
      if ((t.reference ?? '').isNotEmpty) _referenceController.text = t.reference!;
      _amountController.text = t.amount.toStringAsFixed(2);
    }
    final repo = context.read<Repository>();
    _accountsFuture = () async {
      final accounts = await repo.listBankAccounts();
      if (t != null) {
        for (final a in accounts) {
          if (a.id == t.fromAccountId) _fromAccount = a;
          if (a.id == t.toAccountId) _toAccount = a;
        }
      } else {
        if (accounts.isNotEmpty) _fromAccount = accounts.first;
        if (accounts.length > 1) _toAccount = accounts[1];
      }
      return accounts;
    }();
  }

  @override
  void dispose() {
    _referenceController.dispose();
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

  Future<void> _submit() async {
    if (_fromAccount == null || _toAccount == null) {
      _toast('Choose both accounts.');
      return;
    }
    if (_fromAccount!.id == _toAccount!.id) {
      _toast('Source and destination accounts must be different.');
      return;
    }
    final amount = double.tryParse(_amountController.text.trim());
    if (amount == null || amount <= 0) {
      _toast('Enter a valid amount.');
      return;
    }
    setState(() => _submitting = true);
    try {
      final repo = context.read<Repository>();
      final reference = _referenceController.text.trim();
      final t = widget.transfer;
      if (t == null) {
        await repo.createBankTransfer(
          date: _date,
          reference: reference,
          fromAccountId: _fromAccount!.id,
          toAccountId: _toAccount!.id,
          amount: amount,
        );
      } else {
        await repo.updateBankTransfer(
          t.id,
          date: _date,
          reference: reference,
          fromAccountId: _fromAccount!.id,
          toAccountId: _toAccount!.id,
          amount: amount,
        );
      }
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) _toast(e is ApiException ? e.message : 'Failed to save transfer');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _toast(String message) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));

  @override
  Widget build(BuildContext context) {
    final dateFmt = DateFormat('d MMM yyyy');
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.only(left: 20, right: 20, top: 20, bottom: 20 + bottomInset),
      child: FutureBuilder<List<BankAccountRef>>(
        future: _accountsFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const SizedBox(height: 200, child: Center(child: CircularProgressIndicator()));
          }
          if (snapshot.hasError) {
            final message = snapshot.error is ApiException
                ? (snapshot.error as ApiException).message
                : 'Failed to load accounts';
            return SizedBox(height: 160, child: Center(child: Text(message, textAlign: TextAlign.center)));
          }
          final accounts = snapshot.data ?? [];
          if (accounts.length < 2) {
            return const SizedBox(
              height: 160,
              child: Center(
                child: Text(
                  'You need at least two bank accounts to move money between them. Add them in the admin app.',
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
                Text(widget.isEdit ? 'Edit transfer' : 'New Transfer',
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
                TextField(
                  controller: _referenceController,
                  decoration: const InputDecoration(
                    labelText: 'Reference',
                    hintText: 'Optional, e.g. Move to savings',
                  ),
                  onTapOutside: (_) => FocusManager.instance.primaryFocus?.unfocus(),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<BankAccountRef>(
                  initialValue: _fromAccount,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Source Account'),
                  items: accounts.map((a) => DropdownMenuItem(value: a, child: Text(a.name))).toList(),
                  onChanged: (a) => setState(() => _fromAccount = a),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<BankAccountRef>(
                  initialValue: _toAccount,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Destination Account'),
                  items: accounts.map((a) => DropdownMenuItem(value: a, child: Text(a.name))).toList(),
                  onChanged: (a) => setState(() => _toAccount = a),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _amountController,
                  decoration: const InputDecoration(labelText: 'Amount', prefixText: '£'),
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
                  onTapOutside: (_) => FocusManager.instance.primaryFocus?.unfocus(),
                ),
                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _submitting ? null : _submit,
                    child: Text(_submitting
                        ? 'Saving…'
                        : widget.isEdit
                            ? 'Save changes'
                            : 'Record Transfer'),
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

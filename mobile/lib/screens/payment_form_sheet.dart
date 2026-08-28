import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/expense.dart';
import '../models/invoice.dart';
import '../models/payment.dart' as models;

/// Add or edit a payment from the Financial → Payments screen. Uses the same
/// fields as the admin app's Add Payment modal: Invoice, Date, Amount, Charges,
/// Payment Method and Account. Pops `true` when saved.
///
/// When editing, the invoice can't be changed (it's shown read-only) — the
/// other fields are pre-filled and PATCHed on save.
class PaymentFormSheet extends StatefulWidget {
  final models.Payment? payment;
  const PaymentFormSheet({super.key, this.payment});

  bool get isEdit => payment != null;

  @override
  State<PaymentFormSheet> createState() => _PaymentFormSheetState();
}

class _PaymentFormSheetState extends State<PaymentFormSheet> {
  final _amountController = TextEditingController();
  final _chargesController = TextEditingController();
  DateTime _date = DateTime.now();
  Invoice? _invoice; // add mode
  BankAccountRef? _account;
  PaymentMethod? _paymentMethod;
  bool _submitting = false;
  late Future<(List<Invoice>, List<BankAccountRef>, List<PaymentMethod>)> _lookups;

  @override
  void initState() {
    super.initState();
    final p = widget.payment;
    if (p != null) {
      _date = p.date;
      _amountController.text = p.amount.toStringAsFixed(2);
      if (p.charges > 0) _chargesController.text = p.charges.toStringAsFixed(2);
    }
    final repo = context.read<Repository>();
    _lookups = () async {
      final invoices = await repo.listInvoices();
      final accounts = await repo.listBankAccounts();
      final methods = await repo.listPaymentMethods();
      // Pre-select account/method for edit, and default them for add.
      if (p != null) {
        for (final a in accounts) {
          if (a.id == p.accountId) {
            _account = a;
            break;
          }
        }
        _account ??= accounts.isNotEmpty ? accounts.first : null;
        for (final m in methods) {
          if (m.name == p.paymentMethod) {
            _paymentMethod = m;
            break;
          }
        }
      } else if (accounts.isNotEmpty) {
        _account = accounts.first;
      }
      final outstanding = invoices
          .where((inv) => inv.status != 'cancelled' && inv.balanceDue > 0)
          .toList();
      return (outstanding, accounts, methods);
    }();
  }

  @override
  void dispose() {
    _amountController.dispose();
    _chargesController.dispose();
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

  void _onInvoiceChanged(Invoice? inv) {
    setState(() {
      _invoice = inv;
      if (inv != null) _amountController.text = inv.balanceDue.toStringAsFixed(2);
    });
  }

  Future<void> _submit() async {
    final p = widget.payment;
    final invoiceId = p?.invoiceId ?? _invoice?.id;
    if (invoiceId == null || invoiceId.isEmpty) {
      _toast('Choose an invoice.');
      return;
    }
    final amount = double.tryParse(_amountController.text.trim());
    if (amount == null || amount <= 0) {
      _toast('Enter a valid amount.');
      return;
    }
    if (_account == null) {
      _toast('Choose an account.');
      return;
    }
    setState(() => _submitting = true);
    try {
      final repo = context.read<Repository>();
      final charges = double.tryParse(_chargesController.text.trim());
      if (p == null) {
        await repo.recordPayment(
          invoiceId: invoiceId,
          date: _date,
          amount: amount,
          accountId: _account!.id,
          paymentMethod: _paymentMethod?.name,
          charges: charges,
        );
      } else {
        await repo.updatePayment(
          p.id,
          invoiceId: invoiceId,
          date: _date,
          amount: amount,
          accountId: _account!.id,
          paymentMethod: _paymentMethod?.name,
          charges: charges,
        );
      }
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) _toast(e is ApiException ? e.message : 'Failed to save payment');
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
      child: FutureBuilder<(List<Invoice>, List<BankAccountRef>, List<PaymentMethod>)>(
        future: _lookups,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const SizedBox(height: 200, child: Center(child: CircularProgressIndicator()));
          }
          if (snapshot.hasError) {
            final message = snapshot.error is ApiException
                ? (snapshot.error as ApiException).message
                : 'Failed to load form';
            return SizedBox(height: 160, child: Center(child: Text(message, textAlign: TextAlign.center)));
          }
          final (invoices, accounts, methods) = snapshot.data!;
          if (accounts.isEmpty) {
            return const SizedBox(
              height: 160,
              child: Center(
                child: Text(
                  'No bank accounts set up yet. Add one in the admin app before recording a payment.',
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
                Text(widget.isEdit ? 'Edit payment' : 'Add payment',
                    style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 16),
                // Invoice: a picker when adding, read-only when editing.
                if (widget.isEdit)
                  InputDecorator(
                    decoration: const InputDecoration(labelText: 'Invoice'),
                    child: Text(widget.payment!.invoiceNumber ?? '(invoice)'),
                  )
                else
                  DropdownButtonFormField<Invoice>(
                    initialValue: _invoice,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Invoice'),
                    hint: Text(invoices.isEmpty ? 'No invoices with a balance due' : 'Select an invoice'),
                    items: invoices
                        .map((inv) => DropdownMenuItem(
                              value: inv,
                              child: Text(
                                '${inv.invoiceNumber} — ${inv.customer.name} — £${inv.balanceDue.toStringAsFixed(2)} due',
                                overflow: TextOverflow.ellipsis,
                              ),
                            ))
                        .toList(),
                    onChanged: _onInvoiceChanged,
                  ),
                const SizedBox(height: 12),
                InkWell(
                  onTap: _pickDate,
                  child: InputDecorator(
                    decoration: const InputDecoration(labelText: 'Date'),
                    child: Text(dateFmt.format(_date)),
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _amountController,
                        decoration: const InputDecoration(labelText: 'Amount', prefixText: '£'),
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
                        onTapOutside: (_) => FocusManager.instance.primaryFocus?.unfocus(),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextField(
                        controller: _chargesController,
                        decoration: const InputDecoration(
                          labelText: 'Charges',
                          prefixText: '£',
                          hintText: 'Optional',
                        ),
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
                        onTapOutside: (_) => FocusManager.instance.primaryFocus?.unfocus(),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<PaymentMethod>(
                  initialValue: _paymentMethod,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Payment Method', hintText: 'Optional'),
                  items: [
                    const DropdownMenuItem<PaymentMethod>(value: null, child: Text('Not specified')),
                    ...methods.map((m) => DropdownMenuItem(value: m, child: Text(m.name))),
                  ],
                  onChanged: (m) => setState(() => _paymentMethod = m),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<BankAccountRef>(
                  initialValue: _account,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Account'),
                  items: accounts.map((a) => DropdownMenuItem(value: a, child: Text(a.name))).toList(),
                  onChanged: (a) => setState(() => _account = a),
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
                            : 'Record Payment'),
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

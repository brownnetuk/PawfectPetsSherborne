import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:printing/printing.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/business_info.dart';
import '../models/expense.dart';
import '../models/invoice.dart';
import '../pdf/invoice_pdf.dart';

/// Shows a single invoice rendered as a PDF, with a bottom action bar
/// (Send Email / Record Payment / Request Deposit) in place of the app's
/// main navigation.
class InvoiceDetailScreen extends StatefulWidget {
  final String invoiceId;
  const InvoiceDetailScreen({super.key, required this.invoiceId});

  @override
  State<InvoiceDetailScreen> createState() => _InvoiceDetailScreenState();
}

class _InvoiceDetailScreenState extends State<InvoiceDetailScreen> {
  Invoice? _invoice;
  BusinessInfo? _business;
  Object? _loadError;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _invoice = null;
      _business = null;
      _loadError = null;
    });
    try {
      final repo = context.read<Repository>();
      final invoice = await repo.getInvoice(widget.invoiceId);
      final business = await repo.getBusinessInfo();
      if (mounted) {
        setState(() {
          _invoice = invoice;
          _business = business;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _loadError = e);
    }
  }

  void _snack(String message) {
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  Future<bool> _confirm(String title, String message, String confirmLabel) async {
    final result = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: Text(confirmLabel)),
        ],
      ),
    );
    return result ?? false;
  }

  Future<void> _sendEmail() async {
    final invoice = _invoice!;
    final repo = context.read<Repository>();
    final ok = await _confirm(
      'Send invoice',
      'Email invoice ${invoice.invoiceNumber} to ${invoice.customer.name}?',
      'Send',
    );
    if (!ok) return;
    setState(() => _busy = true);
    try {
      await repo.sendInvoiceEmail(invoice.id);
      _snack('Invoice emailed to ${invoice.customer.name}');
      await _load();
    } catch (e) {
      _snack(e is ApiException ? e.message : 'Failed to send invoice');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _requestDeposit() async {
    final invoice = _invoice!;
    final repo = context.read<Repository>();
    final ok = await _confirm(
      'Request deposit',
      'Email a deposit request for ${invoice.invoiceNumber} to ${invoice.customer.name}?',
      'Send',
    );
    if (!ok) return;
    setState(() => _busy = true);
    try {
      final result = await repo.requestDeposit(invoice.id);
      final money = NumberFormat.currency(locale: 'en_GB', symbol: '£');
      _snack('Deposit of ${money.format(result.depositAmount)} '
          '(${result.depositPercentage.toStringAsFixed(0)}%) requested');
      await _load();
    } catch (e) {
      _snack(e is ApiException ? e.message : 'Failed to request deposit');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _recordPayment() async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: _RecordPaymentSheet(invoice: _invoice!),
      ),
    );
    if (saved == true) {
      _snack('Payment recorded');
      await _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(_invoice?.invoiceNumber ?? 'Invoice')),
      body: _buildBody(),
      bottomNavigationBar: _buildActions(),
    );
  }

  Widget _buildBody() {
    if (_loadError != null) {
      final message = _loadError is ApiException
          ? (_loadError as ApiException).message
          : 'Failed to load invoice';
      return Center(child: Text(message, textAlign: TextAlign.center));
    }
    if (_invoice == null || _business == null) {
      return const Center(child: CircularProgressIndicator());
    }
    return PdfPreview(
      // Regenerate when the invoice changes (e.g. after a payment/send).
      key: ValueKey('${_invoice!.status}-${_invoice!.amountPaid}'),
      build: (_) => buildInvoicePdf(_invoice!, _business!),
      canChangePageFormat: false,
      canChangeOrientation: false,
      canDebug: false,
      pdfFileName: '${_invoice!.invoiceNumber}.pdf',
    );
  }

  Widget _buildActions() {
    final enabled = _invoice != null && !_busy;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
        child: Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: enabled ? _sendEmail : null,
                icon: const Icon(Icons.email_outlined, size: 18),
                label: const Text('Send Email'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: ElevatedButton.icon(
                onPressed: enabled ? _recordPayment : null,
                icon: const Icon(Icons.payments_outlined, size: 18),
                label: const Text('Record Payment'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: enabled ? _requestDeposit : null,
                icon: const Icon(Icons.request_quote_outlined, size: 18),
                label: const Text('Request Deposit'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _RecordPaymentSheet extends StatefulWidget {
  final Invoice invoice;
  const _RecordPaymentSheet({required this.invoice});

  @override
  State<_RecordPaymentSheet> createState() => _RecordPaymentSheetState();
}

class _RecordPaymentSheetState extends State<_RecordPaymentSheet> {
  final _amountController = TextEditingController();
  DateTime _date = DateTime.now();
  BankAccountRef? _account;
  PaymentMethod? _paymentMethod;
  bool _submitting = false;
  late Future<(List<BankAccountRef>, List<PaymentMethod>)> _lookups;

  @override
  void initState() {
    super.initState();
    _amountController.text = widget.invoice.balanceDue.toStringAsFixed(2);
    final repo = context.read<Repository>();
    _lookups = () async {
      final accounts = await repo.listBankAccounts();
      final methods = await repo.listPaymentMethods();
      return (accounts, methods);
    }();
  }

  @override
  void dispose() {
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
    final amount = double.tryParse(_amountController.text.trim());
    if (amount == null || amount <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Enter a valid amount.')));
      return;
    }
    if (_account == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Choose an account.')));
      return;
    }
    setState(() => _submitting = true);
    try {
      await context.read<Repository>().recordPayment(
            invoiceId: widget.invoice.id,
            date: _date,
            amount: amount,
            accountId: _account!.id,
            paymentMethod: _paymentMethod?.name,
          );
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        final message = e is ApiException ? e.message : 'Failed to record payment';
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
      child: FutureBuilder<(List<BankAccountRef>, List<PaymentMethod>)>(
        future: _lookups,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const SizedBox(height: 160, child: Center(child: CircularProgressIndicator()));
          }
          if (snapshot.hasError) {
            final message = snapshot.error is ApiException
                ? (snapshot.error as ApiException).message
                : 'Failed to load accounts';
            return SizedBox(height: 160, child: Center(child: Text(message, textAlign: TextAlign.center)));
          }
          final (accounts, methods) = snapshot.data!;
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
          return Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Record payment', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 16),
              TextField(
                controller: _amountController,
                decoration: const InputDecoration(labelText: 'Amount', prefixText: '£'),
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
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
              DropdownButtonFormField<BankAccountRef>(
                initialValue: _account,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Paid into'),
                hint: const Text('Choose an account'),
                items: accounts.map((a) => DropdownMenuItem(value: a, child: Text(a.name))).toList(),
                onChanged: (a) => setState(() => _account = a),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<PaymentMethod>(
                initialValue: _paymentMethod,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Method', hintText: 'Optional'),
                items: [
                  const DropdownMenuItem<PaymentMethod>(value: null, child: Text('Not specified')),
                  ...methods.map((m) => DropdownMenuItem(value: m, child: Text(m.name))),
                ],
                onChanged: (m) => setState(() => _paymentMethod = m),
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _submitting ? null : _submit,
                  child: Text(_submitting ? 'Saving…' : 'Save payment'),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

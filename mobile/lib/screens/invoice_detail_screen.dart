import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:printing/printing.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/invoice.dart';
import '../widgets/zoomable_pdf.dart';
import 'record_payment_sheet.dart';

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
      _loadError = null;
    });
    try {
      final invoice = await context.read<Repository>().getInvoice(widget.invoiceId);
      if (mounted) setState(() => _invoice = invoice);
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
        child: RecordPaymentSheet(invoice: _invoice!),
      ),
    );
    if (saved == true) {
      _snack('Payment recorded');
      await _load();
    }
  }

  Future<void> _share() async {
    final repo = context.read<Repository>();
    try {
      final bytes = await repo.getInvoicePdf(widget.invoiceId);
      await Printing.sharePdf(bytes: bytes, filename: '${_invoice?.invoiceNumber ?? 'invoice'}.pdf');
    } catch (e) {
      _snack(e is ApiException ? e.message : 'Failed to share invoice');
    }
  }

  Future<void> _print() async {
    final repo = context.read<Repository>();
    try {
      await Printing.layoutPdf(onLayout: (_) => repo.getInvoicePdf(widget.invoiceId));
    } catch (e) {
      _snack(e is ApiException ? e.message : 'Failed to print invoice');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_invoice?.invoiceNumber ?? 'Invoice'),
        actions: [
          IconButton(
            icon: const Icon(Icons.ios_share),
            tooltip: 'Share',
            onPressed: _invoice == null ? null : _share,
          ),
          IconButton(
            icon: const Icon(Icons.print_outlined),
            tooltip: 'Print',
            onPressed: _invoice == null ? null : _print,
          ),
        ],
      ),
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
    if (_invoice == null) {
      return const Center(child: CircularProgressIndicator());
    }
    return ZoomablePdf(
      // Re-fetch/re-render when the invoice changes (e.g. after a payment/send).
      key: ValueKey('${_invoice!.status}-${_invoice!.amountPaid}'),
      load: () => context.read<Repository>().getInvoicePdf(widget.invoiceId),
    );
  }

  Widget _buildActions() => InvoiceActionBar(
        enabled: _invoice != null && !_busy,
        onSendEmail: _sendEmail,
        onRecordPayment: _recordPayment,
        onRequestDeposit: _requestDeposit,
      );
}

/// The invoice detail screen's bottom action bar. The primary action gets a
/// full-width row and the two email actions share the row below -- three
/// across is too cramped for these labels at phone widths.
class InvoiceActionBar extends StatelessWidget {
  final bool enabled;
  final VoidCallback onSendEmail;
  final VoidCallback onRecordPayment;
  final VoidCallback onRequestDeposit;

  const InvoiceActionBar({
    super.key,
    required this.enabled,
    required this.onSendEmail,
    required this.onRecordPayment,
    required this.onRequestDeposit,
  });

  @override
  Widget build(BuildContext context) {
    final outlinedStyle = OutlinedButton.styleFrom(
      minimumSize: const Size(0, 46),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
    );
    return SafeArea(
      minimum: const EdgeInsets.fromLTRB(16, 6, 16, 10),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: enabled ? onRecordPayment : null,
              style: ElevatedButton.styleFrom(minimumSize: const Size(0, 48)),
              icon: const Icon(Icons.payments_outlined, size: 20),
              label: const Text('Record Payment'),
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: enabled ? onSendEmail : null,
                  style: outlinedStyle,
                  icon: const Icon(Icons.email_outlined, size: 18),
                  label: const Text('Send Email'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: enabled ? onRequestDeposit : null,
                  style: outlinedStyle,
                  icon: const Icon(Icons.request_quote_outlined, size: 18),
                  label: const Text('Request Deposit'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

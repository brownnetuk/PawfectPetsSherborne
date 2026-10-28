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
/// (Send Email / Record Payment / Request Deposit, plus Overdue Payment once
/// the invoice is overdue with a balance owing) in place of the app's main
/// navigation.
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
      // Must pop with the dialog's own context: showDialog puts the dialog on
      // the root navigator, while this screen lives inside a tab's nested
      // navigator -- popping with the screen context targets the wrong
      // navigator and the dialog never resolves.
      builder: (dialogContext) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialogContext).pop(false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.of(dialogContext).pop(true), child: Text(confirmLabel)),
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

  /// Mirrors the admin's "Overdue Payment" action: emails the Payment Overdue
  /// template for the outstanding balance. Leaves the invoice status alone.
  Future<void> _sendOverdueReminder() async {
    final invoice = _invoice!;
    final repo = context.read<Repository>();
    final money = NumberFormat.currency(locale: 'en_GB', symbol: '£');
    final due = DateFormat('d MMM yyyy').format(invoice.dueDate.toLocal());
    final ok = await _confirm(
      'Send overdue payment reminder',
      'Email an overdue payment reminder for ${invoice.invoiceNumber} to ${invoice.customer.name}?\n\n'
          'Due $due · balance due ${money.format(invoice.balanceDue)}',
      'Send Reminder',
    );
    if (!ok) return;
    setState(() => _busy = true);
    try {
      final result = await repo.sendOverdueReminder(invoice.id);
      _snack('Reminder sent for ${money.format(result.balanceDue)} '
          '(${result.daysOverdue} day${result.daysOverdue == 1 ? '' : 's'} overdue)');
      await _load();
    } catch (e) {
      _snack(e is ApiException ? e.message : 'Failed to send the reminder');
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

  /// Schedule Send (admin's ScheduleSendModal): pick a date and time, and the
  /// server emails the invoice then. Defaults to the current schedule when
  /// moving one, otherwise 9am tomorrow. Only drafts can be scheduled.
  Future<void> _scheduleSend() async {
    final invoice = _invoice!;
    final repo = context.read<Repository>();
    final now = DateTime.now();
    final initial = invoice.scheduledSendAt ?? DateTime(now.year, now.month, now.day + 1, 9);
    final date = await showDatePicker(
      context: context,
      initialDate: initial.isBefore(now) ? now : initial,
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: now.add(const Duration(days: 365)),
      helpText: 'Send on',
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay(hour: initial.hour, minute: initial.minute),
      helpText: 'Send at',
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(alwaysUse24HourFormat: true),
        child: child!,
      ),
    );
    if (time == null || !mounted) return;
    final sendAt = DateTime(date.year, date.month, date.day, time.hour, time.minute);
    if (!sendAt.isAfter(DateTime.now())) {
      _snack('Pick a date and time in the future.');
      return;
    }
    setState(() => _busy = true);
    try {
      await repo.scheduleInvoiceSend(invoice.id, sendAt);
      _snack('${invoice.invoiceNumber} will be sent ${DateFormat('d MMM yyyy HH:mm').format(sendAt)}');
      await _load();
    } catch (e) {
      _snack(e is ApiException ? e.message : 'Failed to schedule the send');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _cancelScheduledSend() async {
    final invoice = _invoice!;
    final repo = context.read<Repository>();
    final ok = await _confirm(
      'Cancel scheduled send',
      '${invoice.invoiceNumber} goes back to a draft and is not emailed.',
      'Cancel send',
    );
    if (!ok) return;
    setState(() => _busy = true);
    try {
      await repo.cancelScheduledInvoiceSend(invoice.id);
      _snack('Scheduled send cancelled');
      await _load();
    } catch (e) {
      _snack(e is ApiException ? e.message : 'Failed to cancel the scheduled send');
    } finally {
      if (mounted) setState(() => _busy = false);
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

  Widget _buildActions() {
    final invoice = _invoice;
    // Same rule as the admin's Invoices list: only once the invoice has
    // actually gone overdue (the day after its due date, server-side) and
    // there's still money owing.
    final canRemind = invoice != null && invoice.status == 'overdue' && invoice.balanceDue > 0;
    final scheduled = invoice != null && invoice.status == 'scheduled';
    return InvoiceActionBar(
      enabled: invoice != null && !_busy,
      onSendEmail: _sendEmail,
      onRecordPayment: _recordPayment,
      onRequestDeposit: _requestDeposit,
      onOverdueReminder: canRemind ? _sendOverdueReminder : null,
      // Drafts can be scheduled; a scheduled one moved or cancelled.
      onScheduleSend: invoice != null && invoice.canScheduleSend ? _scheduleSend : null,
      onCancelScheduledSend: scheduled ? _cancelScheduledSend : null,
      scheduledSendAt: scheduled ? invoice.scheduledSendAt : null,
    );
  }
}

/// The invoice detail screen's bottom action bar. The primary action gets a
/// full-width row and the two email actions share the row below -- three
/// across is too cramped for these labels at phone widths. When
/// [onScheduleSend] is given, a "Schedule Send" (or "Reschedule Send", with
/// the current time and a cancel button when [scheduledSendAt] is set) row is
/// added; when [onOverdueReminder] is given, an "Overdue Payment" row.
class InvoiceActionBar extends StatelessWidget {
  final bool enabled;
  final VoidCallback onSendEmail;
  final VoidCallback onRecordPayment;
  final VoidCallback onRequestDeposit;
  // Null hides the row (invoice not overdue, or nothing owing).
  final VoidCallback? onOverdueReminder;
  // Null hides the row (only drafts and already scheduled invoices qualify).
  final VoidCallback? onScheduleSend;
  // Set only while the invoice is scheduled.
  final VoidCallback? onCancelScheduledSend;
  final DateTime? scheduledSendAt;

  const InvoiceActionBar({
    super.key,
    required this.enabled,
    required this.onSendEmail,
    required this.onRecordPayment,
    required this.onRequestDeposit,
    this.onOverdueReminder,
    this.onScheduleSend,
    this.onCancelScheduledSend,
    this.scheduledSendAt,
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
          if (onScheduleSend != null) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: enabled ? onScheduleSend : null,
                    style: outlinedStyle,
                    icon: const Icon(Icons.schedule_send_outlined, size: 18),
                    label: Text(scheduledSendAt == null
                        ? 'Schedule Send'
                        : 'Sends ${DateFormat('d MMM HH:mm').format(scheduledSendAt!)}'),
                  ),
                ),
                if (onCancelScheduledSend != null) ...[
                  const SizedBox(width: 12),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: enabled ? onCancelScheduledSend : null,
                      style: outlinedStyle,
                      icon: const Icon(Icons.cancel_schedule_send_outlined, size: 18),
                      label: const Text('Cancel Send'),
                    ),
                  ),
                ],
              ],
            ),
          ],
          if (onOverdueReminder != null) ...[
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: enabled ? onOverdueReminder : null,
                style: outlinedStyle.copyWith(
                  foregroundColor: WidgetStatePropertyAll(Colors.orange.shade900),
                  side: WidgetStatePropertyAll(BorderSide(color: Colors.orange.shade700)),
                ),
                icon: const Icon(Icons.notification_important_outlined, size: 18),
                label: const Text('Overdue Payment'),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

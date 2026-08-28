import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/payment.dart';
import 'payment_form_sheet.dart';

/// List of payments received against invoices, with add / edit / delete.
class PaymentsScreen extends StatefulWidget {
  const PaymentsScreen({super.key});

  @override
  State<PaymentsScreen> createState() => _PaymentsScreenState();
}

class _PaymentsScreenState extends State<PaymentsScreen> {
  late Future<List<Payment>> _future;
  final _money = NumberFormat.currency(locale: 'en_GB', symbol: '£');
  final _dateFmt = DateFormat('d MMM yyyy');

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() => _future = context.read<Repository>().listPayments();

  Future<void> _refresh() async {
    setState(_load);
    await _future;
  }

  Future<void> _add() async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const PaymentFormSheet(),
    );
    if (saved == true) _refresh();
  }

  Future<void> _openActions(Payment payment) async {
    final action = await showModalBottomSheet<String>(
      context: context,
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              title: Text(payment.paymentId, style: const TextStyle(fontWeight: FontWeight.w600)),
              subtitle: Text(
                '${_money.format(payment.amount)}${payment.invoiceNumber != null ? ' · ${payment.invoiceNumber}' : ''}',
              ),
            ),
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.edit_outlined),
              title: const Text('Edit'),
              onTap: () => Navigator.of(context).pop('edit'),
            ),
            ListTile(
              leading: Icon(Icons.delete_outline, color: Colors.red.shade600),
              title: Text('Delete', style: TextStyle(color: Colors.red.shade600)),
              onTap: () => Navigator.of(context).pop('delete'),
            ),
          ],
        ),
      ),
    );
    if (!mounted) return;
    if (action == 'edit') {
      final saved = await showModalBottomSheet<bool>(
        context: context,
        isScrollControlled: true,
        builder: (_) => PaymentFormSheet(payment: payment),
      );
      if (saved == true) _refresh();
    } else if (action == 'delete') {
      _confirmDelete(payment);
    }
  }

  Future<void> _confirmDelete(Payment payment) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete payment?'),
        content: Text(
          'This permanently removes payment ${payment.paymentId} and restores its amount to the invoice\'s outstanding balance.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text('Delete', style: TextStyle(color: Colors.red.shade600)),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try {
      await context.read<Repository>().deletePayment(payment.id);
      _refresh();
    } catch (e) {
      if (mounted) {
        final message = e is ApiException ? e.message : 'Failed to delete payment';
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Payments')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _add,
        icon: const Icon(Icons.add),
        label: const Text('Add payment'),
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: FutureBuilder<List<Payment>>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) {
              final message = snapshot.error is ApiException
                  ? (snapshot.error as ApiException).message
                  : 'Failed to load payments';
              return ListView(children: [const SizedBox(height: 80), Center(child: Text(message, textAlign: TextAlign.center))]);
            }
            final payments = snapshot.data ?? [];
            if (payments.isEmpty) {
              return ListView(children: const [SizedBox(height: 80), Center(child: Text('No payments yet.'))]);
            }
            return ListView.separated(
              padding: const EdgeInsets.only(top: 8, bottom: 88),
              itemCount: payments.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (context, i) {
                final p = payments[i];
                final subtitleParts = [
                  if ((p.invoiceNumber ?? '').isNotEmpty) p.invoiceNumber!,
                  if ((p.paymentMethod ?? '').isNotEmpty) p.paymentMethod!,
                  if ((p.accountName ?? '').isNotEmpty) p.accountName!,
                  _dateFmt.format(p.date),
                ];
                return ListTile(
                  title: Text(p.paymentId),
                  subtitle: Text(subtitleParts.join(' · ')),
                  trailing: Text(
                    _money.format(p.amount),
                    style: TextStyle(fontWeight: FontWeight.w600, color: Colors.green.shade700),
                  ),
                  onTap: () => _openActions(p),
                );
              },
            );
          },
        ),
      ),
    );
  }
}

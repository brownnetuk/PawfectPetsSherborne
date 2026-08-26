import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/customer.dart';
import '../models/invoice.dart';
import '../widgets/hold_to_delete_dialog.dart';
import '../widgets/status_badge.dart';
import 'create_invoice_screen.dart';
import 'edit_invoice_screen.dart';
import 'home_shell.dart';
import 'invoice_detail_screen.dart';
import 'record_payment_sheet.dart';
import 'select_customer_screen.dart';

class InvoicesScreen extends StatefulWidget {
  const InvoicesScreen({super.key});

  @override
  State<InvoicesScreen> createState() => _InvoicesScreenState();
}

class _InvoicesScreenState extends State<InvoicesScreen> {
  late Future<List<Invoice>> _future;

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    _future = context.read<Repository>().listInvoices();
  }

  Future<void> _refresh() async {
    setState(_load);
    await _future;
  }

  /// Add Invoice: pick a customer first, then raise the invoice against them.
  Future<void> _addInvoice() async {
    final customer = await Navigator.of(context).push<Customer>(
      MaterialPageRoute(builder: (_) => const SelectCustomerScreen()),
    );
    if (customer == null || !mounted) return;
    final created = await Navigator.of(context).push<Invoice>(
      MaterialPageRoute(
        builder: (_) => CreateInvoiceScreen(
          customerId: customer.id,
          customerName: customer.name,
        ),
      ),
    );
    if (created != null) _refresh();
  }

  /// Swipe-left action chooser: Edit / Record Payment / Delete. Always returns
  /// false so the row snaps back; each action refreshes the list itself.
  Future<bool> _swipeActions(Invoice inv) async {
    final action = await showModalBottomSheet<String>(
      context: context,
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 4),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(inv.invoiceNumber, style: const TextStyle(fontWeight: FontWeight.w600)),
              ),
            ),
            ListTile(
              leading: const Icon(Icons.edit_outlined),
              title: const Text('Edit'),
              onTap: () => Navigator.of(context).pop('edit'),
            ),
            ListTile(
              leading: const Icon(Icons.payments_outlined),
              title: const Text('Record Payment'),
              onTap: () => Navigator.of(context).pop('payment'),
            ),
            ListTile(
              leading: Icon(Icons.delete_outline, color: Colors.red.shade600),
              title: Text('Delete', style: TextStyle(color: Colors.red.shade700)),
              onTap: () => Navigator.of(context).pop('delete'),
            ),
          ],
        ),
      ),
    );
    if (!mounted) return false;
    switch (action) {
      case 'edit':
        await _editInvoice(inv);
      case 'payment':
        await _recordPayment(inv);
      case 'delete':
        await _deleteInvoice(inv);
    }
    return false;
  }

  Future<void> _editInvoice(Invoice inv) async {
    final updated = await Navigator.of(context).push<Invoice>(
      MaterialPageRoute(builder: (_) => EditInvoiceScreen(invoice: inv)),
    );
    if (updated != null) _refresh();
  }

  Future<void> _recordPayment(Invoice inv) async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: RecordPaymentSheet(invoice: inv),
      ),
    );
    if (saved == true && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Payment recorded')));
      _refresh();
    }
  }

  Future<void> _deleteInvoice(Invoice inv) async {
    final repo = context.read<Repository>();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => HoldToDeleteDialog(
        title: 'Delete invoice?',
        message: 'This permanently deletes ${inv.invoiceNumber}. This cannot be undone.',
      ),
    );
    if (confirmed != true) return;
    try {
      await repo.deleteInvoice(inv.id);
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Deleted ${inv.invoiceNumber}')));
        _refresh();
      }
    } catch (e) {
      if (mounted) {
        final message = e is ApiException ? e.message : 'Failed to delete invoice';
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(message), duration: const Duration(seconds: 5)));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final dateFmt = DateFormat('d MMM yyyy');
    final money = NumberFormat.currency(locale: 'en_GB', symbol: '£');
    return Scaffold(
      appBar: AppBar(title: const Text('Invoices'), actions: const [LogoutAction()]),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _addInvoice,
        icon: const Icon(Icons.add),
        label: const Text('Add Invoice'),
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: FutureBuilder<List<Invoice>>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) {
              final message = snapshot.error is ApiException
                  ? (snapshot.error as ApiException).message
                  : 'Failed to load invoices';
              return ListView(
                children: [
                  const SizedBox(height: 80),
                  Center(child: Text(message, textAlign: TextAlign.center)),
                ],
              );
            }
            final invoices = snapshot.data ?? [];
            if (invoices.isEmpty) {
              return ListView(
                children: const [
                  SizedBox(height: 80),
                  Center(child: Text('No invoices yet.')),
                ],
              );
            }
            return ListView.separated(
              padding: const EdgeInsets.symmetric(vertical: 8),
              itemCount: invoices.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (context, i) {
                final inv = invoices[i];
                return Dismissible(
                  key: ValueKey(inv.id),
                  direction: DismissDirection.endToStart,
                  background: Container(
                    color: Colors.blueGrey.shade600,
                    alignment: Alignment.centerRight,
                    padding: const EdgeInsets.symmetric(horizontal: 24),
                    child: const Icon(Icons.more_horiz, color: Colors.white),
                  ),
                  confirmDismiss: (_) => _swipeActions(inv),
                  child: ListTile(
                    title: Text('${inv.invoiceNumber} · ${inv.customer.name}'),
                    subtitle: Text(
                      '${money.format(inv.total)} · issued ${dateFmt.format(inv.issueDate)}',
                    ),
                    trailing: StatusBadge(status: inv.status),
                    onTap: () async {
                      await Navigator.of(context).push(
                        MaterialPageRoute(builder: (_) => InvoiceDetailScreen(invoiceId: inv.id)),
                      );
                      _refresh(); // status/amount may have changed via the actions
                    },
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

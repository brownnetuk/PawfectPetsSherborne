import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/customer.dart';
import '../models/invoice.dart';
import '../widgets/status_badge.dart';
import 'create_invoice_screen.dart';
import 'home_shell.dart';
import 'invoice_detail_screen.dart';
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
                return ListTile(
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
                );
              },
            );
          },
        ),
      ),
    );
  }
}

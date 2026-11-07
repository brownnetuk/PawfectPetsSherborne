import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/invoice.dart';
import '../models/quote.dart';
import '../theme.dart';
import '../widgets/status_badge.dart';
import 'invoice_detail_screen.dart';
import 'quote_detail_screen.dart';

/// Every invoice and quote raised for one customer, opened from the receipt
/// icon in the customer header. Two tabs (Invoices / Quotes) reuse the
/// Business tab's row layout minus the customer name, and tap through to the
/// same detail screens; both lists refetch on return since the actions there
/// can change status or amounts.
class CustomerFinanceScreen extends StatefulWidget {
  final String customerId;
  final String customerName;
  const CustomerFinanceScreen({super.key, required this.customerId, required this.customerName});

  @override
  State<CustomerFinanceScreen> createState() => _CustomerFinanceScreenState();
}

class _CustomerFinanceScreenState extends State<CustomerFinanceScreen> {
  late Future<List<Invoice>> _invoices;
  late Future<List<Quote>> _quotes;

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    final repo = context.read<Repository>();
    _invoices = repo.listInvoices(customerId: widget.customerId);
    _quotes = repo.listQuotes(customerId: widget.customerId);
  }

  Future<void> _refresh() async {
    setState(_load);
    await Future.wait([_invoices, _quotes]);
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Invoices & quotes'),
              Text(
                widget.customerName,
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w400),
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
          bottom: const TabBar(
            tabs: [Tab(text: 'Invoices'), Tab(text: 'Quotes')],
          ),
        ),
        body: TabBarView(
          children: [
            _InvoicesTab(future: _invoices, onRefresh: _refresh),
            _QuotesTab(future: _quotes, onRefresh: _refresh),
          ],
        ),
      ),
    );
  }
}

/// Shared scaffolding for both tabs: spinner, error text, pull-to-refresh and
/// an empty message that still scrolls so the refresh gesture works.
class _TabList<T> extends StatelessWidget {
  final Future<List<T>> future;
  final Future<void> Function() onRefresh;
  final String emptyMessage;
  final String errorMessage;
  final Widget Function(BuildContext, T) rowBuilder;

  const _TabList({
    required this.future,
    required this.onRefresh,
    required this.emptyMessage,
    required this.errorMessage,
    required this.rowBuilder,
  });

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: FutureBuilder<List<T>>(
        future: future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            final message = snapshot.error is ApiException ? (snapshot.error as ApiException).message : errorMessage;
            return ListView(children: [
              const SizedBox(height: 80),
              Center(child: Text(message, textAlign: TextAlign.center)),
            ]);
          }
          final items = snapshot.data ?? [];
          if (items.isEmpty) {
            return ListView(children: [
              const SizedBox(height: 80),
              Center(child: Text(emptyMessage, style: const TextStyle(color: brandMuted))),
            ]);
          }
          return ListView.separated(
            itemCount: items.length,
            separatorBuilder: (_, _) => const Divider(height: 1),
            itemBuilder: (context, i) => rowBuilder(context, items[i]),
          );
        },
      ),
    );
  }
}

class _InvoicesTab extends StatelessWidget {
  final Future<List<Invoice>> future;
  final Future<void> Function() onRefresh;
  const _InvoicesTab({required this.future, required this.onRefresh});

  @override
  Widget build(BuildContext context) {
    final dateFmt = DateFormat('d MMM yyyy');
    final money = NumberFormat.currency(locale: 'en_GB', symbol: '£');
    return _TabList<Invoice>(
      future: future,
      onRefresh: onRefresh,
      emptyMessage: 'No invoices for this customer yet',
      errorMessage: 'Failed to load invoices',
      rowBuilder: (context, inv) => ListTile(
        title: Text(inv.invoiceNumber),
        subtitle: Text(
          '${money.format(inv.total)} · issued ${dateFmt.format(inv.issueDate)}'
          '${inv.scheduledSendAt != null ? ' · sends ${DateFormat('d MMM HH:mm').format(inv.scheduledSendAt!)}' : ''}',
        ),
        trailing: inv.isPartiallyPaid
            ? Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  StatusBadge(status: inv.status),
                  const SizedBox(height: 2),
                  const StatusBadge(status: 'partially_paid'),
                ],
              )
            : StatusBadge(status: inv.status),
        onTap: () async {
          await Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => InvoiceDetailScreen(invoiceId: inv.id)),
          );
          onRefresh();
        },
      ),
    );
  }
}

class _QuotesTab extends StatelessWidget {
  final Future<List<Quote>> future;
  final Future<void> Function() onRefresh;
  const _QuotesTab({required this.future, required this.onRefresh});

  @override
  Widget build(BuildContext context) {
    final dateFmt = DateFormat('d MMM yyyy');
    final money = NumberFormat.currency(locale: 'en_GB', symbol: '£');
    return _TabList<Quote>(
      future: future,
      onRefresh: onRefresh,
      emptyMessage: 'No quotes for this customer yet',
      errorMessage: 'Failed to load quotes',
      rowBuilder: (context, q) => ListTile(
        title: Text(q.quoteNumber),
        subtitle: Text('${money.format(q.total)} · valid to ${dateFmt.format(q.validUntil)}'),
        trailing: StatusBadge(status: q.status),
        onTap: () async {
          await Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => QuoteDetailScreen(quoteId: q.id)),
          );
          onRefresh();
        },
      ),
    );
  }
}

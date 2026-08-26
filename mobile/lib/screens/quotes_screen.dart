import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/customer.dart';
import '../models/quote.dart';
import '../widgets/hold_to_delete_dialog.dart';
import '../widgets/status_badge.dart';
import 'create_quote_screen.dart';
import 'home_shell.dart';
import 'quote_detail_screen.dart';
import 'select_customer_screen.dart';

class QuotesScreen extends StatefulWidget {
  const QuotesScreen({super.key});

  @override
  State<QuotesScreen> createState() => _QuotesScreenState();
}

class _QuotesScreenState extends State<QuotesScreen> {
  late Future<List<Quote>> _future;

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    _future = context.read<Repository>().listQuotes();
  }

  Future<void> _refresh() async {
    setState(_load);
    await _future;
  }

  /// Add Quote: pick a customer first, then raise the quote against them.
  Future<void> _addQuote() async {
    final customer = await Navigator.of(context).push<Customer>(
      MaterialPageRoute(builder: (_) => const SelectCustomerScreen()),
    );
    if (customer == null || !mounted) return;
    final created = await Navigator.of(context).push<Quote>(
      MaterialPageRoute(
        builder: (_) => CreateQuoteScreen(customerId: customer.id, customerName: customer.name),
      ),
    );
    if (created != null) _refresh();
  }

  /// Swipe-left action chooser: Edit / Send Email / Delete. Always returns
  /// false so the row snaps back; each action refreshes the list itself.
  Future<bool> _swipeActions(Quote q) async {
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
                child: Text(q.quoteNumber, style: const TextStyle(fontWeight: FontWeight.w600)),
              ),
            ),
            ListTile(
              leading: const Icon(Icons.edit_outlined),
              title: const Text('Edit'),
              onTap: () => Navigator.of(context).pop('edit'),
            ),
            ListTile(
              leading: const Icon(Icons.email_outlined),
              title: const Text('Send Email'),
              onTap: () => Navigator.of(context).pop('send'),
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
        await _editQuote(q);
      case 'send':
        await _sendEmail(q);
      case 'delete':
        await _deleteQuote(q);
    }
    return false;
  }

  Future<void> _editQuote(Quote q) async {
    final updated = await Navigator.of(context).push<Quote>(
      MaterialPageRoute(
        builder: (_) => CreateQuoteScreen(
          customerId: q.customer?.id ?? '',
          customerName: q.customerName,
          quote: q,
        ),
      ),
    );
    if (updated != null) _refresh();
  }

  Future<void> _sendEmail(Quote q) async {
    final repo = context.read<Repository>();
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Send quote'),
        content: Text('Email quote ${q.quoteNumber} to ${q.customerName}?'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Send')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await repo.sendQuoteEmail(q.id);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Quote ${q.quoteNumber} emailed')));
        _refresh();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(e is ApiException ? e.message : 'Failed to send quote')));
      }
    }
  }

  Future<void> _deleteQuote(Quote q) async {
    final repo = context.read<Repository>();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => HoldToDeleteDialog(
        title: 'Delete quote?',
        message: 'This permanently deletes ${q.quoteNumber}. This cannot be undone.',
      ),
    );
    if (confirmed != true) return;
    try {
      await repo.deleteQuote(q.id);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Deleted ${q.quoteNumber}')));
        _refresh();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(e is ApiException ? e.message : 'Failed to delete quote'),
            duration: const Duration(seconds: 5)));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final dateFmt = DateFormat('d MMM yyyy');
    final money = NumberFormat.currency(locale: 'en_GB', symbol: '£');
    return Scaffold(
      appBar: AppBar(title: const Text('Quotes'), actions: const [LogoutAction()]),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _addQuote,
        icon: const Icon(Icons.add),
        label: const Text('Add Quote'),
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: FutureBuilder<List<Quote>>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) {
              final message = snapshot.error is ApiException
                  ? (snapshot.error as ApiException).message
                  : 'Failed to load quotes';
              return ListView(
                children: [
                  const SizedBox(height: 80),
                  Center(child: Text(message, textAlign: TextAlign.center)),
                ],
              );
            }
            final quotes = snapshot.data ?? [];
            if (quotes.isEmpty) {
              return ListView(
                children: const [
                  SizedBox(height: 80),
                  Center(child: Text('No quotes yet.')),
                ],
              );
            }
            return ListView.separated(
              padding: const EdgeInsets.symmetric(vertical: 8),
              itemCount: quotes.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (context, i) {
                final q = quotes[i];
                return Dismissible(
                  key: ValueKey(q.id),
                  direction: DismissDirection.endToStart,
                  background: Container(
                    color: Colors.blueGrey.shade600,
                    alignment: Alignment.centerRight,
                    padding: const EdgeInsets.symmetric(horizontal: 24),
                    child: const Icon(Icons.more_horiz, color: Colors.white),
                  ),
                  confirmDismiss: (_) => _swipeActions(q),
                  child: ListTile(
                    title: Text('${q.quoteNumber} · ${q.customerName}'),
                    subtitle: Text('${money.format(q.total)} · valid to ${dateFmt.format(q.validUntil)}'),
                    trailing: StatusBadge(status: q.status),
                    onTap: () async {
                      await Navigator.of(context).push(
                        MaterialPageRoute(builder: (_) => QuoteDetailScreen(quoteId: q.id)),
                      );
                      _refresh();
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

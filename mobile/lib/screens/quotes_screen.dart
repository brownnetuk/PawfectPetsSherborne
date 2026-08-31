import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
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
  final _searchController = TextEditingController();
  String _search = '';
  // Optional status filter; null shows all statuses.
  String? _statusFilter;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _load() {
    _future = context.read<Repository>().listQuotes();
  }

  Future<void> _refresh() async {
    setState(_load);
    await _future;
  }

  /// Add Quote: pick an existing or manual customer, then raise the quote.
  Future<void> _addQuote() async {
    final result = await Navigator.of(context).push<SelectCustomerResult>(
      MaterialPageRoute(builder: (_) => const SelectCustomerScreen(allowManual: true)),
    );
    if (result == null || !mounted) return;
    final screen = result.isManual
        ? CreateQuoteScreen(
            customerName: result.manualName!,
            manualCustomerName: result.manualName,
            manualCustomerEmail: result.manualEmail,
          )
        : CreateQuoteScreen(customerId: result.customer!.id, customerName: result.customer!.name);
    final created = await Navigator.of(context).push<Quote>(
      MaterialPageRoute(builder: (_) => screen),
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
              leading: const Icon(Icons.swap_horiz),
              title: const Text('Convert to invoice'),
              onTap: () => Navigator.of(context).pop('convert'),
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
      case 'convert':
        await _convertQuote(q);
      case 'delete':
        await _deleteQuote(q);
    }
    return false;
  }

  Future<void> _convertQuote(Quote q) async {
    final repo = context.read<Repository>();
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Convert to invoice'),
        content: Text('Mark ${q.quoteNumber} as accepted, create an invoice from it, '
            'and email ${q.customerName} a deposit request?'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Convert')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      final invoiceNumber = await repo.acceptQuote(q.id);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text('Converted to invoice${invoiceNumber != null ? ' $invoiceNumber' : ''}')));
        _refresh();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(e is ApiException ? e.message : 'Failed to convert quote'),
            duration: const Duration(seconds: 5)));
      }
    }
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
      appBar: AppBar(
        title: const Text('Quotes'),
        actions: const [LogoutAction()],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(104),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Column(
              children: [
                TextField(
                  controller: _searchController,
                  textInputAction: TextInputAction.search,
                  onSubmitted: (_) => FocusScope.of(context).unfocus(),
                  onTapOutside: (_) => FocusScope.of(context).unfocus(),
                  decoration: InputDecoration(
                    hintText: 'Search by number or customer…',
                    prefixIcon: const Icon(Icons.search),
                    isDense: true,
                    suffixIcon: _search.isEmpty
                        ? null
                        : IconButton(
                            icon: const Icon(Icons.close),
                            tooltip: 'Clear',
                            onPressed: () {
                              _searchController.clear();
                              setState(() => _search = '');
                              FocusScope.of(context).unfocus();
                            },
                          ),
                  ),
                  onChanged: (v) => setState(() => _search = v.toLowerCase()),
                ),
                const SizedBox(height: 8),
                Align(
                  alignment: Alignment.centerLeft,
                  child: Wrap(
                    spacing: 8,
                    children: [
                      for (final f in const [
                        ('sent', 'Sent'),
                        ('draft', 'Draft'),
                        ('accepted', 'Accepted'),
                      ])
                        ChoiceChip(
                          label: Text(f.$2),
                          selected: _statusFilter == f.$1,
                          onSelected: (v) => setState(() => _statusFilter = v ? f.$1 : null),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
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
            final allQuotes = snapshot.data ?? [];
            final quotes = allQuotes.where((q) {
              if (_statusFilter != null && q.status != _statusFilter) return false;
              if (_search.isEmpty) return true;
              return q.quoteNumber.toLowerCase().contains(_search) ||
                  q.customerName.toLowerCase().contains(_search);
            }).toList();
            if (quotes.isEmpty) {
              final hasFilter = _search.isNotEmpty || _statusFilter != null;
              return ListView(
                children: [
                  const SizedBox(height: 80),
                  Center(child: Text(hasFilter ? 'No matches.' : 'No quotes yet.')),
                ],
              );
            }
            return ListView.separated(
              padding: const EdgeInsets.symmetric(vertical: 8),
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
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

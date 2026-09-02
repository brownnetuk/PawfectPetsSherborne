import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/portal_models.dart';
import '../widgets/common.dart';

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
    _future = context.read<Repository>().listQuotes();
  }

  Future<void> _refresh() async {
    final f = context.read<Repository>().listQuotes();
    setState(() => _future = f);
    await f;
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _refresh,
      child: FutureBuilder<List<Quote>>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) {
            return ErrorListView(
              message: snap.error is ApiException ? (snap.error as ApiException).message : 'Failed to load quotes',
              onRetry: _refresh,
            );
          }
          final quotes = snap.data ?? [];
          if (quotes.isEmpty) {
            return const EmptyListView(message: 'No quotes yet.');
          }
          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: quotes.length,
            separatorBuilder: (_, _) => const SizedBox(height: 10),
            itemBuilder: (context, i) => _QuoteCard(quote: quotes[i], onChanged: _refresh),
          );
        },
      ),
    );
  }
}

class _QuoteCard extends StatelessWidget {
  final Quote quote;
  final Future<void> Function() onChanged;
  const _QuoteCard({required this.quote, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () async {
          final changed = await showModalBottomSheet<bool>(
            context: context,
            isScrollControlled: true,
            builder: (_) => _QuoteSheet(quote: quote),
          );
          if (changed == true) await onChanged();
        },
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(quote.quoteNumber, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                    const SizedBox(height: 2),
                    Text('Valid until ${dateFmt.format(quote.validUntil)}',
                        style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
                    if (quote.subject != null && quote.subject!.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(quote.subject!, style: const TextStyle(fontSize: 13)),
                    ],
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(money.format(quote.total), style: const TextStyle(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 4),
                  StatusChip(status: quote.status),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _QuoteSheet extends StatefulWidget {
  final Quote quote;
  const _QuoteSheet({required this.quote});

  @override
  State<_QuoteSheet> createState() => _QuoteSheetState();
}

class _QuoteSheetState extends State<_QuoteSheet> {
  bool _busy = false;

  bool get _decidable => widget.quote.status == 'sent';

  Future<void> _accept() async {
    await _act(() => context.read<Repository>().acceptQuote(widget.quote.id), 'Quote accepted.');
  }

  Future<void> _decline() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Decline quote?'),
        content: Text('Are you sure you want to decline ${widget.quote.quoteNumber}?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style: TextButton.styleFrom(foregroundColor: const Color(0xFFC0392B)),
            child: const Text('Decline'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    await _act(() => context.read<Repository>().declineQuote(widget.quote.id), 'Quote declined.');
  }

  Future<void> _act(Future<void> Function() call, String successMsg) async {
    setState(() => _busy = true);
    try {
      await call();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(successMsg)));
      Navigator.pop(context, true); // signal the list to refresh
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e is ApiException ? e.message : 'Something went wrong')));
        setState(() => _busy = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final q = widget.quote;
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.7,
      maxChildSize: 0.95,
      builder: (context, controller) => ListView(
        controller: controller,
        padding: const EdgeInsets.all(20),
        children: [
          Row(
            children: [
              Expanded(child: Text(q.quoteNumber, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold))),
              StatusChip(status: q.status),
            ],
          ),
          const SizedBox(height: 4),
          Text('Issued ${dateFmt.format(q.issueDate)}  ·  Valid until ${dateFmt.format(q.validUntil)}',
              style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
          if (q.subject != null && q.subject!.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(q.subject!),
          ],
          const Divider(height: 28),
          ...q.lineItems.map((li) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Row(
                  children: [
                    Expanded(child: Text('${li.description}  ×${li.quantity % 1 == 0 ? li.quantity.toInt() : li.quantity}')),
                    Text(money.format(li.lineTotal)),
                  ],
                ),
              )),
          const Divider(height: 20),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('Total', style: TextStyle(fontWeight: FontWeight.bold)),
              Text(money.format(q.total), style: const TextStyle(fontWeight: FontWeight.bold)),
            ],
          ),
          const SizedBox(height: 24),
          if (_decidable) ...[
            ElevatedButton.icon(
              onPressed: _busy ? null : _accept,
              icon: const Icon(Icons.check_circle_outline),
              label: Text(_busy ? 'Working…' : 'Accept quote'),
            ),
            const SizedBox(height: 10),
            OutlinedButton.icon(
              onPressed: _busy ? null : _decline,
              style: OutlinedButton.styleFrom(foregroundColor: const Color(0xFFC0392B)),
              icon: const Icon(Icons.cancel_outlined),
              label: const Text('Decline quote'),
            ),
          ] else
            Text(
              'This quote has been ${q.status}.',
              style: TextStyle(color: Colors.grey.shade600),
            ),
        ],
      ),
    );
  }
}

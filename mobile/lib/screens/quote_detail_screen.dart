import 'package:flutter/material.dart';
import 'package:printing/printing.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/quote.dart';
import '../widgets/zoomable_pdf.dart';

/// Shows a quote as a PDF, with a Send Email action (and share/print).
class QuoteDetailScreen extends StatefulWidget {
  final String quoteId;
  const QuoteDetailScreen({super.key, required this.quoteId});

  @override
  State<QuoteDetailScreen> createState() => _QuoteDetailScreenState();
}

class _QuoteDetailScreenState extends State<QuoteDetailScreen> {
  Quote? _quote;
  Object? _loadError;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _quote = null;
      _loadError = null;
    });
    try {
      final quote = await context.read<Repository>().getQuote(widget.quoteId);
      if (mounted) setState(() => _quote = quote);
    } catch (e) {
      if (mounted) setState(() => _loadError = e);
    }
  }

  void _snack(String message) {
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _sendEmail() async {
    final quote = _quote!;
    final repo = context.read<Repository>();
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Send quote'),
        content: Text('Email quote ${quote.quoteNumber} to ${quote.customerName}?'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Send')),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _busy = true);
    try {
      await repo.sendQuoteEmail(quote.id);
      _snack('Quote emailed to ${quote.customerName}');
      await _load();
    } catch (e) {
      _snack(e is ApiException ? e.message : 'Failed to send quote');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _share() async {
    final repo = context.read<Repository>();
    try {
      final bytes = await repo.getQuotePdf(widget.quoteId);
      await Printing.sharePdf(bytes: bytes, filename: '${_quote?.quoteNumber ?? 'quote'}.pdf');
    } catch (e) {
      _snack(e is ApiException ? e.message : 'Failed to share quote');
    }
  }

  Future<void> _print() async {
    final repo = context.read<Repository>();
    try {
      await Printing.layoutPdf(onLayout: (_) => repo.getQuotePdf(widget.quoteId));
    } catch (e) {
      _snack(e is ApiException ? e.message : 'Failed to print quote');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_quote?.quoteNumber ?? 'Quote'),
        actions: [
          IconButton(
            icon: const Icon(Icons.ios_share),
            tooltip: 'Share',
            onPressed: _quote == null ? null : _share,
          ),
          IconButton(
            icon: const Icon(Icons.print_outlined),
            tooltip: 'Print',
            onPressed: _quote == null ? null : _print,
          ),
        ],
      ),
      body: _buildBody(),
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.fromLTRB(16, 8, 16, 10),
        child: SizedBox(
          width: double.infinity,
          child: ElevatedButton.icon(
            onPressed: (_quote == null || _busy) ? null : _sendEmail,
            icon: const Icon(Icons.email_outlined, size: 18),
            label: const Text('Send Email'),
          ),
        ),
      ),
    );
  }

  Widget _buildBody() {
    if (_loadError != null) {
      final message =
          _loadError is ApiException ? (_loadError as ApiException).message : 'Failed to load quote';
      return Center(child: Text(message, textAlign: TextAlign.center));
    }
    if (_quote == null) {
      return const Center(child: CircularProgressIndicator());
    }
    return ZoomablePdf(
      key: ValueKey(_quote!.status),
      load: () => context.read<Repository>().getQuotePdf(widget.quoteId),
    );
  }
}

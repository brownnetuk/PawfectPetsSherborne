import 'package:flutter/material.dart';
import 'package:printing/printing.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/portal_models.dart';
import '../widgets/common.dart';

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
    _future = context.read<Repository>().listInvoices();
  }

  Future<void> _refresh() async {
    final f = context.read<Repository>().listInvoices();
    setState(() => _future = f);
    await f;
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _refresh,
      child: FutureBuilder<List<Invoice>>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) {
            return ErrorListView(message: snap.error is ApiException ? (snap.error as ApiException).message : 'Failed to load invoices', onRetry: _refresh);
          }
          final invoices = snap.data ?? [];
          if (invoices.isEmpty) {
            return const EmptyListView(message: 'No invoices yet.');
          }
          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: invoices.length,
            separatorBuilder: (_, _) => const SizedBox(height: 10),
            itemBuilder: (context, i) => _InvoiceCard(invoice: invoices[i]),
          );
        },
      ),
    );
  }
}

class _InvoiceCard extends StatelessWidget {
  final Invoice invoice;
  const _InvoiceCard({required this.invoice});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => showModalBottomSheet(
          context: context,
          isScrollControlled: true,
          builder: (_) => _InvoiceSheet(invoice: invoice),
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(invoice.invoiceNumber, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                    const SizedBox(height: 2),
                    Text(dateFmt.format(invoice.issueDate), style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
                    if (invoice.subject != null && invoice.subject!.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(invoice.subject!, style: const TextStyle(fontSize: 13)),
                    ],
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(money.format(invoice.total), style: const TextStyle(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 4),
                  StatusChip(status: invoice.status),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _InvoiceSheet extends StatefulWidget {
  final Invoice invoice;
  const _InvoiceSheet({required this.invoice});

  @override
  State<_InvoiceSheet> createState() => _InvoiceSheetState();
}

class _InvoiceSheetState extends State<_InvoiceSheet> {
  bool _pdfBusy = false;
  bool _sendBusy = false;

  Future<void> _download() async {
    setState(() => _pdfBusy = true);
    try {
      final bytes = await context.read<Repository>().invoicePdf(widget.invoice.id);
      await Printing.sharePdf(bytes: bytes, filename: '${widget.invoice.invoiceNumber}.pdf');
    } catch (e) {
      _toast(e is ApiException ? e.message : 'Could not open the PDF');
    } finally {
      if (mounted) setState(() => _pdfBusy = false);
    }
  }

  Future<void> _send() async {
    setState(() => _sendBusy = true);
    try {
      await context.read<Repository>().sendInvoice(widget.invoice.id);
      _toast('Invoice emailed to you.');
    } catch (e) {
      _toast(e is ApiException ? e.message : 'Could not send the invoice');
    } finally {
      if (mounted) setState(() => _sendBusy = false);
    }
  }

  void _toast(String msg) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));

  @override
  Widget build(BuildContext context) {
    final inv = widget.invoice;
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
              Expanded(
                child: Text(inv.invoiceNumber, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
              ),
              StatusChip(status: inv.status),
            ],
          ),
          const SizedBox(height: 4),
          Text('Issued ${dateFmt.format(inv.issueDate)}  ·  Due ${dateFmt.format(inv.dueDate)}',
              style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
          if (inv.subject != null && inv.subject!.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(inv.subject!),
          ],
          const Divider(height: 28),
          ...inv.lineItems.map((li) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Row(
                  children: [
                    Expanded(child: Text('${li.description}  ×${li.quantity % 1 == 0 ? li.quantity.toInt() : li.quantity}')),
                    Text(money.format(li.lineTotal)),
                  ],
                ),
              )),
          const Divider(height: 20),
          _totalRow('Subtotal', inv.subtotal),
          _totalRow('Total', inv.total, bold: true),
          if (inv.amountPaid > 0) _totalRow('Paid', inv.amountPaid),
          if (inv.balanceDue > 0) _totalRow('Balance due', inv.balanceDue, bold: true),
          const SizedBox(height: 20),
          OutlinedButton.icon(
            onPressed: _pdfBusy ? null : _download,
            icon: const Icon(Icons.picture_as_pdf_outlined),
            label: Text(_pdfBusy ? 'Preparing…' : 'Download PDF'),
          ),
          const SizedBox(height: 10),
          ElevatedButton.icon(
            onPressed: _sendBusy ? null : _send,
            icon: const Icon(Icons.email_outlined),
            label: Text(_sendBusy ? 'Sending…' : 'Send by email'),
          ),
        ],
      ),
    );
  }

  Widget _totalRow(String label, double value, {bool bold = false}) {
    final style = TextStyle(fontWeight: bold ? FontWeight.bold : FontWeight.normal);
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [Text(label, style: style), Text(money.format(value), style: style)],
      ),
    );
  }
}



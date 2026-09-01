import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/day_booking.dart';
import '../models/invoice.dart';

/// One invoice-to-be for a customer, from their uninvoiced day bookings.
class _CustomerGroup {
  final String customerId;
  final String customerName;
  final List<String> bookingIds;
  final List<InvoiceLineItem> lineItems;
  final double total;
  _CustomerGroup(this.customerId, this.customerName, this.bookingIds, this.lineItems, this.total);
}

/// Generates one invoice per customer covering every not-yet-invoiced Walk and
/// Visit booked in the anchor month, mirroring the admin Generate Invoices
/// modal. Pops `true` when invoices were created.
class GenerateInvoicesSheet extends StatefulWidget {
  final DateTime anchorMonth;
  const GenerateInvoicesSheet({super.key, required this.anchorMonth});

  @override
  State<GenerateInvoicesSheet> createState() => _GenerateInvoicesSheetState();
}

class _GenerateInvoicesSheetState extends State<GenerateInvoicesSheet> {
  final _money = NumberFormat.currency(locale: 'en_GB', symbol: '£');
  late final DateTime _monthStart = DateTime(widget.anchorMonth.year, widget.anchorMonth.month, 1);
  late final DateTime _monthEndExclusive =
      DateTime(widget.anchorMonth.year, widget.anchorMonth.month + 1, 1);
  late final String _monthLabel = DateFormat('MMMM yyyy').format(widget.anchorMonth);

  bool _loading = true;
  bool _busy = false;
  String? _error;
  String? _result;
  List<_CustomerGroup> _groups = [];
  String? _expandedId;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final bookings =
          await context.read<Repository>().listDayBookings(from: _monthStart, to: _monthEndExclusive);
      final billable = bookings.where((b) => b.invoiceId == null || b.invoiceId!.isEmpty).toList();

      final byCustomer = <String, List<DayBooking>>{};
      for (final b in billable) {
        (byCustomer[b.customerId] ??= []).add(b);
      }
      final groups = <_CustomerGroup>[];
      byCustomer.forEach((cid, custBookings) {
        // Sum quantity per product into one line item each.
        final byProduct = <String, ({String name, double price, int qty})>{};
        for (final b in custBookings) {
          final existing = byProduct[b.productId];
          byProduct[b.productId] = existing == null
              ? (name: b.productName, price: b.productPrice, qty: b.quantity)
              : (name: existing.name, price: existing.price, qty: existing.qty + b.quantity);
        }
        final lineItems = byProduct.values
            .map((p) => InvoiceLineItem(description: p.name, quantity: p.qty.toDouble(), unitPrice: p.price))
            .toList();
        final total = lineItems.fold<double>(0, (s, li) => s + li.quantity * li.unitPrice);
        groups.add(_CustomerGroup(
          cid,
          custBookings.first.customerName,
          custBookings.map((b) => b.id).toList(),
          lineItems,
          total,
        ));
      });
      groups.sort((a, b) => a.customerName.toLowerCase().compareTo(b.customerName.toLowerCase()));
      setState(() {
        _groups = groups;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _loading = false;
        _error = e is ApiException ? e.message : 'Failed to load this month\'s bookings';
      });
    }
  }

  DateTime _lastWorkingDayOfMonth(DateTime date) {
    var last = DateTime(date.year, date.month + 1, 0);
    if (last.weekday == DateTime.sunday) {
      last = DateTime(last.year, last.month, last.day - 2);
    } else if (last.weekday == DateTime.saturday) {
      last = DateTime(last.year, last.month, last.day - 1);
    }
    return last;
  }

  Future<void> _confirm() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final repo = context.read<Repository>();
      final terms = await repo.listInvoiceTerms();
      InvoiceTerm? defaultTerm;
      for (final t in terms) {
        if (t.isDefault) defaultTerm = t;
      }
      final issueDate = DateTime.now();
      var dueDate = issueDate;
      if (defaultTerm?.endOfMonth ?? false) {
        dueDate = _lastWorkingDayOfMonth(issueDate);
      } else if (defaultTerm?.plusDays != null) {
        dueDate = DateTime(issueDate.year, issueDate.month, issueDate.day + defaultTerm!.plusDays!);
      }

      var count = 0;
      for (final group in _groups) {
        final invoice = await repo.createInvoice(
          customerId: group.customerId,
          lineItems: group.lineItems,
          issueDate: issueDate,
          dueDate: dueDate,
          subject: 'Bookings for $_monthLabel',
          paymentTerms: defaultTerm?.text,
        );
        for (final bookingId in group.bookingIds) {
          await repo.updateDayBooking(bookingId, invoiceId: invoice.id);
        }
        count++;
      }
      setState(() {
        _busy = false;
        _result = 'Created $count invoice${count == 1 ? '' : 's'}.';
      });
    } catch (e) {
      setState(() {
        _busy = false;
        _error = e is ApiException ? e.message : 'Failed to generate invoices';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.only(left: 20, right: 20, top: 20, bottom: 20 + bottomInset),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Generate invoices — $_monthLabel', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 12),
            if (_error != null) ...[
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.error_outline, size: 18, color: Colors.red.shade600),
                  const SizedBox(width: 6),
                  Expanded(child: Text(_error!, style: TextStyle(color: Colors.red.shade700))),
                ],
              ),
              const SizedBox(height: 12),
            ],
            if (_result != null)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: Colors.green.shade50, borderRadius: BorderRadius.circular(8)),
                child: Text(_result!, style: TextStyle(color: Colors.green.shade800)),
              )
            else if (_loading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 40),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_groups.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 20),
                child: Text('Nothing to invoice for $_monthLabel — every booking is already invoiced.',
                    style: TextStyle(color: Colors.grey.shade600)),
              )
            else ...[
              Text('One invoice per customer, covering every not-yet-invoiced Walk and Visit booked in $_monthLabel.',
                  style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
              const SizedBox(height: 12),
              for (final g in _groups) _groupTile(g),
              const SizedBox(height: 8),
              Text('${_groups.length} invoice${_groups.length == 1 ? '' : 's'} will be created.',
                  style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
            ],
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(_result != null),
                  child: Text(_result != null ? 'Close' : 'Cancel'),
                ),
                if (_result == null && !_loading && _groups.isNotEmpty) ...[
                  const SizedBox(width: 8),
                  ElevatedButton(
                    onPressed: _busy ? null : _confirm,
                    child: Text(_busy ? 'Creating…' : 'Confirm & Create'),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _groupTile(_CustomerGroup g) {
    final expanded = _expandedId == g.customerId;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        border: Border.all(color: Colors.grey.shade300),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        children: [
          ListTile(
            onTap: () => setState(() => _expandedId = expanded ? null : g.customerId),
            leading: Icon(expanded ? Icons.expand_less : Icons.expand_more, color: Colors.grey.shade600),
            title: Text(g.customerName, style: const TextStyle(fontWeight: FontWeight.w700)),
            subtitle: Text('${g.lineItems.length} line item${g.lineItems.length == 1 ? '' : 's'}'),
            trailing: Text(_money.format(g.total), style: const TextStyle(fontWeight: FontWeight.w700)),
          ),
          if (expanded)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: Column(
                children: [
                  for (final li in g.lineItems)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 3),
                      child: Row(
                        children: [
                          Expanded(child: Text(li.description, style: const TextStyle(fontSize: 13))),
                          Text('${li.quantity.toStringAsFixed(li.quantity == li.quantity.roundToDouble() ? 0 : 2)} × ${_money.format(li.unitPrice)}',
                              style: TextStyle(fontSize: 13, color: Colors.grey.shade700)),
                          const SizedBox(width: 10),
                          Text(_money.format(li.lineTotal), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                        ],
                      ),
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

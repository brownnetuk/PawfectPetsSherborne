import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/customer.dart';
import '../models/day_booking.dart';
import '../models/invoice.dart';
import '../models/product.dart';
import '../models/visit_mapping.dart';
import '../theme.dart';
import '../utils/travel_lines.dart';
import '../widgets/brand.dart';
import 'create_invoice_screen.dart';

/// The whole booking a calendar entry belongs to: every date and item on it,
/// with a Create Invoice action for the rows not yet invoiced.
///
/// A boarding-stay row's booking is every row sharing its stayId. Walks and
/// visits carry no shared id, so their booking is the pet's consecutive run of
/// booked days around the entry's date (how the calendar infers AM/PM too).
/// Pops `true` when an invoice was created, so the caller reloads.
class BookingSummarySheet extends StatefulWidget {
  final DayBooking entry;
  // The pet's owner (for the travel-charge settings); null if not loaded.
  final Customer? owner;
  final List<Product> products;
  final VisitMapping visitMapping;

  const BookingSummarySheet({
    super.key,
    required this.entry,
    required this.owner,
    required this.products,
    required this.visitMapping,
  });

  @override
  State<BookingSummarySheet> createState() => _BookingSummarySheetState();
}

class _BookingSummarySheetState extends State<BookingSummarySheet> {
  final _money = NumberFormat.currency(locale: 'en_GB', symbol: '£');
  final _dayFmt = DateFormat('EEE d MMM');
  final _dateFmt = DateFormat('d MMM yyyy');
  late final Future<List<DayBooking>> _future = _load();
  bool _busy = false;

  static DateTime _dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

  static bool _isInvoiced(DayBooking b) => b.invoiceId != null && b.invoiceId!.isNotEmpty;

  /// Rows still to be billed: not a placeholder and not yet on an invoice.
  static List<DayBooking> _billable(List<DayBooking> rows) =>
      rows.where((r) => !r.placeholder && !_isInvoiced(r)).toList();

  Future<List<DayBooking>> _load() async {
    final repo = context.read<Repository>();
    final entry = widget.entry;
    if (entry.stayId != null && entry.stayId!.isNotEmpty) {
      final rows = await repo.listStay(entry.stayId!);
      return rows.isEmpty ? [entry] : _sorted(rows);
    }
    final all = await repo.listCustomerDayBookings(entry.customerId);
    // This pet's rows (as the main pet or one of the additional pets on a
    // multi-pet visit), leaving out any boarding stay they're also on.
    bool samePet(DayBooking b) =>
        !b.boardingStay &&
        (b.animalId == entry.animalId ||
            b.additionalAnimalIds.contains(entry.animalId) ||
            entry.additionalAnimalIds.contains(b.animalId));
    final mine = all.where(samePet).toList();
    if (mine.isEmpty) return [entry];
    final days = mine.map((b) => _dateOnly(b.date)).toSet();
    // Walk outwards from the entry's day while the neighbouring day is booked.
    var start = _dateOnly(entry.date);
    while (days.contains(DateTime(start.year, start.month, start.day - 1))) {
      start = DateTime(start.year, start.month, start.day - 1);
    }
    var end = _dateOnly(entry.date);
    while (days.contains(DateTime(end.year, end.month, end.day + 1))) {
      end = DateTime(end.year, end.month, end.day + 1);
    }
    final run = mine.where((b) {
      final d = _dateOnly(b.date);
      return !d.isBefore(start) && !d.isAfter(end);
    }).toList();
    return run.isEmpty ? [entry] : _sorted(run);
  }

  static List<DayBooking> _sorted(List<DayBooking> rows) => [...rows]..sort((a, b) {
      final byDate = a.date.compareTo(b.date);
      if (byDate != 0) return byDate;
      // Pick-up placeholder last; otherwise alphabetical by product.
      if (a.placeholder != b.placeholder) return a.placeholder ? 1 : -1;
      return a.productName.compareTo(b.productName);
    });

  /// One line per product (quantities summed), priced from the catalogue, with
  /// travel charged per Visit/Walk from the owner's settings rather than from
  /// the booked travel rows -- the same rules as the Visits sheet and the
  /// monthly Generate Invoices run.
  List<InvoiceLineItem> _lineItemsFor(List<DayBooking> rows) {
    final catalogue = {for (final p in widget.products) p.id: p};
    final byProduct = <String, ({String name, double price, int qty})>{};
    for (final row in rows) {
      final product = catalogue[row.productId];
      final name = product?.name ?? (row.productName.isNotEmpty ? row.productName : 'Booking');
      final price = product?.price ?? row.productPrice;
      final existing = byProduct[row.productId];
      byProduct[row.productId] = existing == null
          ? (name: name, price: price, qty: row.quantity)
          : (name: existing.name, price: existing.price, qty: existing.qty + row.quantity);
    }
    var lineItems = byProduct.values
        .map((p) => InvoiceLineItem(description: p.name, quantity: p.qty.toDouble(), unitPrice: p.price))
        .toList();
    final travel = travelProductForCustomer(widget.owner, widget.products);
    if (travel != null) {
      final quantity =
          travelQuantityForCustomer(widget.owner, travelUnitsForBookings(rows, widget.visitMapping, travel));
      lineItems = withTravelQuantity(lineItems, travel, quantity);
    }
    return lineItems;
  }

  /// Opens the invoice form pre-filled with the booking's unbilled rows; once
  /// the draft is created, links those rows to it so Generate Invoices skips
  /// them.
  Future<void> _createInvoice(List<DayBooking> rows) async {
    final billable = _billable(rows);
    if (billable.isEmpty) return;
    final dates = billable.map((r) => _dateOnly(r.date)).toList()..sort();
    final first = dates.first;
    final last = dates.last;
    final today = _dateOnly(DateTime.now());
    final invoice = await Navigator.of(context).push<Invoice>(
      MaterialPageRoute(
        builder: (_) => CreateInvoiceScreen(
          customerId: widget.entry.customerId,
          customerName: widget.owner?.name ?? widget.entry.customerName,
          initialLineItems: _lineItemsFor(billable),
          initialSubject: first == last
              ? 'Booking for ${_dateFmt.format(first)}'
              : 'Booking ${_dateFmt.format(first)} – ${_dateFmt.format(last)}',
          // Due on the last date it covers, unless that's already passed (the
          // form rejects a due date before the issue date).
          initialDueDate: last.isBefore(today) ? null : last,
        ),
      ),
    );
    if (invoice == null || !mounted) return;
    final repo = context.read<Repository>();
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);
    setState(() => _busy = true);
    try {
      for (final row in billable) {
        await repo.updateDayBooking(row.id, invoiceId: invoice.id);
      }
    } catch (e) {
      messenger.showSnackBar(SnackBar(
        content: Text(e is ApiException ? e.message : 'Invoice created, but linking the booking to it failed'),
      ));
    }
    navigator.pop(true);
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    final entry = widget.entry;
    return Padding(
      padding: EdgeInsets.only(left: 20, right: 20, top: 20, bottom: 20 + bottomInset),
      child: FutureBuilder<List<DayBooking>>(
        future: _future,
        builder: (context, snapshot) {
          final loading = snapshot.connectionState == ConnectionState.waiting;
          final rows = snapshot.data ?? const <DayBooking>[];
          final billable = _billable(rows);
          final Widget body;
          if (loading) {
            body = const Padding(
              padding: EdgeInsets.symmetric(vertical: 32),
              child: Center(child: CircularProgressIndicator()),
            );
          } else if (snapshot.hasError) {
            body = Padding(
              padding: const EdgeInsets.symmetric(vertical: 16),
              child: Text(
                snapshot.error is ApiException ? (snapshot.error as ApiException).message : 'Failed to load the booking',
                style: TextStyle(color: Colors.red.shade700),
              ),
            );
          } else {
            body = _details(rows);
          }
          return Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('${entry.animalName} — booking', style: Theme.of(context).textTheme.titleMedium),
              if (entry.customerName.isNotEmpty) ...[
                const SizedBox(height: 2),
                Text(entry.customerName, style: TextStyle(color: Colors.grey.shade600)),
              ],
              const SizedBox(height: 12),
              Flexible(child: SingleChildScrollView(child: body)),
              const SizedBox(height: 20),
              Row(
                children: [
                  TextButton(
                    onPressed: _busy ? null : () => Navigator.of(context).pop(false),
                    child: const Text('Close'),
                  ),
                  const Spacer(),
                  ElevatedButton.icon(
                    onPressed: loading || _busy || billable.isEmpty ? null : () => _createInvoice(rows),
                    icon: const Icon(Icons.request_quote_outlined, size: 18),
                    label: Text(
                      _busy
                          ? 'Linking…'
                          : (!loading && rows.isNotEmpty && billable.isEmpty ? 'Invoiced' : 'Create Invoice'),
                    ),
                  ),
                ],
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _details(List<DayBooking> rows) {
    final dates = rows.map((r) => _dateOnly(r.date)).toSet().toList()..sort();
    final first = dates.first;
    final last = dates.last;
    final total = rows.fold<double>(0, (s, b) => s + b.lineTotal);
    final invoicedCount = rows.where((r) => !r.placeholder && _isInvoiced(r)).length;
    final billableCount = rows.where((r) => !r.placeholder).length;
    final dropOff = rows.where((r) => r.dropOffTime != null && r.dropOffTime!.isNotEmpty).firstOrNull;
    final pickUp = rows.where((r) => r.pickUpTime != null && r.pickUpTime!.isNotEmpty).lastOrNull;

    final String datesLabel;
    if (first == last) {
      datesLabel = _dateFmt.format(first);
    } else {
      datesLabel = '${_dayFmt.format(first)} – ${_dateFmt.format(last)} (${dates.length} days)';
    }
    final String invoiceLabel;
    if (invoicedCount == 0) {
      invoiceLabel = 'Not yet invoiced';
    } else if (invoicedCount == billableCount) {
      invoiceLabel = 'Invoiced';
    } else {
      invoiceLabel = 'Partly invoiced ($invoicedCount of $billableCount items)';
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _row('Dates', datesLabel),
        _row('Pets', widget.entry.animalName),
        if (dropOff != null) _row('Drop-off', '${_dayFmt.format(dropOff.date)} at ${dropOff.dropOffTime}'),
        if (pickUp != null) _row('Pick-up', '${_dayFmt.format(pickUp.date)} at ${pickUp.pickUpTime}'),
        _row('Invoice', invoiceLabel),
        const BrandSectionLabel('Items', padding: EdgeInsets.only(top: 8, bottom: 4)),
        for (final date in dates) ...[
          Padding(
            padding: const EdgeInsets.only(top: 8, bottom: 2),
            child: Text(
              _dayFmt.format(date),
              style: const TextStyle(fontWeight: FontWeight.w700, color: brandBlue, fontSize: 13),
            ),
          ),
          for (final b in rows.where((r) => _dateOnly(r.date) == date)) _itemRow(b),
        ],
        const Divider(height: 20),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('Total', style: Theme.of(context).textTheme.titleMedium),
            Text(
              _money.format(total),
              style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
            ),
          ],
        ),
      ],
    );
  }

  Widget _itemRow(DayBooking b) {
    final name = b.placeholder ? 'Pick-up (no charge)' : (b.productName.isEmpty ? '(product)' : b.productName);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Text.rich(
              TextSpan(
                text: name,
                style: const TextStyle(fontSize: 13.5),
                children: [
                  if (!b.placeholder)
                    TextSpan(
                      text: '  · Qty ${b.quantity}',
                      style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
                    ),
                ],
              ),
            ),
          ),
          if (_isInvoiced(b) && !b.placeholder)
            const Padding(
              padding: EdgeInsets.only(left: 6, right: 6),
              child: Icon(Icons.check_circle, size: 16, color: brandBlue),
            ),
          if (!b.placeholder)
            Text(_money.format(b.lineTotal), style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5)),
        ],
      ),
    );
  }

  Widget _row(String label, String value) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(width: 80, child: Text(label, style: TextStyle(color: Colors.grey.shade600))),
            Expanded(child: Text(value)),
          ],
        ),
      );
}

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
    return Padding(
      padding: EdgeInsets.only(left: 20, right: 20, top: 16, bottom: 20 + bottomInset),
      child: FutureBuilder<List<DayBooking>>(
        future: _future,
        builder: (context, snapshot) {
          final loading = snapshot.connectionState == ConnectionState.waiting;
          final rows = snapshot.data ?? const <DayBooking>[];
          final billable = _billable(rows);
          final allInvoiced = !loading && rows.isNotEmpty && billable.isEmpty;
          final Widget body;
          if (loading) {
            body = const Padding(
              padding: EdgeInsets.symmetric(vertical: 40),
              child: Center(child: CircularProgressIndicator()),
            );
          } else if (snapshot.hasError) {
            body = Padding(
              padding: const EdgeInsets.symmetric(vertical: 16),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.error_outline, size: 18, color: Colors.red.shade600),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      snapshot.error is ApiException
                          ? (snapshot.error as ApiException).message
                          : 'Failed to load the booking',
                      style: TextStyle(color: Colors.red.shade700),
                    ),
                  ),
                ],
              ),
            );
          } else {
            body = _details(rows);
          }
          return Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _handle(),
              _header(loading ? null : rows),
              const SizedBox(height: 12),
              Flexible(child: SingleChildScrollView(child: body)),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _busy ? null : () => Navigator.of(context).pop(false),
                      child: const Text('Close'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: ElevatedButton.icon(
                      onPressed: loading || _busy || billable.isEmpty ? null : () => _createInvoice(rows),
                      icon: Icon(allInvoiced ? Icons.check_circle_outline : Icons.request_quote_outlined, size: 18),
                      label: Text(
                        _busy ? 'Linking…' : (allInvoiced ? 'Invoiced' : 'Create Invoice'),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
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

  // The sheet's grab handle.
  Widget _handle() => Center(
        child: Container(
          width: 36,
          height: 4,
          margin: const EdgeInsets.only(bottom: 14),
          decoration: BoxDecoration(color: brandRule, borderRadius: BorderRadius.circular(2)),
        ),
      );

  /// Pets + owner, with the invoice state as a pill once the rows are known.
  Widget _header(List<DayBooking>? rows) {
    final entry = widget.entry;
    Widget? pill;
    if (rows != null && rows.isNotEmpty) {
      final chargeable = rows.where((r) => !r.placeholder).toList();
      final invoiced = chargeable.where(_isInvoiced).length;
      if (invoiced == 0) {
        pill = _pill('Not invoiced', background: brandYellowTint, foreground: brandInk);
      } else if (invoiced == chargeable.length) {
        pill = _pill('Invoiced', background: brandBlueTint, foreground: brandBlue, icon: Icons.check_circle);
      } else {
        pill = _pill('Partly invoiced', background: brandBlueTint, foreground: brandBlue);
      }
    }
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 40,
          height: 40,
          decoration: const BoxDecoration(color: brandBlueTint, shape: BoxShape.circle),
          child: const Icon(Icons.pets, size: 20, color: brandBlue),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                entry.animalName,
                style: const TextStyle(fontFamily: displayFont, fontSize: 18, color: brandBlue, height: 1.15),
              ),
              if (entry.customerName.isNotEmpty) ...[
                const SizedBox(height: 2),
                Text(entry.customerName, style: const TextStyle(color: brandMuted, fontSize: 13)),
              ],
            ],
          ),
        ),
        if (pill != null) ...[const SizedBox(width: 8), pill],
      ],
    );
  }

  Widget _pill(String label, {required Color background, required Color foreground, IconData? icon}) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(999)),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[Icon(icon, size: 14, color: foreground), const SizedBox(width: 4)],
            Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: foreground)),
          ],
        ),
      );

  /// What one day shows and charges. Booked rows map one-to-one; when the
  /// owner is travel-chargeable the day also gets a travel line worked out
  /// from the settings (per Visit and/or per Walk) in place of any booked
  /// travel rows, so the sheet shows what Create Invoice will charge.
  List<_Line> _linesForDay(List<DayBooking> dayRows, Product? travel) {
    final lines = <_Line>[];
    for (final b in dayRows) {
      if (travel != null && b.productId == travel.id) continue;
      lines.add(_Line(
        name: b.placeholder ? 'Pick-up (no charge)' : (b.productName.isEmpty ? '(product)' : b.productName),
        quantity: b.quantity,
        unitPrice: b.productPrice,
        total: b.lineTotal,
        invoiced: !b.placeholder && _isInvoiced(b),
        placeholder: b.placeholder,
      ));
    }
    if (travel != null) {
      final quantity =
          travelQuantityForCustomer(widget.owner, travelUnitsForBookings(dayRows, widget.visitMapping, travel));
      if (quantity > 0) {
        // Travel counts as invoiced once the day's own items are.
        final chargeable = lines.where((l) => !l.placeholder).toList();
        lines.add(_Line(
          name: travel.name,
          quantity: quantity,
          unitPrice: travel.price,
          total: quantity * travel.price,
          invoiced: chargeable.isNotEmpty && chargeable.every((l) => l.invoiced),
          travel: true,
        ));
      }
    }
    return lines;
  }

  Widget _details(List<DayBooking> rows) {
    final dates = rows.map((r) => _dateOnly(r.date)).toSet().toList()..sort();
    final first = dates.first;
    final last = dates.last;
    final dropOff = rows.where((r) => r.dropOffTime != null && r.dropOffTime!.isNotEmpty).firstOrNull;
    final pickUp = rows.where((r) => r.pickUpTime != null && r.pickUpTime!.isNotEmpty).lastOrNull;

    final travel = travelProductForCustomer(widget.owner, widget.products);
    final linesByDay = {
      for (final date in dates) date: _linesForDay(rows.where((r) => _dateOnly(r.date) == date).toList(), travel),
    };
    final allLines = linesByDay.values.expand((l) => l).toList();
    final total = allLines.fold<double>(0, (s, l) => s + l.total);
    final travelLines = allLines.where((l) => l.travel).toList();
    final travelQuantity = travelLines.fold<int>(0, (s, l) => s + l.quantity);
    final travelTotal = travelLines.fold<double>(0, (s, l) => s + l.total);

    final String datesLabel;
    if (first == last) {
      datesLabel = DateFormat('EEE d MMM yyyy').format(first);
    } else {
      datesLabel = '${_dayFmt.format(first)} – ${_dayFmt.format(last)} ${last.year}';
    }
    final days = dates.length;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Summary card: dates (with the day count), drop-off, pick-up, travel.
        Card(
          margin: EdgeInsets.zero,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
            child: Column(
              children: [
                _summaryRow(Icons.calendar_today_outlined, datesLabel, trailing: '$days day${days == 1 ? '' : 's'}'),
                if (dropOff != null) ...[
                  const SizedBox(height: 8),
                  _summaryRow(Icons.login, 'Drop-off ${_dayFmt.format(dropOff.date)}', trailing: dropOff.dropOffTime),
                ],
                if (pickUp != null) ...[
                  const SizedBox(height: 8),
                  _summaryRow(Icons.logout, 'Pick-up ${_dayFmt.format(pickUp.date)}', trailing: pickUp.pickUpTime),
                ],
                if (travel != null) ...[
                  const SizedBox(height: 8),
                  _summaryRow(
                    Icons.directions_car_outlined,
                    travelQuantity == 0 ? 'No travel charge' : '$travelQuantity × ${travel.name}',
                    trailing: travelQuantity == 0 ? null : _money.format(travelTotal),
                  ),
                ],
              ],
            ),
          ),
        ),
        const BrandSectionLabel('Items', padding: EdgeInsets.only(top: 18, bottom: 8)),
        for (final date in dates) _dayCard(date, linesByDay[date]!),
        const SizedBox(height: 6),
        // Total as the calendar's revenue banner: blue band, yellow pill.
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(color: brandBlue, borderRadius: BorderRadius.circular(14)),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Row(
                children: [
                  Icon(Icons.payments_outlined, size: 18, color: Colors.white),
                  SizedBox(width: 8),
                  Text('BOOKING TOTAL',
                      style: TextStyle(
                          fontWeight: FontWeight.w700, color: Colors.white, fontSize: 12, letterSpacing: 1.2)),
                ],
              ),
              RefPill(_money.format(total), fontSize: 15),
            ],
          ),
        ),
      ],
    );
  }

  Widget _summaryRow(IconData icon, String label, {String? trailing}) => Row(
        children: [
          Icon(icon, size: 16, color: brandBlue),
          const SizedBox(width: 10),
          Expanded(child: Text(label, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600))),
          if (trailing != null) ...[
            const SizedBox(width: 8),
            Text(trailing, style: const TextStyle(fontSize: 13, color: brandMuted, fontWeight: FontWeight.w600)),
          ],
        ],
      );

  /// One day's items: the date and the day's subtotal in the header, then a
  /// row per item with its price and quantity in a fixed right-hand column so
  /// long product names wrap on the left instead of pushing the price about.
  Widget _dayCard(DateTime date, List<_Line> items) {
    final dayTotal = items.fold<double>(0, (s, l) => s + l.total);
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 10, 14, 6),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    _dayFmt.format(date),
                    style: const TextStyle(fontWeight: FontWeight.w700, color: brandBlue, fontSize: 13.5),
                  ),
                ),
                Text(
                  _money.format(dayTotal),
                  style: const TextStyle(fontSize: 12.5, color: brandMuted, fontWeight: FontWeight.w600),
                ),
              ],
            ),
            const Divider(height: 12, color: brandRule),
            for (final b in items) _itemRow(b),
          ],
        ),
      ),
    );
  }

  Widget _itemRow(_Line line) {
    // Leading marker: a tick once invoiced, a car for the derived travel
    // line, otherwise a small dot.
    final Widget marker;
    if (line.invoiced) {
      marker = const Icon(Icons.check_circle, size: 14, color: brandBlue);
    } else if (line.travel) {
      marker = const Icon(Icons.directions_car_outlined, size: 14, color: brandMuted);
    } else {
      marker = const Padding(padding: EdgeInsets.all(3), child: Icon(Icons.circle, size: 8, color: brandRule));
    }
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(padding: const EdgeInsets.only(top: 3), child: marker),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              line.name,
              style: TextStyle(
                fontSize: 14,
                color: line.placeholder || line.travel ? brandMuted : brandInk,
                fontStyle: line.travel ? FontStyle.italic : FontStyle.normal,
                height: 1.3,
              ),
            ),
          ),
          const SizedBox(width: 12),
          if (!line.placeholder)
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(_money.format(line.total),
                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: brandInk)),
                Text(
                  line.quantity == 1 ? 'Qty 1' : 'Qty ${line.quantity} × ${_money.format(line.unitPrice)}',
                  style: const TextStyle(fontSize: 11.5, color: brandMuted),
                ),
              ],
            ),
        ],
      ),
    );
  }
}

/// One displayed item: a booked row, or the travel line derived from the
/// owner's settings ([travel]), which has no row of its own on the calendar.
class _Line {
  final String name;
  final int quantity;
  final double unitPrice;
  final double total;
  final bool invoiced;
  final bool placeholder;
  final bool travel;

  const _Line({
    required this.name,
    required this.quantity,
    required this.unitPrice,
    required this.total,
    required this.invoiced,
    this.placeholder = false,
    this.travel = false,
  });
}

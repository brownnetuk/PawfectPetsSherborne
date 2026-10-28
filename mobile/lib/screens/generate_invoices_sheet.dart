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
import '../utils/travel_lines.dart';

/// One invoice-to-be for a customer, from their uninvoiced day bookings.
class _CustomerGroup {
  final String customerId;
  final String customerName;
  final List<String> bookingIds;

  /// Booked products with any travel rows stripped out -- travel is charged
  /// per Visit (and optionally per Walk), not per travel row booked. See
  /// `_linesFor`.
  final List<InvoiceLineItem> baseLineItems;

  /// The customer's travel product, when they're travel-chargeable.
  final Product? travel;

  /// Travel always charged for Visits (1 x Visit -> 1, 2 x Visit -> 2).
  final int visitTravel;

  /// Travel staff can opt into for Walks, one per walk.
  final int walkTravel;

  /// The customer's latest booked date this month -- the generated invoice
  /// falls due on the last day of what it covers.
  final DateTime lastDate;
  _CustomerGroup({
    required this.customerId,
    required this.customerName,
    required this.bookingIds,
    required this.baseLineItems,
    required this.travel,
    required this.visitTravel,
    required this.walkTravel,
    required this.lastDate,
  });
}

/// Generates one invoice per customer covering every not-yet-invoiced Walk and
/// Visit booked in the anchor month, mirroring the admin Generate Invoices
/// modal. Every customer starts ticked; untick any to leave them for a later
/// run. Pops `true` when invoices were created.
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

  /// Customers whose invoice will be created -- all of them by default.
  final Set<String> _selectedIds = {};

  /// Customers whose Walks this month should carry travel too (opt-in).
  final Set<String> _walkTravelIds = {};

  List<_CustomerGroup> get _selected => _groups.where((g) => _selectedIds.contains(g.customerId)).toList();

  /// The lines the invoice would be created with right now: the booked
  /// products plus travel for Visits, and for Walks when ticked.
  List<InvoiceLineItem> _linesFor(_CustomerGroup g) {
    final travel = g.travel;
    if (travel == null) return g.baseLineItems;
    final walks = _walkTravelIds.contains(g.customerId) ? g.walkTravel : 0;
    return withTravelQuantity(g.baseLineItems, travel, g.visitTravel + walks);
  }

  double get _selectedTotal => _selected.fold<double>(0, (s, g) => s + lineItemsTotal(_linesFor(g)));

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final repo = context.read<Repository>();
      final results = await Future.wait([
        repo.listDayBookings(from: _monthStart, to: _monthEndExclusive),
        repo.listCustomers(),
        repo.listProducts(),
        repo.getVisitMapping(),
      ]);
      final bookings = results[0] as List<DayBooking>;
      final customers = {for (final c in results[1] as List<Customer>) c.id: c};
      final products = results[2] as List<Product>;
      final mapping = results[3] as VisitMapping;
      // Same filter as the admin's GenerateInvoicesModal: uninvoiced rows,
      // excluding a boarding stay's never-billed pick-up placeholder.
      final billable = bookings
          .where((b) => (b.invoiceId == null || b.invoiceId!.isEmpty) && !b.placeholder)
          .toList();

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
        final booked = byProduct.values
            .map((p) => InvoiceLineItem(description: p.name, quantity: p.qty.toDouble(), unitPrice: p.price))
            .toList();
        // Travel is charged per Visit (2 x Visit -> 2 x Travel), not per
        // travel row booked -- those also land on Walks, Day Care and
        // Boarding days. Walk travel is offered per customer in the tile.
        final travel = travelProductForCustomer(customers[cid], products);
        final units = travel == null ? const TravelUnits() : travelUnitsForBookings(custBookings, mapping, travel);
        final lastDate = custBookings.map((b) => b.date).reduce((a, b) => a.isAfter(b) ? a : b);
        groups.add(_CustomerGroup(
          customerId: cid,
          customerName: custBookings.first.customerName,
          bookingIds: custBookings.map((b) => b.id).toList(),
          baseLineItems: travel == null ? booked : withTravelQuantity(booked, travel, 0),
          travel: travel,
          visitTravel: units.visits,
          walkTravel: units.walks,
          lastDate: lastDate,
        ));
      });
      groups.sort((a, b) => a.customerName.toLowerCase().compareTo(b.customerName.toLowerCase()));
      setState(() {
        _groups = groups;
        _selectedIds
          ..clear()
          ..addAll(groups.map((g) => g.customerId));
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _loading = false;
        _error = e is ApiException ? e.message : 'Failed to load this month\'s bookings';
      });
    }
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

      var count = 0;
      for (final group in _selected) {
        final invoice = await repo.createInvoice(
          customerId: group.customerId,
          lineItems: _linesFor(group),
          issueDate: issueDate,
          dueDate: group.lastDate,
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
              Text('One invoice per customer, covering every not-yet-invoiced Walk and Visit booked in $_monthLabel. '
                  'Untick anyone to leave them for a later run.',
                  style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  onPressed: _busy
                      ? null
                      : () => setState(() {
                            if (_selectedIds.length == _groups.length) {
                              _selectedIds.clear();
                            } else {
                              _selectedIds.addAll(_groups.map((g) => g.customerId));
                            }
                          }),
                  child: Text(_selectedIds.length == _groups.length ? 'Select none' : 'Select all'),
                ),
              ),
              for (final g in _groups) _groupTile(g),
              const SizedBox(height: 8),
              // Running total of what's ticked, so staff can see the month's
              // billing at a glance before confirming.
              Row(
                children: [
                  Expanded(
                    child: Text(
                      '${_selected.length} of ${_groups.length} invoice${_groups.length == 1 ? '' : 's'} will be created.',
                      style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
                    ),
                  ),
                  Text('Total ', style: TextStyle(color: Colors.grey.shade700, fontSize: 13)),
                  Text(_money.format(_selectedTotal), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                ],
              ),
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
                    onPressed: _busy || _selected.isEmpty ? null : _confirm,
                    child: Text(_busy
                        ? 'Creating…'
                        : 'Confirm & Create${_selected.length == _groups.length ? '' : ' (${_selected.length})'}'),
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
    final selected = _selectedIds.contains(g.customerId);
    final lineItems = _linesFor(g);
    final travel = g.travel;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        border: Border.all(color: selected ? Colors.grey.shade300 : Colors.grey.shade200),
        borderRadius: BorderRadius.circular(8),
        color: selected ? null : Colors.grey.shade50,
      ),
      child: Column(
        children: [
          // Tick to include this customer; tap the row/chevron to see the lines.
          ListTile(
            onTap: () => setState(() => _expandedId = expanded ? null : g.customerId),
            contentPadding: const EdgeInsets.only(left: 4, right: 12),
            leading: Checkbox(
              value: selected,
              onChanged: _busy
                  ? null
                  : (v) => setState(() {
                        if (v == true) {
                          _selectedIds.add(g.customerId);
                        } else {
                          _selectedIds.remove(g.customerId);
                        }
                      }),
            ),
            title: Text(g.customerName,
                style: TextStyle(fontWeight: FontWeight.w700, color: selected ? null : Colors.grey.shade600)),
            subtitle: Text('${lineItems.length} line item${lineItems.length == 1 ? '' : 's'}'),
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(_money.format(lineItemsTotal(lineItems)),
                    style: TextStyle(fontWeight: FontWeight.w700, color: selected ? null : Colors.grey.shade600)),
                const SizedBox(width: 4),
                Icon(expanded ? Icons.expand_less : Icons.expand_more, color: Colors.grey.shade600),
              ],
            ),
          ),
          // Walks only carry travel when staff tick it (Visits always do).
          if (travel != null && g.walkTravel > 0)
            CheckboxListTile(
              dense: true,
              contentPadding: const EdgeInsets.only(left: 44, right: 12),
              controlAffinity: ListTileControlAffinity.leading,
              value: _walkTravelIds.contains(g.customerId),
              onChanged: _busy || !selected
                  ? null
                  : (v) => setState(() {
                        if (v == true) {
                          _walkTravelIds.add(g.customerId);
                        } else {
                          _walkTravelIds.remove(g.customerId);
                        }
                      }),
              title: Text('Add travel for walks too (${g.walkTravel} × ${travel.name})',
                  style: const TextStyle(fontSize: 13)),
            ),
          if (expanded)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: Column(
                children: [
                  for (final li in lineItems)
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

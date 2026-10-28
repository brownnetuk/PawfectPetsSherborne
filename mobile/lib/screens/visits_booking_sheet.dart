import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/bank_holiday.dart';
import '../models/customer.dart';
import '../models/day_booking.dart';
import '../models/invoice.dart';
import '../models/product.dart';
import '../models/visit_mapping.dart';
import '../utils/visit_plan.dart';

/// Books "Visits" across a date range, mirroring the admin New Booking modal:
/// for each day in the range it looks up the product from the Visits mapping
/// (visit count × day-type) and creates a day booking per selected dog, adding
/// the owner's travel product when configured. Once created, offers to raise
/// a draft invoice for just those rows and then to email it, same as the
/// admin's BookingInvoicePrompt. Pops `true` when anything was created.
class VisitsBookingSheet extends StatefulWidget {
  final List<Customer> customers;
  final List<AnimalRef> animals;
  final List<Product> products;
  final VisitMapping visitMapping;
  final List<BankHoliday> bankHolidays;

  const VisitsBookingSheet({
    super.key,
    required this.customers,
    required this.animals,
    required this.products,
    required this.visitMapping,
    required this.bankHolidays,
  });

  @override
  State<VisitsBookingSheet> createState() => _VisitsBookingSheetState();
}

class _VisitsBookingSheetState extends State<VisitsBookingSheet> {
  String? _customerId;
  final Set<String> _animalIds = {};
  int _visitsPerDay = 1;
  // Visit length in minutes ('20' | '30' | '40') -- picks which Settings >
  // Bookings > Visits product set the plan is built from, as in the admin.
  String _visitDuration = '20';
  DateTime? _startDate;
  int _visitsFirstDay = 1;
  String _amPmFirstDay = 'PM';
  DateTime? _endDate;
  int _visitsLastDay = 1;
  String _amPmLastDay = 'AM';
  bool _busy = false;
  String? _error;
  String? _result;

  final _dateFmt = DateFormat('d MMM yyyy');

  static String _ymd(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  List<AnimalRef> get _customerAnimals =>
      widget.animals.where((a) => a.customerId == _customerId).toList()
        ..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));

  Customer? _ownerOf(String id) {
    for (final c in widget.customers) {
      if (c.id == id) return c;
    }
    return null;
  }

  Future<void> _pickDate({required bool isStart}) async {
    final initial = (isStart ? _startDate : _endDate) ?? DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
    );
    if (picked != null) {
      setState(() {
        final d = DateTime(picked.year, picked.month, picked.day);
        if (isStart) {
          _startDate = d;
        } else {
          _endDate = d;
        }
      });
    }
  }

  Future<void> _submit() async {
    final custId = _customerId;
    final start = _startDate;
    final end = _endDate;
    setState(() => _error = null);
    if (custId == null) {
      setState(() => _error = 'Choose a customer.');
      return;
    }
    if (_animalIds.isEmpty) {
      setState(() => _error = 'Choose at least one animal.');
      return;
    }
    if (start == null || end == null) {
      setState(() => _error = 'Choose a start and end date.');
      return;
    }
    if (end.isBefore(start)) {
      setState(() => _error = 'End date must be on or after the start date.');
      return;
    }

    // The day-by-day product plan (shared across selected animals), including
    // the AM/PM override for a single-visit first/last day.
    final result = buildVisitPlan(
      start: start,
      end: end,
      visitsPerDay: _visitsPerDay,
      visitsFirstDay: _visitsFirstDay,
      visitsLastDay: _visitsLastDay,
      mapping: widget.visitMapping,
      bankHolidays: widget.bankHolidays,
      duration: _visitDuration,
      amPmFirstDay: _amPmFirstDay,
      amPmLastDay: _amPmLastDay,
    );
    final plan = result.plan;
    if (result.missing.isNotEmpty) {
      setState(() => _error =
          'No product is configured in Settings > Bookings > Visits for: ${result.missing.join(', ')}.');
      return;
    }

    setState(() => _busy = true);
    try {
      final repo = context.read<Repository>();
      // Skip days already booked for a dog (same as the admin create path).
      final existing = await repo.listDayBookings(
        from: start,
        to: DateTime(end.year, end.month, end.day + 1),
      );
      final existingKeys = {
        for (final b in existing)
          for (final id in [b.animalId, ...b.additionalAnimalIds]) '$id|${_ymd(b.date.toLocal())}',
      };

      // One booking per day for all the selected pets (one product, billed
      // once) -- the first pet is the booking's animal, the rest ride along
      // as additionalAnimals -- not a booking per pet.
      final ids = _animalIds.toList();
      final primaryId = ids.first;
      final otherIds = ids.sublist(1);
      final animal = widget.animals.where((a) => a.id == primaryId).firstOrNull;
      final owner = animal == null ? null : _ownerOf(animal.customerId);
      final travelId = (owner?.travelChargeable ?? false) ? owner?.travelProductId : null;

      // Every row created this time round -- what the invoice prompt bills.
      final createdRows = <DayBooking>[];
      var skipped = 0;
      for (final entry in plan) {
        if (ids.any((id) => existingKeys.contains('$id|${_ymd(entry.date)}'))) {
          skipped++;
          continue;
        }
        createdRows.add(await repo.createDayBooking(
          animalId: primaryId,
          additionalAnimalIds: otherIds,
          date: entry.date,
          productId: entry.productId,
          quantity: 1,
          visitTime: entry.visitTime,
        ));
        if (travelId != null && travelId.isNotEmpty && travelId != entry.productId) {
          createdRows.add(await repo.createDayBooking(
            animalId: primaryId,
            date: entry.date,
            productId: travelId,
            quantity: 1,
          ));
        }
      }
      final created = createdRows.length;
      setState(() {
        _busy = false;
        _result = 'Created $created booking${created == 1 ? '' : 's'}'
            '${skipped > 0 ? ', skipped $skipped already booked' : ''}.';
      });
      if (created > 0 && mounted) {
        await _offerInvoice(repo, custId, createdRows);
      }
    } catch (e) {
      setState(() {
        _busy = false;
        _error = e is ApiException ? e.message : 'Failed to save the booking';
      });
    }
  }

  /// A yes/no question on top of the sheet. Pops with the dialog's own
  /// context (showDialog uses the root navigator, not this sheet's).
  Future<bool> _ask({
    required String title,
    required String message,
    required String noLabel,
    required String yesLabel,
  }) async {
    final result = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialogContext).pop(false), child: Text(noLabel)),
          FilledButton(onPressed: () => Navigator.of(dialogContext).pop(true), child: Text(yesLabel)),
        ],
      ),
    );
    return result ?? false;
  }

  /// Invoices a new booking can still be added to: not paid or cancelled,
  /// and with something left to pay. Newest first. Same rule as the admin's
  /// BookingInvoicePrompt.
  List<Invoice> _openInvoices(List<Invoice> invoices, String customerId) {
    return invoices.where((inv) {
      if (inv.customer.id != customerId) return false;
      if (inv.status == 'paid' || inv.status == 'cancelled') return false;
      return !(inv.amountPaid > 0 && inv.amountPaid >= inv.total);
    }).toList()
      ..sort((a, b) => b.issueDate.compareTo(a.issueDate));
  }

  /// Months between the invoice's issue date and now: negative for earlier
  /// months, 0 for this month, positive for later months.
  int _issuedMonthOffset(Invoice inv) {
    final now = DateTime.now();
    final issued = inv.issueDate.toLocal();
    return (issued.year - now.year) * 12 + (issued.month - now.month);
  }

  /// Folds the new booking's lines into an invoice's existing ones: a line
  /// for the same item at the same price (and no discount) gains quantity,
  /// anything else is appended.
  List<InvoiceLineItem> _mergeLineItems(List<InvoiceLineItem> existing, List<InvoiceLineItem> added) {
    final merged = [...existing];
    for (final item in added) {
      final i = merged.indexWhere((li) =>
          li.description == item.description && li.unitPrice == item.unitPrice && li.discountPercent == 0);
      if (i >= 0) {
        final li = merged[i];
        merged[i] = InvoiceLineItem(
          description: li.description,
          quantity: li.quantity + item.quantity,
          unitPrice: li.unitPrice,
        );
      } else {
        merged.add(item);
      }
    }
    return merged;
  }

  /// When the customer already has open invoices: add to one of them
  /// (grouped as this month, later, earlier), or create a new one. Returns the chosen invoice,
  /// `null` for a new invoice, or `false` when dismissed.
  Future<Object?> _pickInvoice(List<Invoice> open) async {
    final money = NumberFormat.currency(locale: 'en_GB', symbol: '£');
    final thisMonth = open.where((inv) => _issuedMonthOffset(inv) == 0).toList();
    // Soonest first.
    final later = open.where((inv) => _issuedMonthOffset(inv) > 0).toList().reversed.toList();
    final earlier = open.where((inv) => _issuedMonthOffset(inv) < 0).toList();
    Widget heading(String text) => Padding(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 0),
          child: Text(text, style: Theme.of(context).textTheme.labelMedium),
        );
    Widget option(BuildContext dialogContext, Invoice inv) => SimpleDialogOption(
          onPressed: () => Navigator.of(dialogContext).pop(inv),
          child: Text('Add to ${inv.invoiceNumber} · ${_dateFmt.format(inv.issueDate.toLocal())} · '
              '${money.format(inv.total)} · ${inv.status}'),
        );
    final result = await showDialog<Object>(
      context: context,
      builder: (dialogContext) => SimpleDialog(
        title: const Text('Add to an invoice?'),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 0, 24, 8),
            child: Text(
              'This customer already has ${open.length == 1 ? 'an open invoice' : '${open.length} open invoices'}. '
              'Add this booking to ${open.length == 1 ? 'it' : 'one of them'}, or create a new draft?',
            ),
          ),
          if (thisMonth.isNotEmpty) heading('This month'),
          for (final inv in thisMonth) option(dialogContext, inv),
          if (later.isNotEmpty) heading('Later months'),
          for (final inv in later) option(dialogContext, inv),
          if (earlier.isNotEmpty) heading('Earlier'),
          for (final inv in earlier) option(dialogContext, inv),
          SimpleDialogOption(
            onPressed: () => Navigator.of(dialogContext).pop('new'),
            child: const Text('Create a new draft invoice'),
          ),
          SimpleDialogOption(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Not now'),
          ),
        ],
      ),
    );
    if (result is Invoice) return result;
    if (result == 'new') return null;
    return false;
  }

  /// Asked straight after the bookings are created, mirroring the admin's
  /// BookingInvoicePrompt: "Generate an invoice?" Yes raises one draft
  /// invoice from just the rows created (one line per product, travel rows
  /// included since the sheet books them as their own product) and links
  /// those rows to it so the monthly Generate Invoices run skips them. If the
  /// customer already has open invoices, staff can add the rows to one of
  /// them instead. Then offers to email it straight away. Either
  /// step declined leaves the bookings (and any draft) exactly as they are.
  Future<void> _offerInvoice(Repository repo, String customerId, List<DayBooking> rows) async {
    final customerName = _ownerOf(customerId)?.name ?? 'the customer';

    List<Invoice> open = const [];
    try {
      open = _openInvoices(await repo.listInvoices(customerId: customerId), customerId);
    } catch (_) {
      // Not being able to look is no reason to block creating a new one.
    }
    if (!mounted) return;

    final Invoice? addTo;
    if (open.isNotEmpty) {
      final picked = await _pickInvoice(open);
      if (picked == false || !mounted) return;
      addTo = picked as Invoice?;
    } else {
      addTo = null;
      final generate = await _ask(
        title: 'Generate an invoice?',
        message: 'Create a draft invoice for this booking now?',
        noLabel: 'No',
        yesLabel: 'Yes, create draft',
      );
      if (!generate || !mounted) return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });
    final Invoice invoice;
    try {
      // Sum quantity per product into one line item each, pricing from the
      // catalogue (the create response may carry only the product id).
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
      final lineItems = byProduct.values
          .map((p) => InvoiceLineItem(description: p.name, quantity: p.qty.toDouble(), unitPrice: p.price))
          .toList();

      final dates = rows.map((r) => DateTime(r.date.year, r.date.month, r.date.day)).toList()..sort();
      final first = dates.first;
      final last = dates.last;

      if (addTo != null) {
        // Re-read it so lines added since the list loaded aren't lost.
        final current = await repo.getInvoice(addTo.id);
        final currentDue = current.dueDate.toLocal();
        invoice = await repo.updateInvoice(current.id, {
          'lineItems': _mergeLineItems(current.lineItems, lineItems).map((e) => e.toJson()).toList(),
          // Still due on the last date it covers, if the new booking runs later.
          if (last.isAfter(DateTime(currentDue.year, currentDue.month, currentDue.day)))
            'dueDate': last.toIso8601String(),
        });
      } else {
        final terms = await repo.listInvoiceTerms();
        InvoiceTerm? defaultTerm;
        for (final t in terms) {
          if (t.isDefault) defaultTerm = t;
        }

        // Drafted by the server; due on the last date it covers, same as the
        // monthly run.
        invoice = await repo.createInvoice(
          customerId: customerId,
          lineItems: lineItems,
          issueDate: DateTime.now(),
          dueDate: last,
          paymentTerms: defaultTerm?.text,
          subject: first == last
              ? 'Booking for ${_dateFmt.format(first)}'
              : 'Booking ${_dateFmt.format(first)} – ${_dateFmt.format(last)}',
        );
      }
      for (final row in rows) {
        await repo.updateDayBooking(row.id, invoiceId: invoice.id);
      }
      if (!mounted) return;
      setState(() {
        _busy = false;
        _result = addTo != null
            ? '$_result Added to invoice ${invoice.invoiceNumber}.'
            : '$_result Draft invoice ${invoice.invoiceNumber} created.';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = e is ApiException ? e.message : 'Failed to generate the invoice';
      });
      return;
    }

    final send = await _ask(
      title: 'Send invoice',
      message: 'Email invoice ${invoice.invoiceNumber} to $customerName?',
      noLabel: 'Not now',
      yesLabel: 'Send',
    );
    if (!send || !mounted) return;

    setState(() => _busy = true);
    try {
      await repo.sendInvoiceEmail(invoice.id);
      if (!mounted) return;
      setState(() {
        _busy = false;
        _result = '$_result Emailed to $customerName.';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = e is ApiException ? e.message : 'Failed to send the invoice';
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
            Text('New booking', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 16),
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
            if (_result != null) ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: Colors.green.shade50, borderRadius: BorderRadius.circular(8)),
                child: Text(_result!, style: TextStyle(color: Colors.green.shade800)),
              ),
              // Raising/emailing the invoice after the bookings are in.
              if (_busy) ...[
                const SizedBox(height: 12),
                const LinearProgressIndicator(),
              ],
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _busy ? null : () => Navigator.of(context).pop(true),
                  child: const Text('Close'),
                ),
              ),
            ] else ...[
              DropdownButtonFormField<String>(
                initialValue: _customerId,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Customer'),
                hint: const Text('Select a customer'),
                items: ([...widget.customers]
                      ..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase())))
                    .map((c) => DropdownMenuItem(value: c.id, child: Text(c.name, overflow: TextOverflow.ellipsis)))
                    .toList(),
                onChanged: (v) => setState(() {
                  _customerId = v;
                  _animalIds.clear();
                }),
              ),
              const SizedBox(height: 12),
              Text('Animals', style: TextStyle(color: Colors.grey.shade700, fontSize: 12, fontWeight: FontWeight.w600)),
              if (_customerId == null)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Text('Select a customer first.', style: TextStyle(color: Colors.grey.shade600)),
                )
              else if (_customerAnimals.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Text('This customer has no animals on file.', style: TextStyle(color: Colors.grey.shade600)),
                )
              else
                for (final a in _customerAnimals)
                  CheckboxListTile(
                    contentPadding: EdgeInsets.zero,
                    dense: true,
                    controlAffinity: ListTileControlAffinity.leading,
                    value: _animalIds.contains(a.id),
                    onChanged: (v) => setState(() {
                      if (v == true) {
                        _animalIds.add(a.id);
                      } else {
                        _animalIds.remove(a.id);
                      }
                    }),
                    title: Text('${a.name}${a.species.isNotEmpty ? ' (${a.species})' : ''}'),
                  ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: _visitsDropdown('How many visits per day', _visitsPerDay, (v) => setState(() => _visitsPerDay = v)),
                  ),
                  const SizedBox(width: 12),
                  Expanded(child: _durationDropdown('Visit length', _visitDuration, (v) => setState(() => _visitDuration = v))),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(child: _dateField('Start date', _startDate, () => _pickDate(isStart: true))),
                  const SizedBox(width: 12),
                  Expanded(child: _visitsDropdown('Visits, first day', _visitsFirstDay, (v) => setState(() => _visitsFirstDay = v))),
                  const SizedBox(width: 12),
                  Expanded(child: _amPmDropdown('AM/PM', _amPmFirstDay, _visitsFirstDay, (v) => setState(() => _amPmFirstDay = v))),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(child: _dateField('End date', _endDate, () => _pickDate(isStart: false))),
                  const SizedBox(width: 12),
                  Expanded(child: _visitsDropdown('Visits, end day', _visitsLastDay, (v) => setState(() => _visitsLastDay = v))),
                  const SizedBox(width: 12),
                  Expanded(child: _amPmDropdown('AM/PM', _amPmLastDay, _visitsLastDay, (v) => setState(() => _amPmLastDay = v))),
                ],
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _busy ? null : _submit,
                  child: Text(_busy ? 'Creating…' : 'Create booking'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  // AM/PM override, only meaningful (and enabled) when that day's visit count
  // is 1 — a 2-visit day always covers both.
  Widget _amPmDropdown(String label, String value, int visitCount, ValueChanged<String> onChanged) {
    final enabled = visitCount == 1;
    return DropdownButtonFormField<String>(
      initialValue: enabled ? value : null,
      decoration: InputDecoration(labelText: label),
      hint: const Text('—'),
      items: const [
        DropdownMenuItem(value: 'AM', child: Text('AM')),
        DropdownMenuItem(value: 'PM', child: Text('PM')),
      ],
      onChanged: enabled
          ? (v) {
              if (v != null) onChanged(v);
            }
          : null,
    );
  }

  /// 20 / 30 / 40 minute visit length -- the admin's "Visit Length" select.
  Widget _durationDropdown(String label, String value, ValueChanged<String> onChanged) {
    return DropdownButtonFormField<String>(
      initialValue: value,
      decoration: InputDecoration(labelText: label),
      items: [
        for (final d in VisitMapping.visitDurations) DropdownMenuItem(value: d, child: Text('$d minutes')),
      ],
      onChanged: (v) {
        if (v != null) onChanged(v);
      },
    );
  }

  Widget _visitsDropdown(String label, int value, ValueChanged<int> onChanged) {
    return DropdownButtonFormField<int>(
      initialValue: value,
      decoration: InputDecoration(labelText: label),
      items: const [
        DropdownMenuItem(value: 1, child: Text('1')),
        DropdownMenuItem(value: 2, child: Text('2')),
      ],
      onChanged: (v) {
        if (v != null) onChanged(v);
      },
    );
  }

  Widget _dateField(String label, DateTime? date, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      child: InputDecorator(
        decoration: InputDecoration(labelText: label),
        child: Text(date == null ? 'Choose' : _dateFmt.format(date)),
      ),
    );
  }
}

extension _FirstOrNull<E> on Iterable<E> {
  E? get firstOrNull {
    final it = iterator;
    return it.moveNext() ? it.current : null;
  }
}

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/bank_holiday.dart';
import '../models/customer.dart';
import '../models/day_booking.dart';
import '../models/product.dart';
import '../models/visit_mapping.dart';
import '../utils/visit_plan.dart';

/// Books "Visits" across a date range, mirroring the admin New Booking modal:
/// for each day in the range it looks up the product from the Visits mapping
/// (visit count × day-type) and creates a day booking per selected dog, adding
/// the owner's travel product when configured. Pops `true` when anything was
/// created.
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
      final existingKeys = existing.map((b) => '${b.animalId}|${_ymd(b.date.toLocal())}').toSet();

      var created = 0;
      var skipped = 0;
      for (final id in _animalIds) {
        final animal = widget.animals.where((a) => a.id == id).firstOrNull;
        final owner = animal == null ? null : _ownerOf(animal.customerId);
        final travelId =
            (owner?.travelChargeable ?? false) ? owner?.travelProductId : null;
        for (final entry in plan) {
          if (existingKeys.contains('$id|${_ymd(entry.date)}')) {
            skipped++;
            continue;
          }
          await repo.createDayBooking(
            animalId: id,
            date: entry.date,
            productId: entry.productId,
            quantity: 1,
            visitTime: entry.visitTime,
          );
          created++;
          if (travelId != null && travelId.isNotEmpty && travelId != entry.productId) {
            await repo.createDayBooking(
              animalId: id,
              date: entry.date,
              productId: travelId,
              quantity: 1,
            );
            created++;
          }
        }
      }
      setState(() {
        _busy = false;
        _result = 'Created $created booking${created == 1 ? '' : 's'}'
            '${skipped > 0 ? ', skipped $skipped already booked' : ''}.';
      });
    } catch (e) {
      setState(() {
        _busy = false;
        _error = e is ApiException ? e.message : 'Failed to save the booking';
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
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () => Navigator.of(context).pop(true),
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
              _visitsDropdown('How many visits per day', _visitsPerDay, (v) => setState(() => _visitsPerDay = v)),
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

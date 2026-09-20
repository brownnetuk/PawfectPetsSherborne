import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/animal.dart';
import '../models/bank_holiday.dart';
import '../models/customer.dart';
import '../models/invoice.dart';
import '../models/product.dart';
import '../models/quote.dart';
import '../models/visit_mapping.dart';
import '../utils/visit_plan.dart';

class _FormData {
  final List<Product> products;
  final List<InvoiceTerm> terms;
  final Customer? customer;
  final List<Animal> pets;
  final List<BankHoliday> bankHolidays;
  final VisitMapping visitMapping;
  _FormData(this.products, this.terms, this.customer, this.pets, this.bankHolidays, this.visitMapping);
}

/// Create or edit a quote against an existing customer ([customerId]) or a
/// manual customer ([manualCustomerName] + [manualCustomerEmail]). Mirrors
/// CreateInvoiceScreen but with a "valid until" date and quote endpoints.
class CreateQuoteScreen extends StatefulWidget {
  final String? customerId;
  final String customerName;
  final String? manualCustomerName;
  final String? manualCustomerEmail;
  final Quote? quote;
  const CreateQuoteScreen({
    super.key,
    this.customerId,
    required this.customerName,
    this.manualCustomerName,
    this.manualCustomerEmail,
    this.quote,
  });

  bool get isEditing => quote != null;
  bool get isManual => customerId == null || customerId!.isEmpty;

  @override
  State<CreateQuoteScreen> createState() => _CreateQuoteScreenState();
}

class _CreateQuoteScreenState extends State<CreateQuoteScreen> {
  final _subjectController = TextEditingController();
  final List<_LineItemEntry> _items = [_LineItemEntry()];
  final List<Product> _extraProducts = [];
  DateTime _issueDate = DateTime.now();
  DateTime _validUntil = DateTime.now().add(const Duration(days: 30));
  bool _submitting = false;
  late Future<_FormData> _dataFuture;
  List<InvoiceTerm> _terms = [];
  InvoiceTerm? _selectedTerm;

  // "Visits" toggle: auto-populate line items from the Visits mapping.
  bool _showVisits = false;
  final Set<String> _visitAnimalIds = {};
  int _visitsPerDay = 1;
  DateTime? _visitStart;
  DateTime? _visitEnd;
  int _visitsFirstDay = 1;
  int _visitsLastDay = 1;
  String? _visitError;
  String? _visitInfo;

  // "Day Care" toggle: a single day's drop off/collection, resolved to the
  // Half/Full Day product -- mirrors the admin quote form's Day Care section.
  bool _showDayCare = false;
  final Set<String> _dayCareAnimalIds = {};
  DateTime? _dayCareDate;
  String _dropOffPeriod = 'AM';
  TimeOfDay? _dropOffTime;
  String _collectionPeriod = 'PM';
  TimeOfDay? _collectionTime;
  String? _dayCareError;
  String? _dayCareInfo;

  // "Boarding" toggle: a stay's date range + drop off/pick up times, priced by
  // the backend boarding-plan endpoint -- mirrors the admin's Boarding section.
  bool _showBoarding = false;
  final Set<String> _boardingAnimalIds = {};
  DateTime? _boardingStart;
  TimeOfDay? _boardingDropOffTime;
  DateTime? _boardingEnd;
  TimeOfDay? _boardingPickUpTime;
  String? _boardingError;
  String? _boardingInfo;
  bool _boardingSaving = false;

  // A quote only ever carries one of Visits/Day Care/Boarding (the schema
  // stores at most one plan), so turning one toggle on turns the others off --
  // same mutual exclusivity as the admin quote form.
  void _enableVisits(bool v) => setState(() {
        _showVisits = v;
        if (v) {
          _showDayCare = false;
          _showBoarding = false;
        }
      });
  void _enableDayCare(bool v) => setState(() {
        _showDayCare = v;
        if (v) {
          _showVisits = false;
          _showBoarding = false;
        }
      });
  void _enableBoarding(bool v) => setState(() {
        _showBoarding = v;
        if (v) {
          _showVisits = false;
          _showDayCare = false;
        }
      });

  @override
  void initState() {
    super.initState();
    final repo = context.read<Repository>();
    _dataFuture = () async {
      final products = await repo.listProducts();
      final terms = await repo.listInvoiceTerms();
      Customer? customer;
      var pets = <Animal>[];
      if (!widget.isManual) {
        customer = await repo.getCustomer(widget.customerId!);
        pets = await repo.listAnimals(widget.customerId!);
      }
      final bankHolidays = await repo.listBankHolidays();
      final visitMapping = await repo.getVisitMapping();
      return _FormData(products, terms, customer, pets, bankHolidays, visitMapping);
    }();
    _dataFuture.then((data) async {
      if (!mounted) return;
      _terms = data.terms;
      if (widget.isEditing) {
        final q = await repo.getQuote(widget.quote!.id);
        if (!mounted) return;
        setState(() => _prefillFromQuote(q, data.products));
      } else {
        InvoiceTerm? def;
        for (final t in data.terms) {
          if (t.isDefault) {
            def = t;
            break;
          }
        }
        setState(() {
          _selectedTerm = def;
          if (def != null) _applyTermValidUntil(def);
        });
      }
    }).catchError((_) {});
  }

  void _prefillFromQuote(Quote q, List<Product> catalogue) {
    _subjectController.text = q.subject ?? '';
    _issueDate = q.issueDate;
    _validUntil = q.validUntil;
    InvoiceTerm? term;
    for (final t in _terms) {
      if (t.text == q.paymentTerms) {
        term = t;
        break;
      }
    }
    if (term == null && (q.paymentTerms ?? '').isNotEmpty) {
      term = InvoiceTerm(id: '', text: q.paymentTerms!);
      _terms = [..._terms, term];
    }
    _selectedTerm = term;
    for (final e in _items) {
      e.dispose();
    }
    _items.clear();
    for (final li in q.lineItems) {
      Product? product;
      for (final p in catalogue) {
        if (p.name == li.description) {
          product = p;
          break;
        }
      }
      if (product == null) {
        product = Product(id: '', productCode: '', name: li.description, price: li.unitPrice);
        _extraProducts.add(product);
      }
      _items.add(_LineItemEntry()
        ..product = product
        ..quantity.text = _trimNum(li.quantity)
        ..discount.text = li.discountPercent > 0 ? _trimNum(li.discountPercent) : '');
    }
    if (_items.isEmpty) _items.add(_LineItemEntry());
  }

  @override
  void dispose() {
    _subjectController.dispose();
    for (final item in _items) {
      item.dispose();
    }
    super.dispose();
  }

  double get _total => _items.fold(0, (sum, item) => sum + item.lineTotal);

  void _addItem() => setState(() => _items.add(_LineItemEntry()));

  Future<void> _pickVisitDate({required bool isStart}) async {
    final initial = (isStart ? _visitStart : _visitEnd) ?? DateTime.now();
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
          _visitStart = d;
        } else {
          _visitEnd = d;
        }
      });
    }
  }

  // Runs the same Visits-mapping plan the Bookings page uses and merges the
  // aggregated products (summed across every selected animal and day) into the
  // line items, keeping anything already typed.
  void _saveVisits(_FormData data) {
    setState(() {
      _visitError = null;
      _visitInfo = null;
    });
    if (_visitAnimalIds.isEmpty) {
      setState(() => _visitError = 'Choose at least one animal.');
      return;
    }
    if (_visitStart == null || _visitEnd == null) {
      setState(() => _visitError = 'Choose a start and end date.');
      return;
    }
    if (_visitEnd!.isBefore(_visitStart!)) {
      setState(() => _visitError = 'End date must be on or after the start date.');
      return;
    }
    final result = buildVisitPlan(
      start: _visitStart!,
      end: _visitEnd!,
      visitsPerDay: _visitsPerDay,
      visitsFirstDay: _visitsFirstDay,
      visitsLastDay: _visitsLastDay,
      mapping: data.visitMapping,
      bankHolidays: data.bankHolidays,
    );
    if (result.missing.isNotEmpty) {
      setState(() => _visitError =
          'No product is configured in Settings > Bookings > Visits for: ${result.missing.join(', ')}.');
      return;
    }
    final animalCount = _visitAnimalIds.length;
    final byProduct = <String, int>{};
    for (final d in result.plan) {
      byProduct[d.productId] = (byProduct[d.productId] ?? 0) + animalCount;
    }
    setState(() {
      _mergeProductsIntoItems(byProduct, data.products);
      _visitInfo = 'Added to line items.';
    });
  }

  // Merges a by-product quantity map into the line items, keeping anything
  // with a product already chosen and summing quantities into an existing row
  // for the same product. Shared by the Visits/Day Care/Boarding "Add to line
  // items" buttons; must be called inside setState.
  void _mergeProductsIntoItems(Map<String, int> byProduct, List<Product> products) {
    // Drop still-blank starter rows, keep anything with a product chosen.
    final kept = _items.where((e) => e.product != null).toList();
    for (final e in _items) {
      if (!kept.contains(e)) e.dispose();
    }
    _items
      ..clear()
      ..addAll(kept);
    byProduct.forEach((pid, qty) {
      Product? product;
      for (final p in products) {
        if (p.id == pid) product = p;
      }
      if (product == null) return;
      _LineItemEntry? existing;
      for (final e in _items) {
        if (e.product?.id == pid) existing = e;
      }
      if (existing != null) {
        final cur = double.tryParse(existing.quantity.text.trim()) ?? 0;
        final total = cur + qty;
        existing.quantity.text = total == total.roundToDouble() ? total.toStringAsFixed(0) : total.toStringAsFixed(2);
      } else {
        _items.add(_LineItemEntry()
          ..product = product
          ..quantity.text = '$qty');
      }
    });
    if (_items.isEmpty) _items.add(_LineItemEntry());
  }

  // Resolves the single Day Care product (Full Day for an AM drop off + PM
  // collection, else Half Day -- the same rule the admin quote form and New
  // Booking modal use) and adds one line, quantity per animal.
  void _saveDayCare(_FormData data) {
    setState(() {
      _dayCareError = null;
      _dayCareInfo = null;
    });
    if (_dayCareAnimalIds.isEmpty) {
      setState(() => _dayCareError = 'Choose at least one animal.');
      return;
    }
    if (_dayCareDate == null || _dropOffTime == null || _collectionTime == null) {
      setState(() => _dayCareError = 'Choose a date, and both a drop off and collection time.');
      return;
    }
    final isFullDay = _dropOffPeriod == 'AM' && _collectionPeriod == 'PM';
    final productId = isFullDay ? data.visitMapping.dayCareFullDay : data.visitMapping.dayCareHalfDay;
    if (productId == null) {
      setState(() => _dayCareError =
          'No product is configured in Settings > Bookings > Day Care for: ${isFullDay ? 'Full Day' : 'Half Day'}.');
      return;
    }
    setState(() {
      _mergeProductsIntoItems({productId: _dayCareAnimalIds.length}, data.products);
      _dayCareInfo = 'Added to line items.';
    });
  }

  // Calls the same backend boarding-plan endpoint the admin uses (whole 24h
  // boarding days + a leftover half day, with 2nd-dog rates), then aggregates
  // its day-by-day lines into line items by product.
  Future<void> _saveBoarding(_FormData data) async {
    setState(() {
      _boardingError = null;
      _boardingInfo = null;
    });
    if (_boardingAnimalIds.isEmpty) {
      setState(() => _boardingError = 'Choose at least one animal.');
      return;
    }
    if (_boardingStart == null || _boardingEnd == null) {
      setState(() => _boardingError = 'Choose a start and end date.');
      return;
    }
    if (_boardingDropOffTime == null || _boardingPickUpTime == null) {
      setState(() => _boardingError = 'Choose a drop off and pick up time.');
      return;
    }
    final startIso = '${_ymd(_boardingStart!)}T${_hm(_boardingDropOffTime!)}:00';
    final endIso = '${_ymd(_boardingEnd!)}T${_hm(_boardingPickUpTime!)}:00';
    if (!DateTime.parse(endIso).isAfter(DateTime.parse(startIso))) {
      setState(() => _boardingError = 'Pick up must be after drop off.');
      return;
    }
    setState(() => _boardingSaving = true);
    try {
      final plan = await context
          .read<Repository>()
          .getBoardingPlan(startIso, endIso, _boardingAnimalIds.length);
      final missing = (plan['missing'] as List<dynamic>? ?? []);
      if (missing.isNotEmpty) {
        setState(() =>
            _boardingError = 'No product is configured in Settings > Bookings for: ${missing.join(', ')}.');
        return;
      }
      final lines = (plan['lines'] as List<dynamic>? ?? []);
      if (lines.isEmpty) {
        setState(() => _boardingError = 'This stay is too short to book anything. Check the dates and times.');
        return;
      }
      final byProduct = <String, int>{};
      for (final line in lines.whereType<Map<String, dynamic>>()) {
        // Placeholder lines (the unbilled pick-up-day presence marker) don't
        // carry a charge, so they never become line items.
        if (line['placeholder'] == true) continue;
        final pid = line['productId'] as String?;
        if (pid == null) continue;
        byProduct[pid] = (byProduct[pid] ?? 0) + 1;
      }
      if (!mounted) return;
      setState(() {
        _mergeProductsIntoItems(byProduct, data.products);
        _boardingInfo = 'Added to line items.';
      });
    } catch (e) {
      if (mounted) {
        setState(() =>
            _boardingError = e is ApiException ? e.message : 'Failed to work out the boarding plan');
      }
    } finally {
      if (mounted) setState(() => _boardingSaving = false);
    }
  }

  Widget _visitsSection(_FormData data) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Visits'),
          subtitle: const Text('Auto-populate line items from the Visits mapping'),
          value: _showVisits,
          onChanged: _enableVisits,
        ),
        if (_showVisits) ...[
          Text('Animals', style: TextStyle(color: Colors.grey.shade700, fontSize: 12, fontWeight: FontWeight.w600)),
          if (widget.isManual || data.pets.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Text(
                widget.isManual ? 'Select a customer first.' : 'This customer has no animals on file.',
                style: TextStyle(color: Colors.grey.shade600),
              ),
            )
          else
            for (final p in data.pets)
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                dense: true,
                controlAffinity: ListTileControlAffinity.leading,
                value: _visitAnimalIds.contains(p.id),
                onChanged: (v) => setState(() {
                  if (v == true) {
                    _visitAnimalIds.add(p.id);
                  } else {
                    _visitAnimalIds.remove(p.id);
                  }
                }),
                title: Text('${p.name}${p.species.isNotEmpty ? ' (${p.species})' : ''}'),
              ),
          const SizedBox(height: 8),
          _visitsCountDropdown('How many visits per day', _visitsPerDay, (v) => setState(() => _visitsPerDay = v)),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(child: _visitDateField('Start date', _visitStart, () => _pickVisitDate(isStart: true))),
              const SizedBox(width: 12),
              Expanded(child: _visitsCountDropdown('Visits, first', _visitsFirstDay, (v) => setState(() => _visitsFirstDay = v))),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(child: _visitDateField('End date', _visitEnd, () => _pickVisitDate(isStart: false))),
              const SizedBox(width: 12),
              Expanded(child: _visitsCountDropdown('Visits, last', _visitsLastDay, (v) => setState(() => _visitsLastDay = v))),
            ],
          ),
          if (_visitError != null) ...[
            const SizedBox(height: 8),
            Text(_visitError!, style: TextStyle(color: Colors.red.shade700, fontSize: 13)),
          ],
          if (_visitInfo != null) ...[
            const SizedBox(height: 8),
            Text(_visitInfo!, style: TextStyle(color: Colors.green.shade700, fontSize: 13)),
          ],
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: () => _saveVisits(data),
              icon: const Icon(Icons.playlist_add, size: 18),
              label: const Text('Add to line items'),
            ),
          ),
          const Divider(),
        ],
        const SizedBox(height: 8),
      ],
    );
  }

  // The animal checkboxes shared by all three plan sections, each driving its
  // own selection set.
  List<Widget> _animalChecklist(_FormData data, Set<String> selected) {
    if (widget.isManual || data.pets.isEmpty) {
      return [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Text(
            widget.isManual ? 'Select a customer first.' : 'This customer has no animals on file.',
            style: TextStyle(color: Colors.grey.shade600),
          ),
        ),
      ];
    }
    return [
      for (final p in data.pets)
        CheckboxListTile(
          contentPadding: EdgeInsets.zero,
          dense: true,
          controlAffinity: ListTileControlAffinity.leading,
          value: selected.contains(p.id),
          onChanged: (v) => setState(() {
            if (v == true) {
              selected.add(p.id);
            } else {
              selected.remove(p.id);
            }
          }),
          title: Text('${p.name}${p.species.isNotEmpty ? ' (${p.species})' : ''}'),
        ),
    ];
  }

  Widget _dayCareSection(_FormData data) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Day Care'),
          subtitle: const Text("Auto-populate line items from a single day's drop off/collection"),
          value: _showDayCare,
          onChanged: _enableDayCare,
        ),
        if (_showDayCare) ...[
          Text('Animals', style: TextStyle(color: Colors.grey.shade700, fontSize: 12, fontWeight: FontWeight.w600)),
          ..._animalChecklist(data, _dayCareAnimalIds),
          const SizedBox(height: 8),
          _visitDateField('Date', _dayCareDate, () => _pickDay(_dayCareDate, (d) => _dayCareDate = d)),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(child: _periodDropdown('Drop off', _dropOffPeriod, (v) => setState(() => _dropOffPeriod = v))),
              const SizedBox(width: 12),
              Expanded(
                child: _timeField('Drop off time', _dropOffTime, () => _pickTime(_dropOffTime, (t) => _dropOffTime = t)),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: _periodDropdown('Collection', _collectionPeriod, (v) => setState(() => _collectionPeriod = v)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _timeField(
                    'Collection time', _collectionTime, () => _pickTime(_collectionTime, (t) => _collectionTime = t)),
              ),
            ],
          ),
          if (_dayCareError != null) ...[
            const SizedBox(height: 8),
            Text(_dayCareError!, style: TextStyle(color: Colors.red.shade700, fontSize: 13)),
          ],
          if (_dayCareInfo != null) ...[
            const SizedBox(height: 8),
            Text(_dayCareInfo!, style: TextStyle(color: Colors.green.shade700, fontSize: 13)),
          ],
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: () => _saveDayCare(data),
              icon: const Icon(Icons.playlist_add, size: 18),
              label: const Text('Add to line items'),
            ),
          ),
          const Divider(),
        ],
        const SizedBox(height: 8),
      ],
    );
  }

  Widget _boardingSection(_FormData data) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Boarding'),
          subtitle: const Text("Auto-populate line items from a stay's dates and times"),
          value: _showBoarding,
          onChanged: _enableBoarding,
        ),
        if (_showBoarding) ...[
          Text('Animals', style: TextStyle(color: Colors.grey.shade700, fontSize: 12, fontWeight: FontWeight.w600)),
          ..._animalChecklist(data, _boardingAnimalIds),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: _visitDateField('Start date', _boardingStart, () => _pickDay(_boardingStart, (d) => _boardingStart = d)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _timeField('Drop off time', _boardingDropOffTime,
                    () => _pickTime(_boardingDropOffTime, (t) => _boardingDropOffTime = t)),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: _visitDateField('End date', _boardingEnd, () => _pickDay(_boardingEnd, (d) => _boardingEnd = d)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _timeField('Pick up time', _boardingPickUpTime,
                    () => _pickTime(_boardingPickUpTime, (t) => _boardingPickUpTime = t)),
              ),
            ],
          ),
          if (_boardingError != null) ...[
            const SizedBox(height: 8),
            Text(_boardingError!, style: TextStyle(color: Colors.red.shade700, fontSize: 13)),
          ],
          if (_boardingInfo != null) ...[
            const SizedBox(height: 8),
            Text(_boardingInfo!, style: TextStyle(color: Colors.green.shade700, fontSize: 13)),
          ],
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: _boardingSaving ? null : () => _saveBoarding(data),
              icon: const Icon(Icons.playlist_add, size: 18),
              label: Text(_boardingSaving ? 'Working out the plan…' : 'Add to line items'),
            ),
          ),
          const Divider(),
        ],
        const SizedBox(height: 8),
      ],
    );
  }

  Widget _periodDropdown(String label, String value, ValueChanged<String> onChanged) {
    return DropdownButtonFormField<String>(
      initialValue: value,
      isDense: true,
      decoration: InputDecoration(labelText: label, isDense: true),
      items: const [
        DropdownMenuItem(value: 'AM', child: Text('AM')),
        DropdownMenuItem(value: 'PM', child: Text('PM')),
      ],
      onChanged: (v) {
        if (v != null) onChanged(v);
      },
    );
  }

  Widget _timeField(String label, TimeOfDay? time, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      child: InputDecorator(
        decoration: InputDecoration(labelText: label, isDense: true),
        child: Text(time == null ? 'Choose' : _hm(time)),
      ),
    );
  }

  Future<void> _pickDay(DateTime? current, ValueChanged<DateTime> assign) async {
    final picked = await showDatePicker(
      context: context,
      initialDate: current ?? DateTime.now(),
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
    );
    if (picked != null) {
      setState(() => assign(DateTime(picked.year, picked.month, picked.day)));
    }
  }

  Future<void> _pickTime(TimeOfDay? current, ValueChanged<TimeOfDay> assign) async {
    final picked = await showTimePicker(
      context: context,
      initialTime: current ?? const TimeOfDay(hour: 9, minute: 0),
    );
    if (picked != null) setState(() => assign(picked));
  }

  static String _ymd(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  static String _hm(TimeOfDay t) =>
      '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

  Widget _visitsCountDropdown(String label, int value, ValueChanged<int> onChanged) {
    return DropdownButtonFormField<int>(
      initialValue: value,
      isDense: true,
      decoration: InputDecoration(labelText: label, isDense: true),
      items: const [
        DropdownMenuItem(value: 1, child: Text('1')),
        DropdownMenuItem(value: 2, child: Text('2')),
      ],
      onChanged: (v) {
        if (v != null) onChanged(v);
      },
    );
  }

  Widget _visitDateField(String label, DateTime? date, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      child: InputDecorator(
        decoration: InputDecoration(labelText: label, isDense: true),
        child: Text(date == null ? 'Choose' : _formatDate(date)),
      ),
    );
  }

  Future<void> _confirmRemoveItem(int index) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Remove line item?'),
        content: const Text('This removes the selected line from the quote.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red.shade600),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (ok == true) setState(() => _items.removeAt(index).dispose());
  }

  void _applyTermValidUntil(InvoiceTerm t) {
    if (t.endOfMonth) {
      _validUntil = DateTime(_issueDate.year, _issueDate.month + 1, 0);
    } else if (t.plusDays != null) {
      _validUntil = _issueDate.add(Duration(days: t.plusDays!));
    }
  }

  Future<void> _pickDate({required bool isIssue}) async {
    final picked = await showDatePicker(
      context: context,
      initialDate: isIssue ? _issueDate : _validUntil,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
    );
    if (picked != null) {
      setState(() {
        if (isIssue) {
          _issueDate = picked;
          if (_selectedTerm != null) _applyTermValidUntil(_selectedTerm!);
        } else {
          _validUntil = picked;
        }
      });
    }
  }

  String? _validate() {
    if (_items.where((i) => i.isValid).isEmpty) {
      return 'Add at least one line item with a product and quantity.';
    }
    if (_validUntil.isBefore(_issueDate)) {
      return 'The valid-until date cannot be before the issue date.';
    }
    return null;
  }

  Future<void> _submit({bool send = false}) async {
    final error = _validate();
    if (error != null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error)));
      return;
    }
    final repo = context.read<Repository>();
    setState(() => _submitting = true);
    try {
      final lineItems = _items.where((i) => i.isValid).map((i) => i.toLineItem()).toList();
      // The toggled-on plan's inputs, when complete, ride along on the quote
      // so accepting it books the stay/day/visits on the calendar -- same
      // plans the admin's quote form persists. A quote carries at most one of
      // the three, so choosing one explicitly nulls the other two; with no
      // toggle on, all three are omitted (not nulled) so an edit here can't
      // wipe a plan saved elsewhere.
      Map<String, dynamic>? visitPlan;
      if (_showVisits &&
          _visitAnimalIds.isNotEmpty &&
          _visitStart != null &&
          _visitEnd != null &&
          !_visitEnd!.isBefore(_visitStart!)) {
        visitPlan = {
          'animals': _visitAnimalIds.toList(),
          'startDate': _ymd(_visitStart!),
          'endDate': _ymd(_visitEnd!),
          'visitsPerDay': '$_visitsPerDay',
          'visitsFirstDay': '$_visitsFirstDay',
          'visitsLastDay': '$_visitsLastDay',
        };
      }
      Map<String, dynamic>? dayCarePlan;
      if (_showDayCare &&
          _dayCareAnimalIds.isNotEmpty &&
          _dayCareDate != null &&
          _dropOffTime != null &&
          _collectionTime != null) {
        dayCarePlan = {
          'animals': _dayCareAnimalIds.toList(),
          'date': _ymd(_dayCareDate!),
          'dropOffPeriod': _dropOffPeriod,
          'dropOffTime': _hm(_dropOffTime!),
          'collectionPeriod': _collectionPeriod,
          'collectionTime': _hm(_collectionTime!),
        };
      }
      Map<String, dynamic>? boardingPlan;
      if (_showBoarding &&
          _boardingAnimalIds.isNotEmpty &&
          _boardingStart != null &&
          _boardingEnd != null &&
          _boardingDropOffTime != null &&
          _boardingPickUpTime != null) {
        boardingPlan = {
          'animals': _boardingAnimalIds.toList(),
          'startDate': _ymd(_boardingStart!),
          'dropOffTime': _hm(_boardingDropOffTime!),
          'endDate': _ymd(_boardingEnd!),
          'pickUpTime': _hm(_boardingPickUpTime!),
        };
      }
      final hasPlan = visitPlan != null || dayCarePlan != null || boardingPlan != null;
      final Quote quote;
      if (widget.isEditing) {
        quote = await repo.updateQuote(widget.quote!.id, {
          'lineItems': lineItems.map((i) => i.toJson()).toList(),
          'issueDate': _issueDate.toIso8601String(),
          'validUntil': _validUntil.toIso8601String(),
          'subject': _subjectController.text.trim(),
          'paymentTerms': _selectedTerm?.text ?? '',
          if (hasPlan) ...{
            'visitPlan': visitPlan,
            'dayCarePlan': dayCarePlan,
            'boardingPlan': boardingPlan,
          },
        });
      } else {
        quote = await repo.createQuote(
          customerId: widget.isManual ? null : widget.customerId,
          manualCustomerName: widget.isManual ? widget.manualCustomerName : null,
          manualCustomerEmail: widget.isManual ? widget.manualCustomerEmail : null,
          lineItems: lineItems,
          issueDate: _issueDate,
          validUntil: _validUntil,
          subject: _subjectController.text.trim(),
          paymentTerms: _selectedTerm?.text ?? '',
          visitPlan: visitPlan,
          dayCarePlan: dayCarePlan,
          boardingPlan: boardingPlan,
        );
        if (send) await repo.sendQuoteEmail(quote.id);
      }
      if (!mounted) return;
      Navigator.of(context).pop(quote);
      final verb = widget.isEditing ? 'updated' : (send ? 'created & sent' : 'created');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Quote ${quote.quoteNumber} $verb')),
      );
    } catch (e) {
      if (mounted) {
        final message = e is ApiException ? e.message : 'Failed to save quote';
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.isEditing ? 'Edit quote' : 'New quote')),
      body: FutureBuilder<_FormData>(
        future: _dataFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            final message = snapshot.error is ApiException
                ? (snapshot.error as ApiException).message
                : 'Failed to load';
            return Center(child: Text(message, textAlign: TextAlign.center));
          }
          final data = snapshot.data!;
          if (data.products.isEmpty && _extraProducts.isEmpty) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Text(
                  'No products have been set up yet. Add products in the admin app before raising a quote.',
                  textAlign: TextAlign.center,
                ),
              ),
            );
          }
          return _buildForm(context, data);
        },
      ),
    );
  }

  Widget _buildForm(BuildContext context, _FormData data) {
    final address = data.customer?.address;
    final products = [...data.products, ..._extraProducts];
    return ListView(
      padding: const EdgeInsets.all(20),
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      children: [
        Text(widget.customerName, style: Theme.of(context).textTheme.titleLarge),
        if (widget.isManual && (widget.manualCustomerEmail ?? '').isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text('${widget.manualCustomerEmail}  ·  Manual customer',
                style: TextStyle(color: Colors.grey.shade700)),
          )
        else if (address != null && address.trim().isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text(address, style: TextStyle(color: Colors.grey.shade700)),
          ),
        if (data.pets.isNotEmpty) ...[
          const SizedBox(height: 8),
          Text('Pets', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.grey.shade600)),
          for (final p in data.pets) Text('• ${p.name} (${p.breed})'),
        ],
        const SizedBox(height: 16),
        TextField(
          controller: _subjectController,
          maxLines: 1,
          decoration: const InputDecoration(labelText: 'Subject', hintText: 'Optional', isDense: true),
        ),
        const SizedBox(height: 16),
        _sectionTitle('Dates'),
        _dateRow('Issue date', _issueDate, () => _pickDate(isIssue: true)),
        _dateRow('Valid until', _validUntil, () => _pickDate(isIssue: false)),
        const SizedBox(height: 16),
        _visitsSection(data),
        _dayCareSection(data),
        _boardingSection(data),
        _sectionTitle('Line items'),
        ..._items.asMap().entries.map(
              (entry) => _LineItemEditor(
                key: ObjectKey(entry.value),
                entry: entry.value,
                products: products,
                onChanged: () => setState(() {}),
                onRemove: _items.length > 1 ? () => _confirmRemoveItem(entry.key) : null,
              ),
            ),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: _addItem,
            icon: const Icon(Icons.add),
            label: const Text('Add line item'),
          ),
        ),
        const SizedBox(height: 12),
        _sectionTitle('Payment terms'),
        if (_terms.isEmpty)
          Text('No payment terms set up. Add them in the admin app.',
              style: TextStyle(color: Colors.grey.shade600))
        else
          DropdownButtonFormField<InvoiceTerm>(
            initialValue: _selectedTerm,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Payment terms', isDense: true),
            hint: const Text('Choose payment terms'),
            items: _terms
                .map((t) => DropdownMenuItem(value: t, child: Text(t.text, overflow: TextOverflow.ellipsis)))
                .toList(),
            onChanged: (t) => setState(() {
              _selectedTerm = t;
              if (t != null) _applyTermValidUntil(t);
            }),
          ),
        const SizedBox(height: 24),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('Total', style: Theme.of(context).textTheme.titleMedium),
            Text(_formatMoney(_total),
                style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
          ],
        ),
        const SizedBox(height: 20),
        if (widget.isEditing)
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _submitting ? null : _submit,
              child: Text(_submitting ? 'Saving…' : 'Save changes'),
            ),
          )
        else
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: _submitting ? null : () => _submit(),
                  child: Text(_submitting ? 'Saving…' : 'Create Draft'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: ElevatedButton(
                  onPressed: _submitting ? null : () => _submit(send: true),
                  child: Text(_submitting ? 'Saving…' : 'Create & Send'),
                ),
              ),
            ],
          ),
      ],
    );
  }

  Widget _dateRow(String label, DateTime date, VoidCallback onTap) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(
          children: [
            SizedBox(width: 110, child: Text(label, style: TextStyle(color: Colors.grey.shade600))),
            Expanded(
              child: OutlinedButton(
                onPressed: onTap,
                style: OutlinedButton.styleFrom(alignment: Alignment.centerLeft),
                child: Text(_formatDate(date)),
              ),
            ),
          ],
        ),
      );

  Widget _sectionTitle(String title) => Padding(
        padding: const EdgeInsets.only(top: 8, bottom: 8),
        child: Text(
          title.toUpperCase(),
          style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, letterSpacing: 0.5, color: Colors.grey.shade600),
        ),
      );
}

class _LineItemEntry {
  Product? product;
  // Bumped whenever the product is (re)picked so the product dropdown rebuilds
  // and reflects the decided value — including reverting after a cancelled
  // day-type warning.
  int rev = 0;
  final quantity = TextEditingController(text: '1');
  final discount = TextEditingController();

  double get _qty => double.tryParse(quantity.text.trim()) ?? 0;
  double get _discount => double.tryParse(discount.text.trim()) ?? 0;
  double get unitPrice => product?.price ?? 0;

  bool get isValid => product != null && _qty > 0;

  double get lineTotal => _qty * unitPrice * (1 - _discount / 100);

  InvoiceLineItem toLineItem() => InvoiceLineItem(
        description: product!.name,
        quantity: _qty,
        unitPrice: product!.price,
        discountPercent: _discount,
      );

  void dispose() {
    quantity.dispose();
    discount.dispose();
  }
}

class _LineItemEditor extends StatelessWidget {
  final _LineItemEntry entry;
  final List<Product> products;
  final VoidCallback onChanged;
  final VoidCallback? onRemove;

  const _LineItemEditor({
    super.key,
    required this.entry,
    required this.products,
    required this.onChanged,
    this.onRemove,
  });

  static const _dense = InputDecoration(isDense: true);
  static void _dismissKeyboard(PointerDownEvent _) =>
      FocusManager.instance.primaryFocus?.unfocus();

  // Applies the chosen product. Day-type availability restrictions only apply
  // to bookings, not quotes, so there's no availability warning here.
  void _pickProduct(Product? p) {
    entry.product = p;
    entry.rev++;
    onChanged();
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(8, 8, 8, 4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            DropdownButtonFormField<Product>(
              key: ValueKey('product-${entry.rev}'),
              initialValue: entry.product,
              isExpanded: true,
              isDense: true,
              decoration: const InputDecoration(labelText: 'Product', isDense: true),
              hint: const Text('Choose a product'),
              items: products
                  .map((p) => DropdownMenuItem(value: p, child: Text(p.name, overflow: TextOverflow.ellipsis)))
                  .toList(),
              onChanged: (p) => _pickProduct(p),
            ),
            const SizedBox(height: 6),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: entry.quantity,
                    style: const TextStyle(fontSize: 14),
                    decoration: _dense.copyWith(labelText: 'Qty'),
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
                    onTapOutside: _dismissKeyboard,
                    onChanged: (_) => onChanged(),
                  ),
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: InputDecorator(
                    decoration: _dense.copyWith(labelText: 'Unit'),
                    child: Text(_formatMoney(entry.unitPrice), style: const TextStyle(fontSize: 14)),
                  ),
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: TextField(
                    controller: entry.discount,
                    style: const TextStyle(fontSize: 14),
                    decoration: _dense.copyWith(labelText: 'Disc %'),
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
                    onTapOutside: _dismissKeyboard,
                    onChanged: (_) => onChanged(),
                  ),
                ),
              ],
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(_formatMoney(entry.lineTotal), style: TextStyle(color: Colors.grey.shade700)),
                if (onRemove != null)
                  TextButton.icon(
                    onPressed: onRemove,
                    icon: const Icon(Icons.delete_outline, size: 18),
                    label: const Text('Remove'),
                    style: TextButton.styleFrom(
                      foregroundColor: Colors.red.shade400,
                      visualDensity: VisualDensity.compact,
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

String _formatMoney(double value) => '£${value.toStringAsFixed(2)}';

String _trimNum(double v) => v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toString();

String _formatDate(DateTime date) =>
    '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}/${date.year}';

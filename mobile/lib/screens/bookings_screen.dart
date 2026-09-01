import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/bank_holiday.dart';
import '../models/customer.dart';
import '../models/day_booking.dart';
import '../models/product.dart';
import '../models/visit_mapping.dart';
import '../utils/product_availability.dart';
import 'generate_invoices_sheet.dart';
import 'home_shell.dart';
import 'visits_booking_sheet.dart';

// Customer.regularDays weekday keys, indexed by DateTime.weekday (1=Mon..7=Sun).
const _weekdayKeys = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

enum _BookingView { day, week }

/// Day-by-day scheduling calendar: for the selected day, the dogs booked in
/// ("Scheduled"), dogs whose owner has this weekday as a regular day
/// ("Recommended", one-tap add), and an "Add dog" action. Mirrors the admin
/// Bookings calendar's day panel, including the travel-charge auto-add.
class BookingsScreen extends StatefulWidget {
  const BookingsScreen({super.key});

  @override
  State<BookingsScreen> createState() => _BookingsScreenState();
}

class _BookingsScreenState extends State<BookingsScreen> {
  final _money = NumberFormat.currency(locale: 'en_GB', symbol: '£');
  DateTime _day = _dateOnly(DateTime.now());
  _BookingView _view = _BookingView.day;

  // Loaded once, reused across day changes.
  List<Customer>? _customers;
  List<AnimalRef>? _animals;
  List<Product>? _products;
  List<BankHoliday> _bankHolidays = [];
  VisitMapping _visitMapping = VisitMapping();

  late Future<List<DayBooking>> _future;

  static DateTime _dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

  // Monday of the week containing [_day] (weekday: Mon=1..Sun=7).
  DateTime get _weekStart => DateTime(_day.year, _day.month, _day.day - (_day.weekday - 1));

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<DayBooking>> _load() async {
    final repo = context.read<Repository>();
    if (_customers == null) {
      final results = await Future.wait([
        repo.listCustomers(),
        repo.listAllAnimals(),
        repo.listProducts(),
        repo.listBankHolidays(),
        repo.getVisitMapping(),
      ]);
      _customers = results[0] as List<Customer>;
      _animals = results[1] as List<AnimalRef>;
      _products = results[2] as List<Product>;
      _bankHolidays = results[3] as List<BankHoliday>;
      _visitMapping = results[4] as VisitMapping;
    }
    // Day view shows one day; week view shows Mon..Sun. Fetch one day either
    // side of what's visible so AM/PM can be inferred from neighbouring days
    // (a visit's AM/PM depends on whether it starts/ends a run) -- the display
    // still filters to the visible days.
    final DateTime visibleFrom, visibleTo;
    if (_view == _BookingView.week) {
      visibleFrom = _weekStart;
      visibleTo = DateTime(visibleFrom.year, visibleFrom.month, visibleFrom.day + 7);
    } else {
      visibleFrom = _day;
      visibleTo = DateTime(_day.year, _day.month, _day.day + 1);
    }
    final padFrom = DateTime(visibleFrom.year, visibleFrom.month, visibleFrom.day - 1);
    final padTo = DateTime(visibleTo.year, visibleTo.month, visibleTo.day + 1);
    return repo.listDayBookings(from: padFrom, to: padTo);
  }

  void _reload() => setState(() => _future = _load());

  Future<void> _refresh() async {
    _reload();
    await _future;
  }

  // Steps by one day or one week depending on the current view.
  void _changeRange(int delta) {
    setState(() {
      final step = _view == _BookingView.week ? delta * 7 : delta;
      _day = DateTime(_day.year, _day.month, _day.day + step);
      _future = _load();
    });
  }

  void _setView(_BookingView view) {
    if (view == _view) return;
    setState(() {
      _view = view;
      _future = _load();
    });
  }

  // Jump to the day view focused on [date] (used when tapping a day in week view).
  void _openDay(DateTime date) {
    setState(() {
      _day = _dateOnly(date);
      _view = _BookingView.day;
      _future = _load();
    });
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _day,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
    );
    if (picked != null) {
      setState(() {
        _day = _dateOnly(picked);
        _future = _load();
      });
    }
  }

  Customer? _ownerOf(String customerId) {
    for (final c in _customers ?? const <Customer>[]) {
      if (c.id == customerId) return c;
    }
    return null;
  }

  Product? _productById(String id) {
    for (final p in _products ?? const <Product>[]) {
      if (p.id == id) return p;
    }
    return null;
  }

  String _defaultProductFor(String? customerId) {
    final owner = customerId == null ? null : _ownerOf(customerId);
    if (owner?.defaultProductId != null && owner!.defaultProductId!.isNotEmpty) {
      return owner.defaultProductId!;
    }
    return (_products != null && _products!.isNotEmpty) ? _products!.first.id : '';
  }

  /// Mirrors the admin travel-line auto-add: if travel is chargeable for the
  /// dog's owner and configured, add it as its own entry unless it's the main
  /// product just booked or already present for this dog today.
  Future<void> _maybeAddTravel(
    Repository repo,
    String animalId,
    String? customerId,
    String mainProductId,
    List<DayBooking> current,
  ) async {
    final owner = customerId == null ? null : _ownerOf(customerId);
    final travelId = owner?.travelProductId;
    if (owner == null || !owner.travelChargeable || travelId == null || travelId.isEmpty) return;
    if (travelId == mainProductId) return;
    final hasTravel = current.any((b) => b.animalId == animalId && b.productId == travelId);
    if (hasTravel) return;
    await repo.createDayBooking(animalId: animalId, date: _day, productId: travelId, quantity: 1);
  }

  Future<void> _quickAdd(AnimalRef animal, List<DayBooking> current) async {
    final mainProduct = _defaultProductFor(animal.customerId);
    if (mainProduct.isEmpty) {
      _snack('Set up a product first.');
      return;
    }
    final product = _productById(mainProduct);
    if (product != null && !await confirmProductAvailability(context, product, _day, _bankHolidays)) {
      return;
    }
    if (!mounted) return;
    final repo = context.read<Repository>();
    try {
      await repo.createDayBooking(animalId: animal.id, date: _day, productId: mainProduct, quantity: 1);
      await _maybeAddTravel(repo, animal.id, animal.customerId, mainProduct, current);
      _reload();
    } catch (e) {
      _snack(e is ApiException ? e.message : 'Failed to add this dog');
    }
  }

  // The "Schedule" button: pick Dog Walk (the day scheduler) or Visits (a
  // date-range booking via the Settings > Bookings > Visits mapping).
  Future<void> _openScheduleMenu(List<DayBooking> current) async {
    final choice = await showModalBottomSheet<String>(
      context: context,
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: Icon(Icons.directions_walk, color: Colors.green.shade600),
              title: const Text('Dog Walk'),
              subtitle: const Text('Add a dog to this day'),
              onTap: () => Navigator.of(context).pop('walk'),
            ),
            ListTile(
              leading: Icon(Icons.home_outlined, color: Colors.amber.shade800),
              title: const Text('Visits'),
              subtitle: const Text('Book visits across a date range'),
              onTap: () => Navigator.of(context).pop('visits'),
            ),
          ],
        ),
      ),
    );
    if (!mounted) return;
    if (choice == 'walk') {
      await _openAddDog(current);
    } else if (choice == 'visits') {
      await _openVisits();
    }
  }

  Future<void> _openVisits() async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => VisitsBookingSheet(
        customers: _customers ?? const [],
        animals: _animals ?? const [],
        products: _products ?? const [],
        visitMapping: _visitMapping,
        bankHolidays: _bankHolidays,
      ),
    );
    if (saved == true) _reload();
  }

  Future<void> _openGenerateInvoices() async {
    final generated = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => GenerateInvoicesSheet(anchorMonth: _day),
    );
    if (generated == true) _reload();
  }

  Future<void> _openAddDog(List<DayBooking> current) async {
    final animals = _animals ?? const <AnimalRef>[];
    final products = _products ?? const <Product>[];
    if (products.isEmpty) {
      _snack('No products set up yet. Add them in the admin app first.');
      return;
    }
    final repo = context.read<Repository>();
    final result = await showModalBottomSheet<_AddDogResult>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _AddDogSheet(
        animals: animals,
        products: products,
        ownerNameOf: (id) => _ownerOf(id)?.name ?? '',
        defaultProductFor: _defaultProductFor,
      ),
    );
    if (result == null) return;
    final product = _productById(result.productId);
    if (product != null && mounted && !await confirmProductAvailability(context, product, _day, _bankHolidays)) {
      return;
    }
    try {
      await repo.createDayBooking(
        animalId: result.animalId,
        date: _day,
        productId: result.productId,
        quantity: result.quantity,
      );
      await _maybeAddTravel(repo, result.animalId, result.customerId, result.productId, current);
      _reload();
    } catch (e) {
      _snack(e is ApiException ? e.message : 'Failed to add this dog');
    }
  }

  Future<void> _editEntry(DayBooking booking) async {
    final products = _products ?? const <Product>[];
    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _EditEntrySheet(booking: booking, products: products, bankHolidays: _bankHolidays),
    );
    if (changed == true) _reload();
  }

  void _snack(String m) {
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }

  List<List<DayBooking>> _groupByAnimal(List<DayBooking> list) {
    final map = <String, List<DayBooking>>{};
    for (final b in list) {
      (map[b.animalId] ??= []).add(b);
    }
    return map.values.toList();
  }

  @override
  Widget build(BuildContext context) {
    final isToday = _dateOnly(DateTime.now()) == _day;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Bookings'),
        actions: [
          if (!isToday)
            TextButton(
              onPressed: () => setState(() {
                _day = _dateOnly(DateTime.now());
                _future = _load();
              }),
              child: const Text('Today'),
            ),
          IconButton(
            icon: const Icon(Icons.request_quote_outlined),
            tooltip: 'Generate invoices',
            onPressed: _openGenerateInvoices,
          ),
          const LogoutAction(),
        ],
      ),
      floatingActionButton: _view == _BookingView.day
          ? FutureBuilder<List<DayBooking>>(
              future: _future,
              builder: (context, snapshot) => FloatingActionButton.extended(
                onPressed: () => _openScheduleMenu(
                  (snapshot.data ?? const []).where((b) => _sameDay(b.date, _day)).toList(),
                ),
                icon: const Icon(Icons.add),
                label: const Text('Schedule'),
              ),
            )
          : null,
      body: Column(
        children: [
          _viewToggle(),
          _dateNavigator(),
          const Divider(height: 1),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _refresh,
              child: FutureBuilder<List<DayBooking>>(
                future: _future,
                builder: (context, snapshot) {
                  if (snapshot.connectionState == ConnectionState.waiting) {
                    return const Center(child: CircularProgressIndicator());
                  }
                  if (snapshot.hasError) {
                    final message = snapshot.error is ApiException
                        ? (snapshot.error as ApiException).message
                        : 'Failed to load bookings';
                    return ListView(children: [
                      const SizedBox(height: 80),
                      Center(child: Text(message, textAlign: TextAlign.center)),
                    ]);
                  }
                  final bookings = snapshot.data ?? [];
                  final body = _view == _BookingView.week ? _weekBody(bookings) : _dayBody(bookings);
                  // Swipe left/right to move forward/back a day (day view) or a
                  // week (week view), mirroring the navigator arrows.
                  return GestureDetector(
                    onHorizontalDragEnd: (details) {
                      final v = details.primaryVelocity ?? 0;
                      if (v < -100) {
                        _changeRange(1);
                      } else if (v > 100) {
                        _changeRange(-1);
                      }
                    },
                    child: body,
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _viewToggle() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      child: SegmentedButton<_BookingView>(
        segments: const [
          ButtonSegment(value: _BookingView.day, label: Text('Day'), icon: Icon(Icons.view_day_outlined)),
          ButtonSegment(value: _BookingView.week, label: Text('Week'), icon: Icon(Icons.view_week_outlined)),
        ],
        selected: {_view},
        onSelectionChanged: (s) => _setView(s.first),
        showSelectedIcon: false,
      ),
    );
  }

  Widget _dateNavigator() {
    final String label;
    if (_view == _BookingView.week) {
      final start = _weekStart;
      final end = DateTime(start.year, start.month, start.day + 6);
      label = '${DateFormat('d MMM').format(start)} – ${DateFormat('d MMM yyyy').format(end)}';
    } else {
      label = DateFormat('EEE d MMM yyyy').format(_day);
    }
    final isWeek = _view == _BookingView.week;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.chevron_left),
            tooltip: isWeek ? 'Previous week' : 'Previous day',
            onPressed: () => _changeRange(-1),
          ),
          Expanded(
            child: TextButton.icon(
              onPressed: _pickDate,
              icon: const Icon(Icons.calendar_today_outlined, size: 16),
              label: Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.chevron_right),
            tooltip: isWeek ? 'Next week' : 'Next day',
            onPressed: () => _changeRange(1),
          ),
        ],
      ),
    );
  }

  Widget _dayBody(List<DayBooking> all) {
    final dayItems = all.where((b) => _sameDay(b.date, _day)).toList();
    final walkGroups = _groupByAnimal(dayItems.where((b) => !_visitMapping.isVisitProduct(b.productId)).toList());
    final visitGroups = _groupByAnimal(dayItems.where((b) => _visitMapping.isVisitProduct(b.productId)).toList());
    final addedIds = dayItems.map((b) => b.animalId).toSet();
    final weekdayKey = _weekdayKeys[_day.weekday - 1];
    final recommended = (_animals ?? const <AnimalRef>[]).where((a) {
      if (a.species.toLowerCase() != 'dog') return false;
      if (addedIds.contains(a.id)) return false;
      final owner = _ownerOf(a.customerId);
      return owner?.regularDays.contains(weekdayKey) ?? false;
    }).toList();

    final dayTotal = dayItems.fold<double>(0, (s, b) => s + b.lineTotal);
    return ListView(
      padding: const EdgeInsets.only(bottom: 96),
      children: [
        _revenueBanner('Day revenue', dayTotal),
        if (walkGroups.isEmpty && visitGroups.isEmpty)
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: Text('Nothing booked.'),
          ),
        if (walkGroups.isNotEmpty) ...[
          _sectionTitle('Walks'),
          for (final group in walkGroups) _animalCard(group, all),
        ],
        if (visitGroups.isNotEmpty) ...[
          _sectionTitle('Visits'),
          for (final group in visitGroups) _animalCard(group, all),
        ],
        if (recommended.isNotEmpty) ...[
          _sectionTitle('Recommended'),
          for (final a in recommended)
            ListTile(
              leading: const Icon(Icons.pets),
              title: Text(a.name),
              subtitle: Text(_ownerOf(a.customerId)?.name ?? ''),
              trailing: IconButton(
                icon: Icon(Icons.add_circle, color: Colors.green.shade600),
                tooltip: 'Add to this day',
                onPressed: () => _quickAdd(a, dayItems),
              ),
            ),
        ],
      ],
    );
  }

  /// The AM/PM label for a visit entry: a 2-visit day is "AM & PM"; a 1-visit
  /// day is "AM" if it's the end of a consecutive run of visit days (and not
  /// also the start), otherwise "PM" — matching the admin calendar.
  String? _visitTime(DayBooking b, List<DayBooking> all) {
    final count = _visitMapping.visitCountForProduct(b.productId);
    if (count == null) return null;
    if (count == 2) return 'AM & PM';
    bool visitOn(int deltaDays) {
      final d = DateTime(b.date.year, b.date.month, b.date.day + deltaDays);
      return all.any((x) =>
          x.animalId == b.animalId &&
          _visitMapping.isVisitProduct(x.productId) &&
          _sameDay(x.date, d));
    }

    final isStart = !visitOn(-1);
    final isEnd = !visitOn(1);
    return (isEnd && !isStart) ? 'AM' : 'PM';
  }

  bool _sameDay(DateTime a, DateTime b) => a.year == b.year && a.month == b.month && a.day == b.day;

  Widget _weekBody(List<DayBooking> all) {
    final start = _weekStart;
    final today = _dateOnly(DateTime.now());
    // Sum only the visible week (the fetched list is padded ±1 day for AM/PM).
    var weekTotal = 0.0;
    for (int i = 0; i < 7; i++) {
      final date = DateTime(start.year, start.month, start.day + i);
      weekTotal += all.where((b) => _sameDay(b.date, date)).fold<double>(0, (s, b) => s + b.lineTotal);
    }
    final children = <Widget>[_revenueBanner('Week revenue', weekTotal), const SizedBox(height: 8)];
    for (int i = 0; i < 7; i++) {
      final date = DateTime(start.year, start.month, start.day + i);
      final dayItems = all.where((b) => _sameDay(b.date, date)).toList();
      final groups = _groupByAnimal(dayItems);
      final dayTotal = dayItems.fold<double>(0, (s, b) => s + b.lineTotal);
      final isToday = today == date;
      children.add(
        InkWell(
          onTap: () => _openDay(date),
          child: Container(
            width: double.infinity,
            color: Colors.grey.shade100,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            child: Row(
              children: [
                Text(
                  DateFormat('EEE d MMM').format(date),
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: isToday ? Theme.of(context).colorScheme.primary : null,
                  ),
                ),
                const Spacer(),
                Text(
                  groups.isEmpty
                      ? '—'
                      : '${groups.length} dog${groups.length == 1 ? '' : 's'} · ${_money.format(dayTotal)}',
                  style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
                ),
                const SizedBox(width: 4),
                const Icon(Icons.chevron_right, size: 18),
              ],
            ),
          ),
        ),
      );
      if (groups.isEmpty) {
        children.add(Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
          child: Text('Nothing booked.', style: TextStyle(color: Colors.grey.shade600)),
        ));
      } else {
        for (final g in groups) {
          children.add(_animalCard(g, all));
        }
      }
    }
    return ListView(padding: const EdgeInsets.only(bottom: 24), children: children);
  }

  Widget _animalCard(List<DayBooking> group, List<DayBooking> all) {
    final first = group.first;
    return Card(
      margin: const EdgeInsets.fromLTRB(12, 6, 12, 6),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.pets, size: 18),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(first.animalName, style: const TextStyle(fontWeight: FontWeight.w700)),
                ),
                Text(first.customerName,
                    style: TextStyle(color: Colors.grey.shade600, fontSize: 12)),
              ],
            ),
            for (final b in group) _entryRow(b, all),
          ],
        ),
      ),
    );
  }

  Widget _entryRow(DayBooking b, List<DayBooking> all) {
    final isVisit = _visitMapping.isVisitProduct(b.productId);
    final colour = isVisit ? Colors.amber.shade800 : Colors.green.shade600;
    final String subtitle;
    if (isVisit) {
      final time = _visitTime(b, all);
      subtitle = 'Visit${time != null ? ' · $time' : ''} · Qty ${b.quantity}';
    } else {
      subtitle = 'Walk · Qty ${b.quantity}';
    }
    return ListTile(
      contentPadding: EdgeInsets.zero,
      dense: true,
      leading: Icon(Icons.circle, size: 12, color: colour),
      title: Text(b.productName.isEmpty ? '(product)' : b.productName),
      subtitle: Text(subtitle),
      trailing: Text(_money.format(b.lineTotal), style: const TextStyle(fontWeight: FontWeight.w600)),
      onTap: () => _editEntry(b),
    );
  }

  Widget _sectionTitle(String title) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 6),
        child: Text(
          title.toUpperCase(),
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.bold,
            letterSpacing: 0.5,
            color: Colors.grey.shade600,
          ),
        ),
      );

  Widget _revenueBanner(String label, double amount) => Container(
        margin: const EdgeInsets.fromLTRB(12, 10, 12, 0),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: Colors.green.shade50,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              children: [
                Icon(Icons.payments_outlined, size: 18, color: Colors.green.shade700),
                const SizedBox(width: 8),
                Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
              ],
            ),
            Text(_money.format(amount),
                style: TextStyle(fontWeight: FontWeight.bold, color: Colors.green.shade800, fontSize: 16)),
          ],
        ),
      );
}

/// What [_AddDogSheet] returns to the caller so it can create the booking (and
/// any travel line) with the parent's repository + owner lookups.
class _AddDogResult {
  final String animalId;
  final String customerId;
  final String productId;
  final int quantity;
  _AddDogResult(this.animalId, this.customerId, this.productId, this.quantity);
}

class _AddDogSheet extends StatefulWidget {
  final List<AnimalRef> animals;
  final List<Product> products;
  final String Function(String customerId) ownerNameOf;
  final String Function(String? customerId) defaultProductFor;

  const _AddDogSheet({
    required this.animals,
    required this.products,
    required this.ownerNameOf,
    required this.defaultProductFor,
  });

  @override
  State<_AddDogSheet> createState() => _AddDogSheetState();
}

class _AddDogSheetState extends State<_AddDogSheet> {
  AnimalRef? _animal;
  String? _productId;
  final _qtyController = TextEditingController(text: '1');

  @override
  void dispose() {
    _qtyController.dispose();
    super.dispose();
  }

  void _onPickAnimal(AnimalRef? a) {
    setState(() {
      _animal = a;
      if (a != null) {
        final def = widget.defaultProductFor(a.customerId);
        if (def.isNotEmpty) _productId = def;
      }
    });
  }

  void _save() {
    final animal = _animal;
    final productId = _productId;
    if (animal == null || productId == null || productId.isEmpty) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Choose a dog and a product.')));
      return;
    }
    final qty = int.tryParse(_qtyController.text.trim()) ?? 1;
    Navigator.of(context).pop(_AddDogResult(animal.id, animal.customerId, productId, qty < 1 ? 1 : qty));
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    // Sort dogs by name for an easier scan.
    final animals = [...widget.animals]..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
    return Padding(
      padding: EdgeInsets.only(left: 20, right: 20, top: 20, bottom: 20 + bottomInset),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Add dog', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 16),
            DropdownButtonFormField<AnimalRef>(
              initialValue: _animal,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Dog'),
              hint: const Text('Choose a dog'),
              items: animals.map((a) {
                final owner = widget.ownerNameOf(a.customerId);
                return DropdownMenuItem(
                  value: a,
                  child: Text(owner.isEmpty ? a.name : '${a.name} — $owner',
                      overflow: TextOverflow.ellipsis),
                );
              }).toList(),
              onChanged: _onPickAnimal,
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _productId,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Product'),
              hint: const Text('Choose a product'),
              items: widget.products
                  .map((p) => DropdownMenuItem(value: p.id, child: Text(p.name, overflow: TextOverflow.ellipsis)))
                  .toList(),
              onChanged: (v) => setState(() => _productId = v),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _qtyController,
              decoration: const InputDecoration(labelText: 'Quantity'),
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              onTapOutside: (_) => FocusManager.instance.primaryFocus?.unfocus(),
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(onPressed: _save, child: const Text('Add dog')),
            ),
          ],
        ),
      ),
    );
  }
}

class _EditEntrySheet extends StatefulWidget {
  final DayBooking booking;
  final List<Product> products;
  final List<BankHoliday> bankHolidays;
  const _EditEntrySheet({required this.booking, required this.products, required this.bankHolidays});

  @override
  State<_EditEntrySheet> createState() => _EditEntrySheetState();
}

class _EditEntrySheetState extends State<_EditEntrySheet> {
  late String _productId = widget.booking.productId;
  late final TextEditingController _qtyController =
      TextEditingController(text: '${widget.booking.quantity}');
  bool _busy = false;

  @override
  void dispose() {
    _qtyController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final qty = int.tryParse(_qtyController.text.trim()) ?? widget.booking.quantity;
    // Warn if the chosen product is restricted to a different day-type.
    Product? product;
    for (final p in widget.products) {
      if (p.id == _productId) product = p;
    }
    if (product != null &&
        !await confirmProductAvailability(context, product, widget.booking.date, widget.bankHolidays)) {
      return;
    }
    if (!mounted) return;
    setState(() => _busy = true);
    try {
      await context.read<Repository>().updateDayBooking(
            widget.booking.id,
            productId: _productId,
            quantity: qty < 1 ? 1 : qty,
          );
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e is ApiException ? e.message : 'Failed to save')));
        setState(() => _busy = false);
      }
    }
  }

  Future<void> _delete() async {
    setState(() => _busy = true);
    try {
      await context.read<Repository>().deleteDayBooking(widget.booking.id);
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e is ApiException ? e.message : 'Failed to remove')));
        setState(() => _busy = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    // Keep the dropdown value valid even if the product was since removed.
    final hasProduct = widget.products.any((p) => p.id == _productId);
    return Padding(
      padding: EdgeInsets.only(left: 20, right: 20, top: 20, bottom: 20 + bottomInset),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${widget.booking.animalName} — edit entry',
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
              initialValue: hasProduct ? _productId : null,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Product'),
              items: widget.products
                  .map((p) => DropdownMenuItem(value: p.id, child: Text(p.name, overflow: TextOverflow.ellipsis)))
                  .toList(),
              onChanged: (v) => setState(() => _productId = v ?? _productId),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _qtyController,
              decoration: const InputDecoration(labelText: 'Quantity'),
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              onTapOutside: (_) => FocusManager.instance.primaryFocus?.unfocus(),
            ),
            const SizedBox(height: 20),
            Row(
              children: [
                TextButton.icon(
                  onPressed: _busy ? null : _delete,
                  icon: Icon(Icons.delete_outline, color: Colors.red.shade600),
                  label: Text('Remove', style: TextStyle(color: Colors.red.shade600)),
                ),
                const Spacer(),
                ElevatedButton(
                  onPressed: _busy ? null : _save,
                  child: Text(_busy ? 'Saving…' : 'Save'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

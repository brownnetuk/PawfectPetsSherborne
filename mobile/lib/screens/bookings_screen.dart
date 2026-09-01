import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/customer.dart';
import '../models/day_booking.dart';
import '../models/product.dart';
import 'home_shell.dart';

// Customer.regularDays weekday keys, indexed by DateTime.weekday (1=Mon..7=Sun).
const _weekdayKeys = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

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

  // Loaded once, reused across day changes.
  List<Customer>? _customers;
  List<AnimalRef>? _animals;
  List<Product>? _products;

  late Future<List<DayBooking>> _future;

  static DateTime _dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

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
      ]);
      _customers = results[0] as List<Customer>;
      _animals = results[1] as List<AnimalRef>;
      _products = results[2] as List<Product>;
    }
    final next = DateTime(_day.year, _day.month, _day.day + 1);
    return repo.listDayBookings(from: _day, to: next);
  }

  void _reload() => setState(() => _future = _load());

  Future<void> _refresh() async {
    _reload();
    await _future;
  }

  void _changeDay(int delta) {
    setState(() {
      _day = DateTime(_day.year, _day.month, _day.day + delta);
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
    final repo = context.read<Repository>();
    try {
      await repo.createDayBooking(animalId: animal.id, date: _day, productId: mainProduct, quantity: 1);
      await _maybeAddTravel(repo, animal.id, animal.customerId, mainProduct, current);
      _reload();
    } catch (e) {
      _snack(e is ApiException ? e.message : 'Failed to add this dog');
    }
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
      builder: (_) => _EditEntrySheet(booking: booking, products: products),
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
          const LogoutAction(),
        ],
      ),
      floatingActionButton: FutureBuilder<List<DayBooking>>(
        future: _future,
        builder: (context, snapshot) => FloatingActionButton.extended(
          onPressed: () => _openAddDog(snapshot.data ?? const []),
          icon: const Icon(Icons.add),
          label: const Text('Add dog'),
        ),
      ),
      body: Column(
        children: [
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
                  final dayBookings = snapshot.data ?? [];
                  return _dayBody(dayBookings);
                },
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _dateNavigator() {
    final label = DateFormat('EEE d MMM yyyy').format(_day);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.chevron_left),
            tooltip: 'Previous day',
            onPressed: () => _changeDay(-1),
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
            tooltip: 'Next day',
            onPressed: () => _changeDay(1),
          ),
        ],
      ),
    );
  }

  Widget _dayBody(List<DayBooking> dayBookings) {
    final groups = _groupByAnimal(dayBookings);
    final addedIds = dayBookings.map((b) => b.animalId).toSet();
    final weekdayKey = _weekdayKeys[_day.weekday - 1];
    final recommended = (_animals ?? const <AnimalRef>[]).where((a) {
      if (addedIds.contains(a.id)) return false;
      final owner = _ownerOf(a.customerId);
      return owner?.regularDays.contains(weekdayKey) ?? false;
    }).toList();

    return ListView(
      padding: const EdgeInsets.only(bottom: 96),
      children: [
        _sectionTitle('Scheduled'),
        if (groups.isEmpty)
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 4, 16, 8),
            child: Text('No dogs booked for this day.'),
          )
        else
          for (final group in groups) _animalCard(group),
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
                onPressed: () => _quickAdd(a, dayBookings),
              ),
            ),
        ],
      ],
    );
  }

  Widget _animalCard(List<DayBooking> group) {
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
            for (final b in group)
              ListTile(
                contentPadding: EdgeInsets.zero,
                dense: true,
                title: Text(b.productName.isEmpty ? '(product)' : b.productName),
                subtitle: Text('Qty ${b.quantity}'),
                trailing: Text(_money.format(b.lineTotal),
                    style: const TextStyle(fontWeight: FontWeight.w600)),
                onTap: () => _editEntry(b),
              ),
          ],
        ),
      ),
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
  const _EditEntrySheet({required this.booking, required this.products});

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

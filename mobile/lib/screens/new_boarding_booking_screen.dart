import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/animal.dart';
import '../models/customer.dart';
import 'select_customer_screen.dart';

/// Direct (no-quote) creation of a reference-numbered Boarding & Day Care
/// booking -- mirrors the admin's "+ New booking" modal. The server books the
/// stay on the calendar and raises its invoice immediately. Pops `true` when
/// a booking was created so the list can refresh.
class NewBoardingBookingScreen extends StatefulWidget {
  const NewBoardingBookingScreen({super.key});

  @override
  State<NewBoardingBookingScreen> createState() => _NewBoardingBookingScreenState();
}

class _NewBoardingBookingScreenState extends State<NewBoardingBookingScreen> {
  Customer? _customer;
  List<Animal>? _pets;
  final Set<String> _animalIds = {};
  String _type = 'boarding';
  DateTime? _startDate;
  TimeOfDay? _dropOffTime;
  DateTime? _endDate;
  TimeOfDay? _pickUpTime; // doubles as the day-care collection time
  String _dropOffPeriod = 'AM';
  String _collectionPeriod = 'PM';
  final _notesController = TextEditingController();
  bool _submitting = false;

  @override
  void dispose() {
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _pickCustomer() async {
    final result = await Navigator.of(context).push<SelectCustomerResult>(
      MaterialPageRoute(builder: (_) => const SelectCustomerScreen()),
    );
    final customer = result?.customer;
    if (customer == null || !mounted) return;
    setState(() {
      _customer = customer;
      _pets = null;
      _animalIds.clear();
    });
    try {
      final pets = await context.read<Repository>().listAnimals(customer.id);
      if (mounted) setState(() => _pets = pets);
    } catch (_) {
      if (mounted) setState(() => _pets = []);
    }
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

  String? _validate() {
    if (_customer == null) return 'Choose a customer.';
    if (_animalIds.isEmpty) return 'Choose at least one animal.';
    if (_startDate == null || _dropOffTime == null || _pickUpTime == null) {
      return 'Fill in the dates and times.';
    }
    if (_type == 'boarding' && _endDate == null) return 'Fill in the dates and times.';
    return null;
  }

  Future<void> _submit() async {
    final error = _validate();
    if (error != null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error)));
      return;
    }
    setState(() => _submitting = true);
    try {
      await context.read<Repository>().createBoardingBooking(
            customerId: _customer!.id,
            animalIds: _animalIds.toList(),
            type: _type,
            startDate: _ymd(_startDate!),
            dropOffTime: _hm(_dropOffTime!),
            endDate: _type == 'boarding' ? _ymd(_endDate!) : null,
            pickUpTime: _hm(_pickUpTime!),
            dropOffPeriod: _type == 'dayCare' ? _dropOffPeriod : null,
            collectionPeriod: _type == 'dayCare' ? _collectionPeriod : null,
            notes: _notesController.text.trim(),
          );
      if (!mounted) return;
      Navigator.of(context).pop(true);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Booking created.')));
    } catch (e) {
      if (mounted) {
        final message = e is ApiException ? e.message : 'Failed to create the booking';
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isBoarding = _type == 'boarding';
    return Scaffold(
      appBar: AppBar(title: const Text('New booking')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        children: [
          InkWell(
            onTap: _submitting ? null : _pickCustomer,
            child: InputDecorator(
              decoration: const InputDecoration(labelText: 'Customer', isDense: true),
              child: Text(_customer?.name ?? 'Choose'),
            ),
          ),
          const SizedBox(height: 12),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'boarding', label: Text('Boarding')),
              ButtonSegment(value: 'dayCare', label: Text('Day Care')),
            ],
            selected: {_type},
            onSelectionChanged: (s) => setState(() => _type = s.first),
          ),
          const SizedBox(height: 12),
          Text('Animals', style: TextStyle(color: Colors.grey.shade700, fontSize: 12, fontWeight: FontWeight.w600)),
          if (_customer == null)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Text('Select a customer first.', style: TextStyle(color: Colors.grey.shade600)),
            )
          else if (_pets == null)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_pets!.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Text('This customer has no animals on file.', style: TextStyle(color: Colors.grey.shade600)),
            )
          else
            for (final p in _pets!)
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                dense: true,
                controlAffinity: ListTileControlAffinity.leading,
                value: _animalIds.contains(p.id),
                onChanged: (v) => setState(() {
                  if (v == true) {
                    _animalIds.add(p.id);
                  } else {
                    _animalIds.remove(p.id);
                  }
                }),
                title: Text('${p.name}${p.species.isNotEmpty ? ' (${p.species})' : ''}'),
              ),
          const SizedBox(height: 8),
          if (isBoarding) ...[
            Row(
              children: [
                Expanded(child: _dateField('Start date', _startDate, () => _pickDay(_startDate, (d) => _startDate = d))),
                const SizedBox(width: 12),
                Expanded(
                  child: _timeField('Drop off time', _dropOffTime, () => _pickTime(_dropOffTime, (t) => _dropOffTime = t)),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(child: _dateField('End date', _endDate, () => _pickDay(_endDate, (d) => _endDate = d))),
                const SizedBox(width: 12),
                Expanded(
                  child: _timeField('Pick up time', _pickUpTime, () => _pickTime(_pickUpTime, (t) => _pickUpTime = t)),
                ),
              ],
            ),
          ] else ...[
            _dateField('Date', _startDate, () => _pickDay(_startDate, (d) => _startDate = d)),
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
                  child:
                      _timeField('Collection time', _pickUpTime, () => _pickTime(_pickUpTime, (t) => _pickUpTime = t)),
                ),
              ],
            ),
          ],
          const SizedBox(height: 12),
          TextField(
            controller: _notesController,
            maxLines: 3,
            decoration: const InputDecoration(labelText: 'Notes', hintText: 'Optional', isDense: true),
            onTapOutside: (_) => FocusManager.instance.primaryFocus?.unfocus(),
          ),
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _submitting ? null : _submit,
              child: Text(_submitting ? 'Creating…' : 'Create booking'),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'The stay is booked on the calendar and its invoice is raised immediately, same as the admin.',
            style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
          ),
        ],
      ),
    );
  }

  Widget _dateField(String label, DateTime? date, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      child: InputDecorator(
        decoration: InputDecoration(labelText: label, isDense: true),
        child: Text(date == null ? 'Choose' : DateFormat('d MMM yyyy').format(date)),
      ),
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
}

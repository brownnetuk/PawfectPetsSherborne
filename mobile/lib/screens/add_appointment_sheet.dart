import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/customer.dart';

/// Creates a standalone appointment (customer + reason + date + time). Pops
/// `true` when saved. Mirrors the admin Add Appointment modal.
class AddAppointmentSheet extends StatefulWidget {
  final List<Customer> customers;
  final DateTime date;
  const AddAppointmentSheet({super.key, required this.customers, required this.date});

  @override
  State<AddAppointmentSheet> createState() => _AddAppointmentSheetState();
}

class _AddAppointmentSheetState extends State<AddAppointmentSheet> {
  final _reasonController = TextEditingController();
  String? _customerId;
  late DateTime _date = widget.date;
  TimeOfDay _time = const TimeOfDay(hour: 9, minute: 0);
  bool _busy = false;
  String? _error;

  final _dateFmt = DateFormat('d MMM yyyy');

  @override
  void dispose() {
    _reasonController.dispose();
    super.dispose();
  }

  String get _timeString =>
      '${_time.hour.toString().padLeft(2, '0')}:${_time.minute.toString().padLeft(2, '0')}';

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
    );
    if (picked != null) setState(() => _date = DateTime(picked.year, picked.month, picked.day));
  }

  Future<void> _pickTime() async {
    final picked = await showTimePicker(context: context, initialTime: _time);
    if (picked != null) setState(() => _time = picked);
  }

  Future<void> _save() async {
    final custId = _customerId;
    final reason = _reasonController.text.trim();
    setState(() => _error = null);
    if (custId == null) {
      setState(() => _error = 'Choose a customer.');
      return;
    }
    if (reason.isEmpty) {
      setState(() => _error = 'Enter a reason.');
      return;
    }
    setState(() => _busy = true);
    try {
      await context.read<Repository>().createAppointment(
            customerId: custId,
            reason: reason,
            date: _date,
            time: _timeString,
          );
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = e is ApiException ? e.message : 'Failed to save appointment';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    final customers = [...widget.customers]
      ..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
    return Padding(
      padding: EdgeInsets.only(left: 20, right: 20, top: 20, bottom: 20 + bottomInset),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Add appointment', style: Theme.of(context).textTheme.titleMedium),
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
            DropdownButtonFormField<String>(
              initialValue: _customerId,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Customer'),
              hint: const Text('Select a customer'),
              items: customers
                  .map((c) => DropdownMenuItem(value: c.id, child: Text(c.name, overflow: TextOverflow.ellipsis)))
                  .toList(),
              onChanged: (v) => setState(() => _customerId = v),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _reasonController,
              decoration: const InputDecoration(labelText: 'Reason'),
              textCapitalization: TextCapitalization.sentences,
              onTapOutside: (_) => FocusManager.instance.primaryFocus?.unfocus(),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: InkWell(
                    onTap: _pickDate,
                    child: InputDecorator(
                      decoration: const InputDecoration(labelText: 'Date'),
                      child: Text(_dateFmt.format(_date)),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: InkWell(
                    onTap: _pickTime,
                    child: InputDecorator(
                      decoration: const InputDecoration(labelText: 'Time'),
                      child: Text(_timeString),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _busy ? null : _save,
                child: Text(_busy ? 'Saving…' : 'Add appointment'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/checklist.dart';
import '../theme.dart';

/// Creates a reusable checklist template -- the staff-app counterpart of the
/// admin's Settings > Boarding > Checklists "Create new". Pops the created
/// template so the caller can assign it to a day straight away. The server
/// needs the Settings permission for this; without it the save shows the
/// server's error and nothing is created.
class ChecklistTemplateScreen extends StatefulWidget {
  const ChecklistTemplateScreen({super.key});

  @override
  State<ChecklistTemplateScreen> createState() => _ChecklistTemplateScreenState();
}

class _ChecklistTemplateScreenState extends State<ChecklistTemplateScreen> {
  String _category = 'boarding';
  final _name = TextEditingController();
  TimeOfDay? _completeBy;
  final List<TextEditingController> _items = [TextEditingController()];
  bool _autoAssign = false;
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    for (final c in _items) {
      c.dispose();
    }
    super.dispose();
  }

  String? get _completeByText => _completeBy == null
      ? null
      : '${_completeBy!.hour.toString().padLeft(2, '0')}:${_completeBy!.minute.toString().padLeft(2, '0')}';

  Future<void> _pickTime() async {
    final picked = await showTimePicker(
      context: context,
      initialTime: _completeBy ?? const TimeOfDay(hour: 10, minute: 0),
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(alwaysUse24HourFormat: true),
        child: child!,
      ),
    );
    if (picked != null) setState(() => _completeBy = picked);
  }

  Future<void> _save() async {
    final name = _name.text.trim();
    final items = _items.map((c) => c.text.trim()).where((s) => s.isNotEmpty).toList();
    if (name.isEmpty) {
      setState(() => _error = 'Give the checklist a name.');
      return;
    }
    if (items.isEmpty) {
      setState(() => _error = 'Add at least one item.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final repo = context.read<Repository>();
      final created = await repo.createChecklistTemplate(
            category: _category,
            name: name,
            completeByTime: _completeByText,
            items: items,
            autoAssign: _autoAssign,
          );
      // Same as the admin: so dogs already booked in from today get it too,
      // not just new bookings. The checklist is saved either way.
      if (_autoAssign) {
        try {
          await repo.syncChecklists(DateTime.now());
        } catch (_) {}
      }
      if (mounted) Navigator.of(context).pop(created);
    } catch (e) {
      setState(() {
        _saving = false;
        _error = e is ApiException ? e.message : 'Failed to save the checklist';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('New checklist')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (_error != null) ...[
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: brandPinkTint, borderRadius: BorderRadius.circular(12)),
              child: Text(_error!, style: const TextStyle(color: brandPink, fontWeight: FontWeight.w600)),
            ),
            const SizedBox(height: 12),
          ],
          Text('Type', style: TextStyle(color: Colors.grey.shade700, fontSize: 12, fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'boarding', label: Text('Boarding'), icon: Icon(Icons.hotel_outlined)),
              ButtonSegment(value: 'dayCare', label: Text('Day Care'), icon: Icon(Icons.wb_sunny_outlined)),
            ],
            selected: {_category},
            onSelectionChanged: (s) => setState(() => _category = s.first),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _name,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(labelText: 'Name', hintText: 'e.g. Morning Boarding Round'),
          ),
          const SizedBox(height: 12),
          InkWell(
            onTap: _pickTime,
            child: InputDecorator(
              decoration: InputDecoration(
                labelText: 'Complete by time (optional)',
                suffixIcon: _completeBy == null
                    ? const Icon(Icons.schedule)
                    : IconButton(
                        icon: const Icon(Icons.close),
                        tooltip: 'Clear',
                        onPressed: () => setState(() => _completeBy = null),
                      ),
              ),
              child: Text(_completeByText ?? 'None', style: TextStyle(color: _completeBy == null ? brandMuted : brandInk)),
            ),
          ),
          const SizedBox(height: 16),
          Text('Items', style: TextStyle(color: Colors.grey.shade700, fontSize: 12, fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          for (var i = 0; i < _items.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _items[i],
                      textCapitalization: TextCapitalization.sentences,
                      decoration: InputDecoration(hintText: 'Item ${i + 1}', isDense: true),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.delete_outline, color: brandPink),
                    tooltip: 'Remove item',
                    onPressed: _items.length == 1
                        ? null
                        : () => setState(() {
                              _items.removeAt(i).dispose();
                            }),
                  ),
                ],
              ),
            ),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: () => setState(() => _items.add(TextEditingController())),
              icon: const Icon(Icons.add, size: 18),
              label: const Text('Add item'),
            ),
          ),
          const SizedBox(height: 8),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Auto assign'),
            subtitle: Text(
              'Automatically add this checklist to any day that has a ${_category == 'boarding' ? 'boarding' : 'day care'} booking.',
            ),
            value: _autoAssign,
            onChanged: (v) => setState(() => _autoAssign = v),
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _saving ? null : _save,
              child: Text(_saving ? 'Saving…' : 'Save checklist'),
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'Templates are shared with the admin\'s Settings > Boarding > Checklists, where they can be edited or deleted.',
            style: TextStyle(color: brandMuted, fontSize: 12),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

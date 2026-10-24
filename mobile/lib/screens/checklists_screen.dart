import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/checklist.dart';
import '../theme.dart';
import 'checklist_detail_screen.dart';
import 'checklist_template_screen.dart';

/// Boarding > Checklists: the checklists assigned to one day (defaulting to
/// today), each showing how many items are ticked off and whether it's been
/// signed off. Tap one to work through it; "+" assigns another from the
/// admin's templates, or creates a new template on the spot. Mirrors the
/// admin's Boarding & Day Care > Checklists calendar, a day at a time.
class ChecklistsScreen extends StatefulWidget {
  const ChecklistsScreen({super.key});

  @override
  State<ChecklistsScreen> createState() => _ChecklistsScreenState();
}

class _ChecklistsScreenState extends State<ChecklistsScreen> {
  late DateTime _day;
  late Future<List<ChecklistAssignment>> _future;
  bool _busy = false;
  static final _dayFmt = DateFormat('EEEE d MMMM');

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _day = DateTime(now.year, now.month, now.day);
    _future = _load();
  }

  Future<List<ChecklistAssignment>> _load() async {
    final items = await context.read<Repository>().listChecklistAssignments(
          from: _day,
          to: DateTime(_day.year, _day.month, _day.day + 1),
        );
    // Earliest "complete by" first, then by name, so the morning round sits
    // above the evening one.
    items.sort((a, b) {
      final t = (a.completeByTime ?? '99:99').compareTo(b.completeByTime ?? '99:99');
      return t != 0 ? t : a.name.toLowerCase().compareTo(b.name.toLowerCase());
    });
    return items;
  }

  void _reload() => setState(() => _future = _load());

  void _changeDay(int delta) {
    setState(() {
      _day = DateTime(_day.year, _day.month, _day.day + delta);
      _future = _load();
    });
  }

  Future<void> _pickDay() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _day,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
    );
    if (picked != null) {
      setState(() {
        _day = DateTime(picked.year, picked.month, picked.day);
        _future = _load();
      });
    }
  }

  bool get _isToday {
    final now = DateTime.now();
    return _day.year == now.year && _day.month == now.month && _day.day == now.day;
  }

  void _snack(String message) {
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  /// "+": pick one of the admin's templates to assign to this day, or create
  /// a new template and assign it straight away.
  Future<void> _addChecklist() async {
    if (_busy) return;
    final repo = context.read<Repository>();
    setState(() => _busy = true);
    List<ChecklistTemplate> templates;
    try {
      templates = await repo.listChecklistTemplates();
    } catch (e) {
      _snack(e is ApiException ? e.message : 'Failed to load the checklist templates');
      if (mounted) setState(() => _busy = false);
      return;
    }
    if (!mounted) return;
    setState(() => _busy = false);
    templates.sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));

    // null = cancelled, a template = assign it, 'new' = create one first.
    final choice = await showModalBottomSheet<Object>(
      context: context,
      isScrollControlled: true,
      builder: (sheetContext) => SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.of(sheetContext).size.height * 0.75),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 4),
                child: Text('Add a checklist for ${_dayFmt.format(_day)}',
                    style: Theme.of(sheetContext).textTheme.titleMedium),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
                child: Text(
                  templates.isEmpty
                      ? 'No checklist templates yet. Create one below.'
                      : 'Pick a template -- the day gets its own copy to tick off.',
                  style: const TextStyle(color: brandMuted, fontSize: 13),
                ),
              ),
              Flexible(
                child: ListView(
                  shrinkWrap: true,
                  children: [
                    for (final t in templates)
                      ListTile(
                        leading: const Icon(Icons.checklist_outlined),
                        title: Text(t.name),
                        subtitle: Text(
                          '${t.categoryLabel} · ${t.items.length} item${t.items.length == 1 ? '' : 's'}'
                          '${t.completeByTime != null ? ' · by ${t.completeByTime}' : ''}',
                        ),
                        onTap: () => Navigator.of(sheetContext).pop(t),
                      ),
                    const Divider(height: 1),
                    ListTile(
                      leading: const Icon(Icons.add_circle_outline),
                      title: const Text('Create a new checklist template'),
                      subtitle: const Text('Needs the Settings permission; also added to this day'),
                      onTap: () => Navigator.of(sheetContext).pop('new'),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
    if (choice == null || !mounted) return;

    ChecklistTemplate? template;
    if (choice == 'new') {
      template = await Navigator.of(context).push<ChecklistTemplate>(
        MaterialPageRoute(builder: (_) => const ChecklistTemplateScreen()),
      );
    } else if (choice is ChecklistTemplate) {
      template = choice;
    }
    if (template == null || !mounted) return;

    setState(() => _busy = true);
    try {
      await repo.assignChecklist(templateId: template.id, date: _day);
      _snack('${template.name} added to ${_isToday ? 'today' : _dayFmt.format(_day)}.');
      _reload();
    } catch (e) {
      _snack(e is ApiException ? e.message : 'Failed to add the checklist');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _open(ChecklistAssignment a) async {
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => ChecklistDetailScreen(assignment: a)),
    );
    // Ticks, notes, sign-off or a delete may all have happened in there.
    if (mounted) _reload();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Checklists')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _busy ? null : _addChecklist,
        icon: const Icon(Icons.add),
        label: const Text('Add checklist'),
      ),
      body: Column(
        children: [
          // Day navigation: previous / date (tap to pick) / next, plus Today.
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 8, 4, 0),
            child: Row(
              children: [
                IconButton(
                  icon: const Icon(Icons.chevron_left),
                  tooltip: 'Previous day',
                  onPressed: () => _changeDay(-1),
                ),
                Expanded(
                  child: InkWell(
                    borderRadius: BorderRadius.circular(8),
                    onTap: _pickDay,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      child: Column(
                        children: [
                          Text(_isToday ? 'Today' : _dayFmt.format(_day),
                              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                          if (_isToday)
                            Text(_dayFmt.format(_day), style: const TextStyle(color: brandMuted, fontSize: 12)),
                        ],
                      ),
                    ),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.chevron_right),
                  tooltip: 'Next day',
                  onPressed: () => _changeDay(1),
                ),
                if (!_isToday)
                  TextButton(
                    onPressed: () {
                      final now = DateTime.now();
                      setState(() {
                        _day = DateTime(now.year, now.month, now.day);
                        _future = _load();
                      });
                    },
                    child: const Text('Today'),
                  ),
              ],
            ),
          ),
          Expanded(
            child: FutureBuilder<List<ChecklistAssignment>>(
              future: _future,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (snapshot.hasError) {
                  final message = snapshot.error is ApiException
                      ? (snapshot.error as ApiException).message
                      : 'Failed to load checklists';
                  return Center(child: Text(message, textAlign: TextAlign.center));
                }
                final items = snapshot.data ?? [];
                if (items.isEmpty) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(
                        'No checklists for ${_isToday ? 'today' : 'this day'}. Tap "Add checklist" to assign one.',
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: brandMuted),
                      ),
                    ),
                  );
                }
                return RefreshIndicator(
                  onRefresh: () async {
                    _reload();
                    await _future;
                  },
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(12, 8, 12, 96),
                    children: [for (final a in items) _card(a)],
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _card(ChecklistAssignment a) {
    final progress = a.items.isEmpty ? 0.0 : a.doneCount / a.items.length;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => _open(a),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(a.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                  ),
                  _categoryChip(a.category, a.categoryLabel),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                [
                  '${a.doneCount} of ${a.items.length} done',
                  if (a.completeByTime != null) 'complete by ${a.completeByTime}',
                  if (a.isSigned) 'signed off${a.signedBy != null ? ' by ${a.signedBy}' : ''}',
                ].join(' · '),
                style: const TextStyle(color: brandMuted, fontSize: 13),
              ),
              const SizedBox(height: 10),
              ClipRRect(
                borderRadius: BorderRadius.circular(999),
                child: LinearProgressIndicator(
                  value: progress,
                  minHeight: 6,
                  backgroundColor: brandRule,
                  color: a.allDone ? brandBlueDark : brandBlue,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _categoryChip(String category, String label) {
    final boarding = category == 'boarding';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration: BoxDecoration(
        color: boarding ? brandBlueTint : brandYellowTint,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(label,
          style: TextStyle(
              color: boarding ? brandBlueDark : brandInk, fontWeight: FontWeight.w700, fontSize: 12)),
    );
  }
}

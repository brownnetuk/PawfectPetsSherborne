import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/crm_activity.dart';
import '../state/auth_provider.dart';

/// The customer's CRM notes (notes/calls/emails/tasks) — the same records the
/// admin app shows and adds on Customer Detail's Activity tab, via the shared
/// /crm/activities endpoint.
class CustomerNotesScreen extends StatefulWidget {
  final String customerId;
  final String customerName;
  const CustomerNotesScreen({super.key, required this.customerId, required this.customerName});

  @override
  State<CustomerNotesScreen> createState() => _CustomerNotesScreenState();
}

class _CustomerNotesScreenState extends State<CustomerNotesScreen> {
  late Future<List<CrmActivity>> _future;
  static final _fmt = DateFormat('d MMM yyyy, HH:mm');

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    _future = context.read<Repository>().listActivities(customerId: widget.customerId);
  }

  Future<void> _showNoteSheet({CrmActivity? existing}) async {
    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: _NoteSheet(customerId: widget.customerId, existing: existing),
      ),
    );
    if (changed == true && mounted) setState(_load);
  }

  Future<void> _confirmDelete(CrmActivity note) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete note?'),
        content: Text('This permanently deletes "${note.subject}".'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text('Delete', style: TextStyle(color: Colors.red.shade700)),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try {
      await context.read<Repository>().deleteActivity(note.id);
      if (mounted) setState(_load);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e is ApiException ? e.message : 'Failed to delete the note')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Notes')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showNoteSheet(),
        icon: const Icon(Icons.add),
        label: const Text('New note'),
      ),
      body: FutureBuilder<List<CrmActivity>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            final message = snapshot.error is ApiException
                ? (snapshot.error as ApiException).message
                : 'Failed to load notes';
            return Center(child: Text(message, textAlign: TextAlign.center));
          }
          final notes = snapshot.data ?? [];
          if (notes.isEmpty) {
            return const Center(child: Text('No notes logged yet.'));
          }
          return ListView.separated(
            padding: const EdgeInsets.only(top: 8, bottom: 88),
            itemCount: notes.length,
            separatorBuilder: (_, _) => const Divider(height: 1),
            itemBuilder: (context, i) {
              final n = notes[i];
              final detail = [
                if ((n.description ?? '').isNotEmpty) n.description!,
                '${_fmt.format(n.createdAt.toLocal())} · ${n.createdBy}',
              ].join('\n');
              return ListTile(
                leading: CircleAvatar(
                  backgroundColor: Colors.grey.shade200,
                  child: Icon(_icon(n.type), color: Colors.grey.shade700, size: 20),
                ),
                title: Text(n.subject),
                subtitle: Text(detail),
                isThreeLine: (n.description ?? '').isNotEmpty,
                onTap: () => _showNoteSheet(existing: n),
                trailing: PopupMenuButton<String>(
                  onSelected: (v) {
                    if (v == 'edit') _showNoteSheet(existing: n);
                    if (v == 'delete') _confirmDelete(n);
                  },
                  itemBuilder: (_) => [
                    const PopupMenuItem(value: 'edit', child: Text('Edit')),
                    PopupMenuItem(
                      value: 'delete',
                      child: Text('Delete', style: TextStyle(color: Colors.red.shade700)),
                    ),
                  ],
                ),
              );
            },
          );
        },
      ),
    );
  }

  IconData _icon(String type) => switch (type) {
        'call' => Icons.call_outlined,
        'email' => Icons.email_outlined,
        'task' => Icons.task_alt_outlined,
        _ => Icons.sticky_note_2_outlined,
      };
}

/// Add/edit-note sheet mirroring the admin's note form: type, subject and an
/// optional description. Pass [existing] to edit that note in place.
class _NoteSheet extends StatefulWidget {
  final String customerId;
  final CrmActivity? existing;
  const _NoteSheet({required this.customerId, this.existing});

  @override
  State<_NoteSheet> createState() => _NoteSheetState();
}

class _NoteSheetState extends State<_NoteSheet> {
  late final _subjectController = TextEditingController(text: widget.existing?.subject ?? '');
  late final _descriptionController = TextEditingController(text: widget.existing?.description ?? '');
  late String _type = widget.existing?.type ?? 'note';
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _subjectController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final subject = _subjectController.text.trim();
    if (subject.isEmpty) {
      setState(() => _error = 'Enter a subject.');
      return;
    }
    setState(() {
      _error = null;
      _submitting = true;
    });
    try {
      final repo = context.read<Repository>();
      if (widget.existing != null) {
        await repo.updateActivity(
          id: widget.existing!.id,
          type: _type,
          subject: subject,
          description: _descriptionController.text.trim(),
        );
      } else {
        await repo.createActivity(
          customerId: widget.customerId,
          type: _type,
          subject: subject,
          description: _descriptionController.text.trim(),
          createdBy: context.read<AuthProvider>().staff?.name ?? 'Staff',
        );
      }
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        setState(() => _error = e is ApiException ? e.message : 'Failed to save the note');
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(widget.existing != null ? 'Edit note' : 'New note', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
            initialValue: _type,
            decoration: const InputDecoration(labelText: 'Type'),
            items: const [
              DropdownMenuItem(value: 'note', child: Text('Note')),
              DropdownMenuItem(value: 'call', child: Text('Call')),
              DropdownMenuItem(value: 'email', child: Text('Email')),
              DropdownMenuItem(value: 'task', child: Text('Task')),
            ],
            onChanged: (v) => setState(() => _type = v ?? 'note'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _subjectController,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(labelText: 'Subject'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _descriptionController,
            textCapitalization: TextCapitalization.sentences,
            maxLines: 3,
            decoration: const InputDecoration(labelText: 'Description (optional)'),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.error_outline, size: 18, color: Colors.red.shade600),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(_error!, style: TextStyle(color: Colors.red.shade700)),
                ),
              ],
            ),
          ],
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _submitting ? null : _submit,
              child: Text(
                _submitting
                    ? 'Saving…'
                    : widget.existing != null
                        ? 'Save note'
                        : 'Add note',
              ),
            ),
          ),
        ],
      ),
    );
  }
}

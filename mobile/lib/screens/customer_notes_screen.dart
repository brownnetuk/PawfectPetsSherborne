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

  Future<void> _showAddNoteSheet() async {
    final added = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: _NewNoteSheet(customerId: widget.customerId),
      ),
    );
    if (added == true && mounted) setState(_load);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Notes')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _showAddNoteSheet,
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

/// Add-note sheet mirroring the admin's "Add note" form: type, subject and an
/// optional description.
class _NewNoteSheet extends StatefulWidget {
  final String customerId;
  const _NewNoteSheet({required this.customerId});

  @override
  State<_NewNoteSheet> createState() => _NewNoteSheetState();
}

class _NewNoteSheetState extends State<_NewNoteSheet> {
  final _subjectController = TextEditingController();
  final _descriptionController = TextEditingController();
  String _type = 'note';
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
      await context.read<Repository>().createActivity(
            customerId: widget.customerId,
            type: _type,
            subject: subject,
            description: _descriptionController.text.trim(),
            createdBy: context.read<AuthProvider>().staff?.name ?? 'Staff',
          );
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        setState(() => _error = e is ApiException ? e.message : 'Failed to add the note');
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
          Text('New note', style: Theme.of(context).textTheme.titleMedium),
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
              child: Text(_submitting ? 'Adding…' : 'Add note'),
            ),
          ),
        ],
      ),
    );
  }
}

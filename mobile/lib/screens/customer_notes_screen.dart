import 'dart:convert';
import 'dart:io';
import 'package:cunning_document_scanner/cunning_document_scanner.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:image/image.dart' as img;
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/crm_activity.dart';
import '../state/auth_provider.dart';

/// Downscales an attachment to at most 1600px wide and re-encodes it as JPEG
/// (quality 70) so the base64 payload stays well under the API's body-size
/// limit -- same treatment the expense receipt scanner applies. Runs in a
/// background isolate via `compute`.
Uint8List _compressAttachment(Uint8List input) {
  final decoded = img.decodeImage(input);
  if (decoded == null) return input;
  final resized = decoded.width > 1600 ? img.copyResize(decoded, width: 1600) : decoded;
  return Uint8List.fromList(img.encodeJpg(resized, quality: 70));
}

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

  /// The list is served without attachment images (they'd bloat every
  /// refresh) -- fetch the full note only when it's opened.
  Future<CrmActivity> _fullNote(CrmActivity note) async {
    if (note.attachmentCount == 0) return note;
    try {
      return await context.read<Repository>().getActivity(note.id);
    } catch (_) {
      // Open with what we have; the sheet just won't show the images.
      return note;
    }
  }

  /// Tapping a note shows it read-only; its Edit button hands over to the
  /// edit sheet with the same already-fetched attachments.
  Future<void> _viewNote(CrmActivity note) async {
    final full = await _fullNote(note);
    if (!mounted) return;
    final action = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _NoteViewSheet(note: full),
    );
    if (!mounted) return;
    if (action == 'edit') await _showNoteSheet(existing: full);
  }

  Future<void> _editNote(CrmActivity note) async {
    final full = await _fullNote(note);
    if (!mounted) return;
    await _showNoteSheet(existing: full);
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
                [
                  _fmt.format(n.createdAt.toLocal()),
                  n.createdBy,
                  if (n.attachmentCount > 0)
                    '${n.attachmentCount} attachment${n.attachmentCount == 1 ? '' : 's'}',
                ].join(' · '),
              ].join('\n');
              return ListTile(
                leading: CircleAvatar(
                  backgroundColor: Colors.grey.shade200,
                  child: Icon(_icon(n.type), color: Colors.grey.shade700, size: 20),
                ),
                title: Text(n.subject),
                subtitle: Text(detail),
                isThreeLine: (n.description ?? '').isNotEmpty,
                onTap: () => _viewNote(n),
                trailing: PopupMenuButton<String>(
                  onSelected: (v) {
                    if (v == 'edit') _editNote(n);
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

/// Read-only view of a note (subject, meta, description, attachment images),
/// mirroring the admin's note modal. Pops 'edit' when the Edit button is
/// tapped so the caller can open the edit sheet.
class _NoteViewSheet extends StatelessWidget {
  final CrmActivity note;
  const _NoteViewSheet({required this.note});

  static final _fmt = DateFormat('d MMM yyyy, HH:mm');

  @override
  Widget build(BuildContext context) {
    final attachments = note.attachments ?? const <String>[];
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(note.subject, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 4),
          Text(
            '${note.type} · ${note.createdBy} · ${_fmt.format(note.createdAt.toLocal())}',
            style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
          ),
          if ((note.description ?? '').isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(note.description!),
          ],
          if (attachments.isNotEmpty) ...[
            const SizedBox(height: 16),
            for (final a in attachments)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: Image.memory(base64Decode(a.split(',').last), width: double.infinity, fit: BoxFit.contain),
                ),
              ),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('Close'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: () => Navigator.of(context).pop('edit'),
                  icon: const Icon(Icons.edit_outlined, size: 18),
                  label: const Text('Edit'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
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
  late final List<String> _attachments = List.of(widget.existing?.attachments ?? const []);
  bool _submitting = false;
  String? _error;

  void _addAttachment(Uint8List bytes) {
    setState(() => _attachments.add('data:image/jpeg;base64,${base64Encode(bytes)}'));
  }

  Future<void> _scan() async {
    try {
      final paths = await CunningDocumentScanner.getPictures();
      if (paths == null || paths.isEmpty) return;
      for (final path in paths) {
        // The scanner returns full-resolution images; downscale/re-encode off
        // the UI thread so the base64 payload stays small.
        final raw = await File(path).readAsBytes();
        _addAttachment(await compute(_compressAttachment, raw));
      }
    } catch (_) {
      setState(() => _error = 'Could not scan the document.');
    }
  }

  Future<void> _pickImage(ImageSource source) async {
    try {
      final file = await ImagePicker().pickImage(source: source, imageQuality: 70, maxWidth: 1600);
      if (file == null) return;
      _addAttachment(await file.readAsBytes());
    } catch (_) {
      setState(() => _error = 'Could not attach the image.');
    }
  }

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
          attachments: _attachments,
        );
      } else {
        await repo.createActivity(
          customerId: widget.customerId,
          type: _type,
          subject: subject,
          description: _descriptionController.text.trim(),
          createdBy: context.read<AuthProvider>().staff?.name ?? 'Staff',
          attachments: _attachments,
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
          const SizedBox(height: 16),
          Text('Attachments', style: Theme.of(context).textTheme.labelLarge),
          if (_attachments.isNotEmpty) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (var i = 0; i < _attachments.length; i++)
                  Stack(
                    clipBehavior: Clip.none,
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: Image.memory(
                          base64Decode(_attachments[i].split(',').last),
                          width: 72,
                          height: 72,
                          fit: BoxFit.cover,
                        ),
                      ),
                      Positioned(
                        top: -10,
                        right: -10,
                        child: IconButton(
                          icon: const Icon(Icons.cancel, size: 20),
                          color: Colors.red.shade600,
                          visualDensity: VisualDensity.compact,
                          tooltip: 'Remove',
                          onPressed: () => setState(() => _attachments.removeAt(i)),
                        ),
                      ),
                    ],
                  ),
              ],
            ),
          ],
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 4,
            children: [
              OutlinedButton.icon(
                onPressed: _scan,
                icon: const Icon(Icons.document_scanner_outlined, size: 18),
                label: const Text('Scan'),
              ),
              OutlinedButton.icon(
                onPressed: () => _pickImage(ImageSource.camera),
                icon: const Icon(Icons.photo_camera_outlined, size: 18),
                label: const Text('Camera'),
              ),
              OutlinedButton.icon(
                onPressed: () => _pickImage(ImageSource.gallery),
                icon: const Icon(Icons.photo_library_outlined, size: 18),
                label: const Text('Library'),
              ),
            ],
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

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/checklist.dart';
import '../theme.dart';
import '../widgets/brand.dart';
import '../widgets/signature_pad.dart';

/// One day's checklist: tick items off (the server records who ticked each),
/// add notes, and sign the day off with a signature. The overflow menu
/// removes the checklist from the day. Mirrors the admin's checklist panel.
class ChecklistDetailScreen extends StatefulWidget {
  final ChecklistAssignment assignment;
  const ChecklistDetailScreen({super.key, required this.assignment});

  @override
  State<ChecklistDetailScreen> createState() => _ChecklistDetailScreenState();
}

class _ChecklistDetailScreenState extends State<ChecklistDetailScreen> {
  late ChecklistAssignment _a;
  late final TextEditingController _notes;
  bool _notesDirty = false;
  bool _savingNotes = false;
  String? _signature; // captured on the pad, not yet saved
  bool _signing = false;
  bool _deleting = false;
  // Items whose tick is in flight -- the checkbox is disabled meanwhile so a
  // double tap can't send two toggles.
  final Set<int> _toggling = {};
  static final _dayFmt = DateFormat('EEEE d MMMM yyyy');
  static final _signedFmt = DateFormat('d MMM yyyy, HH:mm');

  @override
  void initState() {
    super.initState();
    _a = widget.assignment;
    _notes = TextEditingController(text: _a.notes ?? '');
  }

  @override
  void dispose() {
    _notes.dispose();
    super.dispose();
  }

  void _snack(String message) {
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _toggle(int index) async {
    if (_toggling.contains(index)) return;
    setState(() => _toggling.add(index));
    try {
      final updated = await context.read<Repository>().toggleChecklistItem(_a.id, index);
      if (mounted) setState(() => _a = updated);
    } catch (e) {
      _snack(e is ApiException ? e.message : 'Failed to update the item');
    } finally {
      if (mounted) setState(() => _toggling.remove(index));
    }
  }

  Future<void> _saveNotes() async {
    setState(() => _savingNotes = true);
    try {
      final updated =
          await context.read<Repository>().updateChecklistAssignment(_a.id, notes: _notes.text.trim());
      if (mounted) {
        setState(() {
          _a = updated;
          _notesDirty = false;
        });
        _snack('Notes saved.');
      }
    } catch (e) {
      _snack(e is ApiException ? e.message : 'Failed to save the notes');
    } finally {
      if (mounted) setState(() => _savingNotes = false);
    }
  }

  Future<void> _signOff() async {
    final signature = _signature;
    if (signature == null) return;
    setState(() => _signing = true);
    try {
      final updated =
          await context.read<Repository>().updateChecklistAssignment(_a.id, signatureImage: signature);
      if (mounted) {
        setState(() {
          _a = updated;
          _signature = null;
        });
        _snack('Checklist signed off.');
      }
    } catch (e) {
      _snack(e is ApiException ? e.message : 'Failed to sign off');
    } finally {
      if (mounted) setState(() => _signing = false);
    }
  }

  Future<void> _clearSignOff() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Clear sign-off?'),
        content: const Text('This removes the signature so the day can be signed off again.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialogContext).pop(false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.of(dialogContext).pop(true), child: const Text('Clear')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _signing = true);
    try {
      final updated = await context.read<Repository>().updateChecklistAssignment(_a.id, signatureImage: '');
      if (mounted) setState(() => _a = updated);
    } catch (e) {
      _snack(e is ApiException ? e.message : 'Failed to clear the sign-off');
    } finally {
      if (mounted) setState(() => _signing = false);
    }
  }

  Future<void> _delete() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Remove this checklist?'),
        content: Text('This removes "${_a.name}" from ${_dayFmt.format(_a.date)}, including anything ticked off. '
            'The template itself is kept.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialogContext).pop(false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: brandPink),
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _deleting = true);
    try {
      await context.read<Repository>().deleteChecklistAssignment(_a.id);
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      _snack(e is ApiException ? e.message : 'Failed to remove the checklist');
      if (mounted) setState(() => _deleting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final a = _a;
    return Scaffold(
      appBar: AppBar(
        title: Text(a.name),
        actions: [
          PopupMenuButton<String>(
            onSelected: (v) {
              if (v == 'delete') _delete();
            },
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'delete', child: Text('Remove from this day')),
            ],
          ),
        ],
      ),
      body: _deleting
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(_dayFmt.format(a.date), style: const TextStyle(fontWeight: FontWeight.w600)),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                      decoration: BoxDecoration(
                        color: a.category == 'boarding' ? brandBlueTint : brandYellowTint,
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(a.categoryLabel,
                          style: TextStyle(
                              color: a.category == 'boarding' ? brandBlueDark : brandInk,
                              fontWeight: FontWeight.w700,
                              fontSize: 12)),
                    ),
                  ],
                ),
                if (a.completeByTime != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text('Complete by ${a.completeByTime}', style: const TextStyle(color: brandMuted, fontSize: 13)),
                  ),

                BrandHeading('Items · ${a.doneCount} of ${a.items.length} done'),
                Card(
                  margin: EdgeInsets.zero,
                  child: Column(
                    children: [
                      for (var i = 0; i < a.items.length; i++) ...[
                        if (i > 0) const Divider(height: 1, indent: 16, endIndent: 16),
                        CheckboxListTile(
                          controlAffinity: ListTileControlAffinity.leading,
                          value: a.completed[i],
                          onChanged: _toggling.contains(i) ? null : (_) => _toggle(i),
                          title: Text(
                            a.items[i],
                            style: TextStyle(
                              decoration: a.completed[i] ? TextDecoration.lineThrough : null,
                              color: a.completed[i] ? brandMuted : brandInk,
                            ),
                          ),
                          subtitle: a.completed[i] && (a.completedBy[i] ?? '').isNotEmpty
                              ? Text('Done by ${a.completedBy[i]}', style: const TextStyle(fontSize: 12))
                              : null,
                        ),
                      ],
                    ],
                  ),
                ),
                if (a.allDone)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Row(
                      children: const [
                        Icon(Icons.check_circle, color: brandBlueDark, size: 18),
                        SizedBox(width: 6),
                        Text('Everything ticked off.', style: TextStyle(color: brandBlueDark, fontWeight: FontWeight.w600)),
                      ],
                    ),
                  ),

                const BrandHeading('Notes'),
                TextField(
                  controller: _notes,
                  minLines: 2,
                  maxLines: 5,
                  decoration: const InputDecoration(hintText: 'Anything to note about today\'s round…'),
                  onChanged: (v) => setState(() => _notesDirty = v.trim() != (a.notes ?? '').trim()),
                  onTapOutside: (_) => FocusScope.of(context).unfocus(),
                ),
                const SizedBox(height: 8),
                Align(
                  alignment: Alignment.centerRight,
                  child: FilledButton(
                    onPressed: _notesDirty && !_savingNotes ? _saveNotes : null,
                    child: Text(_savingNotes ? 'Saving…' : 'Save notes'),
                  ),
                ),

                const BrandHeading('Sign-off'),
                if (a.isSigned) ...[
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      border: Border.all(color: brandRule),
                      borderRadius: BorderRadius.circular(12),
                      color: Colors.white,
                    ),
                    child: _signatureImage(a.signatureImage!),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Signed off${a.signedBy != null ? ' by ${a.signedBy}' : ''}'
                    '${a.signedAt != null ? ' on ${_signedFmt.format(a.signedAt!)}' : ''}.',
                    style: const TextStyle(color: brandMuted, fontSize: 13),
                  ),
                  const SizedBox(height: 8),
                  Align(
                    alignment: Alignment.centerRight,
                    child: OutlinedButton(
                      onPressed: _signing ? null : _clearSignOff,
                      child: const Text('Clear sign-off'),
                    ),
                  ),
                ] else ...[
                  if (!a.allDone)
                    const Padding(
                      padding: EdgeInsets.only(bottom: 8),
                      child: Text('You can sign off before every item is ticked, but it\'s usually done last.',
                          style: TextStyle(color: brandMuted, fontSize: 12)),
                    ),
                  SignaturePad(onChanged: (v) => setState(() => _signature = v)),
                  const SizedBox(height: 8),
                  Align(
                    alignment: Alignment.centerRight,
                    child: FilledButton.icon(
                      onPressed: _signature != null && !_signing ? _signOff : null,
                      icon: const Icon(Icons.draw_outlined, size: 18),
                      label: Text(_signing ? 'Signing…' : 'Sign off'),
                    ),
                  ),
                ],
              ],
            ),
    );
  }

  Widget _signatureImage(String dataUri) {
    try {
      return Image.memory(base64Decode(dataUri.split(',').last), height: 90, fit: BoxFit.contain);
    } on FormatException {
      return const SizedBox(height: 90, child: Center(child: Icon(Icons.broken_image_outlined, color: brandMuted)));
    }
  }
}

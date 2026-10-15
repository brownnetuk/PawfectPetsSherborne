import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/booking_observation.dart';

/// Observations on one Boarding & Day Care booking -- the staff-app port of
/// the admin's ObservationsCard: timestamped care notes (Toilet / Play /
/// Medication / Feed / Groom / General) with an optional description and up
/// to 5 photos, observed-by recorded server-side from the signed-in staff.
class ObservationsScreen extends StatefulWidget {
  final String bookingId;
  final String bookingReference;
  const ObservationsScreen({super.key, required this.bookingId, required this.bookingReference});

  @override
  State<ObservationsScreen> createState() => _ObservationsScreenState();
}

class _ObservationsScreenState extends State<ObservationsScreen> {
  late Future<List<BookingObservation>> _future;

  static final _dateTimeFmt = DateFormat('d MMM yyyy, HH:mm');

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    _future = context.read<Repository>().listBookingObservations(widget.bookingId);
  }

  Future<void> _refresh() async {
    setState(_load);
    await _future;
  }

  Future<void> _addObservation() async {
    final added = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _ObservationFormSheet(bookingId: widget.bookingId),
    );
    if (added == true && mounted) setState(_load);
  }

  Future<void> _editObservation(BookingObservation observation) async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _ObservationFormSheet(bookingId: widget.bookingId, existing: observation),
    );
    if (saved == true && mounted) setState(_load);
  }

  /// Full read-only view of one observation with Edit / Delete underneath.
  Future<void> _showObservation(BookingObservation o) async {
    final action = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (sheetContext) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(o.category,
                        style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                  ),
                  Text(_dateTimeFmt.format(o.observedAt),
                      style: TextStyle(color: Colors.grey.shade700, fontSize: 13)),
                ],
              ),
              const SizedBox(height: 10),
              Flexible(
                child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        (o.description ?? '').trim().isEmpty ? 'No description.' : o.description!,
                        style: (o.description ?? '').trim().isEmpty
                            ? TextStyle(color: Colors.grey.shade600)
                            : null,
                      ),
                      if (o.photos.isNotEmpty) ...[
                        const SizedBox(height: 10),
                        Wrap(
                          spacing: 6,
                          runSpacing: 6,
                          children: [
                            for (final photo in o.photos)
                              if (_thumb(photo) case final Widget thumb) thumb,
                          ],
                        ),
                      ],
                      const SizedBox(height: 10),
                      Text('Observed by ${o.observedBy}',
                          style: TextStyle(color: Colors.grey.shade600, fontSize: 12)),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => Navigator.of(sheetContext).pop('edit'),
                      icon: const Icon(Icons.edit_outlined, size: 18),
                      label: const Text('Edit'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => Navigator.of(sheetContext).pop('delete'),
                      icon: const Icon(Icons.delete_outline, size: 18),
                      label: const Text('Delete'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
    if (!mounted) return;
    if (action == 'edit') await _editObservation(o);
    if (action == 'delete') await _delete(o);
  }

  Future<void> _delete(BookingObservation observation) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Delete observation?'),
        content: Text(
            '${observation.category} at ${_dateTimeFmt.format(observation.observedAt)} will be removed.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialogContext).pop(false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.of(dialogContext).pop(true), child: const Text('Delete')),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try {
      await context.read<Repository>().deleteBookingObservation(widget.bookingId, observation.id);
      if (mounted) setState(_load);
    } catch (e) {
      if (mounted) {
        final message = e is ApiException ? e.message : 'Failed to delete the observation';
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Observations · ${widget.bookingReference}'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add_circle_outline),
            tooltip: 'Add observation',
            onPressed: _addObservation,
          ),
        ],
      ),
      body: FutureBuilder<List<BookingObservation>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            final message = snapshot.error is ApiException
                ? (snapshot.error as ApiException).message
                : 'Failed to load observations';
            return Center(child: Text(message, textAlign: TextAlign.center));
          }
          final items = snapshot.data ?? [];
          if (items.isEmpty) {
            return const Center(child: Text('No observations yet. Tap + to add one.'));
          }
          return RefreshIndicator(
            onRefresh: _refresh,
            child: ListView.builder(
              padding: const EdgeInsets.all(12),
              itemCount: items.length,
              itemBuilder: (context, i) => _observationCard(items[i]),
            ),
          );
        },
      ),
    );
  }

  Widget _observationCard(BookingObservation o) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => _showObservation(o),
        child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    o.category,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.primary,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    _dateTimeFmt.format(o.observedAt),
                    style: TextStyle(color: Colors.grey.shade700, fontSize: 13),
                  ),
                ),
                InkWell(
                  onTap: () => _delete(o),
                  child: Icon(Icons.delete_outline, size: 20, color: Colors.grey.shade600),
                ),
              ],
            ),
            if ((o.description ?? '').trim().isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(o.description!),
            ],
            if (o.photos.isNotEmpty) ...[
              const SizedBox(height: 8),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final photo in o.photos)
                    if (_thumb(photo) case final Widget thumb) thumb,
                ],
              ),
            ],
            const SizedBox(height: 6),
            Text('Observed by ${o.observedBy}', style: TextStyle(color: Colors.grey.shade600, fontSize: 12)),
          ],
        ),
        ),
      ),
    );
  }

  Widget? _thumb(String dataUri) {
    try {
      final image = Image.memory(
        base64Decode(dataUri.split(',').last),
        height: 72,
        width: 72,
        fit: BoxFit.cover,
      );
      return InkWell(
        onTap: () => showDialog<void>(
          context: context,
          builder: (_) => Dialog(
            insetPadding: const EdgeInsets.all(12),
            child: InteractiveViewer(
              maxScale: 6,
              child: Image.memory(base64Decode(dataUri.split(',').last), fit: BoxFit.contain),
            ),
          ),
        ),
        child: ClipRRect(borderRadius: BorderRadius.circular(6), child: image),
      );
    } on FormatException {
      return null;
    }
  }
}

/// Add/edit observation form: date & time (default now), category,
/// description, up to 5 photos -- the same fields as the admin's form.
/// Passing [existing] pre-fills it and saves as an update.
class _ObservationFormSheet extends StatefulWidget {
  final String bookingId;
  final BookingObservation? existing;
  const _ObservationFormSheet({required this.bookingId, this.existing});

  @override
  State<_ObservationFormSheet> createState() => _ObservationFormSheetState();
}

class _ObservationFormSheetState extends State<_ObservationFormSheet> {
  late DateTime _observedAt = widget.existing?.observedAt ?? DateTime.now();
  late String _category = widget.existing?.category ?? 'General';
  late final TextEditingController _description =
      TextEditingController(text: widget.existing?.description ?? '');
  late final List<String> _photos = [...?widget.existing?.photos];
  bool _saving = false;
  bool _picking = false;

  static final _dateTimeFmt = DateFormat('d MMM yyyy, HH:mm');

  @override
  void dispose() {
    _description.dispose();
    super.dispose();
  }

  Future<void> _pickObservedAt() async {
    final date = await showDatePicker(
      context: context,
      initialDate: _observedAt,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_observedAt),
    );
    if (time == null) return;
    setState(() => _observedAt = DateTime(date.year, date.month, date.day, time.hour, time.minute));
  }

  Future<void> _addPhoto(ImageSource source) async {
    if (_picking) return;
    setState(() => _picking = true);
    try {
      // Same downscale the rest of the app uses for photo capture.
      final file = await ImagePicker().pickImage(source: source, imageQuality: 70, maxWidth: 1600);
      if (file == null) return;
      final bytes = await file.readAsBytes();
      setState(() => _photos.add('data:image/jpeg;base64,${base64Encode(bytes)}'));
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Failed to add the photo.')));
      }
    } finally {
      if (mounted) setState(() => _picking = false);
    }
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      final repo = context.read<Repository>();
      final existing = widget.existing;
      if (existing == null) {
        await repo.createBookingObservation(
          widget.bookingId,
          observedAt: _observedAt,
          category: _category,
          description: _description.text.trim(),
          photos: _photos,
        );
      } else {
        await repo.updateBookingObservation(
          widget.bookingId,
          existing.id,
          observedAt: _observedAt,
          category: _category,
          description: _description.text.trim(),
          photos: _photos,
        );
      }
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        final message = e is ApiException ? e.message : 'Failed to save the observation';
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(widget.existing == null ? 'Add observation' : 'Edit observation',
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
              const SizedBox(height: 14),
              InkWell(
                onTap: _pickObservedAt,
                child: InputDecorator(
                  decoration: const InputDecoration(labelText: 'Date & time', isDense: true),
                  child: Text(_dateTimeFmt.format(_observedAt)),
                ),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _category,
                decoration: const InputDecoration(labelText: 'Type', isDense: true),
                items: [
                  for (final c in BookingObservation.categories)
                    DropdownMenuItem(value: c, child: Text(c)),
                ],
                onChanged: (v) => setState(() => _category = v ?? 'General'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _description,
                decoration: const InputDecoration(labelText: 'Description', isDense: true),
                maxLines: 3,
              ),
              const SizedBox(height: 12),
              Text('Photos (up to ${BookingObservation.maxPhotos})',
                  style: TextStyle(color: Colors.grey.shade700, fontSize: 12, fontWeight: FontWeight.w600)),
              const SizedBox(height: 6),
              if (_photos.isNotEmpty)
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (var i = 0; i < _photos.length; i++)
                      Stack(
                        children: [
                          ClipRRect(
                            borderRadius: BorderRadius.circular(6),
                            child: Image.memory(
                              base64Decode(_photos[i].split(',').last),
                              height: 72,
                              width: 72,
                              fit: BoxFit.cover,
                            ),
                          ),
                          Positioned(
                            top: 0,
                            right: 0,
                            child: InkWell(
                              onTap: () => setState(() => _photos.removeAt(i)),
                              child: Container(
                                decoration: BoxDecoration(
                                  color: Colors.black54,
                                  borderRadius: BorderRadius.circular(999),
                                ),
                                padding: const EdgeInsets.all(2),
                                child: const Icon(Icons.close, size: 14, color: Colors.white),
                              ),
                            ),
                          ),
                        ],
                      ),
                  ],
                ),
              if (_photos.length < BookingObservation.maxPhotos)
                Row(
                  children: [
                    TextButton.icon(
                      onPressed: _picking ? null : () => _addPhoto(ImageSource.camera),
                      icon: const Icon(Icons.photo_camera_outlined, size: 18),
                      label: const Text('Camera'),
                    ),
                    TextButton.icon(
                      onPressed: _picking ? null : () => _addPhoto(ImageSource.gallery),
                      icon: const Icon(Icons.photo_library_outlined, size: 18),
                      label: const Text('Library'),
                    ),
                  ],
                ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _saving || _picking ? null : _save,
                  child: Text(_saving ? 'Saving…' : 'Save observation'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

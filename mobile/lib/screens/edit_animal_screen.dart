import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/animal.dart';

/// Edit form for a pet's core details. Saves a partial update, so only these
/// fields are touched — the richer intake data (allergies, medication, etc.)
/// is left untouched.
class EditAnimalScreen extends StatefulWidget {
  final Animal animal;
  const EditAnimalScreen({super.key, required this.animal});

  @override
  State<EditAnimalScreen> createState() => _EditAnimalScreenState();
}

class _EditAnimalScreenState extends State<EditAnimalScreen> {
  late final TextEditingController _name = TextEditingController(text: widget.animal.name);
  late final TextEditingController _breed = TextEditingController(text: widget.animal.breed);
  late final TextEditingController _age = TextEditingController(text: '${widget.animal.age}');
  late final TextEditingController _colour =
      TextEditingController(text: widget.animal.colourMarkings ?? '');
  late final TextEditingController _microchip =
      TextEditingController(text: widget.animal.microchipNumber ?? '');
  late final TextEditingController _insurer = TextEditingController(text: widget.animal.insurer ?? '');
  late final TextEditingController _temperament =
      TextEditingController(text: widget.animal.temperamentNotes ?? '');

  late String _species = widget.animal.species;
  late String _sex = widget.animal.sex.isEmpty ? 'female' : widget.animal.sex;
  late bool _vaccinated = widget.animal.vaccinated;
  late DateTime? _vaccineExpiry = widget.animal.vaccineExpiryDate;
  late String? _neutered = widget.animal.neuteredStatus;
  late bool _insured = widget.animal.insured ?? false;
  late String? _vaccinePhoto = widget.animal.vaccineRecordPhoto;
  late List<String> _photos = List.of(widget.animal.photos);
  bool _saving = false;
  bool _pickingPhoto = false;

  static final _dateFmt = DateFormat('d MMM yyyy');

  @override
  void dispose() {
    for (final c in [_name, _breed, _age, _colour, _microchip, _insurer, _temperament]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    final repo = context.read<Repository>();
    final name = _name.text.trim();
    final age = int.tryParse(_age.text.trim());
    if (name.isEmpty) {
      _snack('Enter a name.');
      return;
    }
    if (age == null || age < 0) {
      _snack('Enter a valid age.');
      return;
    }
    if (_vaccinated && _vaccineExpiry == null) {
      _snack('Set the vaccination expiry date.');
      return;
    }
    final patch = <String, dynamic>{
      'name': name,
      'species': _species,
      'breed': _breed.text.trim(),
      'sex': _sex,
      'age': age,
      'vaccinated': _vaccinated,
      if (_vaccinated && _vaccineExpiry != null)
        'vaccineExpiryDate': _vaccineExpiry!.toIso8601String(),
      'colourMarkings': _colour.text.trim(),
      'microchipNumber': _microchip.text.trim(),
      'temperamentNotes': _temperament.text.trim(),
      'insured': _insured,
      if (_insured) 'insurer': _insurer.text.trim(),
      if (_neutered != null) 'neuteredStatus': _neutered,
      'vaccineRecordPhoto': _vaccinePhoto,
      'photos': _photos,
    };
    setState(() => _saving = true);
    try {
      final updated = await repo.updateAnimal(widget.animal.id, patch);
      if (mounted) Navigator.of(context).pop(updated);
    } catch (e) {
      _snack(e is ApiException ? e.message : 'Failed to save pet');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _pickExpiry() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _vaccineExpiry ?? now,
      firstDate: DateTime(now.year - 5),
      lastDate: DateTime(now.year + 10),
    );
    if (picked != null) setState(() => _vaccineExpiry = picked);
  }

  void _snack(String m) {
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }

  /// Captures a photo and hands it over as a jpeg data URI — the same
  /// downscale the intake form uses, keeping the base64 payload well under
  /// the API's body-size limit.
  Future<void> _capturePhoto(ImageSource source, void Function(String dataUri) onPicked) async {
    if (_pickingPhoto) return;
    setState(() => _pickingPhoto = true);
    try {
      final file = await ImagePicker().pickImage(source: source, imageQuality: 70, maxWidth: 1600);
      if (file == null) return;
      final bytes = await file.readAsBytes();
      onPicked('data:image/jpeg;base64,${base64Encode(bytes)}');
    } catch (_) {
      _snack('Failed to add the photo.');
    } finally {
      if (mounted) setState(() => _pickingPhoto = false);
    }
  }

  /// 88px thumbnail for a stored photo. Guards the base64 decode so a
  /// malformed value renders a placeholder instead of crashing the build.
  Widget _thumbnail(String src) {
    final placeholder = Container(
      height: 88,
      width: 88,
      color: Colors.grey.shade200,
      child: const Icon(Icons.broken_image_outlined, color: Colors.grey),
    );
    try {
      return Image.memory(
        base64Decode(src.split(',').last),
        height: 88,
        width: 88,
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) => placeholder,
      );
    } on FormatException {
      return placeholder;
    }
  }

  /// Photo picker section matching the intake form: thumbnails with a remove
  /// badge plus camera/library buttons while below [maxFiles].
  Widget _photoSection({
    required String label,
    required List<String> photos,
    required int maxFiles,
    required void Function(String dataUri) onAdd,
    required void Function(int index) onRemove,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(height: 6),
        if (photos.isNotEmpty)
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (var i = 0; i < photos.length; i++)
                Stack(
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(6),
                      child: _thumbnail(photos[i]),
                    ),
                    Positioned(
                      top: 0,
                      right: 0,
                      child: InkWell(
                        onTap: () => onRemove(i),
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
        if (photos.length < maxFiles)
          Row(
            children: [
              TextButton.icon(
                onPressed: _pickingPhoto ? null : () => _capturePhoto(ImageSource.camera, onAdd),
                icon: const Icon(Icons.photo_camera_outlined, size: 18),
                label: const Text('Camera'),
              ),
              TextButton.icon(
                onPressed: _pickingPhoto ? null : () => _capturePhoto(ImageSource.gallery, onAdd),
                icon: const Icon(Icons.photo_library_outlined, size: 18),
                label: const Text('Library'),
              ),
            ],
          ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Edit ${widget.animal.name}')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          TextField(
            controller: _name,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(labelText: 'Name'),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _species,
            decoration: const InputDecoration(labelText: 'Species'),
            items: const [
              DropdownMenuItem(value: 'dog', child: Text('Dog')),
              DropdownMenuItem(value: 'cat', child: Text('Cat')),
              DropdownMenuItem(value: 'other', child: Text('Other')),
            ],
            onChanged: (v) => setState(() => _species = v ?? 'other'),
          ),
          const SizedBox(height: 12),
          TextField(controller: _breed, decoration: const InputDecoration(labelText: 'Breed')),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<String>(
                  initialValue: _sex,
                  decoration: const InputDecoration(labelText: 'Sex'),
                  items: const [
                    DropdownMenuItem(value: 'female', child: Text('Female')),
                    DropdownMenuItem(value: 'male', child: Text('Male')),
                  ],
                  onChanged: (v) => setState(() => _sex = v ?? 'female'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: TextField(
                  controller: _age,
                  decoration: const InputDecoration(labelText: 'Age'),
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _colour,
            decoration: const InputDecoration(labelText: 'Colour / markings'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _microchip,
            decoration: const InputDecoration(labelText: 'Microchip number'),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String?>(
            initialValue: _neutered,
            decoration: const InputDecoration(labelText: 'Neutered status'),
            items: const [
              DropdownMenuItem(value: null, child: Text('Not specified')),
              DropdownMenuItem(value: 'neutered', child: Text('Neutered')),
              DropdownMenuItem(value: 'spayed', child: Text('Spayed')),
              DropdownMenuItem(value: 'no', child: Text('Not neutered')),
            ],
            onChanged: (v) => setState(() => _neutered = v),
          ),
          const SizedBox(height: 4),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Vaccinated'),
            value: _vaccinated,
            onChanged: (v) => setState(() => _vaccinated = v),
          ),
          if (_vaccinated) ...[
            const SizedBox(height: 4),
            InkWell(
              onTap: _pickExpiry,
              child: InputDecorator(
                decoration: const InputDecoration(labelText: 'Vaccination expiry'),
                child: Text(
                  _vaccineExpiry == null ? 'Set date' : _dateFmt.format(_vaccineExpiry!),
                  style: TextStyle(color: _vaccineExpiry == null ? Colors.grey.shade600 : null),
                ),
              ),
            ),
          ],
          const SizedBox(height: 8),
          _photoSection(
            label: 'Vaccination card',
            photos: [?_vaccinePhoto],
            maxFiles: 1,
            onAdd: (uri) => setState(() => _vaccinePhoto = uri),
            onRemove: (_) => setState(() => _vaccinePhoto = null),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Insured'),
            value: _insured,
            onChanged: (v) => setState(() => _insured = v),
          ),
          if (_insured) ...[
            const SizedBox(height: 4),
            TextField(controller: _insurer, decoration: const InputDecoration(labelText: 'Insurer')),
          ],
          const SizedBox(height: 12),
          TextField(
            controller: _temperament,
            decoration: const InputDecoration(labelText: 'Temperament notes'),
            maxLines: 3,
          ),
          const SizedBox(height: 16),
          _photoSection(
            label: 'Pet photos (up to 2)',
            photos: _photos,
            maxFiles: 2,
            onAdd: (uri) => setState(() => _photos = [..._photos, uri]),
            onRemove: (i) => setState(() => _photos = [..._photos]..removeAt(i)),
          ),
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _saving ? null : _save,
              child: Text(_saving ? 'Saving…' : 'Save changes'),
            ),
          ),
        ],
      ),
    );
  }
}

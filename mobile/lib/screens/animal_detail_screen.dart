import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/animal.dart';
import 'edit_animal_screen.dart';

/// Read-only view of everything on file for a single pet, reached by tapping a
/// pet on the customer detail screen. The overflow menu edits or deletes it.
class AnimalDetailScreen extends StatefulWidget {
  final Animal animal;
  const AnimalDetailScreen({super.key, required this.animal});

  @override
  State<AnimalDetailScreen> createState() => _AnimalDetailScreenState();
}

class _AnimalDetailScreenState extends State<AnimalDetailScreen> {
  static final _dateFmt = DateFormat('d MMM yyyy');
  late Animal _animal = widget.animal;

  /// Opens the pet's photos full-screen (pinch-to-zoom, swipe between them).
  void _openPhoto(List<Uint8List> photos, int index) {
    Navigator.of(context).push(MaterialPageRoute(
      fullscreenDialog: true,
      builder: (_) => _PhotoGalleryScreen(photos: photos, initialIndex: index),
    ));
  }

  Future<void> _edit() async {
    final updated = await Navigator.of(context).push<Animal>(
      MaterialPageRoute(builder: (_) => EditAnimalScreen(animal: _animal)),
    );
    if (updated != null && mounted) setState(() => _animal = updated);
  }

  Future<void> _delete() async {
    final repo = context.read<Repository>();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete pet?'),
        content: Text('This permanently deletes ${_animal.name}. This cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red.shade600),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await repo.deleteAnimal(_animal.id);
      if (mounted) Navigator.of(context).pop(true); // back to customer detail, which reloads
    } catch (e) {
      if (mounted) {
        final message = e is ApiException ? e.message : 'Failed to delete pet';
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(message), duration: const Duration(seconds: 5)));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final animal = _animal;
    final photos = animal.photos.map(_decodeDataUri).whereType<Uint8List>().toList();
    return Scaffold(
      appBar: AppBar(
        title: Text(animal.name.isEmpty ? 'Pet' : animal.name),
        actions: [
          PopupMenuButton<String>(
            onSelected: (v) => v == 'edit' ? _edit() : _delete(),
            itemBuilder: (_) => const [
              PopupMenuItem(
                value: 'edit',
                child: ListTile(leading: Icon(Icons.edit_outlined), title: Text('Edit')),
              ),
              PopupMenuItem(
                value: 'delete',
                child: ListTile(leading: Icon(Icons.delete_outline), title: Text('Delete')),
              ),
            ],
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(animal.name, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 4),
          Text(
            '${_cap(animal.species)} · ${animal.breed}',
            style: TextStyle(color: Colors.grey.shade600),
          ),

          if (photos.isNotEmpty) ...[
            const SizedBox(height: 16),
            SizedBox(
              height: 160,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: photos.length,
                separatorBuilder: (_, _) => const SizedBox(width: 8),
                itemBuilder: (_, i) => GestureDetector(
                  onTap: () => _openPhoto(photos, i),
                  child: Hero(
                    tag: 'pet-photo-$i',
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(10),
                      child: Image.memory(photos[i], height: 160, fit: BoxFit.cover),
                    ),
                  ),
                ),
              ),
            ),
          ],

          _section('Basics'),
          _row('Sex', _cap(animal.sex)),
          _row('Age', '${animal.age}'),
          if (animal.dateOfBirth != null) _row('Date of birth', _dateFmt.format(animal.dateOfBirth!)),
          if ((animal.colourMarkings ?? '').isNotEmpty) _row('Colour / markings', animal.colourMarkings!),
          if ((animal.microchipNumber ?? '').isNotEmpty) _row('Microchip', animal.microchipNumber!),

          _section('Health'),
          _row('Vaccinated', _yesNo(animal.vaccinated)),
          if (animal.vaccineExpiryDate != null)
            _row('Vaccine expiry', _dateFmt.format(animal.vaccineExpiryDate!)),
          if (animal.neuteredStatus != null) _row('Neutered', _neutered(animal.neuteredStatus!)),
          if (animal.neuteredStatus == 'spayed' && animal.lastSeasonEndDate != null)
            _row('Last season ended', _dateFmt.format(animal.lastSeasonEndDate!)),
          if (animal.insured != null) _row('Insured', _yesNo(animal.insured!)),
          if (animal.insured == true && (animal.insurer ?? '').isNotEmpty)
            _row('Insurer', animal.insurer!),
          if (animal.allergies != null) _row('Allergies', _triState(animal.allergies!.status)),
          if (animal.allergies != null && (animal.allergies!.details ?? '').isNotEmpty)
            _row('Allergy details', animal.allergies!.details!),

          if (animal.medication != null) ...[
            _section('Medication'),
            _row('On medication', _yesNo(animal.medication!.onMedication)),
            ...animal.medication!.medications.map(_medicationTile),
            if ((animal.medication!.details ?? '').isNotEmpty)
              _row('Notes', animal.medication!.details!),
          ],

          _section('Temperament & handling'),
          if ((animal.temperamentNotes ?? '').isNotEmpty) _row('Temperament', animal.temperamentNotes!),
          _row('Aggression to people', _yesNo(animal.aggressionToPeople)),
          if ((animal.aggressionToPeopleDetails ?? '').isNotEmpty)
            _row('Details', animal.aggressionToPeopleDetails!),
          if (animal.aggressionToOtherAnimals != null)
            _row('Aggression to animals', _yesNo(animal.aggressionToOtherAnimals!)),
          if ((animal.aggressionToOtherAnimalsDetails ?? '').isNotEmpty)
            _row('Details', animal.aggressionToOtherAnimalsDetails!),
          if (animal.travelsWellInCar != null) _row('Travels well in car', _triState(animal.travelsWellInCar!)),
          if (animal.chasesLivestock != null) _row('Chases livestock', _triState(animal.chasesLivestock!)),
          if ((animal.chasesLivestockDetails ?? '').isNotEmpty)
            _row('Details', animal.chasesLivestockDetails!),
          if (animal.offLeadConsent != null)
            _row('Walk mode', animal.offLeadConsent!.mode == 'off_lead' ? 'Off-lead consented' : 'On-lead'),
          if (animal.offLeadConsent?.date != null)
            _row('Consent date', _dateFmt.format(animal.offLeadConsent!.date!)),
        ],
      ),
    );
  }

  Widget _medicationTile(MedicationEntry m) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Card(
          margin: EdgeInsets.zero,
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(m.name, style: const TextStyle(fontWeight: FontWeight.w600)),
                if ((m.illnessTreating ?? '').isNotEmpty) Text('For: ${m.illnessTreating}'),
                if ((m.dosage ?? '').isNotEmpty || (m.frequency ?? '').isNotEmpty)
                  Text([m.dosage, m.frequency].where((s) => (s ?? '').isNotEmpty).join(' · ')),
                Text('Vet prescribed: ${_yesNo(m.vetPrescribed)} · '
                    'By Pawfect Pets: ${_yesNo(m.administeredByPawfectPets)}',
                    style: TextStyle(color: Colors.grey.shade600, fontSize: 12)),
                if ((m.additionalInfo ?? '').isNotEmpty) Text(m.additionalInfo!),
              ],
            ),
          ),
        ),
      );

  Widget _section(String title) => Padding(
        padding: const EdgeInsets.only(top: 20, bottom: 8),
        child: Text(
          title.toUpperCase(),
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.bold,
            letterSpacing: 0.5,
            color: Colors.grey.shade600,
          ),
        ),
      );

  Widget _row(String label, String value) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(width: 140, child: Text(label, style: TextStyle(color: Colors.grey.shade600))),
            Expanded(child: Text(value)),
          ],
        ),
      );
}

String _cap(String s) => s.isEmpty ? s : '${s[0].toUpperCase()}${s.substring(1)}';
String _yesNo(bool v) => v ? 'Yes' : 'No';
String _triState(String s) => {'yes': 'Yes', 'no': 'No', 'unsure': 'Unsure'}[s] ?? _cap(s);
String _neutered(String s) =>
    {'neutered': 'Neutered', 'spayed': 'Spayed', 'no': 'Not neutered'}[s] ?? _cap(s);

/// Full-screen photo viewer: swipe between a pet's photos and pinch to zoom.
class _PhotoGalleryScreen extends StatefulWidget {
  final List<Uint8List> photos;
  final int initialIndex;
  const _PhotoGalleryScreen({required this.photos, required this.initialIndex});

  @override
  State<_PhotoGalleryScreen> createState() => _PhotoGalleryScreenState();
}

class _PhotoGalleryScreenState extends State<_PhotoGalleryScreen> {
  late final PageController _controller = PageController(initialPage: widget.initialIndex);
  late int _current = widget.initialIndex;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final multiple = widget.photos.length > 1;
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        elevation: 0,
        title: multiple ? Text('${_current + 1} of ${widget.photos.length}') : null,
      ),
      body: PageView.builder(
        controller: _controller,
        itemCount: widget.photos.length,
        onPageChanged: (i) => setState(() => _current = i),
        itemBuilder: (_, i) => Center(
          child: Hero(
            tag: 'pet-photo-$i',
            child: InteractiveViewer(
              minScale: 1,
              maxScale: 5,
              child: Image.memory(widget.photos[i], fit: BoxFit.contain),
            ),
          ),
        ),
      ),
    );
  }
}

Uint8List? _decodeDataUri(String s) {
  final comma = s.indexOf(',');
  final b64 = comma >= 0 ? s.substring(comma + 1) : s;
  try {
    return base64Decode(b64);
  } catch (_) {
    return null;
  }
}

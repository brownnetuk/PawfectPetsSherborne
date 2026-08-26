import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
  late String? _neutered = widget.animal.neuteredStatus;
  late bool _insured = widget.animal.insured ?? false;
  bool _saving = false;

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
    final patch = <String, dynamic>{
      'name': name,
      'species': _species,
      'breed': _breed.text.trim(),
      'sex': _sex,
      'age': age,
      'vaccinated': _vaccinated,
      'colourMarkings': _colour.text.trim(),
      'microchipNumber': _microchip.text.trim(),
      'temperamentNotes': _temperament.text.trim(),
      'insured': _insured,
      if (_insured) 'insurer': _insurer.text.trim(),
      if (_neutered != null) 'neuteredStatus': _neutered,
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

  void _snack(String m) {
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
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

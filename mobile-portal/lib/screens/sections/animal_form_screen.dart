import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../api/api_client.dart';
import '../../api/repository.dart';
import '../../models/portal_models.dart';
import 'section_scaffold.dart';

/// Add or edit one pet. Mirrors the backend's required fields so a create is
/// always valid (including dogs' off-lead consent).
class AnimalFormScreen extends StatefulWidget {
  final Animal? animal;
  const AnimalFormScreen({super.key, this.animal});

  bool get isEdit => animal != null;

  @override
  State<AnimalFormScreen> createState() => _AnimalFormScreenState();
}

class _AnimalFormScreenState extends State<AnimalFormScreen> {
  final _name = TextEditingController();
  final _breed = TextEditingController();
  final _age = TextEditingController();
  final _microchip = TextEditingController();
  final _colour = TextEditingController();
  final _insurer = TextEditingController();
  final _temperament = TextEditingController();
  final _aggPeopleDetails = TextEditingController();
  final _aggAnimalsDetails = TextEditingController();
  final _chasesDetails = TextEditingController();
  final _allergyDetails = TextEditingController();
  final _medName = TextEditingController();
  final _medDosage = TextEditingController();
  final _medFrequency = TextEditingController();
  final _offLeadSignature = TextEditingController();

  String _species = 'dog';
  String _sex = 'male';
  bool _vaccinated = false;
  String? _vaccineExpiry; // yyyy-MM-dd
  String _neutered = ''; // '', neutered, spayed, no
  bool _insured = false;
  bool _aggPeople = false;
  bool _aggAnimals = false;
  String _travels = ''; // '', yes, no, unsure
  String _chases = '';
  String _allergyStatus = 'no';
  bool _onMedication = false;
  bool _vetPrescribed = false;
  bool _adminByPP = false;
  String _offLeadMode = 'on_lead';

  bool _saving = false;
  String? _error;

  bool get _isDog => _species == 'dog';

  @override
  void initState() {
    super.initState();
    final a = widget.animal;
    if (a != null) {
      _name.text = a.name;
      _breed.text = a.breed;
      _age.text = a.age.toString();
      _microchip.text = a.microchipNumber ?? '';
      _colour.text = a.colourMarkings ?? '';
      _temperament.text = a.temperamentNotes ?? '';
      _aggPeopleDetails.text = a.aggressionToPeopleDetails ?? '';
      _aggAnimalsDetails.text = a.aggressionToOtherAnimalsDetails ?? '';
      _chasesDetails.text = a.chasesLivestockDetails ?? '';
      _allergyDetails.text = a.allergyDetails ?? '';
      _species = a.species;
      _sex = a.sex;
      _vaccinated = a.vaccinated;
      _vaccineExpiry = a.vaccineExpiryDate;
      _neutered = a.neuteredStatus ?? '';
      _insured = a.insured;
      _insurer.text = a.insurer ?? '';
      _aggPeople = a.aggressionToPeople;
      _aggAnimals = a.aggressionToOtherAnimals ?? false;
      _travels = a.travelsWellInCar ?? '';
      _chases = a.chasesLivestock ?? '';
      _allergyStatus = a.allergyStatus;
      _onMedication = a.onMedication;
      if (a.medications.isNotEmpty) {
        final m = a.medications.first;
        _medName.text = m.name;
        _medDosage.text = m.dosage ?? '';
        _medFrequency.text = m.frequency ?? '';
        _vetPrescribed = m.vetPrescribed;
        _adminByPP = m.administeredByPawfectPets;
      }
      _offLeadMode = a.offLeadMode ?? 'on_lead';
    }
  }

  @override
  void dispose() {
    for (final c in [
      _name, _breed, _age, _microchip, _colour, _insurer, _temperament,
      _aggPeopleDetails, _aggAnimalsDetails, _chasesDetails, _allergyDetails,
      _medName, _medDosage, _medFrequency, _offLeadSignature,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _pickExpiry() async {
    final now = DateTime.now();
    final initial = _vaccineExpiry != null ? DateTime.tryParse(_vaccineExpiry!) ?? now : now;
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(now.year - 1),
      lastDate: DateTime(now.year + 10),
    );
    if (picked != null) {
      setState(() => _vaccineExpiry = DateFormat('yyyy-MM-dd').format(picked));
    }
  }

  String? _validate() {
    if (_name.text.trim().isEmpty) return 'Enter your pet\'s name.';
    if (_breed.text.trim().isEmpty) return 'Enter the breed.';
    final age = int.tryParse(_age.text.trim());
    if (age == null || age < 0) return 'Enter a valid age (whole number).';
    if (_vaccinated && (_vaccineExpiry == null || _vaccineExpiry!.isEmpty)) {
      return 'Enter the vaccine expiry date.';
    }
    if (_allergyStatus != 'no' && _allergyDetails.text.trim().isEmpty) {
      return 'Add allergy details.';
    }
    if (_onMedication && _medName.text.trim().isEmpty) {
      return 'Enter the medication name.';
    }
    if (_isDog && _offLeadMode == 'off_lead' && _offLeadSignature.text.trim().isEmpty) {
      return 'Type your name to consent to off-lead walking.';
    }
    return null;
  }

  Map<String, dynamic> _buildBody() {
    final body = <String, dynamic>{
      'species': _species,
      'breed': _breed.text.trim(),
      'name': _name.text.trim(),
      'sex': _sex,
      'age': int.parse(_age.text.trim()),
      'vaccinated': _vaccinated,
      'insured': _insured,
      'aggressionToPeople': _aggPeople,
      'allergies': {
        'status': _allergyStatus,
        if (_allergyStatus != 'no') 'details': _allergyDetails.text.trim(),
      },
      'medication': {
        'onMedication': _onMedication,
        if (_onMedication)
          'medications': [
            {
              'name': _medName.text.trim(),
              if (_medDosage.text.trim().isNotEmpty) 'dosage': _medDosage.text.trim(),
              if (_medFrequency.text.trim().isNotEmpty) 'frequency': _medFrequency.text.trim(),
              'vetPrescribed': _vetPrescribed,
              'administeredByPawfectPets': _adminByPP,
            }
          ],
      },
    };
    if (_vaccinated && _vaccineExpiry != null) body['vaccineExpiryDate'] = _vaccineExpiry;
    if (_colour.text.trim().isNotEmpty) body['colourMarkings'] = _colour.text.trim();
    if (_microchip.text.trim().isNotEmpty) body['microchipNumber'] = _microchip.text.trim();
    if (_insured && _insurer.text.trim().isNotEmpty) body['insurer'] = _insurer.text.trim();
    if (_neutered.isNotEmpty) body['neuteredStatus'] = _neutered;
    if (_temperament.text.trim().isNotEmpty) body['temperamentNotes'] = _temperament.text.trim();
    if (_aggPeople && _aggPeopleDetails.text.trim().isNotEmpty) {
      body['aggressionToPeopleDetails'] = _aggPeopleDetails.text.trim();
    }
    // Dog-only fields (the backend rejects these for cats).
    if (_isDog) {
      body['aggressionToOtherAnimals'] = _aggAnimals;
      if (_aggAnimals && _aggAnimalsDetails.text.trim().isNotEmpty) {
        body['aggressionToOtherAnimalsDetails'] = _aggAnimalsDetails.text.trim();
      }
      if (_travels.isNotEmpty) body['travelsWellInCar'] = _travels;
      if (_chases.isNotEmpty) {
        body['chasesLivestock'] = _chases;
        if (_chases != 'no' && _chasesDetails.text.trim().isNotEmpty) {
          body['chasesLivestockDetails'] = _chasesDetails.text.trim();
        }
      }
      body['offLeadConsent'] = {
        'mode': _offLeadMode,
        if (_offLeadMode == 'off_lead') 'signature': _offLeadSignature.text.trim(),
      };
    }
    return body;
  }

  Future<void> _save() async {
    final err = _validate();
    if (err != null) {
      setState(() => _error = err);
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final repo = context.read<Repository>();
      final body = _buildBody();
      if (widget.isEdit) {
        await repo.updateAnimal(widget.animal!.id, body);
      } else {
        await repo.createAnimal(body);
      }
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(widget.isEdit ? 'Pet updated.' : 'Pet added.')));
        Navigator.of(context).pop(true);
      }
    } catch (e) {
      setState(() => _error = e is ApiException ? e.message : 'Failed to save');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SectionScaffold(
      title: widget.isEdit ? 'Edit ${widget.animal!.name}' : 'Add a pet',
      saving: _saving,
      error: _error,
      onSave: _save,
      saveLabel: widget.isEdit ? 'Save changes' : 'Add pet',
      children: [
        sectionField('Name', _name),
        _dropdown('Species', _species, const {'dog': 'Dog', 'cat': 'Cat', 'other': 'Other'},
            (v) => setState(() => _species = v)),
        sectionField('Breed', _breed),
        _dropdown('Sex', _sex, const {'male': 'Male', 'female': 'Female'}, (v) => setState(() => _sex = v)),
        _numberField('Age (years)', _age),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Vaccinated'),
          value: _vaccinated,
          onChanged: (v) => setState(() => _vaccinated = v),
        ),
        if (_vaccinated)
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Vaccine expiry'),
            subtitle: Text(_vaccineExpiry ?? 'Not set'),
            trailing: const Icon(Icons.calendar_today, size: 18),
            onTap: _pickExpiry,
          ),
        _dropdown('Neutered / spayed', _neutered, const {
          '': 'Not specified',
          'neutered': 'Neutered',
          'spayed': 'Spayed',
          'no': 'No',
        }, (v) => setState(() => _neutered = v)),
        sectionField('Microchip number', _microchip),
        sectionField('Colour & markings', _colour),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Insured'),
          value: _insured,
          onChanged: (v) => setState(() => _insured = v),
        ),
        if (_insured) sectionField('Insurer', _insurer),
        sectionField('Temperament notes', _temperament, maxLines: 3),
        const Divider(height: 28),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Aggression to people'),
          value: _aggPeople,
          onChanged: (v) => setState(() => _aggPeople = v),
        ),
        if (_aggPeople) sectionField('Details', _aggPeopleDetails, maxLines: 2),
        if (_isDog) ...[
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Aggression to other animals'),
            value: _aggAnimals,
            onChanged: (v) => setState(() => _aggAnimals = v),
          ),
          if (_aggAnimals) sectionField('Details', _aggAnimalsDetails, maxLines: 2),
          _dropdown('Travels well in car', _travels, const {
            '': 'Not specified',
            'yes': 'Yes',
            'no': 'No',
            'unsure': 'Unsure',
          }, (v) => setState(() => _travels = v)),
          _dropdown('Chases livestock', _chases, const {
            '': 'Not specified',
            'yes': 'Yes',
            'no': 'No',
            'unsure': 'Unsure',
          }, (v) => setState(() => _chases = v)),
          if (_chases == 'yes' || _chases == 'unsure') sectionField('Details', _chasesDetails, maxLines: 2),
        ],
        const Divider(height: 28),
        _dropdown('Allergies', _allergyStatus, const {
          'no': 'None',
          'yes': 'Yes',
          'unsure': 'Unsure',
        }, (v) => setState(() => _allergyStatus = v)),
        if (_allergyStatus != 'no') sectionField('Allergy details', _allergyDetails, maxLines: 2),
        const Divider(height: 28),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('On medication'),
          value: _onMedication,
          onChanged: (v) => setState(() => _onMedication = v),
        ),
        if (_onMedication) ...[
          sectionField('Medication name', _medName),
          sectionField('Dosage', _medDosage),
          sectionField('Frequency', _medFrequency),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Vet prescribed'),
            value: _vetPrescribed,
            onChanged: (v) => setState(() => _vetPrescribed = v),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Administered by Pawfect Pets'),
            value: _adminByPP,
            onChanged: (v) => setState(() => _adminByPP = v),
          ),
        ],
        if (_isDog) ...[
          const Divider(height: 28),
          _dropdown('Walking', _offLeadMode, const {
            'on_lead': 'On lead',
            'off_lead': 'Off lead',
          }, (v) => setState(() => _offLeadMode = v)),
          if (_offLeadMode == 'off_lead')
            sectionField('Type your name to consent to off-lead walking', _offLeadSignature),
        ],
      ],
    );
  }

  Widget _numberField(String label, TextEditingController c) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextField(
          controller: c,
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          decoration: InputDecoration(labelText: label),
        ),
      );

  Widget _dropdown(String label, String value, Map<String, String> options, ValueChanged<String> onChanged) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: DropdownButtonFormField<String>(
        initialValue: value,
        isExpanded: true,
        decoration: InputDecoration(labelText: label),
        items: options.entries.map((e) => DropdownMenuItem(value: e.key, child: Text(e.value))).toList(),
        onChanged: (v) => onChanged(v ?? value),
      ),
    );
  }
}

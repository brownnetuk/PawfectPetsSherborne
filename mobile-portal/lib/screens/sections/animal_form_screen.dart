import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:signature/signature.dart';
import '../../api/api_client.dart';
import '../../api/repository.dart';
import '../../models/portal_models.dart';
import '../../state/auth_provider.dart';
import 'section_scaffold.dart';

/// Add or edit one pet. Mirrors the backend's required fields so a create is
/// always valid (including dogs' off-lead consent, which requires a signature).
class AnimalFormScreen extends StatefulWidget {
  final Animal? animal;
  const AnimalFormScreen({super.key, this.animal});

  bool get isEdit => animal != null;

  @override
  State<AnimalFormScreen> createState() => _AnimalFormScreenState();
}

/// One repeatable medication row's controllers/state.
class _MedEntry {
  final name = TextEditingController();
  final dosage = TextEditingController();
  final frequency = TextEditingController();
  bool vetPrescribed = false;
  bool administeredByPawfectPets = false;

  _MedEntry();

  _MedEntry.from(AnimalMedication m) {
    name.text = m.name;
    dosage.text = m.dosage ?? '';
    frequency.text = m.frequency ?? '';
    vetPrescribed = m.vetPrescribed;
    administeredByPawfectPets = m.administeredByPawfectPets;
  }

  void dispose() {
    name.dispose();
    dosage.dispose();
    frequency.dispose();
  }

  Map<String, dynamic> toJson() => {
        'name': name.text.trim(),
        if (dosage.text.trim().isNotEmpty) 'dosage': dosage.text.trim(),
        if (frequency.text.trim().isNotEmpty) 'frequency': frequency.text.trim(),
        'vetPrescribed': vetPrescribed,
        'administeredByPawfectPets': administeredByPawfectPets,
      };
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

  final List<_MedEntry> _meds = [];
  final _sig = SignatureController(penStrokeWidth: 2, penColor: Colors.black);

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
  String _offLeadMode = 'on_lead';

  bool _saving = false;
  String? _error;

  bool get _isDog => _species == 'dog';

  @override
  void initState() {
    super.initState();
    // Keep the off-lead consent text's {{petName}} in sync as the name is typed.
    _name.addListener(() {
      if (mounted) setState(() {});
    });
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
      _meds.addAll(a.medications.map((m) => _MedEntry.from(m)));
      _offLeadMode = a.offLeadMode ?? 'on_lead';
    }
  }

  @override
  void dispose() {
    for (final c in [
      _name, _breed, _age, _microchip, _colour, _insurer, _temperament,
      _aggPeopleDetails, _aggAnimalsDetails, _chasesDetails, _allergyDetails,
    ]) {
      c.dispose();
    }
    for (final m in _meds) {
      m.dispose();
    }
    _sig.dispose();
    super.dispose();
  }

  void _toggleMedication(bool on) {
    setState(() {
      _onMedication = on;
      if (on && _meds.isEmpty) _meds.add(_MedEntry());
    });
  }

  void _addMed() => setState(() => _meds.add(_MedEntry()));

  void _removeMed(int i) => setState(() => _meds.removeAt(i).dispose());

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

  // Whether an off-lead signature must be captured now (new pet, or switching
  // to off-lead on an edit). An unchanged off-lead pet may keep its existing
  // signature without re-signing.
  bool get _needsNewSignature {
    if (!_isDog || _offLeadMode != 'off_lead') return false;
    final wasOffLead = widget.animal?.offLeadMode == 'off_lead';
    return !(widget.isEdit && wasOffLead);
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
    if (_onMedication) {
      if (_meds.isEmpty) return 'Add at least one medication, or turn off "On medication".';
      if (_meds.any((m) => m.name.text.trim().isEmpty)) return 'Every medication needs a name.';
    }
    if (_isDog && _offLeadMode == 'off_lead' && _sig.isEmpty && _needsNewSignature) {
      return 'Please sign to consent to off-lead walking.';
    }
    return null;
  }

  Future<Map<String, dynamic>> _buildBody() async {
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
        if (_onMedication) 'medications': _meds.map((m) => m.toJson()).toList(),
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
      if (_offLeadMode == 'on_lead') {
        body['offLeadConsent'] = {'mode': 'on_lead'};
      } else {
        // off_lead: include a freshly-captured signature if there is one;
        // otherwise (edit of an already-off-lead pet) omit it to keep the
        // stored signature untouched.
        if (_sig.isNotEmpty) {
          final bytes = await _sig.toPngBytes();
          if (bytes != null) {
            body['offLeadConsent'] = {
              'mode': 'off_lead',
              'signature': 'data:image/png;base64,${base64Encode(bytes)}',
            };
          }
        }
      }
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
      final body = await _buildBody();
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
          onChanged: _toggleMedication,
        ),
        if (_onMedication) ..._medicationList(),
        if (_isDog) ..._offLeadSection(),
      ],
    );
  }

  List<Widget> _medicationList() {
    return [
      for (int i = 0; i < _meds.length; i++) _medCard(i),
      Align(
        alignment: Alignment.centerLeft,
        child: TextButton.icon(
          onPressed: _addMed,
          icon: const Icon(Icons.add),
          label: const Text('Add medication'),
        ),
      ),
    ];
  }

  Widget _medCard(int i) {
    final m = _meds[i];
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFB),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Text('Medication ${i + 1}', style: const TextStyle(fontWeight: FontWeight.w600)),
              const Spacer(),
              if (_meds.length > 1)
                IconButton(
                  visualDensity: VisualDensity.compact,
                  icon: const Icon(Icons.delete_outline, color: Color(0xFFC0392B)),
                  onPressed: () => _removeMed(i),
                ),
            ],
          ),
          sectionField('Name', m.name),
          sectionField('Dosage', m.dosage),
          sectionField('Frequency', m.frequency),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Vet prescribed'),
            value: m.vetPrescribed,
            onChanged: (v) => setState(() => m.vetPrescribed = v),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Administered by Pawfect Pets'),
            value: m.administeredByPawfectPets,
            onChanged: (v) => setState(() => m.administeredByPawfectPets = v),
          ),
        ],
      ),
    );
  }

  // Fallback wording matching the web apps when Business Info has none set.
  static const _defaultOffLeadConsent =
      'I consent to {{petName}} being exercised off the lead, and understand this is at my own risk.';

  List<Widget> _offLeadSection() {
    final raw = context.read<AuthProvider>().profile?.offLeadConsentText ?? '';
    final petName = _name.text.trim().isNotEmpty ? _name.text.trim() : 'my dog';
    // Substitute the {{petName}} placeholder with the real name, same as the
    // intake form / PDF do.
    final consentText =
        (raw.trim().isEmpty ? _defaultOffLeadConsent : raw).replaceAll('{{petName}}', petName);
    final wasOffLead = widget.animal?.offLeadMode == 'off_lead';
    return [
      const Divider(height: 28),
      _dropdown('Walking', _offLeadMode, const {
        'on_lead': 'On lead',
        'off_lead': 'Off lead',
      }, (v) => setState(() => _offLeadMode = v)),
      if (_offLeadMode == 'off_lead') ...[
        if (consentText.trim().isNotEmpty)
          Container(
            width: double.infinity,
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFFF8FAFB),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: const Color(0xFFE5E7EB)),
            ),
            child: Text(consentText, style: const TextStyle(fontSize: 13, height: 1.4)),
          ),
        if (widget.isEdit && wasOffLead)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Text(
              'A signature is already on file. Sign again below only if you want to replace it.',
              style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
            ),
          ),
        const Text('Sign to consent', style: TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: 6),
        Container(
          decoration: BoxDecoration(
            border: Border.all(color: const Color(0xFFCBD5E1)),
            borderRadius: BorderRadius.circular(8),
            color: Colors.white,
          ),
          clipBehavior: Clip.antiAlias,
          child: Signature(controller: _sig, height: 160, backgroundColor: const Color(0xFFF8FAFB)),
        ),
        Align(
          alignment: Alignment.centerRight,
          child: TextButton.icon(
            onPressed: () => setState(() => _sig.clear()),
            icon: const Icon(Icons.undo, size: 18),
            label: const Text('Clear'),
          ),
        ),
      ],
    ];
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

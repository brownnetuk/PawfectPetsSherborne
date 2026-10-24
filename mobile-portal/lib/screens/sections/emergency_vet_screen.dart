import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../api/api_client.dart';
import '../../api/repository.dart';
import '../../models/portal_models.dart';
import '../../state/auth_provider.dart';
import '../../theme.dart';
import 'section_scaffold.dart';

/// The customer's usual vet. A "Vet practice" picker lists the practices
/// staff keep in the admin (Settings > Business Info > Vet Practices); picking
/// one copies its details into the fields below, which stay editable, and
/// "Enter details manually" leaves them exactly as typed -- the same
/// behaviour as the intake form's Emergency Vet step.
class EmergencyVetScreen extends StatefulWidget {
  const EmergencyVetScreen({super.key});

  @override
  State<EmergencyVetScreen> createState() => _EmergencyVetScreenState();
}

class _EmergencyVetScreenState extends State<EmergencyVetScreen> {
  late final Map<String, TextEditingController> _c;
  List<VetPractice> _practices = [];
  // The picked practice's id, or null for "Enter details manually".
  String? _selectedId;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final ev = context.read<AuthProvider>().profile?.emergencyVet;
    _c = {
      'practiceName': TextEditingController(text: ev?.practiceName ?? ''),
      'telephone': TextEditingController(text: ev?.telephone ?? ''),
      'email': TextEditingController(text: ev?.email ?? ''),
      'address1': TextEditingController(text: ev?.address1 ?? ''),
      'address2': TextEditingController(text: ev?.address2 ?? ''),
      'town': TextEditingController(text: ev?.town ?? ''),
      'county': TextEditingController(text: ev?.county ?? ''),
      'postcode': TextEditingController(text: ev?.postcode ?? ''),
    };
    _loadPractices();
  }

  Future<void> _loadPractices() async {
    try {
      final practices = await context.read<Repository>().listVetPractices();
      if (!mounted) return;
      // Pre-select the practice already on file, matched by name and
      // postcode, so the picker reflects what the customer chose before.
      final name = _c['practiceName']!.text.trim().toLowerCase();
      final postcode = _c['postcode']!.text.trim().toLowerCase().replaceAll(' ', '');
      String? selected;
      for (final p in practices) {
        if (p.practiceName.trim().toLowerCase() == name &&
            p.postcode.trim().toLowerCase().replaceAll(' ', '') == postcode) {
          selected = p.id;
          break;
        }
      }
      setState(() {
        _practices = practices;
        _selectedId = selected;
      });
    } catch (_) {
      // The picker is a convenience; the fields still work without it.
    }
  }

  void _pick(String? id) {
    setState(() => _selectedId = id);
    if (id == null) return;
    VetPractice? practice;
    for (final p in _practices) {
      if (p.id == id) practice = p;
    }
    if (practice == null) return;
    _c['practiceName']!.text = practice.practiceName;
    _c['telephone']!.text = practice.telephone;
    _c['email']!.text = practice.email ?? '';
    _c['address1']!.text = practice.address1;
    _c['address2']!.text = practice.address2 ?? '';
    _c['town']!.text = practice.town;
    _c['county']!.text = practice.county ?? '';
    _c['postcode']!.text = practice.postcode;
  }

  @override
  void dispose() {
    for (final ctrl in _c.values) {
      ctrl.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    for (final k in ['practiceName', 'address1', 'town', 'postcode', 'telephone']) {
      if (_c[k]!.text.trim().isEmpty) {
        setState(() => _error = 'Please fill in the practice name, address, town, postcode and telephone.');
        return;
      }
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final auth = context.read<AuthProvider>();
      final ev = {for (final e in _c.entries) e.key: e.value.text.trim()};
      await auth.repository.updateMe({'emergencyVet': ev});
      await auth.refreshProfile();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Emergency vet saved.')));
        Navigator.of(context).pop();
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
      title: 'Emergency Vet',
      saving: _saving,
      error: _error,
      onSave: _save,
      children: [
        if (_practices.isNotEmpty) ...[
          // Only built once the practices have loaded, so the pre-selected
          // match (if any) is in place before the field takes its initial value.
          DropdownButtonFormField<String?>(
            initialValue: _selectedId,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Vet practice'),
            items: [
              const DropdownMenuItem<String?>(value: null, child: Text('Enter details manually')),
              for (final p in _practices)
                DropdownMenuItem<String?>(
                  value: p.id,
                  child: Text('${p.practiceName} · ${p.town}', overflow: TextOverflow.ellipsis),
                ),
            ],
            onChanged: _saving ? null : _pick,
          ),
          Padding(
            padding: const EdgeInsets.only(top: 6, bottom: 14),
            child: Text(
              _selectedId == null
                  ? 'Pick your practice from the list to fill in the details, or type them in below.'
                  : 'Details filled in from the list. You can still change anything below.',
              style: const TextStyle(color: brandMuted, fontSize: 12),
            ),
          ),
        ],
        sectionField('Practice name', _c['practiceName']!),
        sectionField('Telephone', _c['telephone']!, keyboard: TextInputType.phone),
        sectionField('Email', _c['email']!, keyboard: TextInputType.emailAddress),
        sectionField('Address line 1', _c['address1']!),
        sectionField('Address line 2', _c['address2']!),
        sectionField('Town', _c['town']!),
        sectionField('County', _c['county']!),
        sectionField('Postcode', _c['postcode']!),
      ],
    );
  }
}

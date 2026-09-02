import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../api/api_client.dart';
import '../../state/auth_provider.dart';
import 'section_scaffold.dart';

class EmergencyContactScreen extends StatefulWidget {
  const EmergencyContactScreen({super.key});

  @override
  State<EmergencyContactScreen> createState() => _EmergencyContactScreenState();
}

class _EmergencyContactScreenState extends State<EmergencyContactScreen> {
  late final Map<String, TextEditingController> _c;
  bool _sameAsClient = false;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final ec = context.read<AuthProvider>().profile?.emergencyContact;
    _sameAsClient = ec?.sameAsClient ?? false;
    _c = {
      'firstName': TextEditingController(text: ec?.firstName ?? ''),
      'surname': TextEditingController(text: ec?.surname ?? ''),
      'phoneNumber': TextEditingController(text: ec?.phoneNumber ?? ''),
      'email': TextEditingController(text: ec?.email ?? ''),
      'address1': TextEditingController(text: ec?.address1 ?? ''),
      'address2': TextEditingController(text: ec?.address2 ?? ''),
      'town': TextEditingController(text: ec?.town ?? ''),
      'county': TextEditingController(text: ec?.county ?? ''),
      'postcode': TextEditingController(text: ec?.postcode ?? ''),
    };
  }

  @override
  void dispose() {
    for (final ctrl in _c.values) {
      ctrl.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    // Mirror the backend's conditional-required rules for a full contact.
    if (!_sameAsClient) {
      for (final k in ['firstName', 'address1', 'town', 'postcode', 'phoneNumber']) {
        if (_c[k]!.text.trim().isEmpty) {
          setState(() => _error = 'Please fill in name, address, town, postcode and phone (or tick "Same as me").');
          return;
        }
      }
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final auth = context.read<AuthProvider>();
      final ec = <String, dynamic>{'sameAsClient': _sameAsClient};
      if (!_sameAsClient) {
        for (final e in _c.entries) {
          ec[e.key] = e.value.text.trim();
        }
      }
      await auth.repository.updateMe({'emergencyContact': ec});
      await auth.refreshProfile();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Emergency contact saved.')));
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
      title: 'Emergency Contact',
      saving: _saving,
      error: _error,
      onSave: _save,
      children: [
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Same as me'),
          subtitle: const Text('Use my own contact details'),
          value: _sameAsClient,
          onChanged: (v) => setState(() => _sameAsClient = v),
        ),
        if (!_sameAsClient) ...[
          const SizedBox(height: 8),
          sectionField('First name', _c['firstName']!),
          sectionField('Surname', _c['surname']!),
          sectionField('Phone number', _c['phoneNumber']!, keyboard: TextInputType.phone),
          sectionField('Email', _c['email']!, keyboard: TextInputType.emailAddress),
          sectionField('Address line 1', _c['address1']!),
          sectionField('Address line 2', _c['address2']!),
          sectionField('Town', _c['town']!),
          sectionField('County', _c['county']!),
          sectionField('Postcode', _c['postcode']!),
        ],
      ],
    );
  }
}

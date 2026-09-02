import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../api/api_client.dart';
import '../../state/auth_provider.dart';
import 'section_scaffold.dart';

class EmergencyVetScreen extends StatefulWidget {
  const EmergencyVetScreen({super.key});

  @override
  State<EmergencyVetScreen> createState() => _EmergencyVetScreenState();
}

class _EmergencyVetScreenState extends State<EmergencyVetScreen> {
  late final Map<String, TextEditingController> _c;
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

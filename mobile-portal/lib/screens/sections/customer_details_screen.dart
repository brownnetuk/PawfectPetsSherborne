import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../api/api_client.dart';
import '../../state/auth_provider.dart';
import 'section_scaffold.dart';

class CustomerDetailsScreen extends StatefulWidget {
  const CustomerDetailsScreen({super.key});

  @override
  State<CustomerDetailsScreen> createState() => _CustomerDetailsScreenState();
}

class _CustomerDetailsScreenState extends State<CustomerDetailsScreen> {
  late final Map<String, TextEditingController> _c;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final p = context.read<AuthProvider>().profile;
    _c = {
      'firstName': TextEditingController(text: p?.firstName ?? ''),
      'surname': TextEditingController(text: p?.surname ?? ''),
      'phoneNumber': TextEditingController(text: p?.phoneNumber ?? ''),
      'address1': TextEditingController(text: p?.address1 ?? ''),
      'address2': TextEditingController(text: p?.address2 ?? ''),
      'town': TextEditingController(text: p?.town ?? ''),
      'county': TextEditingController(text: p?.county ?? ''),
      'postcode': TextEditingController(text: p?.postcode ?? ''),
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
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final auth = context.read<AuthProvider>();
      final patch = {for (final e in _c.entries) e.key: e.value.text.trim()};
      await auth.repository.updateMe(patch);
      await auth.refreshProfile();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Details saved.')));
        Navigator.of(context).pop();
      }
    } catch (e) {
      setState(() => _error = e is ApiException ? e.message : 'Failed to save your details');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final email = context.read<AuthProvider>().profile?.email ?? '';
    return SectionScaffold(
      title: 'Customer Details',
      saving: _saving,
      error: _error,
      onSave: _save,
      children: [
        InputDecorator(
          decoration: const InputDecoration(labelText: 'Email (used to sign in)'),
          child: Text(email),
        ),
        const SizedBox(height: 12),
        sectionField('First name', _c['firstName']!),
        sectionField('Surname', _c['surname']!),
        sectionField('Phone number', _c['phoneNumber']!, keyboard: TextInputType.phone),
        sectionField('Address line 1', _c['address1']!),
        sectionField('Address line 2', _c['address2']!),
        sectionField('Town', _c['town']!),
        sectionField('County', _c['county']!),
        sectionField('Postcode', _c['postcode']!),
      ],
    );
  }
}

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../api/api_client.dart';
import '../../state/auth_provider.dart';
import 'section_scaffold.dart';

/// Who we call if we can't reach the customer. Always a full, separate
/// contact -- the "Same as me" shortcut was dropped (the web wizard never
/// offers it either), so the record is saved with `sameAsClient: false`.
class EmergencyContactScreen extends StatefulWidget {
  const EmergencyContactScreen({super.key});

  @override
  State<EmergencyContactScreen> createState() => _EmergencyContactScreenState();
}

class _EmergencyContactScreenState extends State<EmergencyContactScreen> {
  late final Map<String, TextEditingController> _c;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final profile = context.read<AuthProvider>().profile;
    final ec = profile?.emergencyContact;
    // A contact saved as "Same as me" under the old screen has no fields of
    // its own, so start it from the customer's own details -- they can then
    // change it to someone else before saving.
    final fromSelf = (ec?.sameAsClient ?? false) && (ec?.firstName ?? '').trim().isEmpty;
    String seed(String? own, String? contact) => fromSelf ? (own ?? '') : (contact ?? '');
    _c = {
      'firstName': TextEditingController(text: seed(profile?.firstName, ec?.firstName)),
      'surname': TextEditingController(text: seed(profile?.surname, ec?.surname)),
      'phoneNumber': TextEditingController(text: seed(profile?.phoneNumber, ec?.phoneNumber)),
      'email': TextEditingController(text: seed(profile?.email, ec?.email)),
      'address1': TextEditingController(text: seed(profile?.address1, ec?.address1)),
      'address2': TextEditingController(text: seed(profile?.address2, ec?.address2)),
      'town': TextEditingController(text: seed(profile?.town, ec?.town)),
      'county': TextEditingController(text: seed(profile?.county, ec?.county)),
      'postcode': TextEditingController(text: seed(profile?.postcode, ec?.postcode)),
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
    // Mirror the backend's required fields for a full contact.
    for (final k in ['firstName', 'address1', 'town', 'postcode', 'phoneNumber']) {
      if (_c[k]!.text.trim().isEmpty) {
        setState(() => _error = 'Please fill in name, address, town, postcode and phone.');
        return;
      }
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final auth = context.read<AuthProvider>();
      final ec = <String, dynamic>{
        'sameAsClient': false,
        for (final e in _c.entries) e.key: e.value.text.trim(),
      };
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
    );
  }
}

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../state/auth_provider.dart';
import '../theme.dart';

class DetailsScreen extends StatefulWidget {
  const DetailsScreen({super.key});

  @override
  State<DetailsScreen> createState() => _DetailsScreenState();
}

class _DetailsScreenState extends State<DetailsScreen> {
  late final Map<String, TextEditingController> _c;
  bool _saving = false;
  String? _error;
  bool _saved = false;

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
      _saved = false;
    });
    try {
      final auth = context.read<AuthProvider>();
      final patch = {for (final e in _c.entries) e.key: e.value.text.trim()};
      await auth.repository.updateMe(patch);
      await auth.refreshProfile();
      if (mounted) setState(() => _saved = true);
    } catch (e) {
      setState(() => _error = e is ApiException ? e.message : 'Failed to save your details');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final p = auth.profile;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Signed in as', style: TextStyle(color: Colors.grey.shade600, fontSize: 12)),
                const SizedBox(height: 2),
                Text(p?.email ?? '', style: const TextStyle(fontWeight: FontWeight.w600)),
              ],
            ),
          ),
        ),
        const SizedBox(height: 8),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(_error!, style: const TextStyle(color: Color(0xFFC0392B))),
          ),
        _field('First name', 'firstName'),
        _field('Surname', 'surname'),
        _field('Phone number', 'phoneNumber', keyboard: TextInputType.phone),
        _field('Address line 1', 'address1'),
        _field('Address line 2', 'address2'),
        _field('Town', 'town'),
        _field('County', 'county'),
        _field('Postcode', 'postcode'),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: ElevatedButton(
                onPressed: _saving ? null : _save,
                child: Text(_saving ? 'Saving…' : 'Save changes'),
              ),
            ),
            if (_saved) ...[
              const SizedBox(width: 12),
              const Text('Saved.', style: TextStyle(color: brandGreenDark, fontWeight: FontWeight.w600)),
            ],
          ],
        ),
      ],
    );
  }

  Widget _field(String label, String key, {TextInputType? keyboard}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextField(
        controller: _c[key],
        keyboardType: keyboard,
        decoration: InputDecoration(labelText: label),
      ),
    );
  }
}

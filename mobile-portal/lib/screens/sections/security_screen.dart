import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../api/api_client.dart';
import '../../state/auth_provider.dart';
import 'section_scaffold.dart';

class SecurityScreen extends StatefulWidget {
  const SecurityScreen({super.key});

  @override
  State<SecurityScreen> createState() => _SecurityScreenState();
}

class _SecurityScreenState extends State<SecurityScreen> {
  final _alarm = TextEditingController();
  final _furtherInfo = TextEditingController();
  bool _keysProvided = false;
  bool _hasAlarm = false;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final s = context.read<AuthProvider>().profile?.security;
    _keysProvided = s?.keysProvided ?? false;
    _hasAlarm = s?.hasAlarmInstructions ?? false;
    _furtherInfo.text = s?.furtherInformation ?? '';
  }

  @override
  void dispose() {
    _alarm.dispose();
    _furtherInfo.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final auth = context.read<AuthProvider>();
      final security = <String, dynamic>{
        'keysProvided': _keysProvided,
        'furtherInformation': _furtherInfo.text.trim(),
      };
      // Only send alarm instructions when the user actually typed something —
      // the plaintext is never returned, so a blank field means "keep as is".
      if (_alarm.text.trim().isNotEmpty) {
        security['alarmInstructions'] = _alarm.text.trim();
      }
      await auth.repository.updateMe({'security': security});
      await auth.refreshProfile();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Security details saved.')));
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
      title: 'Security',
      saving: _saving,
      error: _error,
      onSave: _save,
      children: [
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Keys provided'),
          subtitle: const Text('Have you given us a key?'),
          value: _keysProvided,
          onChanged: (v) => setState(() => _keysProvided = v),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _alarm,
          maxLines: 3,
          decoration: InputDecoration(
            labelText: 'Alarm / key-safe code',
            hintText: _hasAlarm
                ? 'On file — leave blank to keep, or type to replace'
                : 'e.g. alarm code, key-safe location',
            helperText: 'Stored securely and never shown back to you.',
          ),
        ),
        const SizedBox(height: 12),
        sectionField('Further information', _furtherInfo, maxLines: 4),
      ],
    );
  }
}

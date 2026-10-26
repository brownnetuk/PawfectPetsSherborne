import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../api/api_client.dart';
import '../../state/auth_provider.dart';
import '../../theme.dart';

/// "Delete Account": deletes the signed-in person's app account (App Store
/// guideline 5.1.1(v)), optionally asking the business to erase their
/// personal data too.
class DeleteAccountScreen extends StatefulWidget {
  const DeleteAccountScreen({super.key});

  @override
  State<DeleteAccountScreen> createState() => _DeleteAccountScreenState();
}

class _DeleteAccountScreenState extends State<DeleteAccountScreen> {
  bool _eraseData = false;
  bool _deleting = false;
  String? _error;

  Future<void> _delete() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete your account?'),
        content: const Text('You will be signed out and will not be able to sign in again. This cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: brandPink),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() {
      _deleting = true;
      _error = null;
    });
    final auth = context.read<AuthProvider>();
    final navigator = Navigator.of(context);
    try {
      await auth.deleteAccount(eraseData: _eraseData);
      navigator.popUntil((route) => route.isFirst);
    } catch (e) {
      if (mounted) {
        setState(() {
          _deleting = false;
          _error = e is ApiException ? e.message : 'Failed to delete your account';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isAdditionalUser = context.watch<AuthProvider>().profile?.viewerId != null;
    return Scaffold(
      appBar: AppBar(title: const Text('Delete Account')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text(
            'Deleting your account removes your sign-in to the Pawfect Pets app, '
            'stops notifications to your devices and signs you out.',
          ),
          const SizedBox(height: 12),
          Text(
            isAdditionalUser
                ? 'The account holder and anyone else with access will keep theirs.'
                : 'Anyone you have given access to your account will lose access to the app too.',
          ),
          const SizedBox(height: 12),
          const Text(
            'Your bookings, invoices and pet records stay with Pawfect Pets so we can keep caring '
            'for your pets. Tick the box below if you would also like us to erase your personal data. '
            'We will then delete it, except anything the law requires us to keep (such as invoices).',
            style: TextStyle(color: brandMuted),
          ),
          const SizedBox(height: 8),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            title: const Text('Also ask Pawfect Pets to erase my personal data'),
            value: _eraseData,
            onChanged: _deleting ? null : (v) => setState(() => _eraseData = v ?? false),
          ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(_error!, style: const TextStyle(color: brandPink)),
          ],
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _deleting ? null : _delete,
            style: FilledButton.styleFrom(backgroundColor: brandPink),
            child: _deleting
                ? const SizedBox(
                    height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Text('Delete my account'),
          ),
        ],
      ),
    );
  }
}

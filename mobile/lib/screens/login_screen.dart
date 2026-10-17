import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../state/auth_provider.dart';
import 'scan_qr_screen.dart';
import '../theme.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _usernameController = TextEditingController();
  final _passwordController = TextEditingController();
  String? _error;
  bool _submitting = false;
  bool _remember = false;

  Future<void> _submit() async {
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await context.read<AuthProvider>().login(
            _usernameController.text.trim(),
            _passwordController.text,
            remember: _remember,
          );
    } catch (e) {
      setState(() => _error = e is ApiException ? e.message : 'Login failed');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _biometricLogin() async {
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await context.read<AuthProvider>().loginWithBiometrics();
    } catch (e) {
      setState(() => _error = e is ApiException ? e.message : 'Face ID sign-in failed');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _confirmReset() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Disconnect device?'),
        content: const Text(
          'This forgets the server connection and any saved login, and returns '
          'to the setup screen. You’ll need to scan the QR code again.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialogContext).pop(false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red.shade600),
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Disconnect'),
          ),
        ],
      ),
    );
    if (ok == true && mounted) await context.read<AuthProvider>().resetProvisioning();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        // No title on sign-in, so no blue header band -- just the action.
        backgroundColor: Colors.white,
        foregroundColor: brandMuted,
        systemOverlayStyle: SystemUiOverlayStyle.dark,
        shape: const RoundedRectangleBorder(),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Disconnect device',
            onPressed: _submitting ? null : _confirmReset,
          ),
        ],
      ),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 360),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Image.asset('assets/images/logo.png', height: 72),
                const SizedBox(height: 16),
                const Text(
                  'PAWFECT PETS · SHERBORNE',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 2, color: brandBlue),
                ),
                const SizedBox(height: 4),
                const Text.rich(
                  TextSpan(
                    text: 'Staff ',
                    children: [
                      TextSpan(
                        text: 'sign in',
                        style: TextStyle(
                          color: brandPink,
                          decoration: TextDecoration.underline,
                          decorationColor: brandYellow,
                          decorationThickness: 3,
                        ),
                      ),
                    ],
                  ),
                  style: TextStyle(fontFamily: displayFont, fontSize: 28, color: brandBlue),
                ),
                const SizedBox(height: 24),
                if (_error != null) ...[
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFDECEA),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: const Color(0xFFF3B4AC)),
                    ),
                    child: Text(_error!, style: const TextStyle(color: Color(0xFFC0392B))),
                  ),
                  const SizedBox(height: 16),
                ],
                TextField(
                  controller: _usernameController,
                  autocorrect: false,
                  textCapitalization: TextCapitalization.none,
                  autofillHints: const [AutofillHints.username],
                  decoration: const InputDecoration(labelText: 'Username'),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _passwordController,
                  obscureText: true,
                  autofillHints: const [AutofillHints.password],
                  onSubmitted: (_) => _submitting ? null : _submit(),
                  decoration: const InputDecoration(labelText: 'Password'),
                ),
                const SizedBox(height: 8),
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  controlAffinity: ListTileControlAffinity.leading,
                  value: _remember,
                  onChanged: _submitting ? null : (v) => setState(() => _remember = v ?? false),
                  title: const Text('Remember me (Face ID / Touch ID)'),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _submitting ? null : _submit,
                    child: Text(_submitting ? 'Signing in…' : 'Sign in'),
                  ),
                ),
                if (context.watch<AuthProvider>().hasRemembered) ...[
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: _submitting ? null : _biometricLogin,
                      icon: const Icon(Icons.face),
                      label: Text('Sign in as ${context.watch<AuthProvider>().rememberedUsername}'),
                    ),
                  ),
                ],
                const SizedBox(height: 8),
                Center(
                  child: TextButton.icon(
                    onPressed: _submitting
                        ? null
                        : () => Navigator.of(context).push(
                              MaterialPageRoute(builder: (_) => const ScanQrScreen()),
                            ),
                    icon: const Icon(Icons.qr_code_scanner, size: 18),
                    label: const Text('Scan QR code'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

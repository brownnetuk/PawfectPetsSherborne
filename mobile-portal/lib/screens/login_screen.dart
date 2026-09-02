import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../state/auth_provider.dart';
import '../theme.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _code = TextEditingController();
  final _newPassword = TextEditingController();
  final _confirm = TextEditingController();

  // First-time-login toggle: hides the password field and switches to the
  // email-me-a-code flow.
  bool _firstTime = false;
  // True once a code has been emailed and we're on the code + new-password step.
  bool _codeStep = false;
  // Whether the current code step is a password reset (vs first-time login) —
  // only affects the wording.
  bool _resetFlow = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _code.dispose();
    _newPassword.dispose();
    _confirm.dispose();
    super.dispose();
  }

  void _fail(Object e) => setState(() => _error = e is ApiException ? e.message : 'Something went wrong');

  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
    } catch (e) {
      _fail(e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _login() async {
    if (_email.text.trim().isEmpty || _password.text.isEmpty) {
      setState(() => _error = 'Enter your email and password.');
      return;
    }
    await _run(() => context.read<AuthProvider>().login(_email.text, _password.text));
  }

  Future<void> _sendCode({required bool reset}) async {
    if (_email.text.trim().isEmpty) {
      setState(() => _error = 'Enter your email address first.');
      return;
    }
    await _run(() async {
      final repo = context.read<Repository>();
      if (reset) {
        await repo.requestReset(_email.text);
      } else {
        await repo.requestCode(_email.text);
      }
      setState(() {
        _codeStep = true;
        _resetFlow = reset;
      });
    });
  }

  Future<void> _submitCode() async {
    if (_code.text.trim().length != 6) {
      setState(() => _error = 'Enter the 6-digit code from your email.');
      return;
    }
    if (_newPassword.text.length < 8) {
      setState(() => _error = 'Choose a password of at least 8 characters.');
      return;
    }
    if (_newPassword.text != _confirm.text) {
      setState(() => _error = 'The passwords don\'t match.');
      return;
    }
    await _run(() => context
        .read<AuthProvider>()
        .completeWithCode(_email.text, _code.text, _newPassword.text));
  }

  void _startOver() {
    setState(() {
      _codeStep = false;
      _code.clear();
      _newPassword.clear();
      _confirm.clear();
      _error = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Icon(Icons.pets, size: 56, color: brandGreen),
                  const SizedBox(height: 12),
                  Text(
                    'Pawfect Pets',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold),
                  ),
                  Text(
                    'Customer Portal',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.grey.shade600),
                  ),
                  const SizedBox(height: 28),
                  if (_error != null) ...[
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFDECEA),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(_error!, style: const TextStyle(color: Color(0xFFC0392B))),
                    ),
                    const SizedBox(height: 16),
                  ],
                  if (_codeStep) _codeStepFields() else _entryFields(),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _entryFields() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _email,
          keyboardType: TextInputType.emailAddress,
          autocorrect: false,
          textCapitalization: TextCapitalization.none,
          decoration: const InputDecoration(labelText: 'Email address'),
        ),
        const SizedBox(height: 14),
        // First-time login toggle.
        Row(
          children: [
            _Toggle(
              value: _firstTime,
              onChanged: (v) => setState(() {
                _firstTime = v;
                _error = null;
              }),
            ),
            const SizedBox(width: 10),
            const Expanded(child: Text('First time login')),
          ],
        ),
        const SizedBox(height: 14),
        if (!_firstTime) ...[
          TextField(
            controller: _password,
            obscureText: true,
            decoration: const InputDecoration(labelText: 'Password'),
            onSubmitted: (_) => _login(),
          ),
          const SizedBox(height: 20),
          ElevatedButton(
            onPressed: _busy ? null : _login,
            child: Text(_busy ? 'Signing in…' : 'Log in'),
          ),
          const SizedBox(height: 8),
          TextButton(
            onPressed: _busy ? null : () => _sendCode(reset: true),
            child: const Text('Forgot password?'),
          ),
        ] else ...[
          Text(
            'We\'ll email you a 6-digit code to set up your password.',
            style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
          ),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: _busy ? null : () => _sendCode(reset: false),
            child: Text(_busy ? 'Sending…' : 'Email me a code'),
          ),
        ],
      ],
    );
  }

  Widget _codeStepFields() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          _resetFlow
              ? 'Enter the reset code we emailed to ${_email.text.trim()} and choose a new password.'
              : 'Enter the code we emailed to ${_email.text.trim()} and choose a password.',
          style: TextStyle(color: Colors.grey.shade700, fontSize: 13),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _code,
          keyboardType: TextInputType.number,
          maxLength: 6,
          decoration: const InputDecoration(labelText: '6-digit code', counterText: ''),
        ),
        const SizedBox(height: 14),
        TextField(
          controller: _newPassword,
          obscureText: true,
          decoration: const InputDecoration(labelText: 'New password'),
        ),
        const SizedBox(height: 14),
        TextField(
          controller: _confirm,
          obscureText: true,
          decoration: const InputDecoration(labelText: 'Confirm password'),
          onSubmitted: (_) => _submitCode(),
        ),
        const SizedBox(height: 20),
        ElevatedButton(
          onPressed: _busy ? null : _submitCode,
          child: Text(_busy ? 'Saving…' : 'Set password & sign in'),
        ),
        const SizedBox(height: 8),
        TextButton(onPressed: _busy ? null : _startOver, child: const Text('Back')),
      ],
    );
  }
}

/// Small iOS-style sliding toggle.
class _Toggle extends StatelessWidget {
  final bool value;
  final ValueChanged<bool> onChanged;
  const _Toggle({required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => onChanged(!value),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        width: 44,
        height: 26,
        padding: const EdgeInsets.all(3),
        decoration: BoxDecoration(
          color: value ? brandGreen : Colors.grey.shade400,
          borderRadius: BorderRadius.circular(999),
        ),
        child: AnimatedAlign(
          duration: const Duration(milliseconds: 150),
          alignment: value ? Alignment.centerRight : Alignment.centerLeft,
          child: Container(
            width: 20,
            height: 20,
            decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
          ),
        ),
      ),
    );
  }
}

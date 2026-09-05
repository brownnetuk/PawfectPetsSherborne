import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:local_auth/local_auth.dart';
import 'package:package_info_plus/package_info_plus.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/portal_models.dart';

const _tokenKey = 'pawfectpets_portal_token';
// The app version the stored session was created under. The session is kept
// across launches (remember-me is always on) EXCEPT across an app update, when
// we force a fresh login — so this is compared on every launch.
const _versionKey = 'pawfectpets_portal_version';
// Saved login for biometric sign-in (opt-in). Kept separately from the session
// token so it survives logout and lets Face ID / Touch ID re-authenticate.
const _emailKey = 'pawfectpets_portal_saved_email';
const _passwordKey = 'pawfectpets_portal_saved_password';

class AuthProvider extends ChangeNotifier {
  final ApiClient client;
  final Repository repository;
  final _storage = const FlutterSecureStorage();

  Profile? profile;
  bool loading = true;
  // The email of a saved login (shown on the biometric button); the password is
  // only ever read from the keychain during a biometric sign-in.
  String? savedEmail;

  bool get loggedIn => profile != null;
  bool get hasSavedLogin => savedEmail != null && savedEmail!.isNotEmpty;

  AuthProvider(this.client, this.repository) {
    client.setUnauthorizedHandler(() {
      profile = null;
      client.setToken(null);
      _storage.delete(key: _tokenKey);
      notifyListeners();
    });
    _init();
  }

  Future<String> _currentVersion() async {
    final info = await PackageInfo.fromPlatform();
    return '${info.version}+${info.buildNumber}';
  }

  Future<void> _init() async {
    // A saved login (for biometrics) is independent of the session token.
    savedEmail = await _storage.read(key: _emailKey);
    final token = await _storage.read(key: _tokenKey);
    if (token == null) {
      loading = false;
      notifyListeners();
      return;
    }
    // Force re-login when the app has been updated since the session was made.
    final storedVersion = await _storage.read(key: _versionKey);
    final version = await _currentVersion();
    if (storedVersion != version) {
      await _storage.delete(key: _tokenKey);
      loading = false;
      notifyListeners();
      return;
    }
    client.setToken(token);
    try {
      profile = await repository.me();
    } catch (_) {
      await _storage.delete(key: _tokenKey);
      client.setToken(null);
    }
    loading = false;
    notifyListeners();
  }

  Future<void> _persistSession(String token) async {
    await _storage.write(key: _tokenKey, value: token);
    await _storage.write(key: _versionKey, value: await _currentVersion());
    client.setToken(token);
    profile = await repository.me();
    notifyListeners();
  }

  Future<void> login(String email, String password, {bool saveCredentials = false}) async {
    final trimmed = email.trim();
    final token = await repository.login(trimmed, password);
    if (saveCredentials) {
      await _saveCredentials(trimmed, password);
    } else {
      await forgetSavedLogin();
    }
    await _persistSession(token);
  }

  /// First-time / reset completion: sets the password and logs in with the
  /// token the server returns. Also saves the login so biometrics can be used
  /// next time (they just set this password, so it's the current one).
  Future<void> completeWithCode(String email, String code, String password) async {
    final trimmed = email.trim();
    final token = await repository.setPassword(trimmed, code.trim(), password);
    await _saveCredentials(trimmed, password);
    await _persistSession(token);
  }

  Future<void> _saveCredentials(String email, String password) async {
    await _storage.write(key: _emailKey, value: email);
    await _storage.write(key: _passwordKey, value: password);
    savedEmail = email;
  }

  /// Forget the saved biometric login (e.g. "use a different account").
  Future<void> forgetSavedLogin() async {
    await _storage.delete(key: _emailKey);
    await _storage.delete(key: _passwordKey);
    savedEmail = null;
    notifyListeners();
  }

  /// Prompts Face ID / Touch ID, then signs in with the saved credentials.
  Future<void> loginWithBiometrics() async {
    final email = await _storage.read(key: _emailKey);
    final password = await _storage.read(key: _passwordKey);
    if (email == null || password == null) {
      throw ApiException('No saved login found.');
    }
    final ok = await LocalAuthentication().authenticate(
      localizedReason: 'Sign in to Pawfect Pets',
    );
    if (!ok) throw ApiException('Authentication cancelled.');
    await login(email, password, saveCredentials: true);
  }

  Future<void> refreshProfile() async {
    profile = await repository.me();
    notifyListeners();
  }

  Future<void> logout() async {
    // Keep the saved biometric login so Face ID stays available after logout.
    await _storage.delete(key: _tokenKey);
    client.setToken(null);
    profile = null;
    notifyListeners();
  }
}

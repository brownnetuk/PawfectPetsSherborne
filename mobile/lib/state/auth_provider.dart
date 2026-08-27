import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:local_auth/local_auth.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/staff.dart';

const _tokenKey = 'pawfectpets_staff_token';
const _baseUrlKey = 'pawfectpets_api_base_url';
const _rememberEmailKey = 'pawfectpets_remember_email';
const _rememberPasswordKey = 'pawfectpets_remember_password';

class AuthProvider extends ChangeNotifier {
  final ApiClient client;
  final Repository repository;
  final _storage = const FlutterSecureStorage();

  Staff? staff;
  bool loading = true;
  // True until the app has been provisioned with a backend URL via the
  // first-launch QR scan.
  bool needsProvisioning = false;
  // The saved email for a remembered login (shown on the Face ID button);
  // the password is only ever read from the keychain during a biometric login.
  String? rememberedEmail;

  bool get hasRemembered => rememberedEmail != null;

  AuthProvider(this.client, this.repository) {
    client.setUnauthorizedHandler(() {
      staff = null;
      client.setToken(null);
      _storage.delete(key: _tokenKey);
      notifyListeners();
    });
    _init();
  }

  Future<void> _init() async {
    final baseUrl = await _storage.read(key: _baseUrlKey);
    if (baseUrl == null || baseUrl.isEmpty) {
      needsProvisioning = true;
      loading = false;
      notifyListeners();
      return;
    }
    client.setBaseUrl(baseUrl);
    rememberedEmail = await _storage.read(key: _rememberEmailKey);
    await _restoreSession();
  }

  /// Stores the backend URL scanned from the admin app's QR code and moves on
  /// to the login screen. Scanned once, on first launch.
  Future<void> provision(String url) async {
    final cleaned = url.trim().replaceAll(RegExp(r'/+$'), '');
    await _storage.write(key: _baseUrlKey, value: cleaned);
    client.setBaseUrl(cleaned);
    needsProvisioning = false;
    loading = true;
    notifyListeners();
    rememberedEmail = await _storage.read(key: _rememberEmailKey);
    await _restoreSession();
  }

  Future<void> _restoreSession() async {
    final token = await _storage.read(key: _tokenKey);
    if (token == null) {
      loading = false;
      notifyListeners();
      return;
    }
    client.setToken(token);
    try {
      staff = await repository.me();
    } catch (_) {
      await _storage.delete(key: _tokenKey);
      client.setToken(null);
    }
    loading = false;
    notifyListeners();
  }

  Future<void> login(String email, String password, {bool remember = false}) async {
    final result = await repository.login(email, password);
    await _storage.write(key: _tokenKey, value: result.token);
    client.setToken(result.token);
    if (remember) {
      await _storage.write(key: _rememberEmailKey, value: email);
      await _storage.write(key: _rememberPasswordKey, value: password);
      rememberedEmail = email;
    } else {
      await _clearRemembered();
    }
    staff = result.staff;
    notifyListeners();
  }

  /// Prompts Face ID / Touch ID, then signs in with the saved credentials.
  Future<void> loginWithBiometrics() async {
    final email = await _storage.read(key: _rememberEmailKey);
    final password = await _storage.read(key: _rememberPasswordKey);
    if (email == null || password == null) {
      throw ApiException('No saved login found.');
    }
    final ok = await LocalAuthentication().authenticate(
      localizedReason: 'Sign in to PawfectPets Staff',
    );
    if (!ok) throw ApiException('Authentication cancelled.');
    await login(email, password, remember: true);
  }

  Future<void> _clearRemembered() async {
    await _storage.delete(key: _rememberEmailKey);
    await _storage.delete(key: _rememberPasswordKey);
    rememberedEmail = null;
  }

  Future<void> logout() async {
    await _storage.delete(key: _tokenKey);
    await _clearRemembered();
    client.setToken(null);
    staff = null;
    notifyListeners();
  }
}

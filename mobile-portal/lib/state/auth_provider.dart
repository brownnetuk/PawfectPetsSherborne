import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:package_info_plus/package_info_plus.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/portal_models.dart';

const _tokenKey = 'pawfectpets_portal_token';
// The app version the stored session was created under. The session is kept
// across launches (remember-me is always on) EXCEPT across an app update, when
// we force a fresh login — so this is compared on every launch.
const _versionKey = 'pawfectpets_portal_version';

class AuthProvider extends ChangeNotifier {
  final ApiClient client;
  final Repository repository;
  final _storage = const FlutterSecureStorage();

  Profile? profile;
  bool loading = true;

  bool get loggedIn => profile != null;

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

  Future<void> login(String email, String password) async {
    final token = await repository.login(email.trim(), password);
    await _persistSession(token);
  }

  /// First-time / reset completion: sets the password and logs in with the
  /// token the server returns.
  Future<void> completeWithCode(String email, String code, String password) async {
    final token = await repository.setPassword(email.trim(), code.trim(), password);
    await _persistSession(token);
  }

  Future<void> refreshProfile() async {
    profile = await repository.me();
    notifyListeners();
  }

  Future<void> logout() async {
    await _storage.delete(key: _tokenKey);
    client.setToken(null);
    profile = null;
    notifyListeners();
  }
}

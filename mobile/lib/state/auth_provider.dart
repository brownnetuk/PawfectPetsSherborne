import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/staff.dart';

const _tokenKey = 'pawfectpets_staff_token';

class AuthProvider extends ChangeNotifier {
  final ApiClient client;
  final Repository repository;
  final _storage = const FlutterSecureStorage();

  Staff? staff;
  bool loading = true;

  AuthProvider(this.client, this.repository) {
    client.setUnauthorizedHandler(() {
      staff = null;
      client.setToken(null);
      _storage.delete(key: _tokenKey);
      notifyListeners();
    });
    _restoreSession();
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

  Future<void> login(String email, String password) async {
    final result = await repository.login(email, password);
    await _storage.write(key: _tokenKey, value: result.token);
    client.setToken(result.token);
    staff = result.staff;
    notifyListeners();
  }

  Future<void> logout() async {
    await _storage.delete(key: _tokenKey);
    client.setToken(null);
    staff = null;
    notifyListeners();
  }
}

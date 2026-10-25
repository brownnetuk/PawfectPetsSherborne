import 'dart:convert';
import 'dart:typed_data';
import 'package:http/http.dart' as http;
import '../config.dart';

class ApiException implements Exception {
  final String message;
  final int? statusCode;
  /// Machine-readable reason the server gave, when it gave one (e.g.
  /// `PHONE_DIGITS_REQUIRED` from set-password for an additional user).
  final String? code;
  ApiException(this.message, {this.statusCode, this.code});

  @override
  String toString() => message;
}

/// Thin REST client for the customer portal: attaches the customer bearer
/// token, decodes JSON, and surfaces server error messages. Call
/// [setUnauthorizedHandler] once at startup so a 401 on a signed-in request
/// bounces the app back to the login screen. The sign-in endpoints themselves
/// are exempt: their 401 means "wrong email or password" (or a bad code), so
/// the server's own message is shown instead of "Session expired".
class ApiClient {
  String? _token;
  void Function()? _onUnauthorized;
  final String _baseUrl = apiBaseUrl;

  // Endpoints a customer calls while NOT signed in. A 401 from these is the
  // server rejecting the credentials, not an expired session.
  static const _signInPaths = {
    '/portal/login',
    '/portal/request-code',
    '/portal/request-reset',
    '/portal/verify-code',
    '/portal/set-password',
  };

  void setToken(String? token) => _token = token;
  void setUnauthorizedHandler(void Function() handler) => _onUnauthorized = handler;

  Uri _uri(String path, [Map<String, String>? query]) =>
      Uri.parse('$_baseUrl$path').replace(queryParameters: query);

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (_token != null) 'Authorization': 'Bearer $_token',
      };

  Future<T> _handle<T>(
    Future<http.Response> Function() send,
    T Function(dynamic) parse, {
    Duration timeout = const Duration(seconds: 20),
    // False for the sign-in endpoints, whose 401 carries the real reason.
    bool sessionBound = true,
  }) async {
    late http.Response res;
    try {
      res = await send().timeout(timeout);
    } catch (e) {
      throw ApiException('Could not reach the server. Check your connection and try again.');
    }

    if (res.statusCode == 401 && sessionBound) {
      _onUnauthorized?.call();
      throw ApiException('Session expired. Please log in again.', statusCode: 401);
    }
    if (res.statusCode < 200 || res.statusCode >= 300) {
      String message = 'Request failed (${res.statusCode})';
      String? code;
      try {
        final body = jsonDecode(res.body);
        final m = body['message'];
        message = m is List ? m.join('; ') : (m?.toString() ?? message);
        code = body['code']?.toString();
      } catch (_) {}
      throw ApiException(message, statusCode: res.statusCode, code: code);
    }
    if (res.body.isEmpty) return parse(null);
    return parse(jsonDecode(res.body));
  }

  Future<Map<String, dynamic>> get(String path, {Map<String, String>? query}) => _handle(
        () => http.get(_uri(path, query), headers: _headers),
        (json) => json as Map<String, dynamic>,
      );

  Future<List<dynamic>> getList(String path, {Map<String, String>? query}) => _handle(
        () => http.get(_uri(path, query), headers: _headers),
        (json) => json as List<dynamic>,
      );

  Future<Map<String, dynamic>> post(String path, [Map<String, dynamic>? body]) => _handle(
        () => http.post(_uri(path), headers: _headers, body: jsonEncode(body ?? {})),
        (json) => json as Map<String, dynamic>,
        timeout: const Duration(seconds: 60),
        sessionBound: !_signInPaths.contains(path),
      );

  Future<Map<String, dynamic>> patch(String path, Map<String, dynamic> body) => _handle(
        () => http.patch(_uri(path), headers: _headers, body: jsonEncode(body)),
        (json) => json as Map<String, dynamic>,
        timeout: const Duration(seconds: 60),
      );

  Future<void> delete(String path) => _handle<void>(
        () => http.delete(_uri(path), headers: _headers),
        (_) {},
      );

  /// Fetches raw bytes (e.g. an invoice PDF) rather than JSON, applying the
  /// same auth header and error handling as [_handle].
  Future<Uint8List> getBytes(String path, {Map<String, String>? query}) async {
    late http.Response res;
    try {
      res = await http.get(_uri(path, query), headers: _headers).timeout(const Duration(seconds: 30));
    } catch (e) {
      throw ApiException('Could not reach the server. Check your connection and try again.');
    }
    if (res.statusCode == 401) {
      _onUnauthorized?.call();
      throw ApiException('Session expired. Please log in again.', statusCode: 401);
    }
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw ApiException('Request failed (${res.statusCode})', statusCode: res.statusCode);
    }
    return res.bodyBytes;
  }
}

import 'dart:convert';
import 'dart:typed_data';
import 'package:http/http.dart' as http;
import '../config.dart';

class ApiException implements Exception {
  final String message;
  final int? statusCode;
  ApiException(this.message, {this.statusCode});

  @override
  String toString() => message;
}

/// Thin REST client for the customer portal: attaches the customer bearer
/// token, decodes JSON, and surfaces server error messages. Call
/// [setUnauthorizedHandler] once at startup so a 401 anywhere bounces the app
/// back to the login screen.
class ApiClient {
  String? _token;
  void Function()? _onUnauthorized;
  final String _baseUrl = apiBaseUrl;

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
  }) async {
    late http.Response res;
    try {
      res = await send().timeout(timeout);
    } catch (e) {
      throw ApiException('Could not reach the server. Check your connection and try again.');
    }

    if (res.statusCode == 401) {
      _onUnauthorized?.call();
      throw ApiException('Session expired. Please log in again.', statusCode: 401);
    }
    if (res.statusCode < 200 || res.statusCode >= 300) {
      String message = 'Request failed (${res.statusCode})';
      try {
        final body = jsonDecode(res.body);
        final m = body['message'];
        message = m is List ? m.join('; ') : (m?.toString() ?? message);
      } catch (_) {}
      throw ApiException(message, statusCode: res.statusCode);
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
      );

  Future<Map<String, dynamic>> patch(String path, Map<String, dynamic> body) => _handle(
        () => http.patch(_uri(path), headers: _headers, body: jsonEncode(body)),
        (json) => json as Map<String, dynamic>,
        timeout: const Duration(seconds: 60),
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

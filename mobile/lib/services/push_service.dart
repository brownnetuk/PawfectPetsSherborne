import 'package:flutter/services.dart';
import '../api/repository.dart';

/// Bridges the native APNs registration (see ios/Runner/AppDelegate.swift) to
/// the backend: [start] asks iOS to request notification permission and
/// register; when the device token arrives it's posted to `/push/register` so
/// the server can send appointment reminders.
class PushService {
  static const _channel = MethodChannel('pawfectpets/push');
  final Repository _repository;
  bool _started = false;

  PushService(this._repository) {
    _channel.setMethodCallHandler(_handle);
  }

  /// Kick off permission request + APNs registration. Safe to call more than
  /// once (e.g. on each app resume after login); native only prompts once.
  Future<void> start() async {
    if (_started) return;
    _started = true;
    try {
      await _channel.invokeMethod('start');
    } catch (_) {
      // No native handler (e.g. a non-iOS platform) — nothing to do.
    }
  }

  Future<dynamic> _handle(MethodCall call) async {
    if (call.method == 'onToken') {
      final token = call.arguments as String?;
      if (token != null && token.isNotEmpty) {
        try {
          await _repository.registerPushToken(token);
        } catch (_) {
          // Not logged in yet or offline — the token is re-sent on the next
          // start()/token callback.
        }
      }
    }
    return null;
  }
}

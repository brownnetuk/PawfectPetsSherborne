import 'package:flutter/services.dart';
import '../api/repository.dart';

/// Bridges native APNs registration (ios/Runner/AppDelegate.swift) to the
/// backend: [start] asks iOS to request notification permission and register;
/// when the device token arrives it's posted to `/portal/push/register` so the
/// server can push this customer about new invoices/quotes.
class PushService {
  static const _channel = MethodChannel('pawfectpets/push');
  final Repository _repository;
  bool _started = false;

  PushService(this._repository) {
    _channel.setMethodCallHandler(_handle);
  }

  /// Kick off permission request + APNs registration. Safe to call more than
  /// once; native only prompts once.
  Future<void> start() async {
    if (_started) return;
    _started = true;
    try {
      await _channel.invokeMethod('start');
    } catch (_) {
      // No native handler (non-iOS) — nothing to do.
    }
  }

  Future<dynamic> _handle(MethodCall call) async {
    if (call.method == 'onToken') {
      final token = call.arguments as String?;
      if (token != null && token.isNotEmpty) {
        try {
          await _repository.registerPushToken(token);
        } catch (_) {
          // Not logged in yet or offline — re-sent on the next start()/token.
        }
      }
    }
    return null;
  }
}

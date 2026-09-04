import 'package:flutter/foundation.dart';
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

  /// The last tapped notification's payload (type/reference/title/body). The
  /// HomeShell listens to this and routes: a 'message' tap opens the Messages
  /// tab; anything else shows the notification in a modal. Set back to null
  /// once handled.
  final ValueNotifier<Map<String, dynamic>?> tappedNotification = ValueNotifier(null);

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
    } else if (call.method == 'onNotificationTap') {
      final args = call.arguments;
      if (args is Map) {
        tappedNotification.value = args.map((k, v) => MapEntry(k.toString(), v));
      }
    }
    return null;
  }
}

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import '../api/repository.dart';
import 'notification_store.dart';

/// Bridges native APNs registration (ios/Runner/AppDelegate.swift) to the
/// backend: [start] asks iOS to request notification permission and register;
/// when the device token arrives it's posted to `/portal/push/register` so the
/// server can push this customer about new invoices/quotes/messages.
///
/// Also captures notifications the device receives (foreground) or the user
/// taps into the on-device [NotificationStore] so they can be revisited in the
/// bell with a timestamp.
class PushService {
  static const _channel = MethodChannel('pawfectpets/push');
  final Repository _repository;
  final NotificationStore _store;
  bool _started = false;

  /// The last tapped notification's payload (type/reference/title/body). The
  /// HomeShell listens to this and routes: a 'message' tap opens the Messages
  /// tab; anything else shows the notification in a modal. Set back to null
  /// once handled.
  final ValueNotifier<Map<String, dynamic>?> tappedNotification = ValueNotifier(null);

  /// Bumped whenever a notification is captured, so the bell badge can refresh.
  final ValueNotifier<int> inbound = ValueNotifier(0);

  PushService(this._repository, this._store) {
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
    } else if (call.method == 'onNotificationReceived') {
      await _capture(call.arguments);
    } else if (call.method == 'onNotificationTap') {
      final data = await _capture(call.arguments);
      if (data != null) tappedNotification.value = data;
    }
    return null;
  }

  // Persists a received/tapped notification to the on-device store (timestamped
  // now), and returns the normalised payload.
  Future<Map<String, dynamic>?> _capture(dynamic args) async {
    if (args is! Map) return null;
    final data = args.map((k, v) => MapEntry(k.toString(), v));
    final title = data['title']?.toString() ?? 'Notification';
    final body = data['body']?.toString() ?? '';
    final pushMessageId = data['pushMessageId']?.toString();
    // Prefer stable ids so the same push isn't stored twice (foreground receipt
    // + later tap): the server notification id, else the push-message id.
    final id = (data['notificationId']?.toString().isNotEmpty ?? false)
        ? data['notificationId'].toString()
        : (pushMessageId?.isNotEmpty ?? false)
            ? pushMessageId!
            : DateTime.now().microsecondsSinceEpoch.toString();
    final ackRaw = data['ackRequired'];
    final ackRequired = ackRaw == true || ackRaw?.toString() == 'true';
    await _store.add(LocalNotification(
      id: id,
      title: title,
      body: body,
      type: data['type']?.toString(),
      reference: data['reference']?.toString(),
      timestamp: DateTime.now(),
      pushMessageId: pushMessageId,
      ackRequired: ackRequired,
    ));
    inbound.value++;
    return data;
  }
}

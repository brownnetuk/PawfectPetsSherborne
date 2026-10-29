import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import '../api/repository.dart';
import '../models/notification_item.dart';

/// Bridges the native APNs registration (see ios/Runner/AppDelegate.swift) to
/// the backend: [start] asks iOS to request notification permission and
/// register; when the device token arrives it's posted to `/push/register` so
/// the server can send staff notifications (appointment reminders, completed
/// pre-check-in forms, ...).
///
/// Also owns the app icon badge (the red count on the icon): it mirrors the
/// feed's unread count, which the server also sends with each push, and is
/// re-synced whenever notifications are read or the app comes to the front.
///
/// Tapping a push hands its payload here: the feed item is marked read and
/// [onNotificationTap] is told where it leads (a [NotificationLink], or null
/// for one with nowhere to go, which opens the notifications list).
class PushService {
  static const _channel = MethodChannel('pawfectpets/push');
  final Repository _repository;
  bool _started = false;

  /// Unread notifications, for the bell's red dot inside the app.
  final ValueNotifier<int> unreadCount = ValueNotifier(0);

  /// Called when staff tap a push notification (or a row in the notifications
  /// list) with where it leads. Set by the home shell once it's on screen,
  /// which routes it to the right tab and screen.
  void Function(NotificationLink? link)? onNotificationTap;
  // A tap that arrived before the home shell was ready to route it.
  bool _pendingOpen = false;
  NotificationLink? _pendingLink;

  PushService(this._repository) {
    _channel.setMethodCallHandler(_handle);
  }

  /// Kick off permission request + APNs registration. Safe to call more than
  /// once (e.g. on each app resume after login); native only prompts once.
  Future<void> start() async {
    if (!_started) {
      _started = true;
      try {
        await _channel.invokeMethod('start');
        // A tap that launched the app from cold arrives before this Dart
        // handler is listening, so native holds it until we ask.
        final tapped = await _channel.invokeMethod<dynamic>('takeLaunchTap');
        if (tapped != null) await _onTap(tapped);
      } catch (_) {
        // No native handler (e.g. a non-iOS platform) — nothing to do.
      }
    }
    await refreshBadge();
  }

  /// Re-reads the unread count from the server and sets the icon badge to it.
  Future<void> refreshBadge() async {
    try {
      final count = await _repository.getUnreadNotificationCount();
      unreadCount.value = count;
      await _setBadge(count);
    } catch (_) {
      // Offline or logged out — keep whatever badge iOS last showed.
    }
  }

  Future<void> markRead(String id) async {
    try {
      await _repository.markNotificationRead(id);
    } catch (_) {}
    await refreshBadge();
  }

  Future<void> markAllRead() async {
    try {
      await _repository.markAllNotificationsRead();
    } catch (_) {}
    await refreshBadge();
  }

  /// Clears the icon badge on this device only (e.g. on log out).
  Future<void> clearBadge() async {
    unreadCount.value = 0;
    await _setBadge(0);
  }

  /// Opens what a notification links to (used by the notifications list's
  /// rows); a no-op until the home shell has registered its router.
  void openLink(NotificationLink link) => _deliver(link);

  /// Routes a tap that arrived before the home shell was ready to handle it.
  void consumePendingOpen() {
    if (_pendingOpen && onNotificationTap != null) {
      _pendingOpen = false;
      final link = _pendingLink;
      _pendingLink = null;
      onNotificationTap!(link);
    }
  }

  Future<void> _setBadge(int count) async {
    try {
      await _channel.invokeMethod('setBadge', count);
    } catch (_) {}
  }

  void _deliver(NotificationLink? link) {
    if (onNotificationTap != null) {
      onNotificationTap!(link);
    } else {
      _pendingOpen = true;
      _pendingLink = link;
    }
  }

  /// The payload is the push's custom keys (notificationId, type, linkKind,
  /// linkId) as a map; older native code sent just the feed id as a string.
  Future<void> _onTap(dynamic payload) async {
    String notificationId = '';
    NotificationLink? link;
    if (payload is Map) {
      notificationId = payload['notificationId']?.toString() ?? '';
      link = NotificationLink.fromParts(payload['linkKind'], payload['linkId']);
    } else if (payload is String) {
      notificationId = payload;
    }
    if (notificationId.isNotEmpty) await markRead(notificationId);
    _deliver(link);
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
    } else if (call.method == 'onNotificationTap') {
      await _onTap(call.arguments);
    }
    return null;
  }
}

import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../api/repository.dart';
import '../models/portal_models.dart';

/// A notification as shown in the bell — from either the on-device capture
/// (pushes received/tapped while installed) or the server feed.
class LocalNotification {
  final String id;
  final String title;
  final String body;
  final String? type;
  final String? reference;
  final DateTime timestamp;

  LocalNotification({
    required this.id,
    required this.title,
    required this.body,
    this.type,
    this.reference,
    required this.timestamp,
  });

  bool get isMessage => type == 'message';

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'body': body,
        'type': type,
        'reference': reference,
        'timestamp': timestamp.toIso8601String(),
      };

  factory LocalNotification.fromJson(Map<String, dynamic> j) => LocalNotification(
        id: j['id'] as String,
        title: j['title'] as String? ?? '',
        body: j['body'] as String? ?? '',
        type: j['type'] as String?,
        reference: j['reference'] as String?,
        timestamp: DateTime.parse(j['timestamp'] as String),
      );

  factory LocalNotification.fromServer(PortalNotification n) => LocalNotification(
        id: n.id,
        title: n.title,
        body: n.body,
        type: n.type,
        reference: n.reference,
        timestamp: n.createdAt,
      );
}

/// Persists notifications captured on-device (from push receipt/tap) so they
/// can be revisited even if the app never reached the server, plus a
/// "last read" marker used to compute the unread badge.
class NotificationStore {
  final _storage = const FlutterSecureStorage();
  static const _key = 'portal_local_notifications';
  static const _readKey = 'portal_notifications_read_at';
  static const _max = 100;

  Future<List<LocalNotification>> all() async {
    final raw = await _storage.read(key: _key);
    if (raw == null || raw.isEmpty) return [];
    try {
      final list = jsonDecode(raw) as List<dynamic>;
      return list.map((e) => LocalNotification.fromJson(e as Map<String, dynamic>)).toList();
    } catch (_) {
      return [];
    }
  }

  /// Adds a captured notification (newest first), deduped by id, capped.
  Future<void> add(LocalNotification n) async {
    final items = await all();
    if (items.any((x) => x.id == n.id)) return;
    items.insert(0, n);
    final capped = items.take(_max).toList();
    await _storage.write(key: _key, value: jsonEncode(capped.map((e) => e.toJson()).toList()));
  }

  Future<DateTime?> lastReadAt() async {
    final raw = await _storage.read(key: _readKey);
    return raw == null ? null : DateTime.tryParse(raw);
  }

  Future<void> markRead() async {
    await _storage.write(key: _readKey, value: DateTime.now().toIso8601String());
  }
}

/// Composes the on-device store with the server feed for the bell: merges both
/// (deduped by id, newest first) and derives the unread count from the
/// last-read marker so a single tap on the bell clears it.
class NotificationsCenter {
  final Repository repo;
  final NotificationStore store;
  NotificationsCenter(this.repo, this.store);

  Future<List<LocalNotification>> load() async {
    final byId = <String, LocalNotification>{};
    // Local first (always available, even offline)...
    for (final n in await store.all()) {
      byId[n.id] = n;
    }
    // ...then merge the server feed (background pushes never opened locally).
    try {
      for (final n in await repo.listNotifications()) {
        byId.putIfAbsent(n.id, () => LocalNotification.fromServer(n));
      }
    } catch (_) {
      // Offline or server unavailable — local list still shows.
    }
    final items = byId.values.toList()
      ..sort((a, b) => b.timestamp.compareTo(a.timestamp));
    return items;
  }

  Future<int> unreadCount() async {
    final items = await load();
    final readAt = await store.lastReadAt();
    if (readAt == null) return items.length;
    return items.where((n) => n.timestamp.isAfter(readAt)).length;
  }

  Future<void> markRead() => store.markRead();
}

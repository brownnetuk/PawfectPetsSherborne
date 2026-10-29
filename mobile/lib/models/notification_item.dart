/// Where a notification leads when tapped: a screen (`kind`) and a record id
/// (or, for `invoices`, a list filter such as `overdue`). Built from the push
/// payload's `linkKind` / `linkId` or the feed item's fields. The HomeShell
/// turns it into a tab switch plus a pushed screen.
class NotificationLink {
  final String kind;
  final String id;
  const NotificationLink({required this.kind, required this.id});

  /// Null unless both parts are present and non-empty.
  static NotificationLink? fromParts(Object? kind, Object? id) {
    final k = kind?.toString() ?? '';
    final i = id?.toString() ?? '';
    if (k.isEmpty || i.isEmpty) return null;
    return NotificationLink(kind: k, id: i);
  }

  @override
  String toString() => '$kind:$id';
}

/// One entry in the staff notification feed (the same feed as the admin
/// app's bell). `read` is shared across staff: reading it anywhere clears it
/// for everyone, and the app icon badge is the count of unread entries.
class NotificationItem {
  final String id;
  final String title;
  final String body;
  final String? type;
  final bool read;
  final DateTime createdAt;

  /// What the notification is about, when the server knew (see
  /// [NotificationLink]); null for ones with nowhere to go.
  final NotificationLink? link;

  NotificationItem({
    required this.id,
    required this.title,
    required this.body,
    this.type,
    required this.read,
    required this.createdAt,
    this.link,
  });

  factory NotificationItem.fromJson(Map<String, dynamic> json) => NotificationItem(
        id: json['_id'] as String,
        title: json['title'] as String? ?? '',
        body: json['body'] as String? ?? '',
        type: json['type'] as String?,
        read: json['read'] as bool? ?? false,
        createdAt: DateTime.parse(json['createdAt'] as String).toLocal(),
        link: NotificationLink.fromParts(json['linkKind'], json['linkId']),
      );
}

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

  NotificationItem({
    required this.id,
    required this.title,
    required this.body,
    this.type,
    required this.read,
    required this.createdAt,
  });

  factory NotificationItem.fromJson(Map<String, dynamic> json) => NotificationItem(
        id: json['_id'] as String,
        title: json['title'] as String? ?? '',
        body: json['body'] as String? ?? '',
        type: json['type'] as String?,
        read: json['read'] as bool? ?? false,
        createdAt: DateTime.parse(json['createdAt'] as String).toLocal(),
      );
}

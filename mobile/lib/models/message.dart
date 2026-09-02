/// One message in a staff <-> customer conversation.
class Message {
  final String id;
  final String sender; // 'staff' | 'customer'
  final String? senderName;
  final String body;
  final DateTime createdAt;

  Message({
    required this.id,
    required this.sender,
    this.senderName,
    required this.body,
    required this.createdAt,
  });

  bool get fromStaff => sender == 'staff';

  factory Message.fromJson(Map<String, dynamic> json) => Message(
        id: json['_id'] as String,
        sender: json['sender'] as String? ?? 'staff',
        senderName: json['senderName'] as String?,
        body: json['body'] as String? ?? '',
        createdAt: DateTime.parse(json['createdAt'] as String).toLocal(),
      );
}

/// A conversation summary for the staff conversation list.
class Conversation {
  final String customerId;
  final String name;
  final String email;
  final String lastBody;
  final DateTime lastAt;
  final String lastSender; // 'staff' | 'customer'
  final int unread;

  Conversation({
    required this.customerId,
    required this.name,
    required this.email,
    required this.lastBody,
    required this.lastAt,
    required this.lastSender,
    required this.unread,
  });

  factory Conversation.fromJson(Map<String, dynamic> json) => Conversation(
        customerId: json['customerId'] as String,
        name: json['name'] as String? ?? '',
        email: json['email'] as String? ?? '',
        lastBody: json['lastBody'] as String? ?? '',
        lastAt: DateTime.parse(json['lastAt'] as String).toLocal(),
        lastSender: json['lastSender'] as String? ?? 'staff',
        unread: (json['unread'] as num?)?.toInt() ?? 0,
      );
}

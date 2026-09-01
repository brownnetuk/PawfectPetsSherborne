/// Global push-notification settings (Settings > Notifications), mirroring the
/// backend NotificationSettings singleton.
class NotificationSettings {
  final bool customerActivated;
  final bool appointmentReminders;
  final int appointmentLeadMinutes;
  final bool dailyDigest;
  final String dailyDigestTime; // 'HH:mm'
  final bool invoicesOverdue;
  final bool invoicesRead;

  NotificationSettings({
    required this.customerActivated,
    required this.appointmentReminders,
    required this.appointmentLeadMinutes,
    required this.dailyDigest,
    required this.dailyDigestTime,
    required this.invoicesOverdue,
    required this.invoicesRead,
  });

  factory NotificationSettings.fromJson(Map<String, dynamic> json) => NotificationSettings(
        customerActivated: json['customerActivated'] as bool? ?? true,
        appointmentReminders: json['appointmentReminders'] as bool? ?? true,
        appointmentLeadMinutes: (json['appointmentLeadMinutes'] as num?)?.toInt() ?? 60,
        dailyDigest: json['dailyDigest'] as bool? ?? false,
        dailyDigestTime: json['dailyDigestTime'] as String? ?? '07:30',
        invoicesOverdue: json['invoicesOverdue'] as bool? ?? true,
        invoicesRead: json['invoicesRead'] as bool? ?? true,
      );

  NotificationSettings copyWith({
    bool? customerActivated,
    bool? appointmentReminders,
    int? appointmentLeadMinutes,
    bool? dailyDigest,
    String? dailyDigestTime,
    bool? invoicesOverdue,
    bool? invoicesRead,
  }) =>
      NotificationSettings(
        customerActivated: customerActivated ?? this.customerActivated,
        appointmentReminders: appointmentReminders ?? this.appointmentReminders,
        appointmentLeadMinutes: appointmentLeadMinutes ?? this.appointmentLeadMinutes,
        dailyDigest: dailyDigest ?? this.dailyDigest,
        dailyDigestTime: dailyDigestTime ?? this.dailyDigestTime,
        invoicesOverdue: invoicesOverdue ?? this.invoicesOverdue,
        invoicesRead: invoicesRead ?? this.invoicesRead,
      );

  Map<String, dynamic> toJson() => {
        'customerActivated': customerActivated,
        'appointmentReminders': appointmentReminders,
        'appointmentLeadMinutes': appointmentLeadMinutes,
        'dailyDigest': dailyDigest,
        'dailyDigestTime': dailyDigestTime,
        'invoicesOverdue': invoicesOverdue,
        'invoicesRead': invoicesRead,
      };
}

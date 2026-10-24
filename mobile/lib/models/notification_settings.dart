/// Global push-notification settings (Settings > Notifications), mirroring the
/// backend NotificationSettings singleton.
class NotificationSettings {
  final bool customerActivated;
  final bool customerUpdated;
  final bool customerPetUpdated;
  final bool formSubmitted;
  final bool appointmentReminders;
  final int appointmentLeadMinutes;
  final bool dailyDigest;
  final String dailyDigestTime; // 'HH:mm'
  final bool invoicesOverdue;
  final bool invoicesRead;
  // An hour before a day's checklist complete-by time, if items are unticked.
  final bool checklistReminders;

  NotificationSettings({
    required this.customerActivated,
    required this.customerUpdated,
    required this.customerPetUpdated,
    required this.formSubmitted,
    required this.appointmentReminders,
    required this.appointmentLeadMinutes,
    required this.dailyDigest,
    required this.dailyDigestTime,
    required this.invoicesOverdue,
    required this.invoicesRead,
    this.checklistReminders = true,
  });

  factory NotificationSettings.fromJson(Map<String, dynamic> json) => NotificationSettings(
        customerActivated: json['customerActivated'] as bool? ?? true,
        customerUpdated: json['customerUpdated'] as bool? ?? true,
        customerPetUpdated: json['customerPetUpdated'] as bool? ?? true,
        formSubmitted: json['formSubmitted'] as bool? ?? true,
        appointmentReminders: json['appointmentReminders'] as bool? ?? true,
        appointmentLeadMinutes: (json['appointmentLeadMinutes'] as num?)?.toInt() ?? 60,
        dailyDigest: json['dailyDigest'] as bool? ?? false,
        dailyDigestTime: json['dailyDigestTime'] as String? ?? '07:30',
        invoicesOverdue: json['invoicesOverdue'] as bool? ?? true,
        invoicesRead: json['invoicesRead'] as bool? ?? true,
        checklistReminders: json['checklistReminders'] as bool? ?? true,
      );

  NotificationSettings copyWith({
    bool? customerActivated,
    bool? customerUpdated,
    bool? customerPetUpdated,
    bool? formSubmitted,
    bool? appointmentReminders,
    int? appointmentLeadMinutes,
    bool? dailyDigest,
    String? dailyDigestTime,
    bool? invoicesOverdue,
    bool? invoicesRead,
    bool? checklistReminders,
  }) =>
      NotificationSettings(
        customerActivated: customerActivated ?? this.customerActivated,
        customerUpdated: customerUpdated ?? this.customerUpdated,
        customerPetUpdated: customerPetUpdated ?? this.customerPetUpdated,
        formSubmitted: formSubmitted ?? this.formSubmitted,
        appointmentReminders: appointmentReminders ?? this.appointmentReminders,
        appointmentLeadMinutes: appointmentLeadMinutes ?? this.appointmentLeadMinutes,
        dailyDigest: dailyDigest ?? this.dailyDigest,
        dailyDigestTime: dailyDigestTime ?? this.dailyDigestTime,
        invoicesOverdue: invoicesOverdue ?? this.invoicesOverdue,
        invoicesRead: invoicesRead ?? this.invoicesRead,
        checklistReminders: checklistReminders ?? this.checklistReminders,
      );

  Map<String, dynamic> toJson() => {
        'customerActivated': customerActivated,
        'customerUpdated': customerUpdated,
        'customerPetUpdated': customerPetUpdated,
        'formSubmitted': formSubmitted,
        'appointmentReminders': appointmentReminders,
        'appointmentLeadMinutes': appointmentLeadMinutes,
        'dailyDigest': dailyDigest,
        'dailyDigestTime': dailyDigestTime,
        'invoicesOverdue': invoicesOverdue,
        'invoicesRead': invoicesRead,
        'checklistReminders': checklistReminders,
      };
}

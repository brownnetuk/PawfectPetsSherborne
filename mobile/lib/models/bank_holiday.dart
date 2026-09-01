/// A named calendar date staff maintain (Settings > Invoices > Bank Holidays)
/// so bank-holiday-restricted products know which days count as a bank holiday.
class BankHoliday {
  final String id;
  final String name;
  final DateTime date;

  BankHoliday({required this.id, required this.name, required this.date});

  factory BankHoliday.fromJson(Map<String, dynamic> json) => BankHoliday(
        id: json['_id'] as String,
        name: json['name'] as String? ?? '',
        date: DateTime.parse(json['date'] as String),
      );
}

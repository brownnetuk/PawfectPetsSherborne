import 'package:flutter/material.dart';
import '../models/bank_holiday.dart';
import '../models/product.dart';

/// Human labels for a product's day-type restriction.
const availabilityLabels = {
  'weekday': 'Weekday',
  'weekend': 'Weekend',
  'bank_holiday': 'Bank Holiday',
};

String _dateKey(DateTime d) => '${d.year}-${d.month}-${d.day}';

/// The day-type of [date]: 'bank_holiday' takes priority over the plain
/// weekday/weekend split (a bank holiday on a weekday is still a bank holiday
/// for scheduling). Mirrors the admin app's dayTypeFor.
String dayTypeFor(DateTime date, List<BankHoliday> bankHolidays) {
  final key = _dateKey(DateTime(date.year, date.month, date.day));
  // A server date arrives as UTC ISO; round-trip through local so its calendar
  // day matches the local date, same as the admin util.
  final isHoliday = bankHolidays.any((h) => _dateKey(h.date.toLocal()) == key);
  if (isHoliday) return 'bank_holiday';
  final wd = date.weekday; // Mon=1..Sun=7
  return (wd == DateTime.saturday || wd == DateTime.sunday) ? 'weekend' : 'weekday';
}

/// A warning message if [product]'s restriction doesn't match [date]'s
/// day-type, or null if there's no restriction (or it matches).
String? availabilityMismatch(Product product, DateTime date, List<BankHoliday> bankHolidays) {
  final restriction = product.availability;
  if (restriction == null || restriction.isEmpty) return null;
  final actual = dayTypeFor(date, bankHolidays);
  if (actual == restriction) return null;
  return '${product.name} is set to only be used on a '
      '${availabilityLabels[restriction] ?? restriction}, but this date is a '
      '${availabilityLabels[actual] ?? actual}.';
}

/// Returns true if it's OK to use [product] on [date]: either there's no
/// day-type mismatch, or the user confirmed "Use anyway" on the warning.
/// Mirrors the admin "Check product type" modal.
Future<bool> confirmProductAvailability(
  BuildContext context,
  Product product,
  DateTime date,
  List<BankHoliday> bankHolidays,
) async {
  final message = availabilityMismatch(product, date, bankHolidays);
  if (message == null) return true;
  final ok = await showDialog<bool>(
    context: context,
    builder: (_) => AlertDialog(
      title: const Text('Check product type'),
      content: Text(message),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
        FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Use anyway')),
      ],
    ),
  );
  return ok ?? false;
}

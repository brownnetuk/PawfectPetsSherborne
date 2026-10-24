import '../models/bank_holiday.dart';
import '../models/visit_mapping.dart';
import 'product_availability.dart';

/// One planned day: which visit product applies, and (for a single-visit
/// first/last day) an explicit AM/PM override.
class VisitPlanDay {
  final DateTime date;
  final String productId;
  final String? visitTime; // 'AM' | 'PM' or null
  VisitPlanDay(this.date, this.productId, this.visitTime);
}

class VisitPlanResult {
  final List<VisitPlanDay> plan;
  /// "N Visit, M mins (Day Type)" labels for any combination with no product mapped.
  final List<String> missing;
  VisitPlanResult(this.plan, this.missing);
}

/// Builds the day-by-day visit product plan for a date range, mirroring the
/// admin `buildVisitPlan`: the first/last day use their own visit counts,
/// every day between uses [visitsPerDay]; the mapped product comes from the
/// Settings > Bookings > Visits mapping for each day's (count × length ×
/// day-type), [duration] picking the 20/30/40 minute product set.
/// An AM/PM override is recorded only for a single-visit first/last day.
VisitPlanResult buildVisitPlan({
  required DateTime start,
  required DateTime end,
  required int visitsPerDay,
  required int visitsFirstDay,
  required int visitsLastDay,
  required VisitMapping mapping,
  required List<BankHoliday> bankHolidays,
  String duration = '20',
  String amPmFirstDay = 'PM',
  String amPmLastDay = 'AM',
}) {
  final days = <DateTime>[];
  for (var d = start; !d.isAfter(end); d = DateTime(d.year, d.month, d.day + 1)) {
    days.add(d);
  }
  final plan = <VisitPlanDay>[];
  final missing = <String>{};
  for (var i = 0; i < days.length; i++) {
    final date = days[i];
    final isFirst = i == 0;
    final isLast = i == days.length - 1;
    final visits = days.length == 1
        ? visitsFirstDay
        : isFirst
            ? visitsFirstDay
            : isLast
                ? visitsLastDay
                : visitsPerDay;
    final dayType = dayTypeFor(date, bankHolidays);
    final productId = mapping.productFor(visits, dayType, duration: duration);
    if (productId == null || productId.isEmpty) {
      missing.add('$visits Visit, $duration mins (${availabilityLabels[dayType] ?? dayType})');
      continue;
    }
    String? visitTime;
    if (visits == 1) {
      if (days.length == 1 || isFirst) {
        visitTime = amPmFirstDay;
      } else if (isLast) {
        visitTime = amPmLastDay;
      }
    }
    plan.add(VisitPlanDay(date, productId, visitTime));
  }
  return VisitPlanResult(plan, missing.toList());
}

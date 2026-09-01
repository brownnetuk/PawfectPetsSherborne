/// Which catalogue product each (visit count × day-type) combination maps to
/// (Settings > Bookings > Visits). Null slots are unconfigured. Used to create
/// Visit bookings and to tell a Visit entry apart from an ordinary Walk.
class VisitMapping {
  final String? oneVisitWeekday;
  final String? oneVisitWeekend;
  final String? oneVisitBankHoliday;
  final String? twoVisitWeekday;
  final String? twoVisitWeekend;
  final String? twoVisitBankHoliday;

  VisitMapping({
    this.oneVisitWeekday,
    this.oneVisitWeekend,
    this.oneVisitBankHoliday,
    this.twoVisitWeekday,
    this.twoVisitWeekend,
    this.twoVisitBankHoliday,
  });

  static String? _id(dynamic v) =>
      v is Map<String, dynamic> ? v['_id'] as String? : (v as String?);

  factory VisitMapping.fromJson(Map<String, dynamic> json) => VisitMapping(
        oneVisitWeekday: _id(json['oneVisitWeekdayProduct']),
        oneVisitWeekend: _id(json['oneVisitWeekendProduct']),
        oneVisitBankHoliday: _id(json['oneVisitBankHolidayProduct']),
        twoVisitWeekday: _id(json['twoVisitWeekdayProduct']),
        twoVisitWeekend: _id(json['twoVisitWeekendProduct']),
        twoVisitBankHoliday: _id(json['twoVisitBankHolidayProduct']),
      );

  Set<String> get _oneVisitIds =>
      {oneVisitWeekday, oneVisitWeekend, oneVisitBankHoliday}.whereType<String>().toSet();
  Set<String> get _twoVisitIds =>
      {twoVisitWeekday, twoVisitWeekend, twoVisitBankHoliday}.whereType<String>().toSet();

  /// True if [productId] is any of the six mapped visit products.
  bool isVisitProduct(String productId) =>
      _oneVisitIds.contains(productId) || _twoVisitIds.contains(productId);

  /// 1 or 2 if [productId] is a mapped visit product, else null (a Walk).
  int? visitCountForProduct(String productId) {
    if (_oneVisitIds.contains(productId)) return 1;
    if (_twoVisitIds.contains(productId)) return 2;
    return null;
  }

  /// The mapped product for [visits] (1 or 2) on the given [dayType]
  /// ('weekday' | 'weekend' | 'bank_holiday'), or null if unconfigured.
  String? productFor(int visits, String dayType) {
    if (visits == 1) {
      return switch (dayType) {
        'weekend' => oneVisitWeekend,
        'bank_holiday' => oneVisitBankHoliday,
        _ => oneVisitWeekday,
      };
    }
    return switch (dayType) {
      'weekend' => twoVisitWeekend,
      'bank_holiday' => twoVisitBankHoliday,
      _ => twoVisitWeekday,
    };
  }
}

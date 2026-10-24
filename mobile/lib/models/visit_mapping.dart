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
  // Day Care / Boarding product slots (Settings > Bookings), used to tell those
  // day bookings apart from Visits/Walks on the calendar.
  final String? dayCareHalfDay;
  final String? dayCareFullDay;
  final String? dayCareSecondDogHalfDay;
  final String? dayCareSecondDogFullDay;
  final String? boardingPerDay;
  final String? boardingSecondDogPerDay;
  final String? boardingHalfDay;
  final String? boardingSecondDogHalfDay;
  // The 30 and 40 minute visit slots (the six above are the 20 minute ones).
  // Only needed to recognise those bookings as visits, so kept as id sets.
  final Set<String> longerOneVisitIds;
  final Set<String> longerTwoVisitIds;

  VisitMapping({
    this.oneVisitWeekday,
    this.oneVisitWeekend,
    this.oneVisitBankHoliday,
    this.twoVisitWeekday,
    this.twoVisitWeekend,
    this.twoVisitBankHoliday,
    this.dayCareHalfDay,
    this.dayCareFullDay,
    this.dayCareSecondDogHalfDay,
    this.dayCareSecondDogFullDay,
    this.boardingPerDay,
    this.boardingSecondDogPerDay,
    this.boardingHalfDay,
    this.boardingSecondDogHalfDay,
    this.longerOneVisitIds = const {},
    this.longerTwoVisitIds = const {},
  });

  static String? _id(dynamic v) =>
      v is Map<String, dynamic> ? v['_id'] as String? : (v as String?);

  static Set<String> _longerIds(Map<String, dynamic> json, String count) => [
        for (final minutes in ['30', '40'])
          for (final day in ['Weekday', 'Weekend', 'BankHoliday'])
            _id(json['${count}Visit${minutes}Min${day}Product']),
      ].whereType<String>().toSet();

  factory VisitMapping.fromJson(Map<String, dynamic> json) => VisitMapping(
        oneVisitWeekday: _id(json['oneVisitWeekdayProduct']),
        oneVisitWeekend: _id(json['oneVisitWeekendProduct']),
        oneVisitBankHoliday: _id(json['oneVisitBankHolidayProduct']),
        twoVisitWeekday: _id(json['twoVisitWeekdayProduct']),
        twoVisitWeekend: _id(json['twoVisitWeekendProduct']),
        twoVisitBankHoliday: _id(json['twoVisitBankHolidayProduct']),
        dayCareHalfDay: _id(json['dayCareHalfDayProduct']),
        dayCareFullDay: _id(json['dayCareFullDayProduct']),
        dayCareSecondDogHalfDay: _id(json['dayCareSecondDogHalfDayProduct']),
        dayCareSecondDogFullDay: _id(json['dayCareSecondDogFullDayProduct']),
        boardingPerDay: _id(json['boardingPerDayProduct']),
        boardingSecondDogPerDay: _id(json['boardingSecondDogPerDayProduct']),
        boardingHalfDay: _id(json['boardingHalfDayProduct']),
        boardingSecondDogHalfDay: _id(json['boardingSecondDogHalfDayProduct']),
        longerOneVisitIds: _longerIds(json, 'one'),
        longerTwoVisitIds: _longerIds(json, 'two'),
      );

  Set<String> get _oneVisitIds => {
        ...{oneVisitWeekday, oneVisitWeekend, oneVisitBankHoliday}.whereType<String>(),
        ...longerOneVisitIds,
      };
  Set<String> get _twoVisitIds => {
        ...{twoVisitWeekday, twoVisitWeekend, twoVisitBankHoliday}.whereType<String>(),
        ...longerTwoVisitIds,
      };
  Set<String> get _dayCareIds => {
        dayCareHalfDay,
        dayCareFullDay,
        dayCareSecondDogHalfDay,
        dayCareSecondDogFullDay,
      }.whereType<String>().toSet();
  Set<String> get _boardingIds =>
      {boardingPerDay, boardingSecondDogPerDay}.whereType<String>().toSet();

  /// True if [productId] is any of the mapped visit products (any length).
  bool isVisitProduct(String productId) =>
      _oneVisitIds.contains(productId) || _twoVisitIds.contains(productId);

  /// True if [productId] is a Day Care product (Half/Full, incl. 2nd-dog rates).
  bool isDayCareProduct(String productId) => _dayCareIds.contains(productId);

  /// True if [productId] is a Boarding product (incl. the 2nd-dog rate).
  bool isBoardingProduct(String productId) => _boardingIds.contains(productId);

  /// 1 or 2 if [productId] is a mapped visit product, else null (a Walk).
  int? visitCountForProduct(String productId) {
    if (_oneVisitIds.contains(productId)) return 1;
    if (_twoVisitIds.contains(productId)) return 2;
    return null;
  }

  /// The mapped 20 minute product for [visits] (1 or 2) on the given [dayType]
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

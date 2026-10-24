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
  // Every visit slot by its backend field name (oneVisitWeekdayProduct,
  // twoVisit30MinBankHolidayProduct, ...) -- the six named fields above are
  // the 20 minute ones; 30 and 40 minute visits have a "30Min"/"40Min" infix.
  // See [visitSlotKey]. Unconfigured slots are absent.
  final Map<String, String> visitSlots;

  /// The visit lengths staff can pick, in minutes -- same set as the admin's
  /// Settings > Bookings > Visits and quote/booking forms.
  static const visitDurations = ['20', '30', '40'];

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
    this.visitSlots = const {},
  });

  static String? _id(dynamic v) =>
      v is Map<String, dynamic> ? v['_id'] as String? : (v as String?);

  static const _dayTypeSuffix = {'weekday': 'Weekday', 'weekend': 'Weekend', 'bank_holiday': 'BankHoliday'};

  /// The backend field for ([visits] 1|2, [duration] '20'|'30'|'40',
  /// [dayType] 'weekday'|'weekend'|'bank_holiday'), e.g.
  /// oneVisitWeekdayProduct or twoVisit30MinBankHolidayProduct -- the same
  /// naming as the admin's visitMappingKey.
  static String visitSlotKey(int visits, String duration, String dayType) {
    final infix = duration == '20' ? '' : '${duration}Min';
    return '${visits == 2 ? 'two' : 'one'}Visit$infix${_dayTypeSuffix[dayType] ?? 'Weekday'}Product';
  }

  static Map<String, String> _visitSlots(Map<String, dynamic> json) => {
        for (final visits in [1, 2])
          for (final duration in visitDurations)
            for (final dayType in _dayTypeSuffix.keys)
              if (_id(json[visitSlotKey(visits, duration, dayType)]) case final String id)
                visitSlotKey(visits, duration, dayType): id,
      };

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
        visitSlots: _visitSlots(json),
      );

  Set<String> _visitIds(int visits, [List<String> durations = visitDurations]) => {
        for (final duration in durations)
          for (final dayType in _dayTypeSuffix.keys)
            if (visitSlots[visitSlotKey(visits, duration, dayType)] case final String id) id,
      };

  Set<String> get _oneVisitIds => _visitIds(1);
  Set<String> get _twoVisitIds => _visitIds(2);
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

  /// The visit length ('20' | '30' | '40') a mapped visit product is set up
  /// for, defaulting to '20' for anything else -- the admin's
  /// visitDurationForProduct.
  String visitDurationForProduct(String productId) {
    for (final duration in visitDurations) {
      if (_visitIds(1, [duration]).contains(productId) || _visitIds(2, [duration]).contains(productId)) {
        return duration;
      }
    }
    return '20';
  }

  /// The mapped product for [visits] (1 or 2) of [duration] minutes
  /// ('20' | '30' | '40', default 20) on the given [dayType]
  /// ('weekday' | 'weekend' | 'bank_holiday'), or null if unconfigured.
  String? productFor(int visits, String dayType, {String duration = '20'}) =>
      visitSlots[visitSlotKey(visits, duration, dayType)];
}

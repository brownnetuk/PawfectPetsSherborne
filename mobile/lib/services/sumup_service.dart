import 'package:sumup/sumup.dart';
import '../config.dart';

/// Wraps the SumUp SDK for in-person card payments via a SumUp reader.
/// Disabled entirely (and [configured] false) unless the app was built with
/// --dart-define=SUMUP_AFFILIATE_KEY=... from developer.sumup.com.
///
/// First use on a device prompts the SumUp merchant login (the SDK keeps the
/// session), then [charge] runs the SDK's checkout UI: connect reader, tap
/// card, and returns whether the transaction went through.
class SumupService {
  SumupService._();

  static bool get configured => sumupAffiliateKey.isNotEmpty;
  static bool _initialised = false;

  /// Initialises the SDK and ensures a SumUp merchant login (prompting the
  /// SDK's login UI if needed). Throws [StateError] when login is dismissed.
  static Future<void> ensureReady() async {
    if (!_initialised) {
      await Sumup.init(sumupAffiliateKey);
      _initialised = true;
    }
    if (!(await Sumup.isLoggedIn ?? false)) {
      await Sumup.login();
    }
    if (!(await Sumup.isLoggedIn ?? false)) {
      throw StateError('SumUp login was cancelled.');
    }
  }

  /// Whether Tap to Pay on iPhone can be offered (merchant + device support).
  /// Requires [ensureReady] first; returns unavailable rather than throwing.
  static Future<TapToPayAvailabilityResult> tapToPayAvailability() async {
    try {
      return await Sumup.checkTapToPayAvailability();
    } catch (_) {
      return TapToPayAvailabilityResult(isAvailable: false, isActivated: false);
    }
  }

  /// One-time Apple Tap to Pay activation (T&Cs + device setup). Call when
  /// availability reports not yet activated.
  static Future<void> activateTapToPay() => Sumup.presentTapToPayActivation();

  /// Charges [amount] GBP through the SumUp checkout UI -- on the paired
  /// card reader by default, or Tap to Pay on iPhone when [tapToPay] is set.
  /// Returns the SDK's response; `success == true` means the money was taken.
  static Future<SumupPluginCheckoutResponse> charge({
    required String title,
    required double amount,
    required String foreignTransactionId,
    bool tapToPay = false,
  }) async {
    await ensureReady();
    final payment = SumupPayment(
      title: title,
      total: amount,
      currency: 'GBP',
      // SumUp requires this to be unique per transaction attempt; it ties the
      // SumUp transaction back to our invoice in their dashboard.
      foreignTransactionId: foreignTransactionId,
      saleItemsCount: 1,
      skipSuccessScreen: false,
      skipFailureScreen: false,
      tipOnCardReader: false,
      customerEmail: null,
      customerPhone: null,
      cardType: null,
    );
    return Sumup.checkout(SumupPaymentRequest(
      payment,
      paymentMethod: tapToPay ? PaymentMethod.tapToPay : PaymentMethod.cardReader,
    ));
  }
}

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

  /// Charges [amount] GBP through the SumUp checkout UI. Returns the SDK's
  /// response; `success == true` means the money was taken. Throws
  /// [StateError] when the merchant login was dismissed.
  static Future<SumupPluginCheckoutResponse> charge({
    required String title,
    required double amount,
    required String foreignTransactionId,
  }) async {
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
    return Sumup.checkout(SumupPaymentRequest(payment));
  }
}

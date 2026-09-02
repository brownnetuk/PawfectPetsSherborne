import 'dart:typed_data';
import 'api_client.dart';
import '../models/portal_models.dart';

/// All customer-portal API calls, wrapping ApiClient and mapping JSON to
/// models. One method per backend /portal endpoint.
class Repository {
  final ApiClient client;
  Repository(this.client);

  // --- auth ---

  /// First-time login: ask the server to email a 6-digit code.
  Future<void> requestCode(String email) => client.post('/portal/request-code', {'email': email});

  /// Forgotten password: ask the server to email a 6-digit reset code.
  Future<void> requestReset(String email) => client.post('/portal/request-reset', {'email': email});

  /// Consume a code and set a password; returns the session token (auto-login).
  Future<String> setPassword(String email, String code, String password) async {
    final res = await client.post('/portal/set-password', {
      'email': email,
      'code': code,
      'password': password,
    });
    return res['token'] as String;
  }

  Future<String> login(String email, String password) async {
    final res = await client.post('/portal/login', {'email': email, 'password': password});
    return res['token'] as String;
  }

  // --- profile ---

  Future<Profile> me() async => Profile.fromJson(await client.get('/portal/me'));

  Future<Profile> updateMe(Map<String, dynamic> patch) async =>
      Profile.fromJson(await client.patch('/portal/me', patch));

  // --- invoices ---

  Future<List<Invoice>> listInvoices() async {
    final list = await client.getList('/portal/invoices');
    return list.map((e) => Invoice.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Uint8List> invoicePdf(String id) => client.getBytes('/portal/invoices/$id/pdf');

  Future<void> sendInvoice(String id) => client.post('/portal/invoices/$id/send');

  // --- quotes ---

  Future<List<Quote>> listQuotes() async {
    final list = await client.getList('/portal/quotes');
    return list.map((e) => Quote.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> acceptQuote(String id) => client.post('/portal/quotes/$id/accept');
  Future<void> declineQuote(String id) => client.post('/portal/quotes/$id/decline');

  // --- bookings ---

  Future<List<Booking>> listBookings() async {
    final list = await client.getList('/portal/bookings');
    return list.map((e) => Booking.fromJson(e as Map<String, dynamic>)).toList();
  }

  // --- animals ---

  Future<List<Animal>> listAnimals() async {
    final list = await client.getList('/portal/animals');
    return list.map((e) => Animal.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> createAnimal(Map<String, dynamic> body) => client.post('/portal/animals', body);

  Future<void> updateAnimal(String id, Map<String, dynamic> body) =>
      client.patch('/portal/animals/$id', body);

  // --- messages ---

  Future<List<PortalMessage>> listMessages() async {
    final list = await client.getList('/portal/messages');
    return list.map((e) => PortalMessage.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> sendMessage(String body) => client.post('/portal/messages', {'body': body});

  Future<int> messagesUnread() async {
    final res = await client.get('/portal/messages/unread-count');
    return (res['count'] as num?)?.toInt() ?? 0;
  }

  // --- push ---

  Future<void> registerPushToken(String token) =>
      client.post('/portal/push/register', {'token': token, 'platform': 'ios'});
}

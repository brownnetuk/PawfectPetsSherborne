import '../models/animal.dart';
import '../models/booking.dart';
import '../models/crm_activity.dart';
import '../models/customer.dart';
import '../models/staff.dart';
import 'api_client.dart';

class Repository {
  final ApiClient _client;
  Repository(this._client);

  // --- auth ---
  Future<({String token, Staff staff})> login(String email, String password) async {
    final json = await _client.post('/auth/login', {'email': email, 'password': password});
    return (
      token: json['accessToken'] as String,
      staff: Staff.fromJson(json['staff'] as Map<String, dynamic>),
    );
  }

  Future<Staff> me() async => Staff.fromJson(await _client.get('/auth/me'));

  // --- customers ---
  Future<List<Customer>> listCustomers() async =>
      (await _client.getList('/customers')).map((e) => Customer.fromJson(e)).toList();

  Future<Customer> getCustomer(String id) async =>
      Customer.fromJson(await _client.get('/customers/$id'));

  Future<String?> getAlarmInstructions(String id) async {
    final json = await _client.get('/customers/$id/alarm-instructions');
    return json['instructions'] as String?;
  }

  // --- animals ---
  Future<List<Animal>> listAnimals(String customerId) async =>
      (await _client.getList('/animals', query: {'customer': customerId}))
          .map((e) => Animal.fromJson(e))
          .toList();

  // --- bookings ---
  Future<List<Booking>> listBookings({String? customerId}) async => (await _client.getList(
        '/bookings',
        query: customerId != null ? {'customer': customerId} : null,
      ))
          .map((e) => Booking.fromJson(e))
          .toList();

  Future<Booking> updateBookingStatus(String id, String status) async =>
      Booking.fromJson(await _client.patch('/bookings/$id', {'status': status}));

  // --- CRM activity ---
  Future<List<CrmActivity>> listActivities({String? customerId}) async => (await _client.getList(
        '/crm/activities',
        query: customerId != null ? {'customer': customerId} : null,
      ))
          .map((e) => CrmActivity.fromJson(e))
          .toList();

  Future<CrmActivity> createActivity({
    required String customerId,
    required String type,
    required String subject,
    String? description,
    required String createdBy,
  }) async =>
      CrmActivity.fromJson(await _client.post('/crm/activities', {
        'customer': customerId,
        'type': type,
        'subject': subject,
        if (description != null && description.isNotEmpty) 'description': description,
        'createdBy': createdBy,
      }));
}

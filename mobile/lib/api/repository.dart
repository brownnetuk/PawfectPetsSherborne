import '../models/animal.dart';
import '../models/booking.dart';
import 'dart:typed_data';
import '../models/crm_activity.dart';
import '../models/customer.dart';
import '../models/expense.dart';
import '../models/invoice.dart';
import '../models/product.dart';
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

  // --- products (invoice line-item catalogue) ---
  Future<List<Product>> listProducts() async =>
      (await _client.getList('/products')).map((e) => Product.fromJson(e)).toList();

  // --- invoices ---
  Future<List<Invoice>> listInvoices({String? customerId}) async => (await _client.getList(
        '/invoices',
        query: customerId != null ? {'customer': customerId} : null,
      ))
          .map((e) => Invoice.fromJson(e))
          .toList();

  Future<Invoice> getInvoice(String id) async =>
      Invoice.fromJson(await _client.get('/invoices/$id'));

  /// The rendered invoice PDF bytes, produced server-side from the same
  /// template the web apps use.
  Future<Uint8List> getInvoicePdf(String id) async => _client.getBytes('/invoices/$id/pdf');

  /// Emails the invoice to the customer. Moves a draft to "sent".
  Future<Invoice> sendInvoiceEmail(String id) async =>
      Invoice.fromJson(await _client.post('/invoices/$id/send', {}));

  /// Emails a deposit request to the customer; returns the calculated deposit.
  Future<({double depositAmount, double depositPercentage})> requestDeposit(String id) async {
    final json = await _client.post('/invoices/$id/request-deposit', {});
    return (
      depositAmount: (json['depositAmount'] as num?)?.toDouble() ?? 0,
      depositPercentage: (json['depositPercentage'] as num?)?.toDouble() ?? 0,
    );
  }

  // --- payments ---
  Future<List<PaymentMethod>> listPaymentMethods() async =>
      (await _client.getList('/payment-methods')).map((e) => PaymentMethod.fromJson(e)).toList();

  Future<void> recordPayment({
    required String invoiceId,
    required DateTime date,
    required double amount,
    required String accountId,
    String? paymentMethod,
    double? charges,
  }) async =>
      _client.post('/payments', {
        'invoice': invoiceId,
        'date': date.toIso8601String(),
        'amount': amount,
        'account': accountId,
        if (paymentMethod != null && paymentMethod.isNotEmpty) 'paymentMethod': paymentMethod,
        if (charges != null && charges > 0) 'charges': charges,
      });


  /// Creates a draft invoice. The server assigns the invoice number and
  /// computes subtotal/total from the line items, so we only send inputs.
  Future<Invoice> createInvoice({
    required String customerId,
    required List<InvoiceLineItem> lineItems,
    required DateTime issueDate,
    required DateTime dueDate,
    String? subject,
    String? paymentTerms,
    String? bookingId,
  }) async =>
      Invoice.fromJson(await _client.post('/invoices', {
        'customer': customerId,
        'lineItems': lineItems.map((e) => e.toJson()).toList(),
        'issueDate': issueDate.toIso8601String(),
        'dueDate': dueDate.toIso8601String(),
        if (subject != null && subject.isNotEmpty) 'subject': subject,
        if (paymentTerms != null && paymentTerms.isNotEmpty) 'paymentTerms': paymentTerms,
        if (bookingId != null) 'booking': bookingId,
      }));

  // --- expenses ---
  Future<List<Expense>> listExpenses() async =>
      (await _client.getList('/expenses')).map((e) => Expense.fromJson(e)).toList();

  Future<List<ExpenseCategory>> listExpenseCategories() async =>
      (await _client.getList('/expense-categories')).map((e) => ExpenseCategory.fromJson(e)).toList();

  Future<List<BankAccountRef>> listBankAccounts() async =>
      (await _client.getList('/bank-accounts')).map((e) => BankAccountRef.fromJson(e)).toList();

  Future<List<Vendor>> listVendors() async =>
      (await _client.getList('/vendors')).map((e) => Vendor.fromJson(e)).toList();

  Future<Expense> createExpense({
    required DateTime date,
    required String category,
    required String description,
    required double amount,
    String? payee,
    String? accountId,
  }) async =>
      Expense.fromJson(await _client.post('/expenses', {
        'date': date.toIso8601String(),
        'category': category,
        'description': description,
        'amount': amount,
        if (payee != null && payee.isNotEmpty) 'payee': payee,
        if (accountId != null) 'account': accountId,
      }));

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

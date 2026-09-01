import 'dart:typed_data';
import '../models/animal.dart';
import '../models/appointment.dart';
import '../models/audit_log_entry.dart';
import '../models/bank_account.dart';
import '../models/bank_holiday.dart';
import '../models/bank_transfer.dart';
import '../models/booking.dart';
import '../models/day_booking.dart';
import '../models/finance_report.dart';
import '../models/payment.dart' as models;
import '../models/crm_activity.dart';
import '../models/customer.dart';
import '../models/expense.dart';
import '../models/invoice.dart';
import '../models/product.dart';
import '../models/quote.dart';
import '../models/staff.dart';
import '../models/visit_mapping.dart';
import 'api_client.dart';

class Repository {
  final ApiClient _client;
  Repository(this._client);

  // --- auth ---
  Future<({String token, Staff staff})> login(String username, String password) async {
    final json = await _client.post('/auth/login', {'username': username, 'password': password});
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

  /// Creates a minimal "lead" customer (name + email, status pending) — the
  /// same quick-add the admin app uses; full details come later via the
  /// intake form.
  Future<Customer> createLead({required String name, required String email}) async =>
      Customer.fromJson(await _client.post('/customers/leads', {'name': name, 'email': email}));

  /// Permanently deletes a customer. The server rejects this (409) if they
  /// still have pets/bookings/invoices/quotes/activity on file.
  Future<void> deleteCustomer(String id) => _client.delete('/customers/$id');

  Future<Customer> updateCustomerStatus(String id, String status) async =>
      Customer.fromJson(await _client.patch('/customers/$id/status', {'status': status}));

  /// System activity trail for a customer (invoices, quotes, payments, emails
  /// sent/read, deposits, etc.), newest first from the backend.
  Future<List<AuditLogEntry>> listCustomerActivity(String customerId) async =>
      (await _client.getList('/audit-log', query: {'customer': customerId}))
          .map((e) => AuditLogEntry.fromJson(e))
          .toList();

  Future<String?> getAlarmInstructions(String id) async {
    final json = await _client.get('/customers/$id/alarm-instructions');
    return json['instructions'] as String?;
  }

  // --- animals ---
  Future<List<Animal>> listAnimals(String customerId) async =>
      (await _client.getList('/animals', query: {'customer': customerId}))
          .map((e) => Animal.fromJson(e))
          .toList();

  /// Map of customer id -> their pets' names, for searching customers by pet.
  Future<Map<String, List<String>>> petNamesByCustomer() async {
    final list = await _client.getList('/animals');
    final map = <String, List<String>>{};
    for (final e in list) {
      final m = e as Map<String, dynamic>;
      final customer = m['customer'];
      final customerId = customer is String
          ? customer
          : (customer is Map<String, dynamic> ? customer['_id'] as String? : null);
      final name = m['name'] as String?;
      if (customerId != null && name != null && name.isNotEmpty) {
        (map[customerId] ??= []).add(name);
      }
    }
    return map;
  }

  /// Partial update of a pet (only the given fields are changed).
  Future<Animal> updateAnimal(String id, Map<String, dynamic> patch) async =>
      Animal.fromJson(await _client.patch('/animals/$id', patch));

  /// Deletes a pet. The server rejects this (409) if it's on any booking.
  Future<void> deleteAnimal(String id) => _client.delete('/animals/$id');

  // --- bookings ---
  Future<List<Booking>> listBookings({String? customerId}) async => (await _client.getList(
        '/bookings',
        query: customerId != null ? {'customer': customerId} : null,
      ))
          .map((e) => Booking.fromJson(e))
          .toList();

  Future<Booking> updateBookingStatus(String id, String status) async =>
      Booking.fromJson(await _client.patch('/bookings/$id', {'status': status}));

  // --- day bookings (the calendar: one dog + one day + one product) ---
  static String _ymd(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  /// Day bookings from [from] (inclusive) to [to] (exclusive) — pass the day
  /// after the last visible day as [to], matching the backend's $gte/$lt range.
  Future<List<DayBooking>> listDayBookings({required DateTime from, required DateTime to}) async =>
      (await _client.getList('/day-bookings', query: {'from': _ymd(from), 'to': _ymd(to)}))
          .map((e) => DayBooking.fromJson(e))
          .toList();

  Future<DayBooking> createDayBooking({
    required String animalId,
    required DateTime date,
    required String productId,
    int quantity = 1,
    String? visitTime,
  }) async =>
      DayBooking.fromJson(await _client.post('/day-bookings', {
        'animal': animalId,
        'date': _ymd(date),
        'product': productId,
        'quantity': quantity,
        if (visitTime != null) 'visitTime': visitTime,
      }));

  Future<DayBooking> updateDayBooking(
    String id, {
    DateTime? date,
    String? productId,
    int? quantity,
    String? invoiceId,
  }) async =>
      DayBooking.fromJson(await _client.patch('/day-bookings/$id', {
        if (date != null) 'date': _ymd(date),
        if (productId != null) 'product': productId,
        if (quantity != null) 'quantity': quantity,
        if (invoiceId != null) 'invoice': invoiceId,
      }));

  Future<void> deleteDayBooking(String id) => _client.delete('/day-bookings/$id');

  /// The Settings > Bookings > Visits product mapping (visit count × day-type).
  Future<VisitMapping> getVisitMapping() async =>
      VisitMapping.fromJson(await _client.get('/settings/visits'));

  // --- appointments (standalone calendar entries, shown blue) ---
  Future<List<Appointment>> listAppointments({required DateTime from, required DateTime to}) async =>
      (await _client.getList('/appointments', query: {'from': _ymd(from), 'to': _ymd(to)}))
          .map((e) => Appointment.fromJson(e))
          .toList();

  Future<Appointment> createAppointment({
    required String customerId,
    required String reason,
    required DateTime date,
    required String time,
  }) async =>
      Appointment.fromJson(await _client.post('/appointments', {
        'customer': customerId,
        'reason': reason,
        'date': _ymd(date),
        'time': time,
      }));

  Future<void> deleteAppointment(String id) => _client.delete('/appointments/$id');

  /// Registers this device's APNs token so the backend can send appointment
  /// reminders to it.
  Future<void> registerPushToken(String token) =>
      _client.post('/push/register', {'token': token, 'platform': 'ios'});

  /// All animals as lightweight refs (id, name, species, owner id), for the
  /// bookings calendar's "Add dog" / "Recommended" lists.
  Future<List<AnimalRef>> listAllAnimals() async =>
      (await _client.getList('/animals')).map((e) => AnimalRef.fromJson(e)).toList();

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

  /// Named bank-holiday dates, used to work out a date's day-type for product
  /// availability restrictions (Bookings + invoice/quote line items).
  Future<List<BankHoliday>> listBankHolidays() async =>
      (await _client.getList('/bank-holidays')).map((e) => BankHoliday.fromJson(e)).toList();

  // --- invoices ---
  Future<List<Invoice>> listInvoices({String? customerId}) async => (await _client.getList(
        '/invoices',
        query: customerId != null ? {'customer': customerId} : null,
      ))
          .map((e) => Invoice.fromJson(e))
          .toList();

  Future<Invoice> getInvoice(String id) async =>
      Invoice.fromJson(await _client.get('/invoices/$id'));

  // --- quotes ---
  Future<List<Quote>> listQuotes({String? customerId}) async => (await _client.getList(
        '/quotes',
        query: customerId != null ? {'customer': customerId} : null,
      ))
          .map((e) => Quote.fromJson(e))
          .toList();

  Future<Quote> getQuote(String id) async => Quote.fromJson(await _client.get('/quotes/$id'));

  Future<Uint8List> getQuotePdf(String id) async => _client.getBytes('/quotes/$id/pdf');

  /// Creates a quote against either an existing customer ([customerId]) or a
  /// manual/placeholder customer ([manualCustomerName] + [manualCustomerEmail]).
  Future<Quote> createQuote({
    String? customerId,
    String? manualCustomerName,
    String? manualCustomerEmail,
    required List<InvoiceLineItem> lineItems,
    required DateTime issueDate,
    required DateTime validUntil,
    String? subject,
    String? paymentTerms,
  }) async =>
      Quote.fromJson(await _client.post('/quotes', {
        if (customerId != null && customerId.isNotEmpty) 'customer': customerId,
        if (manualCustomerName != null && manualCustomerName.isNotEmpty)
          'manualCustomerName': manualCustomerName,
        if (manualCustomerEmail != null && manualCustomerEmail.isNotEmpty)
          'manualCustomerEmail': manualCustomerEmail,
        'lineItems': lineItems.map((e) => e.toJson()).toList(),
        'issueDate': issueDate.toIso8601String(),
        'validUntil': validUntil.toIso8601String(),
        if (subject != null && subject.isNotEmpty) 'subject': subject,
        if (paymentTerms != null && paymentTerms.isNotEmpty) 'paymentTerms': paymentTerms,
      }));

  /// Accepts a quote and converts it into an invoice (server also emails a
  /// deposit request). Returns the new invoice number, if available.
  Future<String?> acceptQuote(String id) async {
    final json = await _client.post('/quotes/$id/accept', {});
    final invoice = json['invoice'];
    return invoice is Map<String, dynamic> ? invoice['invoiceNumber'] as String? : null;
  }

  Future<Quote> updateQuote(String id, Map<String, dynamic> patch) async =>
      Quote.fromJson(await _client.patch('/quotes/$id', patch));

  Future<void> deleteQuote(String id) => _client.delete('/quotes/$id');

  Future<Quote> sendQuoteEmail(String id) async =>
      Quote.fromJson(await _client.post('/quotes/$id/send', {}));

  /// The admin app's reusable payment-terms library.
  Future<List<InvoiceTerm>> listInvoiceTerms() async =>
      (await _client.getList('/invoice-terms')).map((e) => InvoiceTerm.fromJson(e)).toList();

  /// Partial update of an invoice (subject, terms, dates, status, ...).
  Future<Invoice> updateInvoice(String id, Map<String, dynamic> patch) async =>
      Invoice.fromJson(await _client.patch('/invoices/$id', patch));

  /// Deletes an invoice. The server rejects this (409) if it has payments or
  /// credit notes recorded against it.
  Future<void> deleteInvoice(String id) => _client.delete('/invoices/$id');

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

  /// Edits an existing payment. The server reverses the old invoice/account
  /// effects and re-applies them with these values.
  Future<void> updatePayment(
    String id, {
    required String invoiceId,
    required DateTime date,
    required double amount,
    required String accountId,
    String? paymentMethod,
    double? charges,
  }) async =>
      _client.patch('/payments/$id', {
        'invoice': invoiceId,
        'date': date.toIso8601String(),
        'amount': amount,
        'account': accountId,
        'paymentMethod': paymentMethod ?? '',
        'charges': charges ?? 0,
      });

  /// Deletes a payment; the server restores the invoice balance and reverses
  /// the account adjustment (and any linked charges expense).
  Future<void> deletePayment(String id) => _client.delete('/payments/$id');


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

  Future<Expense> getExpense(String id) async =>
      Expense.fromJson(await _client.get('/expenses/$id'));

  Future<Expense> updateExpense(String id, Map<String, dynamic> patch) async =>
      Expense.fromJson(await _client.patch('/expenses/$id', patch));

  Future<void> deleteExpense(String id) => _client.delete('/expenses/$id');

  // --- financial: payments, bank accounts, reports ---
  Future<List<models.Payment>> listPayments() async =>
      (await _client.getList('/payments')).map((e) => models.Payment.fromJson(e)).toList();

  Future<List<BankAccount>> listBankAccountsDetailed() async =>
      (await _client.getList('/bank-accounts')).map((e) => BankAccount.fromJson(e)).toList();

  Future<({double openingBalance, List<BankTransaction> transactions})> getBankTransactions(
    String accountId,
    int month,
    int year,
  ) async {
    final json = await _client.get(
      '/bank-accounts/$accountId/transactions',
      query: {'month': '$month', 'year': '$year'},
    );
    return (
      openingBalance: (json['openingBalance'] as num?)?.toDouble() ?? 0,
      transactions: (json['transactions'] as List<dynamic>? ?? [])
          .map((e) => BankTransaction.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  // --- bank transfers (money moved between own accounts) ---
  Future<List<BankTransfer>> listBankTransfers() async =>
      (await _client.getList('/bank-transfers')).map((e) => BankTransfer.fromJson(e)).toList();

  Future<BankTransfer> createBankTransfer({
    required DateTime date,
    String? reference,
    required String fromAccountId,
    required String toAccountId,
    required double amount,
  }) async =>
      BankTransfer.fromJson(await _client.post('/bank-transfers', {
        'date': date.toIso8601String(),
        if (reference != null && reference.isNotEmpty) 'reference': reference,
        'fromAccount': fromAccountId,
        'toAccount': toAccountId,
        'amount': amount,
      }));

  Future<BankTransfer> updateBankTransfer(
    String id, {
    required DateTime date,
    String? reference,
    required String fromAccountId,
    required String toAccountId,
    required double amount,
  }) async =>
      BankTransfer.fromJson(await _client.patch('/bank-transfers/$id', {
        'date': date.toIso8601String(),
        'reference': reference ?? '',
        'fromAccount': fromAccountId,
        'toAccount': toAccountId,
        'amount': amount,
      }));

  Future<void> deleteBankTransfer(String id) => _client.delete('/bank-transfers/$id');

  Future<List<IncomeExpenseMonth>> incomeVsExpenses({int months = 6}) async =>
      (await _client.getList('/reports/income-vs-expenses', query: {'months': '$months'}))
          .map((e) => IncomeExpenseMonth.fromJson(e))
          .toList();

  Future<List<ExpenseCategoryTotal>> expensesByCategory({int months = 6}) async =>
      (await _client.getList('/reports/expenses-by-category', query: {'months': '$months'}))
          .map((e) => ExpenseCategoryTotal.fromJson(e))
          .toList();

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
    String? receipt,
  }) async =>
      Expense.fromJson(await _client.post('/expenses', {
        'date': date.toIso8601String(),
        'category': category,
        'description': description,
        'amount': amount,
        if (payee != null && payee.isNotEmpty) 'payee': payee,
        if (accountId != null) 'account': accountId,
        if (receipt != null && receipt.isNotEmpty) 'receipt': receipt,
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

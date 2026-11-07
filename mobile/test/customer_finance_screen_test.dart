import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'package:pawfectpets_staff/api/api_client.dart';
import 'package:pawfectpets_staff/api/repository.dart';
import 'package:pawfectpets_staff/models/customer.dart';
import 'package:pawfectpets_staff/models/invoice.dart';
import 'package:pawfectpets_staff/models/quote.dart';
import 'package:pawfectpets_staff/screens/customer_finance_screen.dart';

/// Serves one customer's invoices and quotes and records which customer the
/// screen asked for, so the test can check the lists are scoped.
class _FakeRepository extends Repository {
  _FakeRepository() : super(ApiClient());

  final requestedCustomerIds = <String?>[];

  @override
  Future<List<Invoice>> listInvoices({String? customerId}) async {
    requestedCustomerIds.add(customerId);
    return [
      Invoice(
        id: 'inv1',
        customer: CustomerRef(id: 'c1', name: 'Jane Smith', email: 'jane@example.com'),
        invoiceNumber: 'INV00040',
        lineItems: const [],
        subtotal: 135,
        total: 135,
        amountPaid: 35,
        status: 'sent',
        issueDate: DateTime(2026, 11, 1),
        dueDate: DateTime(2026, 11, 7),
      ),
    ];
  }

  @override
  Future<List<Quote>> listQuotes({String? customerId}) async {
    requestedCustomerIds.add(customerId);
    return [
      Quote(
        id: 'q1',
        customer: CustomerRef(id: 'c1', name: 'Jane Smith', email: 'jane@example.com'),
        quoteNumber: 'QUO00012',
        lineItems: const [],
        subtotal: 80,
        total: 80,
        status: 'sent',
        issueDate: DateTime(2026, 10, 20),
        validUntil: DateTime(2026, 11, 20),
      ),
    ];
  }
}

void main() {
  testWidgets('lists the customer\'s invoices and quotes on two tabs', (tester) async {
    final repo = _FakeRepository();
    await tester.pumpWidget(
      Provider<Repository>.value(
        value: repo,
        child: const MaterialApp(
          home: CustomerFinanceScreen(customerId: 'c1', customerName: 'Jane Smith'),
        ),
      ),
    );
    await tester.pumpAndSettle();

    // Both lists are fetched for this customer only.
    expect(repo.requestedCustomerIds, ['c1', 'c1']);

    expect(find.text('Jane Smith'), findsOneWidget);
    expect(find.text('INV00040'), findsOneWidget);
    expect(find.text('partially paid'), findsOneWidget);

    await tester.tap(find.text('Quotes'));
    await tester.pumpAndSettle();
    expect(find.text('QUO00012'), findsOneWidget);
    expect(find.textContaining('valid to 20 Nov 2026'), findsOneWidget);
  });
}

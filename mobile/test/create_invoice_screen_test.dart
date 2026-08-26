import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'package:pawfectpets_staff/api/api_client.dart';
import 'package:pawfectpets_staff/api/repository.dart';
import 'package:pawfectpets_staff/models/customer.dart';
import 'package:pawfectpets_staff/models/invoice.dart';
import 'package:pawfectpets_staff/models/product.dart';
import 'package:pawfectpets_staff/screens/create_invoice_screen.dart';

/// Serves a fixed product catalogue and captures the arguments the screen
/// submits, so the test can assert the payload without touching the network.
class _FakeRepository extends Repository {
  _FakeRepository(this.products) : super(ApiClient());

  final List<Product> products;
  String? capturedCustomerId;
  List<InvoiceLineItem>? capturedLineItems;
  int createCalls = 0;

  @override
  Future<List<Product>> listProducts() async => products;

  @override
  Future<Invoice> createInvoice({
    required String customerId,
    required List<InvoiceLineItem> lineItems,
    required DateTime issueDate,
    required DateTime dueDate,
    String? subject,
    String? paymentTerms,
    String? bookingId,
  }) async {
    createCalls++;
    capturedCustomerId = customerId;
    capturedLineItems = lineItems;
    return Invoice(
      id: 'inv1',
      customer: CustomerRef(id: customerId, name: 'Test Client', email: ''),
      invoiceNumber: 'INV-2026-0001',
      lineItems: lineItems,
      subtotal: 20,
      total: 20,
      status: 'draft',
      issueDate: issueDate,
      dueDate: dueDate,
    );
  }
}

void main() {
  final products = [
    Product(id: 'p1', productCode: 'DW', name: 'Dog walking', price: 20),
    Product(id: 'p2', productCode: 'HV', name: 'Home visit', price: 15),
  ];

  Future<void> pumpScreen(WidgetTester tester, _FakeRepository repo) async {
    // Tall surface so the whole form is laid out and the submit button is
    // built (a ListView otherwise lazily skips off-screen children).
    await tester.binding.setSurfaceSize(const Size(1200, 3000));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      Provider<Repository>.value(
        value: repo,
        child: const MaterialApp(
          home: CreateInvoiceScreen(customerId: 'cust1', customerName: 'Test Client'),
        ),
      ),
    );
    await tester.pumpAndSettle(); // resolve listProducts()
  }

  testWidgets('submits the selected product as a line item', (tester) async {
    final repo = _FakeRepository(products);
    await pumpScreen(tester, repo);

    // Open the product dropdown and choose "Dog walking".
    await tester.tap(find.byType(DropdownButtonFormField<Product>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Dog walking — £20.00').last);
    await tester.pumpAndSettle();

    await tester.tap(find.text('Create invoice'));
    await tester.pumpAndSettle();

    expect(repo.createCalls, 1);
    expect(repo.capturedCustomerId, 'cust1');
    expect(repo.capturedLineItems, hasLength(1));
    final item = repo.capturedLineItems!.single;
    expect(item.description, 'Dog walking'); // from the product, not typed
    expect(item.quantity, 1); // qty defaults to 1
    expect(item.unitPrice, 20); // from the product's price
    expect(item.lineTotal, 20);
  });

  testWidgets('will not submit when no product is selected', (tester) async {
    final repo = _FakeRepository(products);
    await pumpScreen(tester, repo);

    await tester.tap(find.text('Create invoice'));
    await tester.pumpAndSettle();

    expect(repo.createCalls, 0);
    expect(find.textContaining('at least one line item'), findsOneWidget);
  });

  testWidgets('shows a message when no products are configured', (tester) async {
    final repo = _FakeRepository([]);
    await pumpScreen(tester, repo);

    expect(find.textContaining('No products have been set up'), findsOneWidget);
    expect(find.text('Create invoice'), findsNothing);
  });
}

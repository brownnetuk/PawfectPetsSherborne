import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pawfectpets_staff/models/customer.dart';
import 'package:pawfectpets_staff/models/invoice.dart';
import 'package:pawfectpets_staff/screens/record_payment_sheet.dart';

// Recording a payment against an already-paid invoice asks first; an invoice
// with a balance goes straight through.
void main() {
  Invoice invoice({required String status, required double paid}) => Invoice(
        id: 'inv1',
        customer: CustomerRef(id: 'c1', name: 'Jane', email: ''),
        invoiceNumber: 'INV00042',
        lineItems: const [],
        subtotal: 50,
        total: 50,
        amountPaid: paid,
        status: status,
        issueDate: DateTime(2026, 10, 1),
        dueDate: DateTime(2026, 10, 15),
      );

  Future<bool?> run(WidgetTester tester, Invoice inv) async {
    bool? result;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Builder(
          builder: (context) => TextButton(
            onPressed: () async => result = await confirmPaymentOnPaidInvoice(context, inv),
            child: const Text('go'),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('go'));
    await tester.pumpAndSettle();
    return result;
  }

  test('isPaid covers the paid status and payments reaching the total', () {
    expect(invoice(status: 'paid', paid: 50).isPaid, isTrue);
    expect(invoice(status: 'sent', paid: 50).isPaid, isTrue);
    expect(invoice(status: 'sent', paid: 20).isPaid, isFalse);
    expect(invoice(status: 'draft', paid: 0).isPaid, isFalse);
  });

  testWidgets('an unpaid invoice needs no confirmation', (tester) async {
    expect(await run(tester, invoice(status: 'sent', paid: 20)), isTrue);
    expect(find.text('Invoice already paid'), findsNothing);
  });

  testWidgets('a paid invoice asks, and Cancel stops the payment', (tester) async {
    bool? result;
    final inv = invoice(status: 'paid', paid: 50);
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Builder(
          builder: (context) => TextButton(
            onPressed: () async => result = await confirmPaymentOnPaidInvoice(context, inv),
            child: const Text('go'),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('go'));
    await tester.pumpAndSettle();
    expect(find.text('Invoice already paid'), findsOneWidget);
    expect(find.textContaining('£50.00 received against £50.00'), findsOneWidget);

    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(result, isFalse);

    await tester.tap(find.text('go'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Make another payment'));
    await tester.pumpAndSettle();
    expect(result, isTrue);
  });
}

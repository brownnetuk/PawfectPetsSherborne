import 'package:flutter_test/flutter_test.dart';
import 'package:pawfectpets_staff/models/customer.dart';
import 'package:pawfectpets_staff/models/invoice.dart';

// The derived filters behind the Invoices tab's chips: Outstanding and
// Partially Paid aren't stored statuses, so they're computed from status and
// amountPaid the same way the admin's filter does.
Invoice _invoice(String status, {double total = 100, double amountPaid = 0}) => Invoice(
      id: 'inv-$status-$amountPaid',
      customer: CustomerRef(id: 'c1', name: 'Jane Smith', email: 'jane@example.com'),
      invoiceNumber: 'INV00001',
      lineItems: const [],
      subtotal: total,
      total: total,
      amountPaid: amountPaid,
      status: status,
      issueDate: DateTime(2026, 11, 1),
      dueDate: DateTime(2026, 11, 7),
    );

void main() {
  test('outstanding means with the customer and still owing', () {
    expect(_invoice('sent').isOutstanding, isTrue);
    expect(_invoice('overdue', amountPaid: 40).isOutstanding, isTrue);
    expect(_invoice('sent', amountPaid: 100).isOutstanding, isFalse);
    expect(_invoice('paid', amountPaid: 100).isOutstanding, isFalse);
    expect(_invoice('draft').isOutstanding, isFalse);
    expect(_invoice('scheduled').isOutstanding, isFalse);
    expect(_invoice('cancelled').isOutstanding, isFalse);
  });

  test('partially paid is a sent invoice with some but not all paid', () {
    expect(_invoice('sent', amountPaid: 40).isPartiallyPaid, isTrue);
    expect(_invoice('sent').isPartiallyPaid, isFalse);
    expect(_invoice('sent', amountPaid: 100).isPartiallyPaid, isFalse);
    expect(_invoice('overdue', amountPaid: 40).isPartiallyPaid, isFalse);
  });
}

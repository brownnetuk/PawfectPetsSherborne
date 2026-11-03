import 'package:flutter_test/flutter_test.dart';
import 'package:pawfectpets_staff/models/boarding_booking.dart';
import 'package:pawfectpets_staff/models/customer.dart';
import 'package:pawfectpets_staff/models/invoice.dart';
import 'package:pawfectpets_staff/utils/booking_confirmation_pdf.dart';

// The text side of the Booking Confirmation PDF: {{token}} substitution and
// flattening the admin's rich-text terms to paragraphs.
void main() {
  final booking = BoardingBooking(
    id: 'bk1',
    reference: 'BK00042',
    customerId: 'c1',
    customerName: 'Jane Smith',
    customerEmail: 'jane@example.com',
    animalIds: const ['a1', 'a2'],
    animalNames: const ['Rex', 'Bella'],
    type: 'boarding',
    startDate: DateTime(2026, 11, 7),
    dropOffTime: '09:00',
    endDate: DateTime(2026, 11, 9),
    pickUpTime: '17:30',
    invoiced: true,
  );
  final invoice = Invoice(
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
  );
  const business = (
    name: 'Pawfect Pets',
    telephone: '01935 717331',
    email: 'info@pawfectpetssherborne.co.uk',
    address: '1 High St, Sherborne DT9 1AA',
    website: '',
    bookingInformation: '',
    bookingTerms: '',
  );

  test('placeholders resolve for the booking, invoice and business', () {
    final vars = bookingPlaceholderVars(booking, invoice, business);
    expect(vars['firstName'], 'Jane');
    expect(vars['petName'], 'Rex and Bella');
    expect(vars['bookingType'], 'Boarding');
    expect(vars['dropOffDate'], 'Saturday, 7 November 2026');
    expect(vars['total'], '£135.00');
    expect(vars['balanceDue'], '£100.00');
    expect(
      interpolateBookingPlaceholders('Hi {{firstName}}, {{petName}} ({{bookingReference}}) owes {{ balanceDue }}. {{nope}}', vars),
      'Hi Jane, Rex and Bella (BK00042) owes £100.00. {{nope}}',
    );
  });

  test('rich-text terms flatten to paragraphs with bullets and entities decoded', () {
    final lines = htmlToParagraphs(
      '<p>Please bring <strong>food &amp; bedding</strong>.</p><ul><li>Vaccinations up to date</li><li>Collar &amp; tag</li></ul>Thanks!<br/>The team',
    );
    expect(lines, [
      'Please bring food & bedding.',
      '• Vaccinations up to date',
      '• Collar & tag',
      'Thanks!',
      'The team',
    ]);
  });

  test('builds a PDF document', () async {
    final bytes = await buildBookingConfirmationPdf(booking: booking, invoice: invoice, business: business);
    expect(bytes.length, greaterThan(1000));
    expect(String.fromCharCodes(bytes.take(5)), '%PDF-');
  });
}

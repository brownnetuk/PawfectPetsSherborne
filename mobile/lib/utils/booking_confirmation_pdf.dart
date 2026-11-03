import 'dart:typed_data';

import 'package:intl/intl.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

import '../models/boarding_booking.dart';
import '../models/invoice.dart';

// Brand palette, as price_list_pdf.dart / the admin's bookingConfirmationPdf.ts.
const _blue = PdfColor.fromInt(0xff0072b5);
const _yellow = PdfColor.fromInt(0xfffdf101);
const _pink = PdfColor.fromInt(0xffd7385e);
const _cream = PdfColor.fromInt(0xfffbf7ee);
const _ink = PdfColor.fromInt(0xff1d2a33);
const _muted = PdfColor.fromInt(0xff5f6f7a);
const _rule = PdfColor.fromInt(0xffd9e6ef);

/// The Settings > Business Info fields the confirmation uses.
typedef ConfirmationBusiness = ({
  String name,
  String telephone,
  String email,
  String address,
  String website,
  // Settings > Boarding: rich-text (HTML) blocks, may contain {{tokens}}.
  String bookingInformation,
  String bookingTerms,
});

/// Fallback when no Booking Terms have been set (the admin's
/// DEFAULT_BOOKING_INFORMATION).
const defaultBookingTerms =
    "We're looking forward to looking after your pet. If anything about this booking needs to change, just get in touch and we'll sort it out.";

final _longDate = DateFormat('EEEE, d MMMM yyyy');
final _money = NumberFormat.currency(locale: 'en_GB', symbol: '£');

String _joinNames(List<String> names) {
  if (names.length <= 1) return names.isEmpty ? '' : names.first;
  return '${names.sublist(0, names.length - 1).join(', ')} and ${names.last}';
}

/// The `{{token}}` values Settings > Boarding > Booking Terms can use,
/// resolved for one booking -- the admin's `buildVars`.
Map<String, String> bookingPlaceholderVars(
  BoardingBooking booking,
  Invoice? invoice,
  ConfirmationBusiness business,
) {
  final balance = invoice == null ? 0.0 : invoice.total - invoice.amountPaid;
  return {
    'customerName': booking.customerName,
    'firstName': booking.customerName.split(' ').first,
    'petName': _joinNames(booking.animalNames),
    'bookingReference': booking.reference,
    'bookingType': booking.isBoarding ? 'Boarding' : 'Day Care',
    'dropOffDate': _longDate.format(booking.startDate.toLocal()),
    'dropOffTime': booking.dropOffTime,
    'pickUpDate': _longDate.format(booking.endDate.toLocal()),
    'pickUpTime': booking.pickUpTime,
    'invoiceNumber': invoice?.invoiceNumber ?? '',
    'total': invoice == null ? '' : _money.format(invoice.total),
    'balanceDue': invoice == null ? '' : _money.format(balance),
    'businessName': business.name,
    'businessPhone': business.telephone,
    'businessEmail': business.email,
    'businessAddress': business.address,
    'businessWebsite': business.website,
  };
}

/// Substitutes every known `{{token}}`; an unknown one is left as-is so a
/// typo shows up in the PDF rather than vanishing (same as the admin).
String interpolateBookingPlaceholders(String text, Map<String, String> vars) =>
    text.replaceAllMapped(RegExp(r'\{\{\s*([A-Za-z0-9_]+)\s*\}\}'), (m) => vars[m.group(1)] ?? m.group(0)!);

/// Flattens the rich-text HTML the admin stores (paragraphs, line breaks,
/// bullet lists, bold/underline) into plain paragraphs for the `pdf`
/// package, which has no HTML renderer. Bullets keep a "•" marker.
List<String> htmlToParagraphs(String html) {
  var s = html
      .replaceAll(RegExp(r'<\s*br\s*/?>', caseSensitive: false), '\n')
      .replaceAll(RegExp(r'<\s*li[^>]*>', caseSensitive: false), '• ')
      .replaceAll(RegExp(r'</\s*(p|li|div|h[1-6]|ul|ol|tr)\s*>', caseSensitive: false), '\n')
      .replaceAll(RegExp(r'<[^>]+>'), '');
  const entities = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&middot;': '·',
    '&pound;': '£',
  };
  entities.forEach((k, v) => s = s.replaceAll(k, v));
  return s.split('\n').map((l) => l.replaceAll(RegExp(r'\s+'), ' ').trim()).where((l) => l.isNotEmpty).toList();
}

/// Builds the customer-facing Booking Confirmation as a branded A4 PDF: the
/// booking and payment cards, the Booking Information text, the Booking
/// Terms, and a contact sign-off -- the staff-app port of the admin's
/// bookingConfirmationPdf.ts (minus the appended invoice pages, which the
/// customer can open from their app or the invoice email).
Future<Uint8List> buildBookingConfirmationPdf({
  required BoardingBooking booking,
  required Invoice? invoice,
  required ConfirmationBusiness business,
  Uint8List? logoBytes,
}) async {
  pw.Font? display, body, bodyBold;
  try {
    display = await PdfGoogleFonts.archivoBlackRegular();
    body = await PdfGoogleFonts.dMSansRegular();
    bodyBold = await PdfGoogleFonts.dMSansBold();
  } catch (_) {}

  pw.TextStyle displayStyle(double size, PdfColor color) => pw.TextStyle(
        font: display,
        fontWeight: display == null ? pw.FontWeight.bold : pw.FontWeight.normal,
        fontSize: size,
        color: color,
      );
  pw.TextStyle bodyStyle(double size, PdfColor color, {bool bold = false}) => pw.TextStyle(
        font: bold ? bodyBold : body,
        fontWeight: bold ? pw.FontWeight.bold : pw.FontWeight.normal,
        fontSize: size,
        color: color,
      );
  pw.Widget yellowBar() => pw.Container(
        width: 34,
        height: 4,
        margin: const pw.EdgeInsets.only(top: 5, bottom: 8),
        decoration: pw.BoxDecoration(color: _yellow, borderRadius: pw.BorderRadius.circular(2)),
      );

  final vars = bookingPlaceholderVars(booking, invoice, business);
  final today = DateFormat('d MMM yyyy').format(DateTime.now());
  final contactLine = [business.telephone, business.email].where((v) => v.trim().isNotEmpty).join('  ·  ');

  final header = pw.Container(
    decoration: pw.BoxDecoration(color: _blue, borderRadius: pw.BorderRadius.circular(14)),
    padding: const pw.EdgeInsets.symmetric(horizontal: 22, vertical: 18),
    child: pw.Row(
      crossAxisAlignment: pw.CrossAxisAlignment.center,
      children: [
        if (logoBytes != null) ...[
          pw.Container(
            width: 78,
            height: 78,
            decoration: const pw.BoxDecoration(color: PdfColors.white, shape: pw.BoxShape.circle),
            alignment: pw.Alignment.center,
            child: pw.Image(pw.MemoryImage(logoBytes), width: 64, height: 64, fit: pw.BoxFit.contain),
          ),
          pw.SizedBox(width: 18),
        ],
        pw.Expanded(
          child: pw.Column(
            crossAxisAlignment: pw.CrossAxisAlignment.start,
            children: [
              pw.Text(business.name.toUpperCase(), style: bodyStyle(11, _cream, bold: true).copyWith(letterSpacing: 2)),
              pw.SizedBox(height: 4),
              pw.Text('Booking confirmed', style: displayStyle(28, _cream)),
              pw.Text('for ${booking.customerName}', style: bodyStyle(12, _cream)),
            ],
          ),
        ),
        pw.Column(
          crossAxisAlignment: pw.CrossAxisAlignment.end,
          children: [
            pw.Text('REFERENCE', style: bodyStyle(8, _cream, bold: true).copyWith(letterSpacing: 1.5)),
            pw.SizedBox(height: 3),
            pw.Container(
              decoration: pw.BoxDecoration(color: _yellow, borderRadius: pw.BorderRadius.circular(10)),
              padding: const pw.EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              child: pw.Text(booking.reference, style: displayStyle(11, _blue)),
            ),
          ],
        ),
      ],
    ),
  );

  pw.Widget fieldRow(String label, String value, {bool last = false, bool strong = false}) => pw.Container(
        padding: const pw.EdgeInsets.symmetric(vertical: 5),
        decoration: last
            ? null
            : const pw.BoxDecoration(border: pw.Border(bottom: pw.BorderSide(color: _rule, width: 0.8))),
        child: pw.Row(
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: [
            pw.SizedBox(width: 78, child: pw.Text(label, style: bodyStyle(10, _muted))),
            pw.Expanded(
              child: pw.Text(value, style: bodyStyle(10.5, strong ? _pink : _ink, bold: strong)),
            ),
          ],
        ),
      );

  pw.Widget card(String title, List<pw.Widget> rows) => pw.Container(
        decoration: pw.BoxDecoration(color: _cream, borderRadius: pw.BorderRadius.circular(12)),
        padding: const pw.EdgeInsets.fromLTRB(16, 14, 16, 10),
        child: pw.Column(
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: [pw.Text(title, style: displayStyle(14, _blue)), yellowBar(), ...rows],
        ),
      );

  final balanceDue = invoice == null ? 0.0 : invoice.total - invoice.amountPaid;
  final bookingCard = card('Your booking', [
    fieldRow(booking.animalNames.length > 1 ? 'Pets' : 'Pet', booking.animalNames.isEmpty ? '—' : booking.animalNames.join(', ')),
    fieldRow('Type', booking.isBoarding ? 'Boarding' : 'Day Care'),
    fieldRow('Drop off', '${_longDate.format(booking.startDate.toLocal())}, ${booking.dropOffTime}'),
    fieldRow('Pick up', '${_longDate.format(booking.endDate.toLocal())}, ${booking.pickUpTime}', last: (booking.notes ?? '').trim().isEmpty),
    if ((booking.notes ?? '').trim().isNotEmpty) fieldRow('Notes', booking.notes!.trim(), last: true),
  ]);
  final paymentCard = card('Payment', [
    if (invoice == null)
      fieldRow('Status', 'Not yet invoiced', last: true)
    else ...[
      fieldRow('Invoice', invoice.invoiceNumber),
      fieldRow('Total', _money.format(invoice.total)),
      fieldRow('Payments received', _money.format(invoice.amountPaid)),
      fieldRow(balanceDue > 0 ? 'Balance due' : 'Status', balanceDue > 0 ? _money.format(balanceDue) : 'Paid in full',
          last: true, strong: true),
    ],
  ]);

  pw.Widget paragraphs(List<String> lines) => pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          for (final line in lines)
            pw.Padding(
              padding: const pw.EdgeInsets.only(bottom: 5),
              child: pw.Paragraph(text: line, style: bodyStyle(10.5, _ink).copyWith(lineSpacing: 2), margin: pw.EdgeInsets.zero),
            ),
        ],
      );

  final information = htmlToParagraphs(interpolateBookingPlaceholders(business.bookingInformation, vars));
  final termsSource = business.bookingTerms.trim().isEmpty ? defaultBookingTerms : business.bookingTerms;
  final terms = htmlToParagraphs(interpolateBookingPlaceholders(termsSource, vars));

  final signOff = pw.Container(
    margin: const pw.EdgeInsets.only(top: 18),
    decoration: pw.BoxDecoration(color: _pink, borderRadius: pw.BorderRadius.circular(12)),
    padding: const pw.EdgeInsets.symmetric(horizontal: 18, vertical: 11),
    child: pw.Row(
      mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
      children: [
        pw.Text('Questions? Just get in touch', style: bodyStyle(14, PdfColors.white, bold: true)),
        pw.Text(contactLine, style: bodyStyle(12, PdfColors.white)),
      ],
    ),
  );

  final doc = pw.Document();
  doc.addPage(pw.MultiPage(
    pageFormat: PdfPageFormat.a4,
    margin: const pw.EdgeInsets.all(40),
    build: (_) => [
      header,
      pw.SizedBox(height: 16),
      pw.Row(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          pw.Expanded(child: bookingCard),
          pw.SizedBox(width: 14),
          pw.Expanded(child: paymentCard),
        ],
      ),
      if (information.isNotEmpty) ...[pw.SizedBox(height: 16), paragraphs(information)],
      pw.SizedBox(height: 18),
      pw.Text('Booking terms', style: displayStyle(16, _blue)),
      yellowBar(),
      paragraphs(terms),
      signOff,
      pw.Padding(
        padding: const pw.EdgeInsets.only(top: 6),
        child: pw.Align(
          alignment: pw.Alignment.centerRight,
          child: pw.Text('Generated $today', style: bodyStyle(9.5, _muted)),
        ),
      ),
    ],
  ));
  return doc.save();
}

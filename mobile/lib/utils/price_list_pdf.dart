import 'dart:typed_data';

import 'package:intl/intl.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

import '../models/product.dart';

// Brand palette from the admin's booking confirmation PDF
// (admin/src/pdf/bookingConfirmationPdf.ts) -- the Pawfect Pets social posts:
// bold blue ground, yellow highlights, pink call-out band, cream cards,
// Archivo Black display over DM Sans body.
const _blue = PdfColor.fromInt(0xff0072b5);
const _yellow = PdfColor.fromInt(0xfffdf101);
const _pink = PdfColor.fromInt(0xffd7385e);
const _cream = PdfColor.fromInt(0xfffbf7ee);
const _ink = PdfColor.fromInt(0xff1d2a33);
const _muted = PdfColor.fromInt(0xff5f6f7a);
const _rule = PdfColor.fromInt(0xffd9e6ef);

/// Builds the customer-facing price list as a branded A4 PDF, styled the same
/// as the booking confirmation.
Future<Uint8List> buildPriceListPdf({
  required List<Product> products,
  required String businessName,
  required String contactLine,
  Uint8List? logoBytes,
}) async {
  // Same faces the booking confirmation uses, fetched from Google Fonts --
  // fall back to the built-ins offline rather than failing the send.
  pw.Font? display, body, bodyBold;
  try {
    display = await PdfGoogleFonts.archivoBlackRegular();
    body = await PdfGoogleFonts.dMSansRegular();
    bodyBold = await PdfGoogleFonts.dMSansBold();
  } catch (_) {}

  final doc = pw.Document();
  final money = NumberFormat.currency(locale: 'en_GB', symbol: '£');
  final today = DateFormat('d MMM yyyy').format(DateTime.now());

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
        decoration: pw.BoxDecoration(
          color: _yellow,
          borderRadius: pw.BorderRadius.circular(2),
        ),
      );

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
              pw.Text(
                businessName.toUpperCase(),
                style: bodyStyle(11, _cream, bold: true).copyWith(letterSpacing: 2),
              ),
              pw.SizedBox(height: 4),
              pw.Text('Price list', style: displayStyle(30, _cream)),
            ],
          ),
        ),
        pw.Container(
          decoration: pw.BoxDecoration(color: _yellow, borderRadius: pw.BorderRadius.circular(999)),
          padding: const pw.EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          child: pw.Text(today, style: displayStyle(11, _blue)),
        ),
      ],
    ),
  );

  pw.Widget productRow(Product p, {required bool last}) => pw.Container(
        padding: const pw.EdgeInsets.symmetric(vertical: 6),
        decoration: last
            ? null
            : const pw.BoxDecoration(
                border: pw.Border(bottom: pw.BorderSide(color: _rule, width: 0.8)),
              ),
        child: pw.Row(
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: [
            pw.Expanded(
              child: pw.Column(
                crossAxisAlignment: pw.CrossAxisAlignment.start,
                children: [
                  pw.Text(p.name, style: bodyStyle(13, _ink, bold: true)),
                  if ((p.description ?? '').trim().isNotEmpty)
                    pw.Padding(
                      padding: const pw.EdgeInsets.only(top: 1),
                      child: pw.Text(p.description!.trim(), style: bodyStyle(10.5, _muted)),
                    ),
                ],
              ),
            ),
            pw.SizedBox(width: 12),
            pw.Text(money.format(p.price), style: bodyStyle(13, _blue, bold: true)),
          ],
        ),
      );

  // One cream card per chunk so a long list paginates cleanly (a single
  // background container can't split across pages).
  const chunkSize = 12;
  final cards = <pw.Widget>[];
  for (var start = 0; start < products.length; start += chunkSize) {
    final chunk = products.sublist(
        start, start + chunkSize > products.length ? products.length : start + chunkSize);
    cards.add(pw.Container(
      margin: const pw.EdgeInsets.only(top: 16),
      decoration: pw.BoxDecoration(color: _cream, borderRadius: pw.BorderRadius.circular(12)),
      padding: const pw.EdgeInsets.fromLTRB(16, 14, 16, 10),
      child: pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          if (start == 0) ...[
            pw.Text('Our prices', style: displayStyle(16, _blue)),
            yellowBar(),
          ],
          for (var i = 0; i < chunk.length; i++)
            productRow(chunk[i], last: i == chunk.length - 1),
        ],
      ),
    ));
  }

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

  doc.addPage(pw.MultiPage(
    pageFormat: PdfPageFormat.a4,
    margin: const pw.EdgeInsets.all(40),
    build: (_) => [
      header,
      ...cards,
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

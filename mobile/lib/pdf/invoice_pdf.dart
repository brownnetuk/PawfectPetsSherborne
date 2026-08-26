import 'dart:typed_data';
import 'package:intl/intl.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import '../models/business_info.dart';
import '../models/invoice.dart';

/// Renders [invoice] as a branded A4 invoice PDF, returning the bytes for
/// display/printing/sharing. Layout mirrors the web apps' invoice PDF at a
/// high level (header, bill-to, line-item table, totals, bank details).
Future<Uint8List> buildInvoicePdf(Invoice invoice, BusinessInfo business) async {
  final doc = pw.Document();
  final money = NumberFormat.currency(locale: 'en_GB', symbol: '£');
  final dateFmt = DateFormat('d MMM yyyy');

  final accent = PdfColor.fromInt(0xFF2F7A4F);
  final grey = PdfColor.fromInt(0xFF6B7280);

  final businessLines = <String>[
    if ((business.address ?? '').isNotEmpty) business.address!,
    [business.town, business.postcode].where((s) => (s ?? '').isNotEmpty).join(', '),
    if ((business.telephone ?? '').isNotEmpty) 'Tel: ${business.telephone}',
    if ((business.email ?? '').isNotEmpty) business.email!,
    if ((business.website ?? '').isNotEmpty) business.website!,
  ].where((s) => s.isNotEmpty).toList();

  final customer = invoice.customer;
  final billToLines = <String>[
    customer.name,
    if ((customer.address ?? '').isNotEmpty) customer.address!,
    if ((customer.phoneNumber ?? '').isNotEmpty) customer.phoneNumber!,
    if (customer.email.isNotEmpty) customer.email,
  ];

  doc.addPage(
    pw.Page(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.all(36),
      build: (context) {
        return pw.Column(
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: [
            // Header: business (left) + INVOICE title (right)
            pw.Row(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
              children: [
                pw.Column(
                  crossAxisAlignment: pw.CrossAxisAlignment.start,
                  children: [
                    pw.Text(
                      business.name ?? 'Invoice',
                      style: pw.TextStyle(fontSize: 18, fontWeight: pw.FontWeight.bold, color: accent),
                    ),
                    pw.SizedBox(height: 4),
                    ...businessLines.map(
                      (l) => pw.Text(l, style: pw.TextStyle(fontSize: 9, color: grey)),
                    ),
                  ],
                ),
                pw.Column(
                  crossAxisAlignment: pw.CrossAxisAlignment.end,
                  children: [
                    pw.Text('INVOICE', style: pw.TextStyle(fontSize: 22, fontWeight: pw.FontWeight.bold)),
                    pw.SizedBox(height: 4),
                    pw.Text(invoice.invoiceNumber, style: const pw.TextStyle(fontSize: 11)),
                    pw.Text('Status: ${invoice.status}', style: pw.TextStyle(fontSize: 9, color: grey)),
                  ],
                ),
              ],
            ),
            pw.SizedBox(height: 24),

            // Bill-to + dates
            pw.Row(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
              children: [
                pw.Column(
                  crossAxisAlignment: pw.CrossAxisAlignment.start,
                  children: [
                    pw.Text('BILL TO', style: pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold, color: grey)),
                    pw.SizedBox(height: 4),
                    ...billToLines.map((l) => pw.Text(l, style: const pw.TextStyle(fontSize: 10))),
                  ],
                ),
                pw.Column(
                  crossAxisAlignment: pw.CrossAxisAlignment.end,
                  children: [
                    _dateRow('Issue date', dateFmt.format(invoice.issueDate)),
                    _dateRow('Due date', dateFmt.format(invoice.dueDate)),
                    if ((invoice.subject ?? '').isNotEmpty) _dateRow('Subject', invoice.subject!),
                  ],
                ),
              ],
            ),
            pw.SizedBox(height: 20),

            // Line items table
            pw.Table(
              border: pw.TableBorder(bottom: pw.BorderSide(color: PdfColor.fromInt(0xFFE5E7EB))),
              columnWidths: {
                0: const pw.FlexColumnWidth(5),
                1: const pw.FlexColumnWidth(1),
                2: const pw.FlexColumnWidth(2),
                3: const pw.FlexColumnWidth(1.5),
                4: const pw.FlexColumnWidth(2),
              },
              children: [
                pw.TableRow(
                  decoration: pw.BoxDecoration(color: PdfColor.fromInt(0xFFF3F4F6)),
                  children: [
                    _th('Description'),
                    _th('Qty', align: pw.TextAlign.right),
                    _th('Unit', align: pw.TextAlign.right),
                    _th('Disc', align: pw.TextAlign.right),
                    _th('Amount', align: pw.TextAlign.right),
                  ],
                ),
                ...invoice.lineItems.map(
                  (item) => pw.TableRow(
                    children: [
                      _td(item.description),
                      _td(_trimNum(item.quantity), align: pw.TextAlign.right),
                      _td(money.format(item.unitPrice), align: pw.TextAlign.right),
                      _td(item.discountPercent > 0 ? '${_trimNum(item.discountPercent)}%' : '—',
                          align: pw.TextAlign.right),
                      _td(money.format(item.lineTotal), align: pw.TextAlign.right),
                    ],
                  ),
                ),
              ],
            ),
            pw.SizedBox(height: 12),

            // Totals
            pw.Align(
              alignment: pw.Alignment.centerRight,
              child: pw.SizedBox(
                width: 220,
                child: pw.Column(
                  children: [
                    _totalRow('Subtotal', money.format(invoice.subtotal)),
                    _totalRow('Total', money.format(invoice.total), bold: true),
                    if (invoice.amountPaid > 0) _totalRow('Paid', money.format(invoice.amountPaid)),
                    if (invoice.amountPaid > 0)
                      _totalRow('Balance due', money.format(invoice.balanceDue), bold: true),
                  ],
                ),
              ),
            ),

            pw.Spacer(),

            // Payment terms + bank details + notes
            if ((invoice.paymentTerms ?? '').isNotEmpty) ...[
              pw.Text('Payment terms', style: pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold, color: grey)),
              pw.Text(invoice.paymentTerms!, style: const pw.TextStyle(fontSize: 10)),
              pw.SizedBox(height: 10),
            ],
            if ((business.bankName ?? '').isNotEmpty ||
                (business.accountNumber ?? '').isNotEmpty) ...[
              pw.Text('Bank details', style: pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold, color: grey)),
              pw.Text(
                [
                  if ((business.bankName ?? '').isNotEmpty) business.bankName,
                  if ((business.sortCode ?? '').isNotEmpty) 'Sort code: ${business.sortCode}',
                  if ((business.accountNumber ?? '').isNotEmpty) 'Account: ${business.accountNumber}',
                ].where((s) => s != null).join('   '),
                style: const pw.TextStyle(fontSize: 10),
              ),
              pw.SizedBox(height: 10),
            ],
            if ((business.invoiceNotesMessage ?? '').isNotEmpty)
              pw.Text(business.invoiceNotesMessage!, style: pw.TextStyle(fontSize: 9, color: grey)),
          ],
        );
      },
    ),
  );

  return doc.save();
}

pw.Widget _dateRow(String label, String value) => pw.Padding(
      padding: const pw.EdgeInsets.only(bottom: 2),
      child: pw.Row(
        mainAxisAlignment: pw.MainAxisAlignment.end,
        children: [
          pw.Text('$label: ', style: pw.TextStyle(fontSize: 9, color: PdfColor.fromInt(0xFF6B7280))),
          pw.Text(value, style: const pw.TextStyle(fontSize: 9)),
        ],
      ),
    );

pw.Widget _th(String text, {pw.TextAlign align = pw.TextAlign.left}) => pw.Padding(
      padding: const pw.EdgeInsets.symmetric(horizontal: 6, vertical: 6),
      child: pw.Text(text,
          textAlign: align, style: pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold)),
    );

pw.Widget _td(String text, {pw.TextAlign align = pw.TextAlign.left}) => pw.Padding(
      padding: const pw.EdgeInsets.symmetric(horizontal: 6, vertical: 5),
      child: pw.Text(text, textAlign: align, style: const pw.TextStyle(fontSize: 10)),
    );

pw.Widget _totalRow(String label, String value, {bool bold = false}) => pw.Padding(
      padding: const pw.EdgeInsets.symmetric(vertical: 2),
      child: pw.Row(
        mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
        children: [
          pw.Text(label, style: pw.TextStyle(fontSize: 10, fontWeight: bold ? pw.FontWeight.bold : null)),
          pw.Text(value, style: pw.TextStyle(fontSize: 10, fontWeight: bold ? pw.FontWeight.bold : null)),
        ],
      ),
    );

/// Drops a trailing ".0" so whole numbers read "2" not "2.0".
String _trimNum(double v) => v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toString();

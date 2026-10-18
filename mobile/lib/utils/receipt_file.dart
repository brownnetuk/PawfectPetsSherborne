import 'dart:convert';
import 'dart:typed_data';
import 'package:intl/intl.dart';

// Expense receipts are base64 data URIs (images or PDFs) with a receiptName
// of Date-Payee-Amount.ext, e.g. 08-10-2026-Amazon-9.99.pdf -- the same
// scheme as the admin app's utils/receiptFile.ts.

const _mimeExtensions = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

/// The MIME type of a data URI, e.g. "application/pdf".
String receiptMimeType(String dataUri) =>
    RegExp(r'^data:([^;,]+)').firstMatch(dataUri)?.group(1)?.toLowerCase() ?? '';

bool isPdfReceipt(String dataUri) => receiptMimeType(dataUri) == 'application/pdf';

Uint8List receiptBytes(String dataUri) => base64Decode(dataUri.split(',').last);

/// The extension to keep: the stored receiptName's, else one inferred from
/// the data URI.
String receiptExtension(String? receiptName, String dataUri) {
  final fromName = receiptName == null ? null : RegExp(r'\.([A-Za-z0-9]{1,5})$').firstMatch(receiptName)?.group(1);
  return fromName?.toLowerCase() ?? _mimeExtensions[receiptMimeType(dataUri)] ?? 'bin';
}

// Letters, digits, dots and underscores pass through; any other run of
// characters becomes a single "-".
String _safePart(String value) => value
    .replaceAll(RegExp(r'[^A-Za-z0-9._]+'), '-')
    .replaceAll(RegExp(r'^[-.]+|[-.]+$'), '');

/// Date-Payee-Amount.ext, e.g. 08-10-2026-Amazon-9.99.pdf.
String receiptFileName(DateTime date, String? payee, double amount, String ext) {
  final payeePart = _safePart(payee ?? '');
  final parts = [
    DateFormat('dd-MM-yyyy').format(date),
    payeePart.isEmpty ? 'No-payee' : payeePart,
    amount.isFinite ? amount.toStringAsFixed(2) : '0.00',
  ];
  final safeExt = _safePart(ext).toLowerCase();
  return '${parts.join('-')}.${safeExt.isEmpty ? 'bin' : safeExt}';
}

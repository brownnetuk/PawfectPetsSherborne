import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_widget_from_html_core/flutter_widget_from_html_core.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../models/portal_models.dart';
import '../../state/auth_provider.dart';

/// Read-only: the business's terms & conditions with the customer's signature
/// shown at the bottom.
class AgreementScreen extends StatelessWidget {
  const AgreementScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final profile = context.watch<AuthProvider>().profile;
    final terms = profile?.terms;
    final agreement = profile?.agreement;
    return Scaffold(
      appBar: AppBar(title: const Text('Agreement')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('Terms & Conditions', style: Theme.of(context).textTheme.titleLarge),
          if (terms?.version != null || terms?.documentDate != null) ...[
            const SizedBox(height: 4),
            Text(
              [
                if (terms?.version != null && terms!.version!.isNotEmpty) 'Version ${terms.version}',
                if (terms?.documentDate != null && terms!.documentDate!.isNotEmpty) terms.documentDate,
              ].join('  ·  '),
              style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
            ),
          ],
          const SizedBox(height: 12),
          if ((terms?.html ?? '').trim().isEmpty)
            Text('The terms & conditions aren\'t available right now.',
                style: TextStyle(color: Colors.grey.shade600))
          else
            HtmlWidget(terms!.html),
          const Divider(height: 40),
          _SignatureBlock(agreement: agreement),
        ],
      ),
    );
  }
}

class _SignatureBlock extends StatelessWidget {
  final Agreement? agreement;
  const _SignatureBlock({required this.agreement});

  @override
  Widget build(BuildContext context) {
    final a = agreement;
    if (a == null || !a.isSigned) {
      return Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: const Color(0xFFFDF1E0), borderRadius: BorderRadius.circular(8)),
        child: const Text('You haven\'t signed the agreement yet.'),
      );
    }
    final sig = _decodeSignature(a.signatureImage);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Signed', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        if (sig != null)
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              border: Border.all(color: const Color(0xFFE5E7EB)),
              borderRadius: BorderRadius.circular(8),
              color: Colors.white,
            ),
            child: Image.memory(sig, height: 90, fit: BoxFit.contain),
          ),
        const SizedBox(height: 8),
        Text(a.signedName!, style: const TextStyle(fontWeight: FontWeight.w600)),
        if (a.signedAt != null)
          Text('Signed ${DateFormat('d MMM yyyy').format(a.signedAt!.toLocal())}',
              style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
      ],
    );
  }

  // Signature is stored as a base64 data URI (or bare base64); decode to bytes.
  Uint8List? _decodeSignature(String? raw) {
    if (raw == null || raw.isEmpty) return null;
    try {
      final b64 = raw.contains(',') ? raw.substring(raw.indexOf(',') + 1) : raw;
      return base64Decode(b64);
    } catch (_) {
      return null;
    }
  }
}

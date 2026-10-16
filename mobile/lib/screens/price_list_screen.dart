import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/product.dart';
import '../utils/price_list_pdf.dart';

/// The customer-facing price sheet: every product flagged "Display in Price
/// List" in the admin's Settings > Invoice/Quotes > Products, with an A-Z /
/// Z-A sort toggle and a mail action that emails it as a branded PDF (same
/// style as the booking confirmation) to a typed-in name and address.
class PriceListScreen extends StatefulWidget {
  const PriceListScreen({super.key});

  @override
  State<PriceListScreen> createState() => _PriceListScreenState();
}

class _PriceListScreenState extends State<PriceListScreen> {
  late Future<List<Product>> _future;
  bool _sortAsc = true;
  bool _sending = false;
  static final _money = NumberFormat.currency(locale: 'en_GB', symbol: '£');

  @override
  void initState() {
    super.initState();
    _future = context.read<Repository>().listProducts();
  }

  List<Product> _visible(List<Product> all) =>
      all.where((p) => p.displayInPriceList).toList()
        ..sort((a, b) => _sortAsc
            ? a.name.toLowerCase().compareTo(b.name.toLowerCase())
            : b.name.toLowerCase().compareTo(a.name.toLowerCase()));

  /// Prompts for a name and email, builds the branded PDF and emails it.
  Future<void> _emailPriceList() async {
    final products = _visible(await _future);
    if (!mounted) return;
    if (products.isEmpty) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('No products are on the price list yet.')));
      return;
    }
    final nameController = TextEditingController();
    final emailController = TextEditingController();
    final send = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Email price list'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: nameController,
              autofocus: true,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(labelText: 'Name'),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: emailController,
              keyboardType: TextInputType.emailAddress,
              autocorrect: false,
              decoration: const InputDecoration(labelText: 'Email address'),
            ),
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false), child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.of(dialogContext).pop(true), child: const Text('Send')),
        ],
      ),
    );
    final name = nameController.text.trim();
    final email = emailController.text.trim();
    nameController.dispose();
    emailController.dispose();
    if (send != true || !mounted) return;
    if (name.isEmpty || !email.contains('@') || !email.contains('.')) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Enter a name and valid email address.')));
      return;
    }

    setState(() => _sending = true);
    try {
      final repo = context.read<Repository>();
      final business = await repo.getBusinessContact();
      final logo = await repo.getBusinessLogo();
      final pdfBytes = await buildPriceListPdf(
        products: products,
        businessName: business.name,
        contactLine: business.contactLine,
        logoBytes: logo,
      );
      await repo.sendPriceListEmail(
        recipientName: name,
        recipientEmail: email,
        attachmentData: 'data:application/pdf;base64,${base64Encode(pdfBytes)}',
        attachmentName: 'Price List.pdf',
      );
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Price list emailed to $email')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(e is ApiException ? e.message : 'Failed to email the price list')));
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final primary = Theme.of(context).colorScheme.primary;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Price List'),
        actions: [
          IconButton(
            icon: _sending
                ? const SizedBox(
                    width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.mail_outline),
            tooltip: 'Email price list',
            onPressed: _sending ? null : _emailPriceList,
          ),
          TextButton.icon(
            onPressed: () => setState(() => _sortAsc = !_sortAsc),
            icon: const Icon(Icons.sort_by_alpha, size: 18),
            label: Text(_sortAsc ? 'A-Z' : 'Z-A'),
          ),
        ],
      ),
      body: FutureBuilder<List<Product>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            final message = snapshot.error is ApiException
                ? (snapshot.error as ApiException).message
                : 'Failed to load the price list';
            return Center(child: Text(message, textAlign: TextAlign.center));
          }
          final products = _visible(snapshot.data ?? []);
          if (products.isEmpty) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Text(
                  'No products are on the price list yet. Tick "Display in Price List" on a product in the admin\'s Settings > Invoice/Quotes.',
                  textAlign: TextAlign.center,
                ),
              ),
            );
          }
          return ListView.builder(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 24),
            itemCount: products.length,
            itemBuilder: (context, i) {
              final p = products[i];
              return Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(p.name,
                                style:
                                    const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
                            if ((p.description ?? '').trim().isNotEmpty)
                              Padding(
                                padding: const EdgeInsets.only(top: 2),
                                child: Text(
                                  p.description!.trim(),
                                  style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
                                ),
                              ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 12),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: primary.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          _money.format(p.price),
                          style: TextStyle(
                              fontWeight: FontWeight.w700, fontSize: 14, color: primary),
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}

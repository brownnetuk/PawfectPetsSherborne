import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/product.dart';
import '../models/visit_mapping.dart';
import '../theme.dart';
import '../utils/price_list_pdf.dart';

/// The customer-facing price sheet: every product flagged "Display in Price
/// List" in the admin's Settings > Invoice/Quotes > Products, with a search
/// box, Walks / Visits / Day Care / Boarding filter pills (sorted into those
/// groups by the Settings > Bookings product mappings, the same way the
/// calendar is), an A-Z / Z-A sort toggle and a mail action that emails the
/// whole list as a branded PDF (same style as the booking confirmation) to a
/// typed-in name and address.
class PriceListScreen extends StatefulWidget {
  const PriceListScreen({super.key});

  @override
  State<PriceListScreen> createState() => _PriceListScreenState();
}

/// The filter pills. Walks is everything not mapped to Visits, Day Care or
/// Boarding -- the calendar's definition of a Walk.
enum _Group { all, walks, visits, dayCare, boarding }

extension on _Group {
  String get label => switch (this) {
        _Group.all => 'All',
        _Group.walks => 'Walks',
        _Group.visits => 'Visits',
        _Group.dayCare => 'Day Care',
        _Group.boarding => 'Boarding',
      };
}

class _PriceListScreenState extends State<PriceListScreen> {
  late Future<({List<Product> products, VisitMapping mapping})> _future;
  final _searchController = TextEditingController();
  String _search = '';
  _Group _group = _Group.all;
  bool _sortAsc = true;
  bool _sending = false;
  static final _money = NumberFormat.currency(locale: 'en_GB', symbol: '£');

  @override
  void initState() {
    super.initState();
    final repo = context.read<Repository>();
    _future = Future.wait([repo.listProducts(), repo.getVisitMapping()]).then(
      (results) => (products: results[0] as List<Product>, mapping: results[1] as VisitMapping),
    );
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  /// Everything on the price list, sorted -- what the emailed PDF contains,
  /// regardless of the search box and pills.
  List<Product> _listed(List<Product> all) =>
      all.where((p) => p.displayInPriceList).toList()
        ..sort((a, b) => _sortAsc
            ? a.name.toLowerCase().compareTo(b.name.toLowerCase())
            : b.name.toLowerCase().compareTo(a.name.toLowerCase()));

  _Group _groupOf(Product p, VisitMapping mapping) {
    // The half-day boarding slots aren't part of isBoardingProduct (the
    // calendar tells boarding stays apart by boardingStay instead), but on a
    // price sheet they belong with Boarding.
    if (mapping.isBoardingProduct(p.id) ||
        p.id == mapping.boardingHalfDay ||
        p.id == mapping.boardingSecondDogHalfDay) {
      return _Group.boarding;
    }
    if (mapping.isDayCareProduct(p.id)) return _Group.dayCare;
    if (mapping.isVisitProduct(p.id)) return _Group.visits;
    return _Group.walks;
  }

  /// The listed products narrowed by the selected pill and the search text
  /// (name, description or product code, case-insensitive).
  List<Product> _visible(List<Product> all, VisitMapping mapping) {
    final q = _search.trim().toLowerCase();
    return _listed(all).where((p) {
      if (_group != _Group.all && _groupOf(p, mapping) != _group) return false;
      if (q.isEmpty) return true;
      return p.name.toLowerCase().contains(q) ||
          (p.description ?? '').toLowerCase().contains(q) ||
          p.productCode.toLowerCase().contains(q);
    }).toList();
  }

  /// Prompts for a name and email, builds the branded PDF and emails it.
  Future<void> _emailPriceList() async {
    final data = await _future;
    final products = _listed(data.products);
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
      // Same groups as the filter pills, in pill order, skipping any with
      // nothing listed.
      final sections = [
        for (final group in _Group.values.where((g) => g != _Group.all))
          (
            heading: group.label,
            products: products.where((p) => _groupOf(p, data.mapping) == group).toList(),
          ),
      ].where((s) => s.products.isNotEmpty).toList();
      final pdfBytes = await buildPriceListPdf(
        sections: sections,
        businessName: business.name,
        contactLine: business.contactLine,
        information: business.priceListInformation,
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
            style: TextButton.styleFrom(foregroundColor: Colors.white),
            onPressed: () => setState(() => _sortAsc = !_sortAsc),
            icon: const Icon(Icons.sort_by_alpha, size: 18),
            label: Text(_sortAsc ? 'A-Z' : 'Z-A'),
          ),
        ],
        // Search box and the sliding filter pills live on the blue band, the
        // same arrangement as the Customers tab's search and status filter.
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(104),
          child: OnBrandBar(
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
                  child: TextField(
                    controller: _searchController,
                    textInputAction: TextInputAction.search,
                    onSubmitted: (_) => FocusScope.of(context).unfocus(),
                    onTapOutside: (_) => FocusScope.of(context).unfocus(),
                    decoration: InputDecoration(
                      hintText: 'Search products…',
                      prefixIcon: const Icon(Icons.search),
                      isDense: true,
                      suffixIcon: _search.isEmpty
                          ? null
                          : IconButton(
                              icon: const Icon(Icons.close),
                              tooltip: 'Clear',
                              onPressed: () {
                                _searchController.clear();
                                setState(() => _search = '');
                                FocusScope.of(context).unfocus();
                              },
                            ),
                    ),
                    onChanged: (v) => setState(() => _search = v),
                  ),
                ),
                SizedBox(
                  height: 48,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    children: [
                      for (final group in _Group.values)
                        Padding(
                          padding: const EdgeInsets.only(right: 6),
                          child: FilterChip(
                            label: Text(group.label),
                            selected: _group == group,
                            showCheckmark: false,
                            onSelected: (_) => setState(() => _group = group),
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
      body: FutureBuilder<({List<Product> products, VisitMapping mapping})>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError || snapshot.data == null) {
            final message = snapshot.error is ApiException
                ? (snapshot.error as ApiException).message
                : 'Failed to load the price list';
            return Center(child: Text(message, textAlign: TextAlign.center));
          }
          final data = snapshot.data!;
          if (_listed(data.products).isEmpty) {
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
          final products = _visible(data.products, data.mapping);
          if (products.isEmpty) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  _search.trim().isEmpty
                      ? 'No ${_group.label.toLowerCase()} products are on the price list.'
                      : 'No products match "${_search.trim()}".',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: brandMuted),
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

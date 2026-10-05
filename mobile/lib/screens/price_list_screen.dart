import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/product.dart';

/// The customer-facing price sheet: every product flagged "Display in Price
/// List" in the admin's Settings > Invoice/Quotes > Products, with an A-Z /
/// Z-A sort toggle in the app bar.
class PriceListScreen extends StatefulWidget {
  const PriceListScreen({super.key});

  @override
  State<PriceListScreen> createState() => _PriceListScreenState();
}

class _PriceListScreenState extends State<PriceListScreen> {
  late Future<List<Product>> _future;
  bool _sortAsc = true;
  static final _money = NumberFormat.currency(locale: 'en_GB', symbol: '£');

  @override
  void initState() {
    super.initState();
    _future = context.read<Repository>().listProducts();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Price List'),
        actions: [
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
          final products = (snapshot.data ?? []).where((p) => p.displayInPriceList).toList()
            ..sort((a, b) => _sortAsc
                ? a.name.toLowerCase().compareTo(b.name.toLowerCase())
                : b.name.toLowerCase().compareTo(a.name.toLowerCase()));
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
          return ListView.separated(
            padding: const EdgeInsets.symmetric(vertical: 8),
            itemCount: products.length,
            separatorBuilder: (_, _) => const Divider(height: 1),
            itemBuilder: (context, i) {
              final p = products[i];
              return ListTile(
                title: Text(p.name),
                subtitle: (p.description ?? '').trim().isNotEmpty ? Text(p.description!) : null,
                trailing: Text(
                  _money.format(p.price),
                  style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
                ),
              );
            },
          );
        },
      ),
    );
  }
}

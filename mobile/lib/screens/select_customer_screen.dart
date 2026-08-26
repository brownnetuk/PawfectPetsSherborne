import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/customer.dart';

/// Searchable customer list that returns the chosen [Customer] via
/// Navigator.pop — used as the first step of raising an invoice.
class SelectCustomerScreen extends StatefulWidget {
  const SelectCustomerScreen({super.key});

  @override
  State<SelectCustomerScreen> createState() => _SelectCustomerScreenState();
}

class _SelectCustomerScreenState extends State<SelectCustomerScreen> {
  late Future<List<Customer>> _future;
  String _search = '';

  @override
  void initState() {
    super.initState();
    _future = context.read<Repository>().listCustomers();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Select customer'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(56),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: TextField(
              decoration: const InputDecoration(
                hintText: 'Search by name or email…',
                prefixIcon: Icon(Icons.search),
                isDense: true,
              ),
              onChanged: (v) => setState(() => _search = v.toLowerCase()),
            ),
          ),
        ),
      ),
      body: FutureBuilder<List<Customer>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            final message = snapshot.error is ApiException
                ? (snapshot.error as ApiException).message
                : 'Failed to load customers';
            return Center(child: Text(message, textAlign: TextAlign.center));
          }
          final customers = (snapshot.data ?? [])
              .where((c) =>
                  _search.isEmpty ||
                  c.name.toLowerCase().contains(_search) ||
                  c.email.toLowerCase().contains(_search))
              .toList();
          if (customers.isEmpty) {
            return Center(child: Text(_search.isEmpty ? 'No customers yet.' : 'No matches.'));
          }
          return ListView.separated(
            padding: const EdgeInsets.symmetric(vertical: 8),
            itemCount: customers.length,
            separatorBuilder: (_, _) => const Divider(height: 1),
            itemBuilder: (context, i) {
              final c = customers[i];
              return ListTile(
                title: Text(c.name),
                subtitle: Text(c.email),
                onTap: () => Navigator.of(context).pop(c),
              );
            },
          );
        },
      ),
    );
  }
}

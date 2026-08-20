import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/customer.dart';
import '../widgets/status_badge.dart';
import 'customer_detail_screen.dart';
import 'home_shell.dart';

class CustomersScreen extends StatefulWidget {
  const CustomersScreen({super.key});

  @override
  State<CustomersScreen> createState() => _CustomersScreenState();
}

class _CustomersScreenState extends State<CustomersScreen> {
  late Future<List<Customer>> _future;
  String _search = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    _future = context.read<Repository>().listCustomers();
  }

  Future<void> _refresh() async {
    setState(_load);
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Customers'),
        actions: const [LogoutAction()],
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
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: FutureBuilder<List<Customer>>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) {
              final message = snapshot.error is ApiException
                  ? (snapshot.error as ApiException).message
                  : 'Failed to load customers';
              return ListView(
                children: [
                  const SizedBox(height: 80),
                  Center(child: Text(message, textAlign: TextAlign.center)),
                ],
              );
            }
            final customers = (snapshot.data ?? [])
                .where((c) =>
                    _search.isEmpty ||
                    c.name.toLowerCase().contains(_search) ||
                    c.email.toLowerCase().contains(_search))
                .toList();
            if (customers.isEmpty) {
              return ListView(
                children: [
                  const SizedBox(height: 80),
                  Center(child: Text(_search.isEmpty ? 'No customers yet.' : 'No matches.')),
                ],
              );
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
                  trailing: StatusBadge(status: c.status),
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => CustomerDetailScreen(customerId: c.id)),
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }
}

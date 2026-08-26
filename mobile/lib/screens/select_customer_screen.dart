import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/customer.dart';

/// What [SelectCustomerScreen] returns: either an existing customer or, when
/// [SelectCustomerScreen.allowManual] is set, a manually-typed name + email.
class SelectCustomerResult {
  final Customer? customer;
  final String? manualName;
  final String? manualEmail;
  const SelectCustomerResult.existing(this.customer) : manualName = null, manualEmail = null;
  const SelectCustomerResult.manual(this.manualName, this.manualEmail) : customer = null;

  bool get isManual => customer == null;
}

/// Searchable customer list that returns a [SelectCustomerResult] via
/// Navigator.pop. With [allowManual] it also offers a "Manual customer" option.
class SelectCustomerScreen extends StatefulWidget {
  final bool allowManual;
  const SelectCustomerScreen({super.key, this.allowManual = false});

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

  Future<void> _manualCustomer() async {
    final nameController = TextEditingController();
    final emailController = TextEditingController();
    final result = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Manual customer'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: nameController,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(labelText: 'Name'),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: emailController,
              keyboardType: TextInputType.emailAddress,
              autocorrect: false,
              decoration: const InputDecoration(labelText: 'Email'),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Use')),
        ],
      ),
    );
    final name = nameController.text.trim();
    final email = emailController.text.trim();
    nameController.dispose();
    emailController.dispose();
    if (result != true) return;
    if (name.isEmpty || !email.contains('@') || !email.contains('.')) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Enter a name and valid email.')));
      }
      return;
    }
    if (mounted) Navigator.of(context).pop(SelectCustomerResult.manual(name, email));
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
          return ListView(
            padding: const EdgeInsets.symmetric(vertical: 8),
            children: [
              if (widget.allowManual)
                ListTile(
                  leading: const Icon(Icons.person_add_alt_1),
                  title: const Text('Manual customer'),
                  subtitle: const Text('Type a name and email (not saved as a customer)'),
                  onTap: _manualCustomer,
                ),
              if (widget.allowManual) const Divider(height: 1),
              if (customers.isEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 60),
                  child: Center(child: Text(_search.isEmpty ? 'No customers yet.' : 'No matches.')),
                )
              else
                for (final c in customers) ...[
                  ListTile(
                    title: Text(c.name),
                    subtitle: Text(c.email),
                    onTap: () => Navigator.of(context).pop(SelectCustomerResult.existing(c)),
                  ),
                  const Divider(height: 1),
                ],
            ],
          );
        },
      ),
    );
  }
}

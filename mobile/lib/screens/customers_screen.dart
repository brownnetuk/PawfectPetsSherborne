import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/customer.dart';
import '../widgets/hold_to_delete_dialog.dart';
import '../widgets/status_badge.dart';
import 'customer_detail_screen.dart';
import 'home_shell.dart';

class CustomersScreen extends StatefulWidget {
  const CustomersScreen({super.key});

  @override
  State<CustomersScreen> createState() => _CustomersScreenState();
}

class _CustomersScreenState extends State<CustomersScreen> {
  late Future<(List<Customer>, Map<String, List<String>>)> _future;
  final _searchController = TextEditingController();
  String _search = '';
  bool _activeOnly = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _load() {
    final repo = context.read<Repository>();
    _future = () async {
      final customers = await repo.listCustomers();
      final pets = await repo.petNamesByCustomer();
      return (customers, pets);
    }();
  }

  Future<void> _refresh() async {
    setState(_load);
    await _future;
  }

  /// Runs the deliberate delete flow (tick a box, then press-and-hold Delete
  /// for 5s). Returns false always so the Dismissible snaps back; on a
  /// successful server delete the list is refreshed to drop the row.
  Future<bool> _confirmDelete(Customer c) async {
    final repo = context.read<Repository>();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => HoldToDeleteDialog(
        title: 'Delete customer?',
        message: 'This permanently deletes ${c.name}. This cannot be undone.',
      ),
    );
    if (confirmed != true) return false;
    try {
      await repo.deleteCustomer(c.id);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Deleted ${c.name}')));
        _refresh();
      }
    } catch (e) {
      if (mounted) {
        final message = e is ApiException ? e.message : 'Failed to delete customer';
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(message), duration: const Duration(seconds: 5)));
      }
    }
    return false;
  }

  Future<void> _newCustomer() async {
    final created = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: const _NewCustomerSheet(),
      ),
    );
    if (created == true) _refresh();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _newCustomer,
        icon: const Icon(Icons.person_add_alt_1),
        label: const Text('New customer'),
      ),
      appBar: AppBar(
        title: const Text('Customers'),
        actions: const [LogoutAction()],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(104),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Column(
              children: [
                TextField(
                  controller: _searchController,
                  textInputAction: TextInputAction.search,
                  onSubmitted: (_) => FocusScope.of(context).unfocus(),
                  onTapOutside: (_) => FocusScope.of(context).unfocus(),
                  decoration: InputDecoration(
                    hintText: 'Search by name, email or pet…',
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
                  onChanged: (v) => setState(() => _search = v.toLowerCase()),
                ),
                const SizedBox(height: 8),
                Align(
                  alignment: Alignment.centerLeft,
                  child: FilterChip(
                    label: const Text('Active only'),
                    selected: _activeOnly,
                    onSelected: (v) => setState(() => _activeOnly = v),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: FutureBuilder<(List<Customer>, Map<String, List<String>>)>(
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
            final (allCustomers, petMap) = snapshot.data ?? (<Customer>[], <String, List<String>>{});
            final customers = allCustomers.where((c) {
              if (_activeOnly && c.status != 'active') return false;
              if (_search.isEmpty) return true;
              final pets = petMap[c.id] ?? const <String>[];
              return c.name.toLowerCase().contains(_search) ||
                  c.email.toLowerCase().contains(_search) ||
                  pets.any((p) => p.toLowerCase().contains(_search));
            }).toList();
            if (customers.isEmpty) {
              final empty = _search.isNotEmpty
                  ? 'No matches.'
                  : (_activeOnly ? 'No active customers.' : 'No customers yet.');
              return ListView(
                children: [
                  const SizedBox(height: 80),
                  Center(child: Text(empty)),
                ],
              );
            }
            return ListView.separated(
              padding: const EdgeInsets.symmetric(vertical: 8),
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              itemCount: customers.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (context, i) {
                final c = customers[i];
                return Dismissible(
                  key: ValueKey(c.id),
                  direction: DismissDirection.endToStart,
                  background: Container(
                    color: Colors.red.shade600,
                    alignment: Alignment.centerRight,
                    padding: const EdgeInsets.symmetric(horizontal: 24),
                    child: const Icon(Icons.delete_outline, color: Colors.white),
                  ),
                  // Never let Dismissible remove the row itself; the confirm
                  // flow deletes server-side and we reload the list instead.
                  confirmDismiss: (_) => _confirmDelete(c),
                  child: ListTile(
                    title: Text(c.name),
                    subtitle: Text(c.email),
                    trailing: StatusBadge(status: c.status),
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute(builder: (_) => CustomerDetailScreen(customerId: c.id)),
                    ),
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

/// Quick "add customer" prompt: creates a lead (name + email), matching the
/// admin app. Full details are captured later via the intake form.
class _NewCustomerSheet extends StatefulWidget {
  const _NewCustomerSheet();

  @override
  State<_NewCustomerSheet> createState() => _NewCustomerSheetState();
}

class _NewCustomerSheetState extends State<_NewCustomerSheet> {
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final name = _nameController.text.trim();
    final email = _emailController.text.trim();
    if (name.isEmpty) {
      setState(() => _error = 'Enter a name.');
      return;
    }
    if (!email.contains('@') || !email.contains('.')) {
      setState(() => _error = 'Enter a valid email.');
      return;
    }
    setState(() {
      _error = null;
      _submitting = true;
    });
    try {
      await context.read<Repository>().createLead(name: name, email: email);
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      // Shown inline (not a snackbar) so it isn't hidden behind the sheet --
      // e.g. the server's "email already in use" message when the customer
      // already exists.
      if (mounted) {
        setState(() => _error = e is ApiException ? e.message : 'Failed to add customer');
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('New customer', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 4),
          Text(
            'Creates a pending customer. Send them the intake form to complete their details.',
            style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _nameController,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(labelText: 'Name'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _emailController,
            keyboardType: TextInputType.emailAddress,
            autocorrect: false,
            decoration: const InputDecoration(labelText: 'Email'),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.error_outline, size: 18, color: Colors.red.shade600),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(_error!, style: TextStyle(color: Colors.red.shade700)),
                ),
              ],
            ),
          ],
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _submitting ? null : _submit,
              child: Text(_submitting ? 'Adding…' : 'Add customer'),
            ),
          ),
        ],
      ),
    );
  }
}

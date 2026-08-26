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

  /// Runs the deliberate delete flow (tick a box, then press-and-hold Delete
  /// for 5s). Returns false always so the Dismissible snaps back; on a
  /// successful server delete the list is refreshed to drop the row.
  Future<bool> _confirmDelete(Customer c) async {
    final repo = context.read<Repository>();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => _DeleteCustomerDialog(name: c.name),
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

/// Deliberate delete confirmation: the user must tick a checkbox and then
/// press-and-hold the Delete button for a full 5 seconds. Releasing early
/// cancels. Pops `true` only once the hold completes.
class _DeleteCustomerDialog extends StatefulWidget {
  final String name;
  const _DeleteCustomerDialog({required this.name});

  @override
  State<_DeleteCustomerDialog> createState() => _DeleteCustomerDialogState();
}

class _DeleteCustomerDialogState extends State<_DeleteCustomerDialog>
    with SingleTickerProviderStateMixin {
  bool _checked = false;
  late final AnimationController _hold = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 5),
  )
    ..addListener(() => setState(() {}))
    ..addStatusListener((status) {
      if (status == AnimationStatus.completed) Navigator.of(context).pop(true);
    });

  @override
  void dispose() {
    _hold.dispose();
    super.dispose();
  }

  void _startHold() {
    if (_checked) _hold.forward();
  }

  void _cancelHold() {
    if (!_hold.isCompleted) _hold.reverse();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Delete customer?'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('This permanently deletes ${widget.name}. This cannot be undone.'),
          const SizedBox(height: 8),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            value: _checked,
            onChanged: (v) => setState(() {
              _checked = v ?? false;
              if (!_checked) _hold.reset();
            }),
            title: const Text('I understand this is permanent'),
          ),
          const SizedBox(height: 4),
          GestureDetector(
            onTapDown: _checked ? (_) => _startHold() : null,
            onTapUp: (_) => _cancelHold(),
            onTapCancel: _cancelHold,
            child: Opacity(
              opacity: _checked ? 1 : 0.4,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    Container(height: 48, width: double.infinity, color: Colors.red.shade600),
                    Positioned.fill(
                      child: Align(
                        alignment: Alignment.centerLeft,
                        child: FractionallySizedBox(
                          widthFactor: _hold.value,
                          child: Container(color: Colors.red.shade900),
                        ),
                      ),
                    ),
                    Text(
                      _hold.isAnimating ? 'Keep holding…' : 'Hold to delete (5s)',
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
      ],
    );
  }
}

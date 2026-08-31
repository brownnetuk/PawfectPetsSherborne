import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/expense.dart';
import 'expense_detail_screen.dart';
import 'expense_form_sheet.dart';
import 'home_shell.dart';

class ExpensesScreen extends StatefulWidget {
  const ExpensesScreen({super.key});

  @override
  State<ExpensesScreen> createState() => _ExpensesScreenState();
}

class _ExpensesScreenState extends State<ExpensesScreen> {
  late Future<List<Expense>> _future;
  final _searchController = TextEditingController();
  String _search = '';
  String? _categoryFilter;
  String? _vendorFilter;
  // Filter dropdown options, loaded from the admin-managed libraries.
  List<ExpenseCategory> _categories = [];
  List<Vendor> _vendors = [];

  @override
  void initState() {
    super.initState();
    _load();
    final repo = context.read<Repository>();
    repo.listExpenseCategories().then((v) {
      if (mounted) setState(() => _categories = v);
    }).catchError((_) {});
    repo.listVendors().then((v) {
      if (mounted) setState(() => _vendors = v);
    }).catchError((_) {});
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _load() {
    _future = context.read<Repository>().listExpenses();
  }

  Future<void> _refresh() async {
    setState(_load);
    await _future;
  }

  Future<void> _createExpense() async {
    final created = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: const ExpenseFormSheet(),
      ),
    );
    if (created == true) _refresh();
  }

  @override
  Widget build(BuildContext context) {
    final dateFmt = DateFormat('d MMM yyyy');
    final money = NumberFormat.currency(locale: 'en_GB', symbol: '£');
    return Scaffold(
      appBar: AppBar(
        title: const Text('Expenses'),
        actions: const [LogoutAction()],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(120),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
            child: Column(
              children: [
                TextField(
                  controller: _searchController,
                  textInputAction: TextInputAction.search,
                  onSubmitted: (_) => FocusScope.of(context).unfocus(),
                  onTapOutside: (_) => FocusScope.of(context).unfocus(),
                  decoration: InputDecoration(
                    hintText: 'Search by description, category or vendor…',
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
                Row(
                  children: [
                    Expanded(
                      child: DropdownButtonFormField<String?>(
                        initialValue: _categoryFilter,
                        isExpanded: true,
                        decoration: const InputDecoration(labelText: 'Category', isDense: true),
                        items: [
                          const DropdownMenuItem<String?>(value: null, child: Text('All')),
                          ..._categories.map((c) => DropdownMenuItem(value: c.name, child: Text(c.name))),
                        ],
                        onChanged: (v) => setState(() => _categoryFilter = v),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: DropdownButtonFormField<String?>(
                        initialValue: _vendorFilter,
                        isExpanded: true,
                        decoration: const InputDecoration(labelText: 'Vendor', isDense: true),
                        items: [
                          const DropdownMenuItem<String?>(value: null, child: Text('All')),
                          ..._vendors.map((v) => DropdownMenuItem(value: v.name, child: Text(v.name))),
                        ],
                        onChanged: (v) => setState(() => _vendorFilter = v),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _createExpense,
        icon: const Icon(Icons.add),
        label: const Text('Create Expense'),
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: FutureBuilder<List<Expense>>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) {
              final message = snapshot.error is ApiException
                  ? (snapshot.error as ApiException).message
                  : 'Failed to load expenses';
              return ListView(
                children: [
                  const SizedBox(height: 80),
                  Center(child: Text(message, textAlign: TextAlign.center)),
                ],
              );
            }
            final allExpenses = snapshot.data ?? [];
            final expenses = allExpenses.where((e) {
              if (_categoryFilter != null && e.category != _categoryFilter) return false;
              if (_vendorFilter != null && e.payee != _vendorFilter) return false;
              if (_search.isEmpty) return true;
              return e.description.toLowerCase().contains(_search) ||
                  e.category.toLowerCase().contains(_search) ||
                  (e.payee ?? '').toLowerCase().contains(_search);
            }).toList();
            if (expenses.isEmpty) {
              final hasFilter = _search.isNotEmpty || _categoryFilter != null || _vendorFilter != null;
              return ListView(
                children: [
                  const SizedBox(height: 80),
                  Center(child: Text(hasFilter ? 'No matches.' : 'No expenses yet.')),
                ],
              );
            }
            return ListView.separated(
              padding: const EdgeInsets.symmetric(vertical: 8),
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              itemCount: expenses.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (context, i) {
                final e = expenses[i];
                return ListTile(
                  title: Text(e.description),
                  subtitle: Text(
                    '${e.category}${e.payee != null && e.payee!.isNotEmpty ? ' · ${e.payee}' : ''} · '
                    '${dateFmt.format(e.date)}',
                  ),
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (e.hasReceipt)
                        Icon(Icons.attach_file, size: 16, color: Colors.grey.shade500),
                      const SizedBox(width: 4),
                      Text(money.format(e.amount), style: const TextStyle(fontWeight: FontWeight.w600)),
                    ],
                  ),
                  onTap: () async {
                    await Navigator.of(context).push(
                      MaterialPageRoute(builder: (_) => ExpenseDetailScreen(expense: e)),
                    );
                    _refresh(); // reflect edits/deletes
                  },
                );
              },
            );
          },
        ),
      ),
    );
  }
}

import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/expense.dart';
import 'expense_form_sheet.dart';

/// Read-only view of a single expense with its attachment, plus Edit / Delete.
/// Pops `true` if anything changed so the list can refresh.
class ExpenseDetailScreen extends StatefulWidget {
  final Expense expense;
  const ExpenseDetailScreen({super.key, required this.expense});

  @override
  State<ExpenseDetailScreen> createState() => _ExpenseDetailScreenState();
}

class _ExpenseDetailScreenState extends State<ExpenseDetailScreen> {
  late Expense _expense = widget.expense;
  bool _changed = false;

  static final _dateFmt = DateFormat('d MMM yyyy');
  final _money = NumberFormat.currency(locale: 'en_GB', symbol: '£');

  Future<void> _reload() async {
    try {
      final fresh = await context.read<Repository>().getExpense(_expense.id);
      if (mounted) setState(() => _expense = fresh);
    } catch (_) {/* keep showing the current data */}
  }

  Future<void> _edit() async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: ExpenseFormSheet(expense: _expense),
      ),
    );
    if (saved == true) {
      _changed = true;
      await _reload();
    }
  }

  Future<void> _delete() async {
    final repo = context.read<Repository>();
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete expense?'),
        content: Text('This permanently deletes "${_expense.description}".'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red.shade600),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await repo.deleteExpense(_expense.id);
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        final message = e is ApiException ? e.message : 'Failed to delete expense';
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(message), duration: const Duration(seconds: 5)));
      }
    }
  }

  Future<void> _openAttachment() async {
    final deleted = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => _AttachmentViewer(expense: _expense)),
    );
    if (deleted == true) {
      _changed = true;
      await _reload();
    }
  }

  @override
  Widget build(BuildContext context) {
    final e = _expense;
    return PopScope(
      canPop: true,
      onPopInvokedWithResult: (didPop, _) {},
      child: Scaffold(
        appBar: AppBar(
          leading: BackButton(onPressed: () => Navigator.of(context).pop(_changed)),
        ),
        body: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(e.description, style: Theme.of(context).textTheme.headlineSmall),
                      if (e.category.isNotEmpty)
                        Text(e.category.toUpperCase(),
                            style: TextStyle(color: Colors.grey.shade600, fontSize: 12, letterSpacing: 0.5)),
                      const SizedBox(height: 12),
                      Text(_money.format(e.amount),
                          style: Theme.of(context)
                              .textTheme
                              .headlineMedium
                              ?.copyWith(color: Colors.red.shade600, fontWeight: FontWeight.bold)),
                      Text(_dateFmt.format(e.date), style: TextStyle(color: Colors.grey.shade700)),
                    ],
                  ),
                ),
                if (e.hasReceipt) _attachmentCard(),
              ],
            ),
            const SizedBox(height: 24),
            const Divider(),
            _row(Icons.account_balance_outlined, 'Paid from', e.accountName ?? '—'),
            _row(Icons.storefront_outlined, 'Payee', (e.payee ?? '').isEmpty ? '—' : e.payee!),
          ],
        ),
        bottomNavigationBar: SafeArea(
          minimum: const EdgeInsets.fromLTRB(16, 8, 16, 10),
          child: Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _edit,
                  icon: const Icon(Icons.edit_outlined, size: 18),
                  label: const Text('Edit'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _delete,
                  icon: Icon(Icons.delete_outline, size: 18, color: Colors.red.shade600),
                  label: Text('Delete', style: TextStyle(color: Colors.red.shade700)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _attachmentCard() => InkWell(
        onTap: _openAttachment,
        borderRadius: BorderRadius.circular(8),
        child: Container(
          width: 120,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            border: Border.all(color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.5)),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Column(
            children: [
              Icon(Icons.description_outlined, color: Theme.of(context).colorScheme.primary),
              const SizedBox(height: 6),
              Text('1 attachment',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Theme.of(context).colorScheme.primary, fontSize: 12)),
            ],
          ),
        ),
      );

  Widget _row(IconData icon, String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 20, color: Colors.grey.shade600),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: TextStyle(color: Colors.grey.shade600, fontSize: 12)),
                  Text(value),
                ],
              ),
            ),
          ],
        ),
      );
}

/// Full-screen receipt viewer: pinch-zoom the image, or delete the attachment.
/// Pops `true` if the attachment was deleted.
class _AttachmentViewer extends StatefulWidget {
  final Expense expense;
  const _AttachmentViewer({required this.expense});

  @override
  State<_AttachmentViewer> createState() => _AttachmentViewerState();
}

class _AttachmentViewerState extends State<_AttachmentViewer> {
  bool _deleting = false;

  Future<void> _delete() async {
    final repo = context.read<Repository>();
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete attachment?'),
        content: const Text('This removes the receipt from the expense.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red.shade600),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _deleting = true);
    try {
      await repo.updateExpense(widget.expense.id, {'receipt': ''});
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        final message = e is ApiException ? e.message : 'Failed to delete attachment';
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
        setState(() => _deleting = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final bytes = base64Decode(widget.expense.receipt!.split(',').last);
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(title: const Text('Attachment')),
      body: Center(
        child: InteractiveViewer(
          minScale: 1,
          maxScale: 6,
          child: Image.memory(bytes, fit: BoxFit.contain),
        ),
      ),
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.fromLTRB(16, 8, 16, 10),
        child: SizedBox(
          width: double.infinity,
          child: OutlinedButton.icon(
            onPressed: _deleting ? null : _delete,
            icon: Icon(Icons.delete_outline, size: 18, color: Colors.red.shade600),
            label: Text(_deleting ? 'Deleting…' : 'Delete', style: TextStyle(color: Colors.red.shade700)),
          ),
        ),
      ),
    );
  }
}

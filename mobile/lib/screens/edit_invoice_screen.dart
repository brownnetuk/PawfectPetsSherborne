import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/invoice.dart';

/// Edits an invoice's metadata: subject, payment terms, issue/due dates and
/// status. Line items aren't editable here (they're product-based). Saves a
/// partial update via PATCH.
class EditInvoiceScreen extends StatefulWidget {
  final Invoice invoice;
  const EditInvoiceScreen({super.key, required this.invoice});

  @override
  State<EditInvoiceScreen> createState() => _EditInvoiceScreenState();
}

class _EditInvoiceScreenState extends State<EditInvoiceScreen> {
  late final TextEditingController _subject =
      TextEditingController(text: widget.invoice.subject ?? '');
  late final TextEditingController _paymentTerms =
      TextEditingController(text: widget.invoice.paymentTerms ?? '');
  late DateTime _issueDate = widget.invoice.issueDate;
  late DateTime _dueDate = widget.invoice.dueDate;
  late String _status = widget.invoice.status;
  bool _saving = false;

  static final _dateFmt = DateFormat('d MMM yyyy');

  @override
  void dispose() {
    _subject.dispose();
    _paymentTerms.dispose();
    super.dispose();
  }

  Future<void> _pickDate({required bool isIssue}) async {
    final picked = await showDatePicker(
      context: context,
      initialDate: isIssue ? _issueDate : _dueDate,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
    );
    if (picked != null) {
      setState(() => isIssue ? _issueDate = picked : _dueDate = picked);
    }
  }

  Future<void> _save() async {
    if (_dueDate.isBefore(_issueDate)) {
      _snack('The due date cannot be before the issue date.');
      return;
    }
    final repo = context.read<Repository>();
    setState(() => _saving = true);
    try {
      final updated = await repo.updateInvoice(widget.invoice.id, {
        'subject': _subject.text.trim(),
        'paymentTerms': _paymentTerms.text.trim(),
        'issueDate': _issueDate.toIso8601String(),
        'dueDate': _dueDate.toIso8601String(),
        'status': _status,
      });
      if (mounted) Navigator.of(context).pop(updated);
    } catch (e) {
      _snack(e is ApiException ? e.message : 'Failed to save invoice');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _snack(String m) {
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Edit ${widget.invoice.invoiceNumber}')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          TextField(controller: _subject, decoration: const InputDecoration(labelText: 'Subject')),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _status,
            decoration: const InputDecoration(labelText: 'Status'),
            items: [
              for (final s in invoiceStatuses)
                DropdownMenuItem(value: s, child: Text(s.replaceAll('_', ' '))),
            ],
            onChanged: (v) => setState(() => _status = v ?? _status),
          ),
          const SizedBox(height: 12),
          _dateRow('Issue date', _issueDate, () => _pickDate(isIssue: true)),
          _dateRow('Due date', _dueDate, () => _pickDate(isIssue: false)),
          const SizedBox(height: 12),
          TextField(
            controller: _paymentTerms,
            decoration: const InputDecoration(labelText: 'Payment terms'),
            maxLines: 2,
          ),
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _saving ? null : _save,
              child: Text(_saving ? 'Saving…' : 'Save changes'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _dateRow(String label, DateTime date, VoidCallback onTap) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(
          children: [
            SizedBox(width: 90, child: Text(label, style: TextStyle(color: Colors.grey.shade600))),
            Expanded(
              child: OutlinedButton(
                onPressed: onTap,
                style: OutlinedButton.styleFrom(alignment: Alignment.centerLeft),
                child: Text(_dateFmt.format(date)),
              ),
            ),
          ],
        ),
      );
}

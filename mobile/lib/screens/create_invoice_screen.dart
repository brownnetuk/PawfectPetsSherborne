import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/animal.dart';
import '../models/customer.dart';
import '../models/invoice.dart';
import '../models/product.dart';

/// Everything the form needs, loaded up front.
class _FormData {
  final List<Product> products;
  final List<InvoiceTerm> terms;
  final Customer customer;
  final List<Animal> pets;
  _FormData(this.products, this.terms, this.customer, this.pets);
}

/// Form for raising a new draft invoice against a customer. Line items are
/// chosen from the product catalogue and payment terms from the admin app's
/// library; the server assigns the invoice number and computes the totals.
class CreateInvoiceScreen extends StatefulWidget {
  final String customerId;
  final String customerName;
  const CreateInvoiceScreen({
    super.key,
    required this.customerId,
    required this.customerName,
  });

  @override
  State<CreateInvoiceScreen> createState() => _CreateInvoiceScreenState();
}

class _CreateInvoiceScreenState extends State<CreateInvoiceScreen> {
  final _subjectController = TextEditingController();
  final List<_LineItemEntry> _items = [_LineItemEntry()];
  DateTime _issueDate = DateTime.now();
  DateTime _dueDate = DateTime.now().add(const Duration(days: 14));
  bool _submitting = false;
  late Future<_FormData> _dataFuture;
  List<InvoiceTerm> _terms = [];
  InvoiceTerm? _selectedTerm;

  @override
  void initState() {
    super.initState();
    final repo = context.read<Repository>();
    _dataFuture = () async {
      final products = await repo.listProducts();
      final terms = await repo.listInvoiceTerms();
      final customer = await repo.getCustomer(widget.customerId);
      final pets = await repo.listAnimals(widget.customerId);
      return _FormData(products, terms, customer, pets);
    }();
    // Pre-select the default term (and set the due date from it) once loaded.
    _dataFuture.then((data) {
      if (!mounted) return;
      InvoiceTerm? def;
      for (final t in data.terms) {
        if (t.isDefault) {
          def = t;
          break;
        }
      }
      setState(() {
        _terms = data.terms;
        _selectedTerm = def;
        if (def != null) _applyTermDueDate(def);
      });
    }).catchError((_) {});
  }

  @override
  void dispose() {
    _subjectController.dispose();
    for (final item in _items) {
      item.dispose();
    }
    super.dispose();
  }

  double get _total => _items.fold(0, (sum, item) => sum + item.lineTotal);

  void _addItem() => setState(() => _items.add(_LineItemEntry()));

  void _removeItem(int index) {
    setState(() {
      _items.removeAt(index).dispose();
    });
  }

  /// Sets the due date from a term's plusDays / endOfMonth, relative to the
  /// current issue date — mirrors the admin app.
  void _applyTermDueDate(InvoiceTerm t) {
    if (t.endOfMonth) {
      _dueDate = DateTime(_issueDate.year, _issueDate.month + 1, 0);
    } else if (t.plusDays != null) {
      _dueDate = _issueDate.add(Duration(days: t.plusDays!));
    }
  }

  Future<void> _pickDate({required bool isIssue}) async {
    final picked = await showDatePicker(
      context: context,
      initialDate: isIssue ? _issueDate : _dueDate,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
    );
    if (picked != null) {
      setState(() {
        if (isIssue) {
          _issueDate = picked;
          if (_selectedTerm != null) _applyTermDueDate(_selectedTerm!);
        } else {
          _dueDate = picked;
        }
      });
    }
  }

  String? _validate() {
    if (_items.where((i) => i.isValid).isEmpty) {
      return 'Add at least one line item with a product and quantity.';
    }
    if (_dueDate.isBefore(_issueDate)) {
      return 'The due date cannot be before the issue date.';
    }
    return null;
  }

  Future<void> _submit() async {
    final error = _validate();
    if (error != null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error)));
      return;
    }
    setState(() => _submitting = true);
    try {
      final lineItems = _items.where((i) => i.isValid).map((i) => i.toLineItem()).toList();
      final invoice = await context.read<Repository>().createInvoice(
            customerId: widget.customerId,
            lineItems: lineItems,
            issueDate: _issueDate,
            dueDate: _dueDate,
            subject: _subjectController.text.trim(),
            paymentTerms: _selectedTerm?.text ?? '',
          );
      if (!mounted) return;
      Navigator.of(context).pop(invoice);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Invoice ${invoice.invoiceNumber} created')),
      );
    } catch (e) {
      if (mounted) {
        final message = e is ApiException ? e.message : 'Failed to create invoice';
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('New invoice')),
      body: FutureBuilder<_FormData>(
        future: _dataFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            final message = snapshot.error is ApiException
                ? (snapshot.error as ApiException).message
                : 'Failed to load';
            return Center(child: Text(message, textAlign: TextAlign.center));
          }
          final data = snapshot.data!;
          if (data.products.isEmpty) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Text(
                  'No products have been set up yet. Add products in the admin app before raising an invoice.',
                  textAlign: TextAlign.center,
                ),
              ),
            );
          }
          return _buildForm(context, data);
        },
      ),
    );
  }

  Widget _buildForm(BuildContext context, _FormData data) {
    final address = data.customer.address;
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        // Customer: name, address, then pets one per line.
        Text(widget.customerName, style: Theme.of(context).textTheme.titleLarge),
        if (address != null && address.trim().isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text(address, style: TextStyle(color: Colors.grey.shade700)),
          ),
        if (data.pets.isNotEmpty) ...[
          const SizedBox(height: 8),
          Text('Pets', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.grey.shade600)),
          for (final p in data.pets) Text('• ${p.name} (${p.breed})'),
        ],
        const SizedBox(height: 16),

        TextField(
          controller: _subjectController,
          maxLines: 1,
          decoration: const InputDecoration(
            labelText: 'Subject',
            hintText: 'Optional',
            isDense: true,
          ),
        ),
        const SizedBox(height: 16),

        _sectionTitle('Dates'),
        _dateRow('Issue date', _issueDate, () => _pickDate(isIssue: true)),
        _dateRow('Due date', _dueDate, () => _pickDate(isIssue: false)),
        const SizedBox(height: 16),

        _sectionTitle('Line items'),
        ..._items.asMap().entries.map(
              (entry) => _LineItemEditor(
                key: ObjectKey(entry.value),
                entry: entry.value,
                products: data.products,
                onChanged: () => setState(() {}),
                onRemove: _items.length > 1 ? () => _removeItem(entry.key) : null,
              ),
            ),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: _addItem,
            icon: const Icon(Icons.add),
            label: const Text('Add line item'),
          ),
        ),
        const SizedBox(height: 12),

        _sectionTitle('Payment terms'),
        if (_terms.isEmpty)
          Text(
            'No payment terms set up. Add them in the admin app.',
            style: TextStyle(color: Colors.grey.shade600),
          )
        else
          DropdownButtonFormField<InvoiceTerm>(
            initialValue: _selectedTerm,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Payment terms', isDense: true),
            hint: const Text('Choose payment terms'),
            items: _terms
                .map((t) => DropdownMenuItem(
                      value: t,
                      child: Text(t.text, overflow: TextOverflow.ellipsis),
                    ))
                .toList(),
            onChanged: (t) => setState(() {
              _selectedTerm = t;
              if (t != null) _applyTermDueDate(t);
            }),
          ),
        const SizedBox(height: 24),

        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('Total', style: Theme.of(context).textTheme.titleMedium),
            Text(
              _formatMoney(_total),
              style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
            ),
          ],
        ),
        const SizedBox(height: 20),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: _submitting ? null : _submit,
            child: Text(_submitting ? 'Creating…' : 'Create invoice'),
          ),
        ),
      ],
    );
  }

  Widget _dateRow(String label, DateTime date, VoidCallback onTap) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(
          children: [
            SizedBox(width: 110, child: Text(label, style: TextStyle(color: Colors.grey.shade600))),
            Expanded(
              child: OutlinedButton(
                onPressed: onTap,
                style: OutlinedButton.styleFrom(alignment: Alignment.centerLeft),
                child: Text(_formatDate(date)),
              ),
            ),
          ],
        ),
      );

  Widget _sectionTitle(String title) => Padding(
        padding: const EdgeInsets.only(top: 8, bottom: 8),
        child: Text(
          title.toUpperCase(),
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.bold,
            letterSpacing: 0.5,
            color: Colors.grey.shade600,
          ),
        ),
      );
}

/// Backs one line item: a product chosen from the catalogue plus an editable
/// quantity and discount. Description and unit price come from the product.
class _LineItemEntry {
  Product? product;
  final quantity = TextEditingController(text: '1');
  final discount = TextEditingController();

  double get _qty => double.tryParse(quantity.text.trim()) ?? 0;
  double get _discount => double.tryParse(discount.text.trim()) ?? 0;
  double get unitPrice => product?.price ?? 0;

  bool get isValid => product != null && _qty > 0;

  double get lineTotal => _qty * unitPrice * (1 - _discount / 100);

  InvoiceLineItem toLineItem() => InvoiceLineItem(
        description: product!.name,
        quantity: _qty,
        unitPrice: product!.price,
        discountPercent: _discount,
      );

  void dispose() {
    quantity.dispose();
    discount.dispose();
  }
}

class _LineItemEditor extends StatelessWidget {
  final _LineItemEntry entry;
  final List<Product> products;
  final VoidCallback onChanged;
  final VoidCallback? onRemove;

  const _LineItemEditor({
    super.key,
    required this.entry,
    required this.products,
    required this.onChanged,
    this.onRemove,
  });

  static const _dense = InputDecoration(isDense: true);

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(8, 8, 8, 4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            DropdownButtonFormField<Product>(
              initialValue: entry.product,
              isExpanded: true,
              isDense: true,
              decoration: const InputDecoration(labelText: 'Product', isDense: true),
              hint: const Text('Choose a product'),
              items: products
                  .map((p) => DropdownMenuItem(
                        value: p,
                        child: Text('${p.name} — ${_formatMoney(p.price)}', overflow: TextOverflow.ellipsis),
                      ))
                  .toList(),
              onChanged: (p) {
                entry.product = p;
                onChanged();
              },
            ),
            const SizedBox(height: 6),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: entry.quantity,
                    style: const TextStyle(fontSize: 14),
                    decoration: _dense.copyWith(labelText: 'Qty'),
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
                    onChanged: (_) => onChanged(),
                  ),
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: InputDecorator(
                    decoration: _dense.copyWith(labelText: 'Unit'),
                    child: Text(_formatMoney(entry.unitPrice), style: const TextStyle(fontSize: 14)),
                  ),
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: TextField(
                    controller: entry.discount,
                    style: const TextStyle(fontSize: 14),
                    decoration: _dense.copyWith(labelText: 'Disc %'),
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
                    onChanged: (_) => onChanged(),
                  ),
                ),
              ],
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(_formatMoney(entry.lineTotal), style: TextStyle(color: Colors.grey.shade700)),
                if (onRemove != null)
                  TextButton.icon(
                    onPressed: onRemove,
                    icon: const Icon(Icons.delete_outline, size: 18),
                    label: const Text('Remove'),
                    style: TextButton.styleFrom(
                      foregroundColor: Colors.red.shade400,
                      visualDensity: VisualDensity.compact,
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

String _formatMoney(double value) => '£${value.toStringAsFixed(2)}';

String _formatDate(DateTime date) =>
    '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}/${date.year}';

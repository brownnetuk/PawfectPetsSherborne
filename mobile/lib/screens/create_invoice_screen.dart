import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/animal.dart';
import '../models/bank_holiday.dart';
import '../models/customer.dart';
import '../models/invoice.dart';
import '../models/product.dart';
import '../utils/product_availability.dart';

/// Everything the form needs, loaded up front.
class _FormData {
  final List<Product> products;
  final List<InvoiceTerm> terms;
  final Customer customer;
  final List<Animal> pets;
  final List<BankHoliday> bankHolidays;
  _FormData(this.products, this.terms, this.customer, this.pets, this.bankHolidays);
}

/// Form for raising or editing an invoice against a customer. Line items are
/// chosen from the product catalogue and payment terms from the admin app's
/// library. When [invoice] is set the form edits that invoice (PATCH); else it
/// creates a new one (POST) and the server assigns the number and totals.
class CreateInvoiceScreen extends StatefulWidget {
  final String customerId;
  final String customerName;
  final Invoice? invoice;
  const CreateInvoiceScreen({
    super.key,
    required this.customerId,
    required this.customerName,
    this.invoice,
  });

  bool get isEditing => invoice != null;

  @override
  State<CreateInvoiceScreen> createState() => _CreateInvoiceScreenState();
}

class _CreateInvoiceScreenState extends State<CreateInvoiceScreen> {
  final _subjectController = TextEditingController();
  final List<_LineItemEntry> _items = [_LineItemEntry()];
  // Synthetic products for existing line items whose product isn't in the
  // catalogue any more, so the dropdown can still show/select them when editing.
  final List<Product> _extraProducts = [];
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
      final bankHolidays = await repo.listBankHolidays();
      return _FormData(products, terms, customer, pets, bankHolidays);
    }();
    _dataFuture.then((data) async {
      if (!mounted) return;
      _terms = data.terms;
      if (widget.isEditing) {
        // Fetch the full invoice for authoritative line items, then pre-fill.
        final inv = await repo.getInvoice(widget.invoice!.id);
        if (!mounted) return;
        setState(() => _prefillFromInvoice(inv, data.products));
      } else {
        InvoiceTerm? def;
        for (final t in data.terms) {
          if (t.isDefault) {
            def = t;
            break;
          }
        }
        setState(() {
          _selectedTerm = def;
          if (def != null) _applyTermDueDate(def);
        });
      }
    }).catchError((_) {});
  }

  void _prefillFromInvoice(Invoice inv, List<Product> catalogue) {
    _subjectController.text = inv.subject ?? '';
    _issueDate = inv.issueDate;
    _dueDate = inv.dueDate;

    // Payment terms: match by text, else keep the stored text as a synthetic term.
    InvoiceTerm? term;
    for (final t in _terms) {
      if (t.text == inv.paymentTerms) {
        term = t;
        break;
      }
    }
    if (term == null && (inv.paymentTerms ?? '').isNotEmpty) {
      term = InvoiceTerm(id: '', text: inv.paymentTerms!);
      _terms = [..._terms, term];
    }
    _selectedTerm = term;

    // Line items: match each to a catalogue product by name, else synthesise one.
    for (final e in _items) {
      e.dispose();
    }
    _items.clear();
    for (final li in inv.lineItems) {
      Product? product;
      for (final p in catalogue) {
        if (p.name == li.description) {
          product = p;
          break;
        }
      }
      if (product == null) {
        product = Product(id: '', productCode: '', name: li.description, price: li.unitPrice);
        _extraProducts.add(product);
      }
      _items.add(_LineItemEntry()
        ..product = product
        ..quantity.text = _trimNum(li.quantity)
        ..discount.text = li.discountPercent > 0 ? _trimNum(li.discountPercent) : '');
    }
    if (_items.isEmpty) _items.add(_LineItemEntry());
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

  Future<void> _confirmRemoveItem(int index) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Remove line item?'),
        content: const Text('This removes the selected line from the invoice.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red.shade600),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (ok == true) setState(() => _items.removeAt(index).dispose());
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

  Future<void> _submit({bool send = false}) async {
    final error = _validate();
    if (error != null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error)));
      return;
    }
    final repo = context.read<Repository>();
    setState(() => _submitting = true);
    try {
      final lineItems = _items.where((i) => i.isValid).map((i) => i.toLineItem()).toList();
      final Invoice invoice;
      if (widget.isEditing) {
        invoice = await repo.updateInvoice(widget.invoice!.id, {
          'lineItems': lineItems.map((i) => i.toJson()).toList(),
          'issueDate': _issueDate.toIso8601String(),
          'dueDate': _dueDate.toIso8601String(),
          'subject': _subjectController.text.trim(),
          'paymentTerms': _selectedTerm?.text ?? '',
        });
      } else {
        invoice = await repo.createInvoice(
          customerId: widget.customerId,
          lineItems: lineItems,
          issueDate: _issueDate,
          dueDate: _dueDate,
          subject: _subjectController.text.trim(),
          paymentTerms: _selectedTerm?.text ?? '',
        );
        if (send) await repo.sendInvoiceEmail(invoice.id);
      }
      if (!mounted) return;
      Navigator.of(context).pop(invoice);
      final verb = widget.isEditing ? 'updated' : (send ? 'created & sent' : 'created');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Invoice ${invoice.invoiceNumber} $verb')),
      );
    } catch (e) {
      if (mounted) {
        final message = e is ApiException ? e.message : 'Failed to save invoice';
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.isEditing ? 'Edit invoice' : 'New invoice')),
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
          if (data.products.isEmpty && _extraProducts.isEmpty) {
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
    final products = [...data.products, ..._extraProducts];
    return ListView(
      padding: const EdgeInsets.all(20),
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
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
                products: products,
                issueDate: _issueDate,
                bankHolidays: data.bankHolidays,
                onChanged: () => setState(() {}),
                onRemove: _items.length > 1 ? () => _confirmRemoveItem(entry.key) : null,
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
        if (widget.isEditing)
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _submitting ? null : _submit,
              child: Text(_submitting ? 'Saving…' : 'Save changes'),
            ),
          )
        else
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: _submitting ? null : () => _submit(),
                  child: Text(_submitting ? 'Saving…' : 'Create Draft'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: ElevatedButton(
                  onPressed: _submitting ? null : () => _submit(send: true),
                  child: Text(_submitting ? 'Saving…' : 'Create & Send'),
                ),
              ),
            ],
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
  // Bumped whenever the product is (re)picked so the product dropdown rebuilds
  // and reflects the decided value — including reverting after a cancelled
  // day-type warning.
  int rev = 0;
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
  final DateTime issueDate;
  final List<BankHoliday> bankHolidays;
  final VoidCallback onChanged;
  final VoidCallback? onRemove;

  const _LineItemEditor({
    super.key,
    required this.entry,
    required this.products,
    required this.issueDate,
    required this.bankHolidays,
    required this.onChanged,
    this.onRemove,
  });

  // Applies the chosen product, first warning if it's restricted to a
  // different day-type than the invoice's issue date. A bumped [entry.rev]
  // rebuilds the dropdown so it reflects the decided value (including a revert
  // when the user cancels the warning).
  Future<void> _pickProduct(BuildContext context, Product? p) async {
    if (p != null && !await confirmProductAvailability(context, p, issueDate, bankHolidays)) {
      entry.rev++;
      onChanged();
      return;
    }
    entry.product = p;
    entry.rev++;
    onChanged();
  }

  static const _dense = InputDecoration(isDense: true);
  static void _dismissKeyboard(PointerDownEvent _) =>
      FocusManager.instance.primaryFocus?.unfocus();

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
              key: ValueKey('product-${entry.rev}'),
              initialValue: entry.product,
              isExpanded: true,
              isDense: true,
              decoration: const InputDecoration(labelText: 'Product', isDense: true),
              hint: const Text('Choose a product'),
              items: products
                  .map((p) => DropdownMenuItem(
                        value: p,
                        child: Text(p.name, overflow: TextOverflow.ellipsis),
                      ))
                  .toList(),
              onChanged: (p) => _pickProduct(context, p),
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
                    onTapOutside: _dismissKeyboard,
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
                    onTapOutside: _dismissKeyboard,
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

/// Drops a trailing ".0" so whole numbers read "2" not "2.0".
String _trimNum(double v) => v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toString();

String _formatDate(DateTime date) =>
    '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}/${date.year}';

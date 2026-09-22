import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/expense.dart';
import '../models/invoice.dart';

/// Bottom sheet for recording a payment against an invoice. Pops `true` when a
/// payment is saved. Shared by the invoice detail screen and the invoice list.
class RecordPaymentSheet extends StatefulWidget {
  final Invoice invoice;
  const RecordPaymentSheet({super.key, required this.invoice});

  @override
  State<RecordPaymentSheet> createState() => _RecordPaymentSheetState();
}

class _RecordPaymentSheetState extends State<RecordPaymentSheet> {
  final _amountController = TextEditingController();
  final _chargesController = TextEditingController();
  DateTime _date = DateTime.now();
  BankAccountRef? _account;
  PaymentMethod? _paymentMethod;
  bool _submitting = false;
  late Future<(List<BankAccountRef>, List<PaymentMethod>)> _lookups;

  // The Full amount / Deposit sliding pill. The deposit percentage comes from
  // the admin's Settings > Deposit; the pill is hidden until it has loaded.
  double? _depositPercentage;
  bool _payingDeposit = false;

  @override
  void initState() {
    super.initState();
    _amountController.text = widget.invoice.balanceDue.toStringAsFixed(2);
    final repo = context.read<Repository>();
    _lookups = () async {
      final accounts = await repo.listBankAccounts();
      final methods = await repo.listPaymentMethods();
      // Pre-select the admin app's default bank account (fall back to the
      // first). Guarded so it doesn't clobber a manual pick on rebuild.
      if (_account == null && accounts.isNotEmpty) {
        _account = accounts.firstWhere((a) => a.isDefault, orElse: () => accounts.first);
      }
      return (accounts, methods);
    }();
    // Fetched separately so a failure just hides the pill rather than
    // blocking the whole sheet.
    repo.getDepositPercentage().then((pct) {
      if (mounted && pct != null && pct > 0) setState(() => _depositPercentage = pct);
    }).catchError((_) {});
  }

  /// Cents-based rounding, matching the backend's requestDeposit() maths
  /// (Math.round(total * percentage) / 100) so the two never disagree by a
  /// penny.
  double get _depositAmount => (widget.invoice.total * _depositPercentage!).roundToDouble() / 100;

  void _setPayingDeposit(bool deposit) {
    setState(() {
      _payingDeposit = deposit;
      _amountController.text =
          deposit ? _depositAmount.toStringAsFixed(2) : widget.invoice.balanceDue.toStringAsFixed(2);
    });
  }

  /// "25%" or "22.5%" -- no trailing .0 on whole percentages.
  String get _pctLabel {
    final pct = _depositPercentage!;
    return pct == pct.roundToDouble() ? '${pct.toStringAsFixed(0)}%' : '$pct%';
  }

  Widget _amountPill() {
    const duration = Duration(milliseconds: 180);
    return Container(
      height: 40,
      decoration: BoxDecoration(
        color: Colors.grey.shade200,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Stack(
        children: [
          AnimatedAlign(
            duration: duration,
            curve: Curves.easeOut,
            alignment: _payingDeposit ? Alignment.centerRight : Alignment.centerLeft,
            child: FractionallySizedBox(
              widthFactor: 0.5,
              heightFactor: 1,
              child: Container(
                margin: const EdgeInsets.all(3),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(999),
                  boxShadow: [
                    BoxShadow(color: Colors.black.withValues(alpha: 0.12), blurRadius: 3, offset: const Offset(0, 1)),
                  ],
                ),
              ),
            ),
          ),
          Row(
            children: [
              _pillOption('Full amount', !_payingDeposit, () => _setPayingDeposit(false)),
              _pillOption('Deposit ($_pctLabel)', _payingDeposit, () => _setPayingDeposit(true)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _pillOption(String label, bool selected, VoidCallback onTap) {
    return Expanded(
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: onTap,
        child: Center(
          child: Text(
            label,
            style: TextStyle(
              fontSize: 13,
              fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
              color: selected ? Theme.of(context).colorScheme.primary : Colors.grey.shade600,
            ),
          ),
        ),
      ),
    );
  }

  @override
  void dispose() {
    _amountController.dispose();
    _chargesController.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
    );
    if (picked != null) setState(() => _date = picked);
  }

  Future<void> _submit() async {
    final amount = double.tryParse(_amountController.text.trim());
    if (amount == null || amount <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Enter a valid amount.')));
      return;
    }
    if (_account == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Choose an account.')));
      return;
    }
    setState(() => _submitting = true);
    try {
      await context.read<Repository>().recordPayment(
            invoiceId: widget.invoice.id,
            date: _date,
            amount: amount,
            accountId: _account!.id,
            paymentMethod: _paymentMethod?.name,
            charges: double.tryParse(_chargesController.text.trim()),
          );
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        final message = e is ApiException ? e.message : 'Failed to record payment';
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final dateFmt = DateFormat('d MMM yyyy');
    return Padding(
      padding: const EdgeInsets.all(20),
      child: FutureBuilder<(List<BankAccountRef>, List<PaymentMethod>)>(
        future: _lookups,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const SizedBox(height: 160, child: Center(child: CircularProgressIndicator()));
          }
          if (snapshot.hasError) {
            final message = snapshot.error is ApiException
                ? (snapshot.error as ApiException).message
                : 'Failed to load accounts';
            return SizedBox(height: 160, child: Center(child: Text(message, textAlign: TextAlign.center)));
          }
          final (accounts, methods) = snapshot.data!;
          if (accounts.isEmpty) {
            return const SizedBox(
              height: 160,
              child: Center(
                child: Text(
                  'No bank accounts set up yet. Add one in the admin app before recording a payment.',
                  textAlign: TextAlign.center,
                ),
              ),
            );
          }
          return Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Record payment', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 16),
              if (_depositPercentage != null) ...[
                _amountPill(),
                const SizedBox(height: 12),
              ],
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _amountController,
                      decoration: const InputDecoration(labelText: 'Amount', prefixText: '£'),
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
                      onTapOutside: (_) => FocusManager.instance.primaryFocus?.unfocus(),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextField(
                      controller: _chargesController,
                      decoration: const InputDecoration(
                        labelText: 'Charges',
                        prefixText: '£',
                        hintText: 'Optional',
                      ),
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
                      onTapOutside: (_) => FocusManager.instance.primaryFocus?.unfocus(),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              InkWell(
                onTap: _pickDate,
                child: InputDecorator(
                  decoration: const InputDecoration(labelText: 'Date'),
                  child: Text(dateFmt.format(_date)),
                ),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<BankAccountRef>(
                initialValue: _account,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Paid into'),
                hint: const Text('Choose an account'),
                items: accounts.map((a) => DropdownMenuItem(value: a, child: Text(a.name))).toList(),
                onChanged: (a) => setState(() => _account = a),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<PaymentMethod>(
                initialValue: _paymentMethod,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Method', hintText: 'Optional'),
                items: [
                  const DropdownMenuItem<PaymentMethod>(value: null, child: Text('Not specified')),
                  ...methods.map((m) => DropdownMenuItem(value: m, child: Text(m.name))),
                ],
                onChanged: (m) => setState(() => _paymentMethod = m),
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _submitting ? null : _submit,
                  child: Text(_submitting ? 'Saving…' : 'Save payment'),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

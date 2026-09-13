import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/customer.dart';
import '../models/product.dart';

const _weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const _weekdayLabels = {
  'monday': 'Monday',
  'tuesday': 'Tuesday',
  'wednesday': 'Wednesday',
  'thursday': 'Thursday',
  'friday': 'Friday',
  'saturday': 'Saturday',
  'sunday': 'Sunday',
};

/// The customer's defaults, mirroring the admin's Customer Defaults tab:
/// default product, chargeable travel (+ product), regular days, and the
/// Mobile App Access (portal) toggle with its password-reset action.
class CustomerDefaultsScreen extends StatefulWidget {
  final Customer customer;
  const CustomerDefaultsScreen({super.key, required this.customer});

  @override
  State<CustomerDefaultsScreen> createState() => _CustomerDefaultsScreenState();
}

class _CustomerDefaultsScreenState extends State<CustomerDefaultsScreen> {
  late Future<List<Product>> _productsFuture;
  late String? _defaultProductId = widget.customer.defaultProductId;
  late bool _travelChargeable = widget.customer.travelChargeable;
  late String? _travelProductId = widget.customer.travelProductId;
  late final Set<String> _regularDays = {...widget.customer.regularDays};
  late bool _portalActive = widget.customer.portalActive;
  bool _saving = false;
  bool _portalBusy = false;

  @override
  void initState() {
    super.initState();
    _productsFuture = context.read<Repository>().listProducts();
  }

  void _snack(String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _save() async {
    if (_travelChargeable && (_travelProductId == null || _travelProductId!.isEmpty)) {
      _snack('Choose a travel product, or turn travel charging off.');
      return;
    }
    setState(() => _saving = true);
    try {
      await context.read<Repository>().updateCustomerDefaults(
            widget.customer.id,
            defaultProduct: (_defaultProductId?.isEmpty ?? true) ? null : _defaultProductId,
            travelChargeable: _travelChargeable,
            travelProduct: _travelChargeable ? _travelProductId : null,
            regularDays: _regularDays.toList(),
          );
      if (mounted) _snack('Defaults saved.');
    } catch (e) {
      if (mounted) _snack(e is ApiException ? e.message : 'Failed to save defaults');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _togglePortal(bool value) async {
    if (value) {
      // Enabling emails the customer a welcome/set-password link -- confirm
      // first, same as the admin.
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Enable app access?'),
          content: Text(
            'This emails ${widget.customer.name} a welcome message with a link to set their password for the customer app.',
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
            TextButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Enable')),
          ],
        ),
      );
      if (confirmed != true || !mounted) return;
    }
    setState(() {
      _portalBusy = true;
      _portalActive = value; // optimistic, reverted on failure
    });
    try {
      await context.read<Repository>().setCustomerPortalActive(widget.customer.id, value);
      if (mounted) {
        _snack(value ? 'App access enabled — welcome email sent.' : 'App access disabled.');
      }
    } catch (e) {
      if (mounted) {
        setState(() => _portalActive = !value);
        _snack(e is ApiException ? e.message : 'Failed to update app access');
      }
    } finally {
      if (mounted) setState(() => _portalBusy = false);
    }
  }

  Future<void> _sendReset() async {
    setState(() => _portalBusy = true);
    try {
      await context.read<Repository>().sendCustomerPortalReset(widget.customer.id);
      if (mounted) _snack('Password reset email sent.');
    } catch (e) {
      if (mounted) _snack(e is ApiException ? e.message : 'Failed to send the reset email');
    } finally {
      if (mounted) setState(() => _portalBusy = false);
    }
  }

  Widget _sectionTitle(String title, String hint) => Padding(
        padding: const EdgeInsets.fromLTRB(0, 18, 0, 6),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
            const SizedBox(height: 2),
            Text(hint, style: TextStyle(color: Colors.grey.shade600, fontSize: 12.5)),
          ],
        ),
      );

  DropdownButtonFormField<String> _productDropdown({
    required List<Product> products,
    required String? value,
    required String emptyLabel,
    required ValueChanged<String?> onChanged,
  }) {
    // Guard against a saved product that no longer exists in the catalogue.
    final known = products.any((p) => p.id == value) ? value : null;
    return DropdownButtonFormField<String>(
      initialValue: known ?? '',
      isDense: true,
      decoration: const InputDecoration(border: OutlineInputBorder(), isDense: true),
      items: [
        DropdownMenuItem(value: '', child: Text(emptyLabel)),
        for (final p in products) DropdownMenuItem(value: p.id, child: Text(p.name, overflow: TextOverflow.ellipsis)),
      ],
      onChanged: (v) => onChanged((v?.isEmpty ?? true) ? null : v),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Customer defaults')),
      body: FutureBuilder<List<Product>>(
        future: _productsFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            final message =
                snapshot.error is ApiException ? (snapshot.error as ApiException).message : 'Failed to load products';
            return Center(child: Text(message, textAlign: TextAlign.center));
          }
          final products = snapshot.data ?? [];
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
            children: [
              _sectionTitle('Default Product', 'The product typically used for this customer.'),
              _productDropdown(
                products: products,
                value: _defaultProductId,
                emptyLabel: 'No default',
                onChanged: (v) => setState(() => _defaultProductId = v),
              ),
              _sectionTitle(
                'Travel',
                'When chargeable, one line of the chosen product is added automatically to every new invoice for this customer.',
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                dense: true,
                title: const Text('Travel is chargeable'),
                value: _travelChargeable,
                onChanged: (v) => setState(() => _travelChargeable = v),
              ),
              if (_travelChargeable)
                _productDropdown(
                  products: products,
                  value: _travelProductId,
                  emptyLabel: 'Select a product…',
                  onChanged: (v) => setState(() => _travelProductId = v),
                ),
              _sectionTitle('Regular Days', 'The days this customer regularly books.'),
              Wrap(
                spacing: 8,
                runSpacing: 4,
                children: [
                  for (final day in _weekdays)
                    FilterChip(
                      label: Text(_weekdayLabels[day]!),
                      selected: _regularDays.contains(day),
                      onSelected: (v) => setState(() => v ? _regularDays.add(day) : _regularDays.remove(day)),
                    ),
                ],
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _saving ? null : _save,
                  child: Text(_saving ? 'Saving…' : 'Save defaults'),
                ),
              ),
              const Divider(height: 40),
              _sectionTitle('Mobile App Access', 'Lets this customer sign in to the customer app.'),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                dense: true,
                title: const Text('App access enabled'),
                value: _portalActive,
                onChanged: _portalBusy ? null : _togglePortal,
              ),
              if (_portalActive)
                OutlinedButton.icon(
                  onPressed: _portalBusy ? null : _sendReset,
                  icon: const Icon(Icons.lock_reset_outlined, size: 18),
                  label: const Text('Send password reset email'),
                ),
            ],
          );
        },
      ),
    );
  }
}

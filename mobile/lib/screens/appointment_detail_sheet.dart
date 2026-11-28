import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../api/repository.dart';
import '../models/appointment.dart';
import '../models/customer.dart';
import '../theme.dart';
import '../widgets/brand.dart';
import 'customer_detail_screen.dart';

/// What an appointment on the calendar is about: the reason, date and time,
/// and the customer's address and phone number so staff can get there and
/// call ahead. Pops `'delete'` when Delete is chosen (the calendar confirms
/// and deletes), otherwise null.
class AppointmentDetailSheet extends StatefulWidget {
  final Appointment appointment;
  // The customer if the calendar already has them loaded; otherwise fetched.
  final Customer? customer;
  const AppointmentDetailSheet({super.key, required this.appointment, this.customer});

  @override
  State<AppointmentDetailSheet> createState() => _AppointmentDetailSheetState();
}

class _AppointmentDetailSheetState extends State<AppointmentDetailSheet> {
  late final Future<Customer?> _customerFuture = _loadCustomer();

  Future<Customer?> _loadCustomer() async {
    if (widget.customer != null) return widget.customer;
    final id = widget.appointment.customerId;
    if (id.isEmpty) return null;
    try {
      return await context.read<Repository>().getCustomer(id);
    } catch (_) {
      return null;
    }
  }

  Future<void> _call(String raw) async {
    final uri = Uri(scheme: 'tel', path: raw.replaceAll(RegExp(r'[^0-9+]'), ''));
    final ok = await launchUrl(uri);
    if (!ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not open the phone dialer.')));
    }
  }

  Future<void> _openMaps(String address) async {
    final uri = Uri.parse('https://maps.apple.com/?q=${Uri.encodeComponent(address)}');
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not open Maps.')));
    }
  }

  void _viewCustomer() {
    final id = widget.appointment.customerId;
    if (id.isEmpty) return;
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => CustomerDetailScreen(customerId: id)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final a = widget.appointment;
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    final when = DateFormat('EEE d MMM yyyy').format(a.date);
    return Padding(
      padding: EdgeInsets.only(left: 20, right: 20, top: 16, bottom: 20 + bottomInset),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 36,
              height: 4,
              margin: const EdgeInsets.only(bottom: 14),
              decoration: BoxDecoration(color: brandRule, borderRadius: BorderRadius.circular(2)),
            ),
          ),
          // Header: reason as the title, customer underneath.
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: const BoxDecoration(color: brandBlueTint, shape: BoxShape.circle),
                child: const Icon(Icons.event_note, size: 20, color: brandBlue),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      a.reason.isEmpty ? 'Appointment' : a.reason,
                      style: const TextStyle(fontFamily: displayFont, fontSize: 18, color: brandBlue, height: 1.15),
                    ),
                    if (a.customerName.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(a.customerName, style: const TextStyle(color: brandMuted, fontSize: 13)),
                    ],
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          // When.
          Card(
            margin: EdgeInsets.zero,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
              child: Column(
                children: [
                  _row(Icons.calendar_today_outlined, when),
                  if (a.time.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    _row(Icons.schedule, a.time),
                  ],
                ],
              ),
            ),
          ),
          const BrandSectionLabel('Customer', padding: EdgeInsets.only(top: 16, bottom: 8)),
          FutureBuilder<Customer?>(
            future: _customerFuture,
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const Padding(
                  padding: EdgeInsets.symmetric(vertical: 16),
                  child: Center(child: SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2))),
                );
              }
              final c = snapshot.data;
              final address = c?.address?.trim() ?? '';
              final phone = c?.phoneNumber?.trim() ?? '';
              final email = c?.email.trim() ?? '';
              if (c == null) {
                return Card(
                  margin: EdgeInsets.zero,
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Text(
                      a.customerName.isEmpty ? 'No customer on this appointment.' : 'Customer details unavailable.',
                      style: const TextStyle(color: brandMuted),
                    ),
                  ),
                );
              }
              return Card(
                margin: EdgeInsets.zero,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _row(Icons.person_outline, c.name),
                      const SizedBox(height: 8),
                      // Address opens Maps; phone opens the dialer.
                      _row(
                        Icons.place_outlined,
                        address.isEmpty ? 'No address on file' : address,
                        muted: address.isEmpty,
                        onTap: address.isEmpty ? null : () => _openMaps(address),
                      ),
                      const SizedBox(height: 8),
                      _row(
                        Icons.phone_outlined,
                        phone.isEmpty ? 'No phone number on file' : phone,
                        muted: phone.isEmpty,
                        onTap: phone.isEmpty ? null : () => _call(phone),
                      ),
                      if (email.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        _row(Icons.mail_outline, email),
                      ],
                    ],
                  ),
                ),
              );
            },
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              TextButton.icon(
                onPressed: () => Navigator.of(context).pop('delete'),
                icon: Icon(Icons.delete_outline, color: Colors.red.shade600),
                label: Text('Delete', style: TextStyle(color: Colors.red.shade600)),
              ),
              const Spacer(),
              OutlinedButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Close')),
              const SizedBox(width: 8),
              ElevatedButton.icon(
                onPressed: a.customerId.isEmpty ? null : _viewCustomer,
                icon: const Icon(Icons.person_outline, size: 18),
                label: const Text('View customer'),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _row(IconData icon, String text, {bool muted = false, VoidCallback? onTap}) {
    final row = Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(padding: const EdgeInsets.only(top: 1), child: Icon(icon, size: 16, color: brandBlue)),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            text,
            style: TextStyle(
              fontSize: 14,
              fontWeight: muted ? FontWeight.w400 : FontWeight.w600,
              color: muted ? brandMuted : (onTap != null ? brandBlue : brandInk),
              decoration: onTap != null ? TextDecoration.underline : null,
              decorationColor: brandBlue,
              height: 1.3,
            ),
          ),
        ),
        if (onTap != null) const Icon(Icons.open_in_new, size: 14, color: brandMuted),
      ],
    );
    if (onTap == null) return row;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Padding(padding: const EdgeInsets.symmetric(vertical: 2), child: row),
    );
  }
}

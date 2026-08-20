import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api/repository.dart';
import '../models/booking.dart';
import '../widgets/status_badge.dart';
import 'customer_detail_screen.dart';

class BookingDetailScreen extends StatefulWidget {
  final Booking booking;
  const BookingDetailScreen({super.key, required this.booking});

  @override
  State<BookingDetailScreen> createState() => _BookingDetailScreenState();
}

class _BookingDetailScreenState extends State<BookingDetailScreen> {
  late Booking _booking;
  bool _updating = false;
  bool _changed = false;

  @override
  void initState() {
    super.initState();
    _booking = widget.booking;
  }

  Future<void> _setStatus(String status) async {
    setState(() => _updating = true);
    try {
      final updated = await context.read<Repository>().updateBookingStatus(_booking.id, status);
      setState(() {
        _booking = updated;
        _changed = true;
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to update: $e')));
      }
    } finally {
      if (mounted) setState(() => _updating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final dateFmt = DateFormat('EEE d MMM yyyy');
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) Navigator.of(context).pop(_changed);
      },
      child: Scaffold(
        appBar: AppBar(
          title: Text('${_booking.serviceType[0].toUpperCase()}${_booking.serviceType.substring(1)} booking'),
        ),
        body: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Text(
                    _booking.customer.name,
                    style: Theme.of(context).textTheme.titleLarge,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(width: 8),
                StatusBadge(status: _booking.status),
              ],
            ),
            const SizedBox(height: 4),
            TextButton(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => CustomerDetailScreen(customerId: _booking.customer.id),
                ),
              ),
              style: TextButton.styleFrom(padding: EdgeInsets.zero, alignment: Alignment.centerLeft),
              child: const Text('View customer details →'),
            ),
            const SizedBox(height: 20),
            _row('Dates', '${dateFmt.format(_booking.startDate)} – ${dateFmt.format(_booking.endDate)}'),
            _row('Pets', _booking.animalNames.join(', ')),
            if (_booking.price != null) _row('Price', '£${_booking.price!.toStringAsFixed(2)}'),
            if (_booking.notes != null && _booking.notes!.isNotEmpty) _row('Notes', _booking.notes!),
            const SizedBox(height: 24),
            Text('Update status', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: bookingStatuses.map((s) {
                final isCurrent = s == _booking.status;
                return ChoiceChip(
                  label: Text(s.replaceAll('_', ' ')),
                  selected: isCurrent,
                  onSelected: _updating || isCurrent ? null : (_) => _setStatus(s),
                );
              }).toList(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _row(String label, String value) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 90,
              child: Text(label, style: TextStyle(color: Colors.grey.shade600)),
            ),
            Expanded(child: Text(value)),
          ],
        ),
      );
}

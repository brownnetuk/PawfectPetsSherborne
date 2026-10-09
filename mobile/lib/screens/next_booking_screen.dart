import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/boarding_booking.dart';
import 'boarding_bookings_screen.dart';

/// Boarding > Next Booking: the next two bookings still to be checked out,
/// soonest start date first. A booking stays here while it's upcoming or in
/// progress and drops out once its check-out form is recorded.
class NextBookingScreen extends StatefulWidget {
  const NextBookingScreen({super.key});

  @override
  State<NextBookingScreen> createState() => _NextBookingScreenState();
}

class _NextBookingScreenState extends State<NextBookingScreen> {
  late Future<List<BoardingBookingWithStatus>> _future;

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    _future = context.read<Repository>().listBoardingBookings().then((items) {
      final pending = items.where((i) => i.booking.checkOutSubmission == null).toList()
        ..sort((a, b) => a.booking.startDate.compareTo(b.booking.startDate));
      return pending.take(2).toList();
    });
  }

  Future<void> _refresh() async {
    setState(_load);
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Next Booking')),
      body: FutureBuilder<List<BoardingBookingWithStatus>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            final message = snapshot.error is ApiException
                ? (snapshot.error as ApiException).message
                : 'Failed to load bookings';
            return Center(child: Text(message, textAlign: TextAlign.center));
          }
          final items = snapshot.data ?? [];
          if (items.isEmpty) {
            return const Center(child: Text('No upcoming bookings.'));
          }
          return RefreshIndicator(
            onRefresh: _refresh,
            child: ListView(
              padding: const EdgeInsets.all(12),
              children: [for (final item in items) _bookingCard(context, item)],
            ),
          );
        },
      ),
    );
  }

  Widget _bookingCard(BuildContext context, BoardingBookingWithStatus item) {
    final b = item.booking;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () async {
          final changed = await Navigator.of(context).push<bool>(
            MaterialPageRoute(builder: (_) => BoardingBookingDetailScreen(item: item)),
          );
          // The detail pops true after a check-in/check-out -- a check-out
          // removes the booking from this list.
          if (changed == true && mounted) setState(_load);
        },
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      b.reference,
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        color: Theme.of(context).colorScheme.primary,
                      ),
                    ),
                  ),
                  BoardingStatusChip(status: item.status),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                '${b.customerName}${b.animalNames.isNotEmpty ? ' · ${b.animalNames.join(', ')}' : ''}',
                style: const TextStyle(fontWeight: FontWeight.w500),
              ),
              const SizedBox(height: 2),
              Text(
                '${b.isBoarding ? 'Boarding' : 'Day Care'} · ${formatBoardingDates(b)}'
                '${b.dropOffTime.isNotEmpty ? ' · Drop off ${b.dropOffTime}' : ''}'
                '${b.pickUpTime.isNotEmpty ? ' · Pick up ${b.pickUpTime}' : ''}',
                style: TextStyle(color: Colors.grey.shade700, fontSize: 13),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

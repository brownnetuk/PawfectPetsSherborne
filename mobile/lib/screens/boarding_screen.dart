import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/boarding_booking.dart';
import 'boarding_bookings_screen.dart';
import 'home_shell.dart';

/// Hub for the Boarding & Day Care area, reached from the bottom bar --
/// mirrors the admin's Boarding & Day Care page. Bookings link plus a Next
/// Booking section showing the next two bookings still to be checked out.
class BoardingScreen extends StatefulWidget {
  const BoardingScreen({super.key});

  @override
  State<BoardingScreen> createState() => _BoardingScreenState();
}

class _BoardingScreenState extends State<BoardingScreen> {
  late Future<List<BoardingBookingWithStatus>> _nextFuture;

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    // The next two bookings, soonest first -- a booking stays here while it's
    // upcoming or in progress and drops out once its check-out is recorded.
    _nextFuture = context.read<Repository>().listBoardingBookings().then((items) {
      final pending = items.where((i) => i.booking.checkOutSubmission == null).toList()
        ..sort((a, b) => a.booking.startDate.compareTo(b.booking.startDate));
      return pending.take(2).toList();
    });
  }

  Future<void> _refresh() async {
    setState(_load);
    await _nextFuture;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Boarding'), actions: const [LogoutAction()]),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          children: [
            ListTile(
              leading: Icon(Icons.hotel_outlined, color: Theme.of(context).colorScheme.primary),
              title: const Text('Bookings'),
              subtitle: const Text('Boarding & Day Care bookings and their status'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () async {
                await Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const BoardingBookingsScreen()),
                );
                // A check-out recorded in there should drop the booking from
                // Next Booking below.
                if (mounted) setState(_load);
              },
            ),
            const Divider(height: 1),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 20, 16, 8),
              child: Text(
                'NEXT BOOKING',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 0.5,
                  color: Colors.grey.shade600,
                ),
              ),
            ),
            FutureBuilder<List<BoardingBookingWithStatus>>(
              future: _nextFuture,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Padding(
                    padding: EdgeInsets.all(24),
                    child: Center(child: CircularProgressIndicator()),
                  );
                }
                if (snapshot.hasError) {
                  final message = snapshot.error is ApiException
                      ? (snapshot.error as ApiException).message
                      : 'Failed to load bookings';
                  return Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    child: Text(message, style: TextStyle(color: Colors.grey.shade600)),
                  );
                }
                final items = snapshot.data ?? [];
                if (items.isEmpty) {
                  return Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    child: Text('No upcoming bookings.', style: TextStyle(color: Colors.grey.shade600)),
                  );
                }
                return Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  child: Column(
                    children: [for (final item in items) _nextBookingCard(context, item)],
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _nextBookingCard(BuildContext context, BoardingBookingWithStatus item) {
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

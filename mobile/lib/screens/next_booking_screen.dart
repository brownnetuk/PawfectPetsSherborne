import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/boarding_booking.dart';
import 'boarding_bookings_screen.dart';

/// Boarding > Next Booking: today's arrivals and departures plus the next two
/// upcoming bookings. A booking stays here while it's still to be checked out
/// and drops out once its check-out form is recorded.
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
      return pending;
    });
  }

  Future<void> _refresh() async {
    setState(_load);
    await _future;
  }

  static bool _isToday(DateTime date) {
    final now = DateTime.now();
    final local = date.toLocal();
    return local.year == now.year && local.month == now.month && local.day == now.day;
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
          final pending = snapshot.data ?? [];

          // Mutually exclusive buckets: a booking that hasn't been checked in
          // and starts today is arriving; one ending today (and not already
          // departed) is departing -- which also catches a same-day Day Care
          // booking once it's checked in. Upcoming is the next two bookings
          // that start after today.
          final arriving = <BoardingBookingWithStatus>[];
          final departing = <BoardingBookingWithStatus>[];
          final upcoming = <BoardingBookingWithStatus>[];
          final today = DateTime.now();
          final startOfTomorrow = DateTime(today.year, today.month, today.day + 1);
          for (final item in pending) {
            final b = item.booking;
            if (b.checkInSubmission == null && _isToday(b.startDate)) {
              arriving.add(item);
            } else if (_isToday(b.endDate)) {
              departing.add(item);
            } else if (!b.startDate.toLocal().isBefore(startOfTomorrow)) {
              if (upcoming.length < 2) upcoming.add(item);
            }
          }

          return RefreshIndicator(
            onRefresh: _refresh,
            child: ListView(
              padding: const EdgeInsets.all(12),
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(4, 4, 4, 12),
                  child: Text(
                    'The bookings shown below are the next 2 upcoming bookings.',
                    style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
                  ),
                ),
                _heading('Arriving Today'),
                if (arriving.isEmpty) _none('No arrivals today.'),
                for (final item in arriving) _bookingCard(context, item),
                _heading('Departing Today'),
                if (departing.isEmpty) _none('No departures today.'),
                for (final item in departing) _bookingCard(context, item),
                _heading('Upcoming'),
                if (upcoming.isEmpty) _none('No upcoming bookings.'),
                for (final item in upcoming) _bookingCard(context, item),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _heading(String title) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 12, 4, 8),
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

  Widget _none(String message) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 0, 4, 8),
        child: Text(message, style: TextStyle(color: Colors.grey.shade500, fontSize: 13)),
      );

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

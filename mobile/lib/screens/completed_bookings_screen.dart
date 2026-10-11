import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/boarding_booking.dart';
import 'boarding_bookings_screen.dart';

/// Boarding > Completed: bookings whose check-out is done ('Check Out
/// Complete' / 'Booking Complete'), most recent stay first -- they move here
/// from the main Bookings list once the check-out form is recorded.
class CompletedBookingsScreen extends StatefulWidget {
  const CompletedBookingsScreen({super.key});

  @override
  State<CompletedBookingsScreen> createState() => _CompletedBookingsScreenState();
}

class _CompletedBookingsScreenState extends State<CompletedBookingsScreen> {
  late Future<List<BoardingBookingWithStatus>> _future;

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    _future = context.read<Repository>().listBoardingBookings().then((items) {
      final completed =
          items.where((i) => kCompletedBoardingStatuses.contains(i.status)).toList()
            ..sort((a, b) => b.booking.endDate.compareTo(a.booking.endDate));
      return completed;
    });
  }

  Future<void> _refresh() async {
    setState(_load);
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Completed Bookings')),
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
            return const Center(child: Text('No completed bookings yet.'));
          }
          return RefreshIndicator(
            onRefresh: _refresh,
            child: ListView.builder(
              padding: const EdgeInsets.all(12),
              itemCount: items.length,
              itemBuilder: (context, i) => _bookingCard(context, items[i]),
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
                  if (b.invoiced)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: Tooltip(
                        message: 'Invoiced',
                        child: Icon(Icons.check_circle_outline, size: 18, color: Colors.green.shade700),
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
                '${b.isBoarding ? 'Boarding' : 'Day Care'} · ${formatBoardingDates(b)}',
                style: TextStyle(color: Colors.grey.shade700, fontSize: 13),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

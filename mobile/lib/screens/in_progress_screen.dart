import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/boarding_booking.dart';
import 'boarding_bookings_screen.dart';
import '../widgets/brand.dart';

/// Boarding > In Progress: every booking that has been checked in but not yet
/// checked out, soonest departure first. A booking appears here the moment its
/// check-in form is recorded and drops out once it's checked out.
class InProgressScreen extends StatefulWidget {
  const InProgressScreen({super.key});

  @override
  State<InProgressScreen> createState() => _InProgressScreenState();
}

class _InProgressScreenState extends State<InProgressScreen> {
  late Future<List<BoardingBookingWithStatus>> _future;

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    _future = context.read<Repository>().listBoardingBookings().then((items) {
      final inProgress = items
          .where((i) => i.booking.checkInSubmission != null && i.booking.checkOutSubmission == null)
          .toList()
        ..sort((a, b) => a.booking.endDate.compareTo(b.booking.endDate));
      return inProgress;
    });
  }

  Future<void> _refresh() async {
    setState(_load);
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('In Progress')),
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
            return const Center(child: Text('No bookings in progress.'));
          }
          return RefreshIndicator(
            onRefresh: _refresh,
            child: ListView(
              padding: const EdgeInsets.all(12),
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(4, 4, 4, 12),
                  child: Text(
                    'Checked-in bookings, until they are checked out.',
                    style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
                  ),
                ),
                for (final item in items) _bookingCard(context, item),
              ],
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
          // The detail pops true after a check-out, which removes the booking
          // from this list.
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
                    child: Align(alignment: Alignment.centerLeft, child: RefPill(b.reference)),
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

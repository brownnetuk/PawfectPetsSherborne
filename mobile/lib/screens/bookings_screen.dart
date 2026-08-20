import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/booking.dart';
import '../widgets/status_badge.dart';
import 'booking_detail_screen.dart';
import 'home_shell.dart';

class BookingsScreen extends StatefulWidget {
  const BookingsScreen({super.key});

  @override
  State<BookingsScreen> createState() => _BookingsScreenState();
}

class _BookingsScreenState extends State<BookingsScreen> {
  late Future<List<Booking>> _future;

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    _future = context.read<Repository>().listBookings();
  }

  Future<void> _refresh() async {
    setState(_load);
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    final dateFmt = DateFormat('d MMM');
    return Scaffold(
      appBar: AppBar(title: const Text('Bookings'), actions: const [LogoutAction()]),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: FutureBuilder<List<Booking>>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) {
              final message = snapshot.error is ApiException
                  ? (snapshot.error as ApiException).message
                  : 'Failed to load bookings';
              return ListView(
                children: [
                  const SizedBox(height: 80),
                  Center(child: Text(message, textAlign: TextAlign.center)),
                ],
              );
            }
            final bookings = snapshot.data ?? [];
            if (bookings.isEmpty) {
              return ListView(
                children: const [
                  SizedBox(height: 80),
                  Center(child: Text('No bookings yet.')),
                ],
              );
            }
            return ListView.separated(
              padding: const EdgeInsets.symmetric(vertical: 8),
              itemCount: bookings.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (context, i) {
                final b = bookings[i];
                return ListTile(
                  title: Text(b.customer.name),
                  subtitle: Text(
                    '${b.serviceType[0].toUpperCase()}${b.serviceType.substring(1)} · '
                    '${dateFmt.format(b.startDate)} – ${dateFmt.format(b.endDate)}\n'
                    '${b.animalNames.join(', ')}',
                  ),
                  isThreeLine: true,
                  trailing: StatusBadge(status: b.status),
                  onTap: () async {
                    final changed = await Navigator.of(context).push<bool>(
                      MaterialPageRoute(builder: (_) => BookingDetailScreen(booking: b)),
                    );
                    if (changed == true) _refresh();
                  },
                );
              },
            );
          },
        ),
      ),
    );
  }
}

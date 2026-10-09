import 'package:flutter/material.dart';
import 'boarding_bookings_screen.dart';
import 'home_shell.dart';
import 'next_booking_screen.dart';

/// Hub for the Boarding & Day Care area, reached from the bottom bar --
/// mirrors the admin's Boarding & Day Care page. Links to Bookings and to
/// Next Booking (the next two bookings still to be checked out).
class BoardingScreen extends StatelessWidget {
  const BoardingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Boarding'), actions: const [LogoutAction()]),
      body: ListView(
        children: [
          ListTile(
            leading: Icon(Icons.hotel_outlined, color: Theme.of(context).colorScheme.primary),
            title: const Text('Bookings'),
            subtitle: const Text('Boarding & Day Care bookings and their status'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const BoardingBookingsScreen()),
            ),
          ),
          const Divider(height: 1),
          ListTile(
            leading: Icon(Icons.upcoming_outlined, color: Theme.of(context).colorScheme.primary),
            title: const Text('Next Booking'),
            subtitle: const Text('The next two bookings, until checked out'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const NextBookingScreen()),
            ),
          ),
          const Divider(height: 1),
        ],
      ),
    );
  }
}

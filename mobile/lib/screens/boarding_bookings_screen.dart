import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/boarding_booking.dart';
import 'customer_forms_screen.dart';
import 'invoice_detail_screen.dart';

/// The reference-numbered Boarding & Day Care bookings, mirroring the admin's
/// Boarding & Day Care > Bookings tab: one card per booking with reference,
/// customer, dog(s), type, dates, times, invoiced tick and status pill.
/// Tapping one opens a read-only detail with the workflow stage tracker.
class BoardingBookingsScreen extends StatefulWidget {
  const BoardingBookingsScreen({super.key});

  @override
  State<BoardingBookingsScreen> createState() => _BoardingBookingsScreenState();
}

class _BoardingBookingsScreenState extends State<BoardingBookingsScreen> {
  late Future<List<BoardingBookingWithStatus>> _future;

  @override
  void initState() {
    super.initState();
    _future = context.read<Repository>().listBoardingBookings();
  }

  Future<void> _refresh() async {
    final future = context.read<Repository>().listBoardingBookings();
    setState(() => _future = future);
    await future;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Boarding & Day Care')),
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
            return const Center(child: Text('No bookings yet.'));
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
          await Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => BoardingBookingDetailScreen(item: item)),
          );
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

/// "12 Oct" for Day Care/single-day bookings, "12 Oct – 15 Oct" for a stay --
/// same formatting as the admin table's Dates column.
String formatBoardingDates(BoardingBooking b) {
  final fmt = DateFormat('d MMM');
  final start = fmt.format(b.startDate.toLocal());
  if (!b.isBoarding || b.startDate == b.endDate) return start;
  final end = fmt.format(b.endDate.toLocal());
  return '$start – $end';
}

/// Status pill matching the admin's colour scheme: grey for Confirmed, blue
/// for Invoice Raised, orange for the awaiting-action states, green for the
/// completed ones.
class BoardingStatusChip extends StatelessWidget {
  final String status;
  const BoardingStatusChip({super.key, required this.status});

  @override
  Widget build(BuildContext context) {
    final color = switch (status) {
      'Confirmed' => Colors.grey.shade700,
      'Invoice Raised' => Colors.blue.shade700,
      'Deposit Requested' || 'In Progress' => Colors.orange.shade800,
      _ => Colors.green.shade700,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        status,
        style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600),
      ),
    );
  }
}

/// Read-only booking detail: the workflow stage tracker (quote -> confirmed ->
/// ... -> invoice paid) plus the booking's own fields, with buttons to open
/// the linked invoice and any completed pre-check-in/check-in/check-out form.
/// Managing the booking (filling forms, payments, amend dates) stays in the
/// admin.
class BoardingBookingDetailScreen extends StatefulWidget {
  final BoardingBookingWithStatus item;
  const BoardingBookingDetailScreen({super.key, required this.item});

  @override
  State<BoardingBookingDetailScreen> createState() => _BoardingBookingDetailScreenState();
}

class _BoardingBookingDetailScreenState extends State<BoardingBookingDetailScreen> {
  bool _openingForm = false;

  /// Fetches a completed workflow form by its submission id and shows it in a
  /// full-screen modal (the same read-only renderer the customer Forms area
  /// uses).
  Future<void> _openForm(String submissionId) async {
    if (_openingForm) return;
    setState(() => _openingForm = true);
    try {
      final submission = await context.read<Repository>().getFormSubmission(submissionId);
      if (!mounted) return;
      await Navigator.of(context).push(
        MaterialPageRoute(
          fullscreenDialog: true,
          builder: (_) => FormResponseScreen(submission: submission),
        ),
      );
    } catch (e) {
      if (mounted) {
        final message = e is ApiException ? e.message : 'Failed to load the form';
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
      }
    } finally {
      if (mounted) setState(() => _openingForm = false);
    }
  }

  Widget _actionButton(IconData icon, String label, VoidCallback onPressed) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: OutlinedButton.icon(
        onPressed: _openingForm ? null : onPressed,
        icon: Icon(icon, size: 18),
        label: Text(label),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    final b = item.booking;
    return Scaffold(
      appBar: AppBar(title: Text(b.reference)),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Row(
            children: [
              Expanded(
                child: Text(b.customerName, style: Theme.of(context).textTheme.titleLarge),
              ),
              BoardingStatusChip(status: item.status),
            ],
          ),
          const SizedBox(height: 16),
          _sectionTitle('Booking'),
          _row('Reference', b.reference),
          _row('Dog(s)', b.animalNames.isEmpty ? '—' : b.animalNames.join(', ')),
          _row('Type', b.isBoarding ? 'Boarding' : 'Day Care'),
          _row('Dates', formatBoardingDates(b)),
          _row('Drop off', b.dropOffTime.isEmpty ? '—' : b.dropOffTime),
          _row('Pick up', b.pickUpTime.isEmpty ? '—' : b.pickUpTime),
          _row('Invoiced', b.invoiced ? 'Yes' : 'No'),
          if ((b.notes ?? '').trim().isNotEmpty) _row('Notes', b.notes!),
          if (b.invoiceId != null ||
              b.preCheckInSubmission != null ||
              b.checkInSubmission != null ||
              b.checkOutSubmission != null) ...[
            const SizedBox(height: 8),
            if (b.invoiceId != null)
              _actionButton(
                Icons.receipt_long_outlined,
                'View invoice',
                () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => InvoiceDetailScreen(invoiceId: b.invoiceId!)),
                ),
              ),
            if (b.preCheckInSubmission != null)
              _actionButton(Icons.assignment_turned_in_outlined, 'View pre-check-in form',
                  () => _openForm(b.preCheckInSubmission!)),
            if (b.checkInSubmission != null)
              _actionButton(Icons.login_outlined, 'View check-in form', () => _openForm(b.checkInSubmission!)),
            if (b.checkOutSubmission != null)
              _actionButton(Icons.logout_outlined, 'View check-out form', () => _openForm(b.checkOutSubmission!)),
          ],
          _sectionTitle('Progress'),
          for (final stage in item.stages) _stageRow(stage),
        ],
      ),
    );
  }

  Widget _stageRow(BoardingStage stage) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 24,
            height: 24,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: stage.done ? Colors.green.shade700 : Colors.white,
              border: stage.done
                  ? null
                  : Border.all(
                      color: stage.current ? Colors.orange.shade800 : Colors.grey.shade400,
                      width: 2,
                    ),
            ),
            child: stage.done ? const Icon(Icons.check, size: 16, color: Colors.white) : null,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  stage.label,
                  style: TextStyle(
                    fontWeight: stage.current ? FontWeight.w700 : FontWeight.w400,
                    color: stage.done || stage.current ? Colors.black87 : Colors.grey.shade600,
                  ),
                ),
                if ((stage.sub ?? '').isNotEmpty)
                  Text(stage.sub!, style: TextStyle(color: Colors.grey.shade600, fontSize: 12)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _sectionTitle(String title) => Padding(
        padding: const EdgeInsets.only(top: 16, bottom: 8),
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

  Widget _row(String label, String value) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(width: 110, child: Text(label, style: TextStyle(color: Colors.grey.shade600))),
            Expanded(child: Text(value)),
          ],
        ),
      );
}

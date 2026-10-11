import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/animal.dart';
import '../models/boarding_booking.dart';
import '../models/customer.dart';
import 'customer_forms_screen.dart';
import 'form_fill_screen.dart';
import 'invoice_detail_screen.dart';
import 'new_boarding_booking_screen.dart';

/// The reference-numbered Boarding & Day Care bookings, mirroring the admin's
/// Boarding & Day Care > Bookings tab: one card per booking with reference,
/// customer, dog(s), type, dates, times, invoiced tick and status pill.
/// Tapping one opens a read-only detail with the workflow stage tracker.
class BoardingBookingsScreen extends StatefulWidget {
  const BoardingBookingsScreen({super.key});

  @override
  State<BoardingBookingsScreen> createState() => _BoardingBookingsScreenState();
}

/// Statuses of a booking whose check-out is done -- these live on the hub's
/// Completed screen rather than the main Bookings list.
const kCompletedBoardingStatuses = {'Check Out Complete', 'Booking Complete'};

class _BoardingBookingsScreenState extends State<BoardingBookingsScreen> {
  late Future<List<BoardingBookingWithStatus>> _future;
  final TextEditingController _search = TextEditingController();
  String? _statusFilter;

  @override
  void initState() {
    super.initState();
    _future = context.read<Repository>().listBoardingBookings();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    final future = context.read<Repository>().listBoardingBookings();
    setState(() => _future = future);
    await future;
  }

  bool _matchesSearch(BoardingBookingWithStatus item) {
    final query = _search.text.trim().toLowerCase();
    if (query.isEmpty) return true;
    final b = item.booking;
    return b.reference.toLowerCase().contains(query) ||
        b.customerName.toLowerCase().contains(query) ||
        b.animalNames.any((n) => n.toLowerCase().contains(query));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Boarding & Day Care'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add_circle_outline),
            tooltip: 'New booking',
            onPressed: () async {
              final created = await Navigator.of(context).push<bool>(
                MaterialPageRoute(builder: (_) => const NewBoardingBookingScreen()),
              );
              if (created == true && mounted) _refresh();
            },
          ),
        ],
      ),
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
          // Checked-out bookings move to the hub's Completed screen.
          final active = (snapshot.data ?? [])
              .where((i) => !kCompletedBoardingStatuses.contains(i.status))
              .toList();
          if (active.isEmpty) {
            return const Center(child: Text('No bookings yet.'));
          }
          final statuses = {for (final i in active) i.status}.toList()..sort();
          if (_statusFilter != null && !statuses.contains(_statusFilter)) _statusFilter = null;
          final items = active
              .where((i) => (_statusFilter == null || i.status == _statusFilter) && _matchesSearch(i))
              .toList();
          return Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
                child: TextField(
                  controller: _search,
                  decoration: InputDecoration(
                    hintText: 'Search reference, customer or dog',
                    prefixIcon: const Icon(Icons.search, size: 20),
                    suffixIcon: _search.text.isEmpty
                        ? null
                        : IconButton(
                            icon: const Icon(Icons.clear, size: 18),
                            onPressed: () => setState(() => _search.clear()),
                          ),
                    isDense: true,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  onChanged: (_) => setState(() {}),
                ),
              ),
              SizedBox(
                height: 48,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  children: [
                    Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: FilterChip(
                        label: const Text('All'),
                        selected: _statusFilter == null,
                        onSelected: (_) => setState(() => _statusFilter = null),
                      ),
                    ),
                    for (final status in statuses)
                      Padding(
                        padding: const EdgeInsets.only(right: 6),
                        child: FilterChip(
                          label: Text(status),
                          selected: _statusFilter == status,
                          onSelected: (selected) =>
                              setState(() => _statusFilter = selected ? status : null),
                        ),
                      ),
                  ],
                ),
              ),
              Expanded(
                child: items.isEmpty
                    ? const Center(child: Text('No bookings match.'))
                    : RefreshIndicator(
                        onRefresh: _refresh,
                        child: ListView.builder(
                          padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                          itemCount: items.length,
                          itemBuilder: (context, i) => _bookingCard(context, items[i]),
                        ),
                      ),
              ),
            ],
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
          // The detail pops true after a check-in/check-out so the status
          // pill and buttons here reflect the new stage.
          if (changed == true && mounted) _refresh();
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
  bool _sendingPreCheckIn = false;
  bool _startingCheck = false;
  bool _requestingPayment = false;
  bool _loadingDetails = false;
  DateTime? _preCheckInSentAt;
  String? _paymentRequestType;

  // Fetched on first tap of a dog/customer name, then reused.
  List<Animal>? _animals;
  Customer? _customer;

  @override
  void initState() {
    super.initState();
    _preCheckInSentAt = widget.item.booking.preCheckInSentAt;
    _paymentRequestType = widget.item.booking.paymentRequestType;
  }

  /// Prompts Deposit vs Full amount, then emails the payment request for the
  /// booking's invoice -- the same one-shot request the admin offers (the
  /// button hides once either has been sent).
  Future<void> _requestPayment() async {
    if (_requestingPayment) return;
    final type = await showModalBottomSheet<String>(
      context: context,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 16, 20, 8),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text('Request payment', style: TextStyle(fontWeight: FontWeight.w600)),
              ),
            ),
            ListTile(
              leading: const Icon(Icons.savings_outlined),
              title: const Text('Deposit'),
              subtitle: const Text('The configured deposit percentage of the invoice total'),
              onTap: () => Navigator.of(sheetContext).pop('deposit'),
            ),
            ListTile(
              leading: const Icon(Icons.payments_outlined),
              title: const Text('Full amount'),
              subtitle: const Text('The whole invoice total'),
              onTap: () => Navigator.of(sheetContext).pop('full'),
            ),
          ],
        ),
      ),
    );
    if (type == null || !mounted) return;
    setState(() => _requestingPayment = true);
    try {
      await context.read<Repository>().requestBoardingPayment(widget.item.booking.id, type);
      if (!mounted) return;
      setState(() => _paymentRequestType = type);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '${type == 'deposit' ? 'Deposit' : 'Full payment'} request emailed to ${widget.item.booking.customerName}.',
          ),
        ),
      );
    } catch (e) {
      if (mounted) {
        final message = e is ApiException ? e.message : 'Failed to send the payment request';
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
      }
    } finally {
      if (mounted) setState(() => _requestingPayment = false);
    }
  }

  /// Emails the customer the pre-check-in link (same as the admin's "Send
  /// now") -- the server picks the configured form and pre-fills it.
  Future<void> _sendPreCheckIn() async {
    if (_sendingPreCheckIn) return;
    setState(() => _sendingPreCheckIn = true);
    try {
      await context.read<Repository>().sendBoardingPreCheckIn(widget.item.booking.id);
      if (!mounted) return;
      setState(() => _preCheckInSentAt = DateTime.now());
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Pre-check-in link sent to ${widget.item.booking.customerName}.')),
      );
    } catch (e) {
      if (mounted) {
        final message = e is ApiException ? e.message : 'Failed to send the pre-check-in link';
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
      }
    } finally {
      if (mounted) setState(() => _sendingPreCheckIn = false);
    }
  }

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
        onPressed: _openingForm || _sendingPreCheckIn || _startingCheck || _requestingPayment ? null : onPressed,
        icon: Icon(icon, size: 18),
        label: Text(label),
      ),
    );
  }

  /// One entry point for arrival and departure: offers whichever of Check in /
  /// Check out is still to do, then runs the same fill-in flow as before.
  Future<void> _arriveDepart() async {
    final b = widget.item.booking;
    final choice = await showModalBottomSheet<bool>(
      context: context,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 16, 20, 8),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text('Arrive / Depart', style: TextStyle(fontWeight: FontWeight.w600)),
              ),
            ),
            if (b.checkInSubmission == null)
              ListTile(
                leading: const Icon(Icons.login_outlined),
                title: const Text('Check in'),
                subtitle: const Text('Arrival: fill in the check-in form'),
                onTap: () => Navigator.of(sheetContext).pop(true),
              ),
            if (b.checkOutSubmission == null)
              ListTile(
                leading: const Icon(Icons.logout_outlined),
                title: const Text('Check out'),
                subtitle: const Text('Departure: fill in the check-out form'),
                onTap: () => Navigator.of(sheetContext).pop(false),
              ),
          ],
        ),
      ),
    );
    if (choice == null || !mounted) return;
    await _startCheck(isCheckIn: choice);
  }

  /// The admin's Fill-in flow: look up the configured form for this booking's
  /// type, create a pending submission for this customer/pets, open it in the
  /// in-app form filler, and on submit link it onto the booking (check-in or
  /// check-out). Pops the detail with `true` afterwards so the list refreshes
  /// with the new status.
  Future<void> _startCheck({required bool isCheckIn}) async {
    if (_startingCheck) return;
    setState(() => _startingCheck = true);
    final b = widget.item.booking;
    try {
      final repo = context.read<Repository>();
      final workflow = await repo.getBoardingWorkflowSettings();
      final formId = (isCheckIn
          ? (b.isBoarding ? workflow['checkInFormBoarding'] : workflow['checkInFormDayCare'])
          : (b.isBoarding ? workflow['checkOutFormBoarding'] : workflow['checkOutFormDayCare'])) as String?;
      if (formId == null) {
        throw ApiException(
            'No ${isCheckIn ? 'check-in' : 'check-out'} form is configured for ${b.isBoarding ? 'Boarding' : 'Day Care'} yet -- set one in Settings > Boarding first.');
      }
      final submissionId = await repo.createFormSubmission(
        formId: formId,
        customerId: b.customerId,
        recipientEmail: b.customerEmail,
        recipientName: b.customerName,
        animalIds: b.animalIds,
      );
      if (!mounted) return;
      final submitted = await Navigator.of(context).push<bool>(
        MaterialPageRoute(
          fullscreenDialog: true,
          builder: (_) => FormFillScreen(
            submissionId: submissionId,
            title: isCheckIn ? 'Check-in' : 'Check-out',
            presetPetNames: b.animalNames,
            // Shown as a "View check-in details" button while filling in
            // check-out, same context the admin gives.
            referenceSubmissionId: isCheckIn ? null : b.checkInSubmission,
            // Feeds the vaccination-card thumbnails, feeding-instructions
            // modal and emergency-contact modal under the check-in toggles.
            customerId: b.customerId,
            preCheckInSubmissionId: b.preCheckInSubmission,
          ),
        ),
      );
      if (submitted != true || !mounted) return;
      if (isCheckIn) {
        await repo.recordBoardingCheckIn(b.id, submissionId);
      } else {
        await repo.recordBoardingCheckOut(b.id, submissionId);
      }
      if (!mounted) return;
      final messenger = ScaffoldMessenger.of(context);
      Navigator.of(context).pop(true);
      messenger.showSnackBar(SnackBar(content: Text(isCheckIn ? 'Checked in.' : 'Checked out.')));
    } catch (e) {
      if (mounted) {
        final message = e is ApiException
            ? e.message
            : 'Failed to ${isCheckIn ? 'check in' : 'check out'}';
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
      }
    } finally {
      if (mounted) setState(() => _startingCheck = false);
    }
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
                child: InkWell(
                  onTap: _loadingDetails ? null : _showCustomerDetails,
                  child: Text(
                    b.customerName,
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          color: Theme.of(context).colorScheme.primary,
                          decoration: TextDecoration.underline,
                          decorationColor: Theme.of(context).colorScheme.primary.withValues(alpha: 0.4),
                        ),
                  ),
                ),
              ),
              BoardingStatusChip(status: item.status),
            ],
          ),
          const SizedBox(height: 10),
          _progressLine(),
          const SizedBox(height: 12),
          _sectionTitle('Booking'),
          _row('Reference', b.reference),
          _dogsRow(b),
          _row('Type', b.isBoarding ? 'Boarding' : 'Day Care'),
          _row('Dates', formatBoardingDates(b)),
          _row('Drop off', b.dropOffTime.isEmpty ? '—' : b.dropOffTime),
          _row('Pick up', b.pickUpTime.isEmpty ? '—' : b.pickUpTime),
          _invoicedRow(b),
          if ((b.notes ?? '').trim().isNotEmpty) _row('Notes', b.notes!),
          ...[
            const SizedBox(height: 8),
            // One-shot, same as the admin: only while invoiced and no request
            // (deposit or full) has been emailed yet.
            if (b.invoiceId != null && _paymentRequestType == null)
              _actionButton(
                Icons.request_quote_outlined,
                _requestingPayment ? 'Sending…' : 'Request payment',
                _requestPayment,
              ),
            if (b.invoiceId != null)
              _actionButton(
                Icons.receipt_long_outlined,
                'View invoice',
                () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => InvoiceDetailScreen(invoiceId: b.invoiceId!)),
                ),
              ),
            // Same gating as the admin's "Send now": only once invoiced, and
            // only until the customer has completed it (then View takes over).
            if (b.preCheckInSubmission == null && b.invoiceId != null) ...[
              _actionButton(
                Icons.send_outlined,
                _sendingPreCheckIn
                    ? 'Sending…'
                    : _preCheckInSentAt != null
                        ? 'Re-send pre-check-in form'
                        : 'Send pre-check-in form',
                _sendPreCheckIn,
              ),
              if (_preCheckInSentAt != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text(
                    'Sent ${DateFormat('d MMM yyyy').format(_preCheckInSentAt!.toLocal())}',
                    style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
                  ),
                ),
            ],
            if (b.preCheckInSubmission != null)
              _actionButton(Icons.assignment_turned_in_outlined, 'View pre-check-in form',
                  () => _openForm(b.preCheckInSubmission!)),
            if (b.checkInSubmission == null || b.checkOutSubmission == null)
              _actionButton(Icons.swap_horiz_outlined, _startingCheck ? 'Preparing…' : 'Arrive / Depart',
                  _arriveDepart),
            if (b.checkInSubmission != null)
              _actionButton(Icons.login_outlined, 'View check-in form', () => _openForm(b.checkInSubmission!)),
            if (b.checkOutSubmission != null)
              _actionButton(Icons.logout_outlined, 'View check-out form', () => _openForm(b.checkOutSubmission!)),
          ],
        ],
      ),
    );
  }

  /// The workflow condensed to one line: the stage the booking is on now and
  /// the step that follows it (e.g. "Deposit paid  →  Next: Pre-check-in").
  /// All-done bookings just show the final stage with a tick.
  Widget _progressLine() {
    final stages = widget.item.stages;
    if (stages.isEmpty) return const SizedBox.shrink();
    var currentIndex = stages.indexWhere((s) => s.current);
    final allDone = currentIndex == -1;
    if (allDone) currentIndex = stages.length - 1;
    final current = stages[currentIndex];
    final next = currentIndex + 1 < stages.length ? stages[currentIndex + 1] : null;
    final color = allDone ? Colors.green.shade700 : Colors.orange.shade800;
    return Row(
      children: [
        Icon(allDone ? Icons.check_circle_outline : Icons.timelapse, size: 16, color: color),
        const SizedBox(width: 6),
        Expanded(
          child: Text.rich(
            TextSpan(children: [
              TextSpan(
                text: current.label,
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: color),
              ),
              if (!allDone && next != null)
                TextSpan(
                  text: '   →   Next: ${next.label}',
                  style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
                ),
            ]),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }

  // --- tappable dog / customer / invoice details ---

  /// Dog(s) row with each name tappable -- opens a sheet of that pet's
  /// details from its customer record.
  Widget _dogsRow(BoardingBooking b) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 110, child: Text('Dog(s)', style: TextStyle(color: Colors.grey.shade600))),
          Expanded(
            child: b.animalNames.isEmpty
                ? const Text('—')
                : Wrap(
                    spacing: 10,
                    children: [
                      for (final name in b.animalNames)
                        InkWell(
                          onTap: _loadingDetails ? null : () => _showDogDetails(name),
                          child: Text(
                            name,
                            style: TextStyle(
                              color: Theme.of(context).colorScheme.primary,
                              decoration: TextDecoration.underline,
                              decorationColor:
                                  Theme.of(context).colorScheme.primary.withValues(alpha: 0.4),
                            ),
                          ),
                        ),
                    ],
                  ),
          ),
        ],
      ),
    );
  }

  /// Invoiced row showing the invoice number as a link into the invoice.
  Widget _invoicedRow(BoardingBooking b) {
    if (b.invoiceId == null) return _row('Invoiced', 'No');
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 110, child: Text('Invoiced', style: TextStyle(color: Colors.grey.shade600))),
          Expanded(
            child: InkWell(
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(
                  fullscreenDialog: true,
                  builder: (_) => InvoiceDetailScreen(invoiceId: b.invoiceId!),
                ),
              ),
              child: Text(
                b.invoiceNumber ?? 'View invoice',
                style: TextStyle(
                  color: Theme.of(context).colorScheme.primary,
                  decoration: TextDecoration.underline,
                  decorationColor: Theme.of(context).colorScheme.primary.withValues(alpha: 0.4),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _showCustomerDetails() async {
    if (_loadingDetails) return;
    if (_customer == null) {
      setState(() => _loadingDetails = true);
      try {
        _customer = await context.read<Repository>().getCustomer(widget.item.booking.customerId);
      } catch (e) {
        if (mounted) {
          final message = e is ApiException ? e.message : 'Failed to load the customer';
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
        }
        return;
      } finally {
        if (mounted) setState(() => _loadingDetails = false);
      }
    }
    if (!mounted) return;
    final c = _customer!;
    final emergency = c.emergencyContact;
    _showDetailSheet(c.name, [
      _detailRow('Status', c.status),
      _detailRow('Email', c.email),
      _detailRow('Phone', c.phoneNumber ?? '—'),
      _detailRow('Address', c.address ?? '—'),
      if (emergency != null) ...[
        const Padding(
          padding: EdgeInsets.only(top: 8, bottom: 4),
          child: Text('Emergency contact', style: TextStyle(fontWeight: FontWeight.w700)),
        ),
        if (emergency.sameAsClient)
          _detailRow('Contact', 'Same as the client')
        else ...[
          _detailRow('Name', emergency.name ?? '—'),
          _detailRow('Phone', emergency.phoneNumber ?? '—'),
          _detailRow('Email', emergency.email ?? '—'),
          _detailRow('Address', emergency.address ?? '—'),
        ],
      ],
    ]);
  }

  Future<void> _showDogDetails(String name) async {
    if (_loadingDetails) return;
    if (_animals == null) {
      setState(() => _loadingDetails = true);
      try {
        _animals = await context.read<Repository>().listAnimals(widget.item.booking.customerId);
      } catch (e) {
        if (mounted) {
          final message = e is ApiException ? e.message : 'Failed to load the pet';
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
        }
        return;
      } finally {
        if (mounted) setState(() => _loadingDetails = false);
      }
    }
    if (!mounted) return;
    Animal? animal;
    for (final a in _animals!) {
      if (a.name == name) animal = a;
    }
    if (animal == null) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text("Couldn't find $name on this customer.")));
      return;
    }
    final dateFmt = DateFormat('d MMM yyyy');
    _showDetailSheet(animal.name, [
      if (animal.photos.any((p) => p.trim().isNotEmpty))
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Wrap(
            spacing: 8,
            children: [
              for (final photo in animal.photos.where((p) => p.trim().isNotEmpty))
                if (_photoThumb(photo) case final Widget thumb) thumb,
            ],
          ),
        ),
      _detailRow('Species', animal.species),
      _detailRow('Breed', animal.breed),
      _detailRow('Sex', animal.sex),
      _detailRow('Age', '${animal.age}'),
      if ((animal.colourMarkings ?? '').isNotEmpty) _detailRow('Colour', animal.colourMarkings!),
      _detailRow(
        'Vaccinated',
        animal.vaccinated
            ? 'Yes${animal.vaccineExpiryDate != null ? ' · expires ${dateFmt.format(animal.vaccineExpiryDate!.toLocal())}' : ''}'
            : 'No',
      ),
      if ((animal.microchipNumber ?? '').isNotEmpty) _detailRow('Microchip', animal.microchipNumber!),
      if (animal.neuteredStatus != null) _detailRow('Neutered', animal.neuteredStatus!),
      if (animal.insured == true) _detailRow('Insurer', animal.insurer ?? 'Insured'),
      if ((animal.temperamentNotes ?? '').isNotEmpty) _detailRow('Temperament', animal.temperamentNotes!),
    ]);
  }

  Widget? _photoThumb(String dataUri) {
    try {
      return ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: Image.memory(
          base64Decode(dataUri.split(',').last),
          height: 96,
          width: 96,
          fit: BoxFit.cover,
        ),
      );
    } on FormatException {
      return null;
    }
  }

  void _showDetailSheet(String title, List<Widget> children) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
              const SizedBox(height: 10),
              Flexible(
                child: SingleChildScrollView(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: children),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _detailRow(String label, String value) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: TextStyle(color: Colors.grey.shade600, fontSize: 12)),
            Text(value.isEmpty ? '—' : value),
          ],
        ),
      );

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

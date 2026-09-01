import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/notification_settings.dart';

/// Settings > Notifications: global push preferences, backed by the singleton
/// at /settings/notifications. Toggles auto-save; the lead time and digest
/// time have their own pickers.
class NotificationSettingsScreen extends StatefulWidget {
  const NotificationSettingsScreen({super.key});

  @override
  State<NotificationSettingsScreen> createState() => _NotificationSettingsScreenState();
}

class _NotificationSettingsScreenState extends State<NotificationSettingsScreen> {
  late Future<NotificationSettings> _future;
  NotificationSettings? _settings;
  bool _saving = false;

  // Options for the appointment reminder lead time.
  static const _leadOptions = <int, String>{
    15: '15 minutes before',
    30: '30 minutes before',
    45: '45 minutes before',
    60: '1 hour before',
    120: '2 hours before',
    180: '3 hours before',
  };

  @override
  void initState() {
    super.initState();
    _future = context.read<Repository>().getNotificationSettings().then((s) => _settings = s);
  }

  Future<void> _save(NotificationSettings next) async {
    final previous = _settings;
    setState(() {
      _settings = next;
      _saving = true;
    });
    try {
      final saved = await context.read<Repository>().updateNotificationSettings(next.toJson());
      if (mounted) setState(() => _settings = saved);
    } catch (e) {
      // Roll back the optimistic change and surface the error.
      if (mounted) {
        setState(() => _settings = previous);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e is ApiException ? e.message : 'Failed to save')));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _pickLeadMinutes() async {
    final s = _settings!;
    final chosen = await showModalBottomSheet<int>(
      context: context,
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final entry in _leadOptions.entries)
              ListTile(
                title: Text(entry.value),
                trailing: entry.key == s.appointmentLeadMinutes
                    ? Icon(Icons.check, color: Theme.of(context).colorScheme.primary)
                    : null,
                onTap: () => Navigator.of(context).pop(entry.key),
              ),
          ],
        ),
      ),
    );
    if (chosen != null) _save(s.copyWith(appointmentLeadMinutes: chosen));
  }

  Future<void> _pickDigestTime() async {
    final s = _settings!;
    final parts = s.dailyDigestTime.split(':');
    final initial = TimeOfDay(
      hour: int.tryParse(parts.first) ?? 7,
      minute: int.tryParse(parts.length > 1 ? parts[1] : '30') ?? 30,
    );
    final picked = await showTimePicker(context: context, initialTime: initial);
    if (picked != null) {
      final hhmm = '${picked.hour.toString().padLeft(2, '0')}:${picked.minute.toString().padLeft(2, '0')}';
      _save(s.copyWith(dailyDigestTime: hhmm));
    }
  }

  String _leadLabel(int minutes) => _leadOptions[minutes] ?? '$minutes minutes before';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        bottom: _saving
            ? const PreferredSize(preferredSize: Size.fromHeight(2), child: LinearProgressIndicator(minHeight: 2))
            : null,
      ),
      body: FutureBuilder<NotificationSettings>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError || _settings == null) {
            final message = snapshot.error is ApiException
                ? (snapshot.error as ApiException).message
                : 'Failed to load notification settings';
            return Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(message, textAlign: TextAlign.center)));
          }
          final s = _settings!;
          return ListView(
            children: [
              _sectionHeader('Customers'),
              SwitchListTile(
                title: const Text('Customer activated'),
                subtitle: const Text('When a customer moves from Pending to Active'),
                value: s.customerActivated,
                onChanged: (v) => _save(s.copyWith(customerActivated: v)),
              ),
              const Divider(height: 1),
              _sectionHeader('Bookings'),
              SwitchListTile(
                title: const Text('Appointment reminders'),
                subtitle: Text('Remind ${_leadLabel(s.appointmentLeadMinutes).toLowerCase()}'),
                value: s.appointmentReminders,
                onChanged: (v) => _save(s.copyWith(appointmentReminders: v)),
              ),
              if (s.appointmentReminders)
                ListTile(
                  contentPadding: const EdgeInsets.only(left: 32, right: 16),
                  leading: const Icon(Icons.schedule),
                  title: const Text('Reminder time'),
                  trailing: Text(_leadLabel(s.appointmentLeadMinutes)),
                  onTap: _pickLeadMinutes,
                ),
              SwitchListTile(
                title: const Text('Daily digest'),
                subtitle: const Text("A summary of the day's bookings"),
                value: s.dailyDigest,
                onChanged: (v) => _save(s.copyWith(dailyDigest: v)),
              ),
              if (s.dailyDigest)
                ListTile(
                  contentPadding: const EdgeInsets.only(left: 32, right: 16),
                  leading: const Icon(Icons.schedule),
                  title: const Text('Digest time'),
                  trailing: Text(s.dailyDigestTime),
                  onTap: _pickDigestTime,
                ),
              const Divider(height: 1),
              _sectionHeader('Invoices'),
              SwitchListTile(
                title: const Text('Invoice overdue'),
                subtitle: const Text('When an invoice passes its due date'),
                value: s.invoicesOverdue,
                onChanged: (v) => _save(s.copyWith(invoicesOverdue: v)),
              ),
              SwitchListTile(
                title: const Text('Invoice read'),
                subtitle: const Text('When a customer opens an invoice'),
                value: s.invoicesRead,
                onChanged: (v) => _save(s.copyWith(invoicesRead: v)),
              ),
              const SizedBox(height: 24),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Text(
                  'These settings apply to everyone — notifications are sent to all staff devices signed in to the app.',
                  style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
                ),
              ),
              const SizedBox(height: 24),
            ],
          );
        },
      ),
    );
  }

  Widget _sectionHeader(String title) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 6),
        child: Text(
          title.toUpperCase(),
          style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, letterSpacing: 0.5, color: Colors.grey.shade600),
        ),
      );
}

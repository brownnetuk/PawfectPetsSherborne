import 'package:flutter/material.dart';
import 'notification_settings_screen.dart';

/// App settings hub. Currently just Notifications; a home for future settings.
class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        children: [
          ListTile(
            leading: Icon(Icons.notifications_outlined, color: Theme.of(context).colorScheme.primary),
            title: const Text('Notifications'),
            subtitle: const Text('Choose which push notifications are sent'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const NotificationSettingsScreen()),
            ),
          ),
          const Divider(height: 1),
        ],
      ),
    );
  }
}

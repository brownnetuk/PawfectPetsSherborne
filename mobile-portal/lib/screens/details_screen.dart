import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../state/auth_provider.dart';
import '../theme.dart';
import 'sections/agreement_screen.dart';
import 'sections/animals_screen.dart';
import 'sections/customer_details_screen.dart';
import 'sections/emergency_contact_screen.dart';
import 'sections/emergency_vet_screen.dart';
import 'sections/security_screen.dart';

/// The "My Details" tab: a menu into each editable section of the customer's
/// record. Everything is editable except the Agreement (read-only T&Cs +
/// their signature).
class DetailsScreen extends StatelessWidget {
  const DetailsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final profile = context.watch<AuthProvider>().profile;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(profile?.name ?? '', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                const SizedBox(height: 2),
                Text(profile?.email ?? '', style: TextStyle(color: Colors.grey.shade600)),
              ],
            ),
          ),
        ),
        const SizedBox(height: 8),
        _MenuTile(
          icon: Icons.person_outline,
          title: 'Customer Details',
          subtitle: 'Your name, address and phone',
          onTap: () => _open(context, const CustomerDetailsScreen()),
        ),
        _MenuTile(
          icon: Icons.contact_emergency_outlined,
          title: 'Emergency Contact',
          subtitle: 'Who we call if we can\'t reach you',
          onTap: () => _open(context, const EmergencyContactScreen()),
        ),
        _MenuTile(
          icon: Icons.local_hospital_outlined,
          title: 'Emergency Vet',
          subtitle: 'Your pets\' veterinary practice',
          onTap: () => _open(context, const EmergencyVetScreen()),
        ),
        _MenuTile(
          icon: Icons.pets_outlined,
          title: 'Animals',
          subtitle: 'Your pets',
          onTap: () => _open(context, const AnimalsScreen()),
        ),
        _MenuTile(
          icon: Icons.vpn_key_outlined,
          title: 'Security',
          subtitle: 'Keys, alarm and access notes',
          onTap: () => _open(context, const SecurityScreen()),
        ),
        _MenuTile(
          icon: Icons.description_outlined,
          title: 'Agreement',
          subtitle: 'Terms & conditions you signed',
          onTap: () => _open(context, const AgreementScreen()),
        ),
      ],
    );
  }

  void _open(BuildContext context, Widget screen) {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));
  }
}

class _MenuTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  const _MenuTile({required this.icon, required this.title, required this.subtitle, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: const Color(0xFFEAF5EE),
          child: Icon(icon, color: brandGreenDark),
        ),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text(subtitle),
        trailing: const Icon(Icons.chevron_right),
        onTap: onTap,
      ),
    );
  }
}

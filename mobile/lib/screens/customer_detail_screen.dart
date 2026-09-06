import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../config.dart';
import '../models/animal.dart';
import '../models/customer.dart';
import '../models/form_summary.dart';
import '../widgets/status_badge.dart';
import 'animal_detail_screen.dart';
import 'customer_activity_screen.dart';

class CustomerDetailScreen extends StatefulWidget {
  final String customerId;
  const CustomerDetailScreen({super.key, required this.customerId});

  @override
  State<CustomerDetailScreen> createState() => _CustomerDetailScreenState();
}

class _CustomerDetailScreenState extends State<CustomerDetailScreen> {
  late Future<(Customer, List<Animal>)> _future;
  String? _alarmInstructions;
  bool _revealing = false;
  String? _statusOverride;
  bool _updatingStatus = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    final repo = context.read<Repository>();
    _future = () async {
      final customer = await repo.getCustomer(widget.customerId);
      final animals = await repo.listAnimals(widget.customerId);
      return (customer, animals);
    }();
  }

  Future<void> _changeStatus(String customerId, String current) async {
    final repo = context.read<Repository>();
    final selected = await showModalBottomSheet<String>(
      context: context,
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 16, 20, 8),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text('Change status', style: TextStyle(fontWeight: FontWeight.w600)),
              ),
            ),
            for (final s in customerStatuses)
              ListTile(
                leading: StatusBadge(status: s),
                title: Text(_statusLabel(s)),
                trailing: s == current ? const Icon(Icons.check) : null,
                onTap: () => Navigator.of(context).pop(s),
              ),
          ],
        ),
      ),
    );
    if (selected == null || selected == current) return;
    setState(() => _updatingStatus = true);
    try {
      await repo.updateCustomerStatus(customerId, selected);
      if (mounted) setState(() => _statusOverride = selected);
    } catch (e) {
      if (mounted) {
        final message = e is ApiException ? e.message : 'Failed to update status';
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
      }
    } finally {
      if (mounted) setState(() => _updatingStatus = false);
    }
  }

  String _statusLabel(String s) => switch (s) {
        'pending' => 'Pending',
        'active' => 'Active',
        'inactive' => 'Inactive',
        'update_info' => 'Needs info update',
        _ => s,
      };

  Future<void> _reveal() async {
    setState(() => _revealing = true);
    try {
      final value = await context.read<Repository>().getAlarmInstructions(widget.customerId);
      setState(() => _alarmInstructions = value ?? '(none provided)');
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to reveal: $e')));
      }
    } finally {
      if (mounted) setState(() => _revealing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Customer')),
      body: FutureBuilder<(Customer, List<Animal>)>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            final message =
                snapshot.error is ApiException ? (snapshot.error as ApiException).message : 'Failed to load';
            return Center(child: Text(message));
          }
          final (customer, animals) = snapshot.data!;
          return ListView(
            padding: const EdgeInsets.all(20),
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Text(customer.name, style: Theme.of(context).textTheme.titleLarge),
                  ),
                  InkWell(
                    borderRadius: BorderRadius.circular(999),
                    onTap: _updatingStatus
                        ? null
                        : () => _changeStatus(customer.id, _statusOverride ?? customer.status),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        StatusBadge(status: _statusOverride ?? customer.status),
                        Icon(Icons.arrow_drop_down, size: 20, color: Colors.grey.shade600),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),
              _sectionTitle('Client details'),
              _row('Email', customer.email),
              _phoneRow('Phone number', customer.phoneNumber),
              _row('Address', customer.address ?? '—'),
              if (customer.emergencyContact != null) ...[
                _sectionTitle('Emergency contact'),
                _row('Same as client', customer.emergencyContact!.sameAsClient ? 'Yes' : 'No'),
                if (!customer.emergencyContact!.sameAsClient) ...[
                  _row('Name', customer.emergencyContact!.name ?? '—'),
                  _row('Address', customer.emergencyContact!.address ?? '—'),
                ],
                _phoneRow('Phone number', customer.emergencyContact!.phoneNumber),
              ],
              if (customer.emergencyVet != null) ...[
                _sectionTitle('Emergency vet'),
                _row('Practice', customer.emergencyVet!.practiceName),
                _row('Address', customer.emergencyVet!.address),
                _phoneRow('Telephone', customer.emergencyVet!.telephone),
                _row(
                  'Alt. care',
                  customer.emergencyVet!.alternativeVetAuthorised ? 'Authorised' : 'Not authorised',
                ),
              ],
              if (customer.security != null) ...[
                _sectionTitle('Security'),
                _row('Keys provided', customer.security!.keysProvided ? 'Yes' : 'No'),
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SizedBox(width: 110, child: Text('Alarm code', style: TextStyle(color: Colors.grey.shade600))),
                      Expanded(
                        child: _alarmInstructions != null
                            ? Text(_alarmInstructions!)
                            : TextButton(
                                onPressed: _revealing ? null : _reveal,
                                style: TextButton.styleFrom(padding: EdgeInsets.zero, alignment: Alignment.centerLeft),
                                child: Text(_revealing ? 'Revealing…' : 'Reveal'),
                              ),
                      ),
                    ],
                  ),
                ),
                if (customer.security!.furtherInformation != null &&
                    customer.security!.furtherInformation!.trim().isNotEmpty)
                  _row('Further information', customer.security!.furtherInformation!),
              ],
              Row(
                children: [
                  Expanded(child: _sectionTitle('Pets (${animals.length})')),
                  IconButton(
                    icon: const Icon(Icons.add_circle_outline),
                    color: Theme.of(context).colorScheme.primary,
                    tooltip: 'Add a pet',
                    onPressed: () => _showAddPetSheet(customer),
                  ),
                ],
              ),
              if (animals.isEmpty)
                const Text('No pets registered yet.')
              else
                ...animals.map((a) => Card(
                      margin: const EdgeInsets.only(bottom: 8),
                      child: ListTile(
                        leading: Icon(
                          a.species == 'cat' ? Icons.pets : Icons.pets_outlined,
                        ),
                        title: Text(a.name),
                        subtitle: Text('${a.breed} (${a.species}), ${a.sex}, age ${a.age}'),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () async {
                          await Navigator.of(context).push(
                            MaterialPageRoute(builder: (_) => AnimalDetailScreen(animal: a)),
                          );
                          if (mounted) setState(_load); // reflect edits/deletes
                        },
                      ),
                    )),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => CustomerActivityScreen(
                      customerId: customer.id,
                      customerName: customer.name,
                    ),
                  ),
                ),
                icon: const Icon(Icons.history),
                label: const Text('Activity'),
              ),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: () => _showSendFormSheet(customer),
                icon: const Icon(Icons.description_outlined),
                label: const Text('Send form'),
              ),
            ],
          );
        },
      ),
    );
  }

  void _showSendFormSheet(Customer customer) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: _SendFormSheet(customer: customer),
      ),
    );
  }

  void _showAddPetSheet(Customer customer) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: _AddPetSheet(customer: customer),
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

  /// A detail row whose value is a tappable phone number that opens the dialer.
  Widget _phoneRow(String label, String? phone) {
    final hasPhone = phone != null && phone.trim().isNotEmpty;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 110, child: Text(label, style: TextStyle(color: Colors.grey.shade600))),
          Expanded(
            child: hasPhone
                ? InkWell(
                    onTap: () => _launchPhone(phone),
                    child: Text(
                      phone,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.primary,
                        decoration: TextDecoration.underline,
                      ),
                    ),
                  )
                : const Text('—'),
          ),
        ],
      ),
    );
  }

  Future<void> _launchPhone(String raw) async {
    final uri = Uri(scheme: 'tel', path: raw.replaceAll(RegExp(r'[^0-9+]'), ''));
    try {
      final ok = await launchUrl(uri);
      if (!ok && mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Could not open the phone dialer.')));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Could not open the phone dialer.')));
      }
    }
  }
}

/// Emails the customer a link to add their pet's details themselves -- the same
/// 'add_pet' triggered email + /intake/:customerId/add-pet link the admin sends
/// from Customer > Pets > New pet > "Send a link to the customer".
class _AddPetSheet extends StatefulWidget {
  final Customer customer;
  const _AddPetSheet({required this.customer});

  @override
  State<_AddPetSheet> createState() => _AddPetSheetState();
}

class _AddPetSheetState extends State<_AddPetSheet> {
  bool _sending = false;
  String? _error;

  String get _link => '$intakeBaseUrl/intake/${widget.customer.id}/add-pet';

  Future<void> _send() async {
    final customer = widget.customer;
    if (customer.email.trim().isEmpty) {
      setState(() => _error = 'This customer has no email address on file.');
      return;
    }
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final repo = context.read<Repository>();
      final messenger = ScaffoldMessenger.of(context);
      await repo.sendAddPetEmail(
        to: customer.email,
        name: customer.name,
        link: _link,
        customerId: customer.id,
      );
      if (!mounted) return;
      Navigator.of(context).pop();
      messenger.showSnackBar(SnackBar(content: Text('Add-a-pet link sent to ${customer.email}.')));
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e is ApiException ? e.message : 'Failed to send the email');
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final customer = widget.customer;
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Add a pet', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 4),
          Text(
            'Email ${customer.name} a link to add their pet’s details themselves.',
            style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
          ),
          const SizedBox(height: 16),
          Text('To: ${customer.email}', style: TextStyle(color: Colors.grey.shade700)),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, style: const TextStyle(color: Color(0xFFC0392B))),
          ],
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: _sending ? null : _send,
              icon: const Icon(Icons.send_outlined, size: 18),
              label: Text(_sending ? 'Sending…' : 'Send email'),
            ),
          ),
        ],
      ),
    );
  }
}

/// Emails the customer a fill-in link for a chosen form (the customer-visible
/// forms from Settings > Forms). Mirrors the admin's Send Form.
class _SendFormSheet extends StatefulWidget {
  final Customer customer;
  const _SendFormSheet({required this.customer});

  @override
  State<_SendFormSheet> createState() => _SendFormSheetState();
}

class _SendFormSheetState extends State<_SendFormSheet> {
  List<FormSummary>? _forms;
  String? _formId;
  bool _loading = true;
  bool _sending = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadForms();
  }

  Future<void> _loadForms() async {
    try {
      final all = await context.read<Repository>().listForms();
      final visible = all.where((f) => f.customerVisible).toList()
        ..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
      if (!mounted) return;
      setState(() {
        _forms = visible;
        _formId = visible.isNotEmpty ? visible.first.id : null;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e is ApiException ? e.message : 'Failed to load forms';
        _loading = false;
      });
    }
  }

  Future<void> _send() async {
    final formId = _formId;
    if (formId == null) return;
    final customer = widget.customer;
    if (customer.email.trim().isEmpty) {
      setState(() => _error = 'This customer has no email address on file.');
      return;
    }
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final repo = context.read<Repository>();
      final messenger = ScaffoldMessenger.of(context);
      final form = _forms!.firstWhere((f) => f.id == formId);
      final submissionId = await repo.createFormSubmission(
        formId: formId,
        customerId: customer.id,
        recipientEmail: customer.email,
        recipientName: customer.name,
      );
      await repo.sendFormEmail(
        to: customer.email,
        name: customer.name,
        link: '$intakeBaseUrl/forms/$submissionId',
        customerId: customer.id,
        formName: form.name,
      );
      if (!mounted) return;
      Navigator.of(context).pop();
      messenger.showSnackBar(SnackBar(content: Text('Sent "${form.name}" to ${customer.email}.')));
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e is ApiException ? e.message : 'Failed to send the form');
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final customer = widget.customer;
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Send a form', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 4),
          Text(
            'Email ${customer.name} a link to fill in one of your forms.',
            style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
          ),
          const SizedBox(height: 16),
          if (_loading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_forms == null || _forms!.isEmpty)
            Text(
              _error ?? 'No customer-visible forms are available. Create one (and mark it visible) in Settings > Forms.',
              style: const TextStyle(color: Color(0xFFC0392B)),
            )
          else ...[
            DropdownButtonFormField<String>(
              initialValue: _formId,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Form'),
              items: _forms!
                  .map((f) => DropdownMenuItem(value: f.id, child: Text(f.name, overflow: TextOverflow.ellipsis)))
                  .toList(),
              onChanged: _sending ? null : (v) => setState(() => _formId = v),
            ),
            const SizedBox(height: 12),
            Text('To: ${customer.email}', style: TextStyle(color: Colors.grey.shade700)),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, style: const TextStyle(color: Color(0xFFC0392B))),
            ],
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _sending || _formId == null ? null : _send,
                icon: const Icon(Icons.send_outlined, size: 18),
                label: Text(_sending ? 'Sending…' : 'Send form'),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

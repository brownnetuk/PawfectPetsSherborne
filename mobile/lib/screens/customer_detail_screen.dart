import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/animal.dart';
import '../models/customer.dart';
import '../state/auth_provider.dart';
import '../widgets/status_badge.dart';

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
                  StatusBadge(status: customer.status),
                ],
              ),
              const SizedBox(height: 20),
              _sectionTitle('Client details'),
              _row('Email', customer.email),
              _row('Mobile', customer.mobile ?? '—'),
              _row('Telephone', customer.telephone ?? '—'),
              _row('Address', customer.address ?? '—'),
              if (customer.emergencyContact != null) ...[
                _sectionTitle('Emergency contact'),
                _row('Same as client', customer.emergencyContact!.sameAsClient ? 'Yes' : 'No'),
                if (!customer.emergencyContact!.sameAsClient) ...[
                  _row('Name', customer.emergencyContact!.name ?? '—'),
                  _row('Address', customer.emergencyContact!.address ?? '—'),
                ],
                _row('Telephone', customer.emergencyContact!.telephone ?? '—'),
                _row('Mobile', customer.emergencyContact!.mobile ?? '—'),
              ],
              if (customer.emergencyVet != null) ...[
                _sectionTitle('Emergency vet'),
                _row('Practice', customer.emergencyVet!.practiceName),
                _row('Address', customer.emergencyVet!.address),
                _row('Telephone', customer.emergencyVet!.telephone),
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
              ],
              _sectionTitle('Pets (${animals.length})'),
              if (animals.isEmpty)
                const Text('No pets registered yet.')
              else
                ...animals.map((a) => Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Text('${a.name} — ${a.breed} (${a.species}), ${a.sex}, age ${a.age}'),
                    )),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: () => _showAddNoteSheet(context),
                icon: const Icon(Icons.note_add_outlined),
                label: const Text('Add activity note'),
              ),
            ],
          );
        },
      ),
    );
  }

  void _showAddNoteSheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: _AddNoteSheet(customerId: widget.customerId),
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

class _AddNoteSheet extends StatefulWidget {
  final String customerId;
  const _AddNoteSheet({required this.customerId});

  @override
  State<_AddNoteSheet> createState() => _AddNoteSheetState();
}

class _AddNoteSheetState extends State<_AddNoteSheet> {
  String _type = 'note';
  final _subjectController = TextEditingController();
  final _descriptionController = TextEditingController();
  bool _submitting = false;

  Future<void> _submit() async {
    if (_subjectController.text.trim().isEmpty) return;
    setState(() => _submitting = true);
    try {
      final staffName = context.read<AuthProvider>().staff?.name ?? 'Staff';
      await context.read<Repository>().createActivity(
            customerId: widget.customerId,
            type: _type,
            subject: _subjectController.text.trim(),
            description: _descriptionController.text.trim(),
            createdBy: staffName,
          );
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to add note: $e')));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Add activity', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
            initialValue: _type,
            decoration: const InputDecoration(labelText: 'Type'),
            items: const [
              DropdownMenuItem(value: 'note', child: Text('Note')),
              DropdownMenuItem(value: 'call', child: Text('Call')),
              DropdownMenuItem(value: 'email', child: Text('Email')),
              DropdownMenuItem(value: 'task', child: Text('Task')),
            ],
            onChanged: (v) => setState(() => _type = v ?? 'note'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _subjectController,
            decoration: const InputDecoration(labelText: 'Subject'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _descriptionController,
            decoration: const InputDecoration(labelText: 'Description'),
            maxLines: 3,
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _submitting ? null : _submit,
              child: Text(_submitting ? 'Adding…' : 'Add'),
            ),
          ),
        ],
      ),
    );
  }
}

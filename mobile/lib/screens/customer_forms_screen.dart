import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/form_submission.dart';

/// Every form sent to this customer, newest first -- pending links still
/// awaiting a reply and completed submissions. Tapping a row opens the
/// response (or a "not filled in yet" note for a pending one).
class CustomerFormsScreen extends StatefulWidget {
  final String customerId;
  final String customerName;
  const CustomerFormsScreen({super.key, required this.customerId, required this.customerName});

  @override
  State<CustomerFormsScreen> createState() => _CustomerFormsScreenState();
}

class _CustomerFormsScreenState extends State<CustomerFormsScreen> {
  late Future<List<FormSubmission>> _future;
  static final _fmt = DateFormat('d MMM yyyy');

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<FormSubmission>> _load() async {
    final submissions = await context.read<Repository>().listFormSubmissions(widget.customerId);
    // Newest send first, regardless of the server's ordering.
    submissions.sort((a, b) {
      final at = a.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
      final bt = b.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
      return bt.compareTo(at);
    });
    return submissions;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Forms sent')),
      body: FutureBuilder<List<FormSubmission>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            final message = snapshot.error is ApiException
                ? (snapshot.error as ApiException).message
                : 'Failed to load forms';
            return Center(child: Text(message, textAlign: TextAlign.center));
          }
          final submissions = snapshot.data ?? [];
          if (submissions.isEmpty) {
            return const Center(child: Text('No forms sent yet.'));
          }
          return ListView.separated(
            padding: const EdgeInsets.symmetric(vertical: 8),
            itemCount: submissions.length,
            separatorBuilder: (_, _) => const Divider(height: 1),
            itemBuilder: (context, i) {
              final s = submissions[i];
              final detail = [
                if (s.createdAt != null) 'Sent ${_fmt.format(s.createdAt!.toLocal())}',
                if (s.submittedAt != null) 'Submitted ${_fmt.format(s.submittedAt!.toLocal())}',
              ].join(' · ');
              return ListTile(
                leading: Icon(
                  s.completed ? Icons.assignment_turned_in_outlined : Icons.assignment_outlined,
                  color: s.completed ? Colors.green.shade700 : Colors.grey.shade600,
                ),
                title: Text(s.formName),
                subtitle: Text(detail.isEmpty ? s.recipientEmail : detail),
                trailing: _StatusChip(completed: s.completed),
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => FormResponseScreen(submission: s)),
                ),
              );
            },
          );
        },
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  final bool completed;
  const _StatusChip({required this.completed});

  @override
  Widget build(BuildContext context) {
    final color = completed ? Colors.green.shade700 : Colors.orange.shade800;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        completed ? 'Completed' : 'Pending',
        style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600),
      ),
    );
  }
}

/// A completed submission's answers, walked in the form's own authored order
/// from the send-time field snapshot -- the same flow the admin's PDF export
/// renders (display text in place, repeatable groups inline, signature/photo
/// answers as images). Pending submissions just show a "not filled in" note.
class FormResponseScreen extends StatelessWidget {
  final FormSubmission submission;
  const FormResponseScreen({super.key, required this.submission});

  static final _date = DateFormat('d MMM yyyy');
  static final _dateTime = DateFormat('d MMM yyyy, HH:mm');

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(submission.formName)),
      body: !submission.completed
          ? const Center(child: Text('Not filled in yet.'))
          : ListView(
              padding: const EdgeInsets.all(20),
              children: [
                Text(
                  [
                    submission.recipientName ?? submission.recipientEmail,
                    if (submission.submittedAt != null)
                      'submitted ${_date.format(submission.submittedAt!.toLocal())}',
                  ].join(' — '),
                  style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
                ),
                if ((submission.formDescription ?? '').trim().isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Text(submission.formDescription!),
                ],
                const SizedBox(height: 8),
                ..._fieldWidgets(context, submission.fields, submission.answers),
              ],
            ),
    );
  }

  List<Widget> _fieldWidgets(
    BuildContext context,
    List<Map<String, dynamic>> fields,
    Map<String, dynamic> answers,
  ) {
    final widgets = <Widget>[];
    for (final field in fields) {
      final type = field['type'] as String? ?? 'text';
      final label = field['label'] as String? ?? '';
      final value = answers[field['id']];

      if (type == 'display') {
        // Staff-authored free text (often consent wording) -- shown verbatim
        // in place, exactly as the customer saw it.
        widgets.add(Padding(
          padding: const EdgeInsets.only(top: 12),
          child: Text(label),
        ));
        continue;
      }

      if (type == 'group') {
        widgets.add(Padding(
          padding: const EdgeInsets.only(top: 16, bottom: 4),
          child: Text(label, style: Theme.of(context).textTheme.titleSmall),
        ));
        final repetitions = (value as List<dynamic>? ?? [])
            .whereType<Map>()
            .map((e) => e.cast<String, dynamic>())
            .toList();
        if (repetitions.isEmpty) {
          widgets.add(Text('None provided.',
              style: TextStyle(color: Colors.grey.shade600, fontStyle: FontStyle.italic)));
        } else {
          final groupFields = (field['fields'] as List<dynamic>? ?? [])
              .whereType<Map>()
              .map((e) => e.cast<String, dynamic>())
              .toList();
          for (var i = 0; i < repetitions.length; i++) {
            widgets.add(Padding(
              padding: const EdgeInsets.only(top: 8, bottom: 2),
              child: Text('$label ${i + 1}', style: const TextStyle(fontWeight: FontWeight.w600)),
            ));
            widgets.addAll(_fieldWidgets(context, groupFields, repetitions[i]));
          }
        }
        continue;
      }

      if (type == 'signature' && value is String && value.isNotEmpty) {
        widgets.add(_labelled(label, _dataUrlImage(value, height: 80, alignLeft: true)));
        continue;
      }

      if (type == 'file' && value is List && value.isNotEmpty) {
        widgets.add(_labelled(
          label,
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: value
                .whereType<String>()
                .map((src) => _dataUrlImage(src, height: 96))
                .toList(),
          ),
        ));
        continue;
      }

      widgets.add(_row(label, _formatAnswer(type, value)));
    }
    return widgets;
  }

  /// Mirrors the admin PDF's formatAnswer: toggles read Yes/No, multi-choice
  /// joins its selections, and the auto date/datetime fields localise.
  String _formatAnswer(String type, dynamic value) {
    if (value == null || value == '') return '—';
    if (type == 'toggle') return value == true || value == 'true' ? 'Yes' : 'No';
    if (type == 'multichoice' && value is List) {
      return value.isEmpty ? '—' : value.join(', ');
    }
    if ((type == 'date' || type == 'today' || type == 'datetime') && value is String) {
      final parsed = DateTime.tryParse(value);
      if (parsed != null) {
        return type == 'datetime' ? _dateTime.format(parsed.toLocal()) : _date.format(parsed.toLocal());
      }
    }
    return '$value';
  }

  Widget _row(String label, String value) => Padding(
        padding: const EdgeInsets.only(top: 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(width: 130, child: Text(label, style: TextStyle(color: Colors.grey.shade600))),
            Expanded(child: Text(value)),
          ],
        ),
      );

  Widget _labelled(String label, Widget child) => Padding(
        padding: const EdgeInsets.only(top: 10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: TextStyle(color: Colors.grey.shade600)),
            const SizedBox(height: 6),
            child,
          ],
        ),
      );

  /// Renders a base64 data-URL image (signatures and photo answers are stored
  /// this way); malformed data degrades to a note rather than an error.
  Widget _dataUrlImage(String src, {required double height, bool alignLeft = false}) {
    final bytes = _decodeDataUrl(src);
    if (bytes == null) {
      return Text('(image unavailable)',
          style: TextStyle(color: Colors.grey.shade600, fontStyle: FontStyle.italic));
    }
    final image = ClipRRect(
      borderRadius: BorderRadius.circular(6),
      child: Container(
        decoration: BoxDecoration(
          border: Border.all(color: Colors.grey.shade300),
          borderRadius: BorderRadius.circular(6),
        ),
        child: Image.memory(bytes, height: height, fit: BoxFit.contain),
      ),
    );
    return alignLeft ? Align(alignment: Alignment.centerLeft, child: image) : image;
  }

  Uint8List? _decodeDataUrl(String src) {
    if (!src.startsWith('data:')) return null;
    final comma = src.indexOf(',');
    if (comma == -1) return null;
    try {
      return base64Decode(src.substring(comma + 1));
    } catch (_) {
      return null;
    }
  }
}

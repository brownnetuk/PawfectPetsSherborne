import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/form_submission.dart';
import '../state/auth_provider.dart';
import '../widgets/signature_pad.dart';
import 'customer_forms_screen.dart';

/// Staff-facing form filling for check-in/check-out -- the mobile port of the
/// admin's FormFillModal. Loads the submission's public (recipient-resolved)
/// fields, renders them by type, validates the same way, and posts the
/// answers to the same submit endpoint the customer fill page uses. Pops
/// `true` once submitted.
class FormFillScreen extends StatefulWidget {
  final String submissionId;
  final String title;

  /// The dog(s) already known from the booking -- a repeatable group with a
  /// customer-pets choice gets one pre-filled repetition per name (same
  /// behaviour as the admin modal).
  final List<String> presetPetNames;

  /// A completed submission to consult while filling (the check-in's answers
  /// during check-out) -- offered as a "View" button rather than inline.
  final String? referenceSubmissionId;
  final String referenceLabel;

  const FormFillScreen({
    super.key,
    required this.submissionId,
    required this.title,
    this.presetPetNames = const [],
    this.referenceSubmissionId,
    this.referenceLabel = 'Check-in details',
  });

  @override
  State<FormFillScreen> createState() => _FormFillScreenState();
}

class _FormFillScreenState extends State<FormFillScreen> {
  List<Map<String, dynamic>>? _fields;
  String? _formDescription;
  String? _loadError;
  bool _alreadyCompleted = false;
  final Map<String, dynamic> _answers = {};
  bool _submitting = false;
  bool _busy = false; // photo pick / reference view in flight

  /// The completed reference (check-in) submission, loaded up front so each
  /// pet's section can show its check-in answers inline while filling in the
  /// check-out. Null when there's no reference or it failed to load (the
  /// "View" button still reports on-demand failures).
  FormSubmission? _reference;

  static final _dateFmt = DateFormat('d MMM yyyy');
  static final _dateTimeFmt = DateFormat('d MMM yyyy, HH:mm');

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final repo = context.read<Repository>();
      final json = await repo.getFormSubmissionPublic(widget.submissionId);
      FormSubmission? reference;
      if (widget.referenceSubmissionId != null) {
        try {
          reference = await repo.getFormSubmission(widget.referenceSubmissionId!);
        } catch (_) {
          // Inline check-in context is a nicety; the form still fills fine.
        }
      }
      if (!mounted) return;
      final staffName = context.read<AuthProvider>().staff?.name ?? 'Staff';
      final fields = (json['fields'] as List<dynamic>? ?? [])
          .whereType<Map>()
          .map((e) => _resolveStaffPlaceholder(e.cast<String, dynamic>(), staffName))
          .toList();
      setState(() {
        if (json['status'] == 'completed') {
          _alreadyCompleted = true;
          return;
        }
        _fields = fields;
        _formDescription = json['formDescription'] as String?;
        _reference = reference;
        _initAnswers(fields);
      });
    } catch (e) {
      if (mounted) {
        setState(() => _loadError = e is ApiException ? e.message : "Couldn't load this form.");
      }
    }
  }

  /// {{staffMemberSignedIn}} is deliberately left unresolved server-side (the
  /// public endpoint has no staff identity) -- substitute it here from the
  /// logged-in session, same as the admin modal.
  Map<String, dynamic> _resolveStaffPlaceholder(Map<String, dynamic> field, String staffName) {
    String replace(String s) => s.replaceAll('{{staffMemberSignedIn}}', staffName);
    final copy = Map<String, dynamic>.of(field);
    if (copy['label'] is String) copy['label'] = replace(copy['label'] as String);
    if (copy['defaultValue'] is String) copy['defaultValue'] = replace(copy['defaultValue'] as String);
    if (copy['type'] == 'group') {
      copy['fields'] = (copy['fields'] as List<dynamic>? ?? [])
          .whereType<Map>()
          .map((e) => _resolveStaffPlaceholder(e.cast<String, dynamic>(), staffName))
          .toList();
    }
    return copy;
  }

  // --- defaults / visibility / emptiness: ports of admin/src/forms/formDefaults.ts ---

  Map<String, dynamic> _defaultAnswersFor(List<Map<String, dynamic>> fields) {
    final defaults = <String, dynamic>{};
    final now = DateTime.now();
    for (final f in fields) {
      final type = f['type'] as String? ?? 'text';
      final id = f['id'] as String? ?? '';
      if (type == 'toggle') defaults[id] = false;
      if (type == 'today') defaults[id] = now.toIso8601String().substring(0, 10);
      if (type == 'datetime') defaults[id] = now.toIso8601String();
      final defaultValue = f['defaultValue'];
      if (defaultValue is String &&
          defaultValue.isNotEmpty &&
          (type == 'text' || type == 'textarea' || type == 'number' || type == 'date')) {
        defaults[id] = defaultValue;
      }
    }
    return defaults;
  }

  void _initAnswers(List<Map<String, dynamic>> fields) {
    _answers.addAll(_defaultAnswersFor(fields.where((f) => f['type'] != 'group').toList()));
    for (final f in fields) {
      if (f['type'] != 'group') continue;
      final id = f['id'] as String;
      final groupFields = _groupFields(f);
      Map<String, dynamic>? petNameField;
      for (final gf in groupFields) {
        if (gf['type'] == 'choice' && gf['optionsSource'] == 'customerPets') petNameField = gf;
      }
      if (petNameField != null && widget.presetPetNames.isNotEmpty) {
        _answers[id] = widget.presetPetNames
            .map((name) => {..._defaultAnswersFor(groupFields), petNameField!['id'] as String: name})
            .toList();
      } else {
        final minRepeats = (f['minRepeats'] as num?)?.toInt() ?? 0;
        _answers[id] = List.generate(minRepeats, (_) => _defaultAnswersFor(groupFields));
      }
    }
  }

  List<Map<String, dynamic>> _groupFields(Map<String, dynamic> group) =>
      (group['fields'] as List<dynamic>? ?? []).whereType<Map>().map((e) => e.cast<String, dynamic>()).toList();

  bool _isFieldVisible(Map<String, dynamic> field, Map<String, dynamic> scopeAnswers) {
    final rule = field['visibleWhen'];
    if (rule is! Map) return true;
    final conditions = (rule['conditions'] as List<dynamic>? ?? []).whereType<Map>().toList();
    if (conditions.isEmpty) return true;
    final results =
        conditions.map((c) => '${scopeAnswers[c['fieldId']]}' == '${c['equals']}').toList();
    return rule['mode'] == 'any' ? results.any((r) => r) : results.every((r) => r);
  }

  bool _isEmpty(Map<String, dynamic> field, dynamic value) {
    final type = field['type'];
    if (type == 'file' || type == 'multichoice') return value is! List || value.isEmpty;
    if (type == 'toggle') return false;
    return value == null || value == '';
  }

  String? _validate() {
    for (final field in _fields!) {
      final label = field['label'] as String? ?? '';
      if (field['type'] == 'group') {
        final repetitions = (_answers[field['id']] as List<dynamic>? ?? []).cast<Map<String, dynamic>>();
        final minRepeats = (field['minRepeats'] as num?)?.toInt() ?? 0;
        if (repetitions.length < minRepeats) {
          return 'Please add at least $minRepeats ${label.toLowerCase()}.';
        }
        for (final repetition in repetitions) {
          for (final child in _groupFields(field)) {
            if (!_isFieldVisible(child, repetition)) continue;
            if (child['required'] == true && _isEmpty(child, repetition[child['id']])) {
              return 'Please fill in "${child['label']}" for each ${label.toLowerCase()}.';
            }
          }
        }
      } else {
        if (!_isFieldVisible(field, _answers)) continue;
        if (field['required'] == true && _isEmpty(field, _answers[field['id']])) {
          return 'Please fill in "$label".';
        }
      }
    }
    return null;
  }

  Future<void> _submit() async {
    final error = _validate();
    if (error != null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error)));
      return;
    }
    setState(() => _submitting = true);
    try {
      await context.read<Repository>().submitFormSubmission(widget.submissionId, _answers);
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        final message = e is ApiException ? e.message : 'Something went wrong. Please try again.';
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _viewReference() async {
    if (_busy || widget.referenceSubmissionId == null) return;
    setState(() => _busy = true);
    try {
      final submission = await context.read<Repository>().getFormSubmission(widget.referenceSubmissionId!);
      if (!mounted) return;
      await Navigator.of(context).push(
        MaterialPageRoute(fullscreenDialog: true, builder: (_) => FormResponseScreen(submission: submission)),
      );
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Failed to load the ${widget.referenceLabel.toLowerCase()}.')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: _loadError != null
          ? Center(child: Text(_loadError!, textAlign: TextAlign.center))
          : _alreadyCompleted
              ? const Center(child: Text('This form has already been completed.'))
              : _fields == null
                  ? const Center(child: CircularProgressIndicator())
                  : ListView(
                      padding: const EdgeInsets.all(20),
                      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                      children: [
                        if (widget.referenceSubmissionId != null)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: OutlinedButton.icon(
                              onPressed: _busy ? null : _viewReference,
                              icon: const Icon(Icons.visibility_outlined, size: 18),
                              label: Text('View ${widget.referenceLabel.toLowerCase()}'),
                            ),
                          ),
                        if ((_formDescription ?? '').trim().isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: Text(_formDescription!, style: TextStyle(color: Colors.grey.shade700)),
                          ),
                        ..._fields!
                            .where((f) => _isFieldVisible(f, _answers))
                            .map((f) => _buildField(f, _answers, (id, v) => setState(() => _answers[id] = v))),
                        const SizedBox(height: 16),
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton(
                            onPressed: _submitting ? null : _submit,
                            child: Text(_submitting ? 'Submitting…' : 'Submit'),
                          ),
                        ),
                      ],
                    ),
    );
  }

  // --- field rendering ---

  Widget _buildField(
    Map<String, dynamic> field,
    Map<String, dynamic> scope,
    void Function(String id, dynamic value) setAnswer, {
    String keyPrefix = '',
  }) {
    final type = field['type'] as String? ?? 'text';
    final id = field['id'] as String? ?? '';
    final label = field['label'] as String? ?? '';
    final required = field['required'] == true;
    final labelText = required ? '$label *' : label;
    final value = scope[id];

    switch (type) {
      case 'display':
        return Padding(
          padding: const EdgeInsets.only(top: 8, bottom: 8),
          child: Text(label),
        );
      case 'today':
      case 'datetime':
        final parsed = value is String ? DateTime.tryParse(value) : null;
        final text = parsed == null
            ? ''
            : type == 'today'
                ? _dateFmt.format(parsed.toLocal())
                : _dateTimeFmt.format(parsed.toLocal());
        return _padded(InputDecorator(
          decoration: InputDecoration(labelText: label, isDense: true, enabled: false),
          child: Text(text),
        ));
      case 'text':
      case 'textarea':
      case 'number':
        return _padded(TextFormField(
          key: ValueKey('$keyPrefix$id'),
          initialValue: value?.toString() ?? '',
          maxLines: type == 'textarea' ? 3 : 1,
          keyboardType: type == 'number' ? const TextInputType.numberWithOptions(decimal: true) : null,
          inputFormatters: type == 'number' ? [FilteringTextInputFormatter.allow(RegExp(r'[0-9.\-]'))] : null,
          decoration: InputDecoration(labelText: labelText, isDense: true),
          onChanged: (v) => setAnswer(id, v),
          onTapOutside: (_) => FocusManager.instance.primaryFocus?.unfocus(),
        ));
      case 'date':
        final parsed = value is String ? DateTime.tryParse(value) : null;
        return _padded(InkWell(
          onTap: () async {
            final picked = await showDatePicker(
              context: context,
              initialDate: parsed ?? DateTime.now(),
              firstDate: DateTime(1990),
              lastDate: DateTime(2100),
            );
            if (picked != null) {
              setAnswer(id,
                  '${picked.year.toString().padLeft(4, '0')}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}');
            }
          },
          child: InputDecorator(
            decoration: InputDecoration(labelText: labelText, isDense: true),
            child: Text(parsed == null ? 'Choose' : _dateFmt.format(parsed)),
          ),
        ));
      case 'toggle':
        return SwitchListTile(
          contentPadding: EdgeInsets.zero,
          dense: true,
          title: Text(label),
          value: value == true,
          onChanged: (v) => setAnswer(id, v),
        );
      case 'choice':
        final options = (field['options'] as List<dynamic>? ?? []).map((o) => o.toString()).toList();
        return _padded(DropdownButtonFormField<String>(
          key: ValueKey('$keyPrefix$id-${value ?? ''}'),
          initialValue: value is String && options.contains(value) ? value : null,
          isExpanded: true,
          decoration: InputDecoration(labelText: labelText, isDense: true),
          items: options.map((o) => DropdownMenuItem(value: o, child: Text(o, overflow: TextOverflow.ellipsis))).toList(),
          onChanged: (v) => setAnswer(id, v),
        ));
      case 'multichoice':
        final options = (field['options'] as List<dynamic>? ?? []).map((o) => o.toString()).toList();
        final selected = (value as List<dynamic>? ?? []).map((v) => v.toString()).toList();
        return Padding(
          padding: const EdgeInsets.only(bottom: 4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _fieldLabel(labelText),
              for (final o in options)
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  dense: true,
                  controlAffinity: ListTileControlAffinity.leading,
                  value: selected.contains(o),
                  onChanged: (v) {
                    final next = [...selected];
                    if (v == true) {
                      next.add(o);
                    } else {
                      next.remove(o);
                    }
                    setAnswer(id, next);
                  },
                  title: Text(o),
                ),
            ],
          ),
        );
      case 'signature':
        return Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _fieldLabel(labelText),
              const SizedBox(height: 6),
              SignaturePad(
                key: ValueKey('$keyPrefix$id'),
                onChanged: (dataUrl) => setAnswer(id, dataUrl),
              ),
            ],
          ),
        );
      case 'file':
        return _photoField(field, scope, setAnswer);
      case 'group':
        return _groupField(field);
      default:
        return const SizedBox.shrink();
    }
  }

  Widget _photoField(
    Map<String, dynamic> field,
    Map<String, dynamic> scope,
    void Function(String id, dynamic value) setAnswer,
  ) {
    final id = field['id'] as String;
    final label = field['label'] as String? ?? '';
    final required = field['required'] == true;
    final maxFiles = (field['maxFiles'] as num?)?.toInt() ?? 5;
    final photos = (scope[id] as List<dynamic>? ?? []).map((v) => v.toString()).toList();

    Future<void> pick(ImageSource source) async {
      if (_busy) return;
      setState(() => _busy = true);
      try {
        // Same downscale the expense receipt capture uses, keeping the
        // base64 payload well under the API's body-size limit.
        final file = await ImagePicker().pickImage(source: source, imageQuality: 70, maxWidth: 1600);
        if (file == null) return;
        final bytes = await file.readAsBytes();
        setAnswer(id, [...photos, 'data:image/jpeg;base64,${base64Encode(bytes)}']);
      } catch (_) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Failed to add the photo.')));
        }
      } finally {
        if (mounted) setState(() => _busy = false);
      }
    }

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _fieldLabel(required ? '$label *' : label),
          const SizedBox(height: 6),
          if (photos.isNotEmpty)
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (var i = 0; i < photos.length; i++)
                  Stack(
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(6),
                        child: Image.memory(
                          base64Decode(photos[i].split(',').last),
                          height: 88,
                          width: 88,
                          fit: BoxFit.cover,
                        ),
                      ),
                      Positioned(
                        top: 0,
                        right: 0,
                        child: InkWell(
                          onTap: () => setAnswer(id, [...photos]..removeAt(i)),
                          child: Container(
                            decoration: BoxDecoration(color: Colors.black54, borderRadius: BorderRadius.circular(999)),
                            padding: const EdgeInsets.all(2),
                            child: const Icon(Icons.close, size: 14, color: Colors.white),
                          ),
                        ),
                      ),
                    ],
                  ),
              ],
            ),
          if (photos.length < maxFiles)
            Row(
              children: [
                TextButton.icon(
                  onPressed: _busy ? null : () => pick(ImageSource.camera),
                  icon: const Icon(Icons.photo_camera_outlined, size: 18),
                  label: const Text('Camera'),
                ),
                TextButton.icon(
                  onPressed: _busy ? null : () => pick(ImageSource.gallery),
                  icon: const Icon(Icons.photo_library_outlined, size: 18),
                  label: const Text('Library'),
                ),
              ],
            ),
        ],
      ),
    );
  }

  // --- inline check-in context inside each pet's check-out section ---

  /// The reference (check-in) submission's per-pet group: the first group
  /// field with answered repetitions, plus the id of its "which pet" choice
  /// (the snapshot keeps optionsSource, unlike the public fields).
  ({List<Map<String, dynamic>> fields, List<Map<String, dynamic>> repetitions, String? petFieldId})?
      _referenceGroup() {
    final ref = _reference;
    if (ref == null) return null;
    for (final f in ref.fields) {
      if (f['type'] != 'group') continue;
      final repetitions = (ref.answers[f['id']] as List<dynamic>? ?? [])
          .whereType<Map>()
          .map((e) => e.cast<String, dynamic>())
          .toList();
      if (repetitions.isEmpty) continue;
      final groupFields = _groupFields(f);
      String? petFieldId;
      for (final gf in groupFields) {
        if (gf['type'] == 'choice' && gf['optionsSource'] == 'customerPets') petFieldId = gf['id'] as String?;
      }
      return (fields: groupFields, repetitions: repetitions, petFieldId: petFieldId);
    }
    return null;
  }

  /// This check-out repetition's pet name: any choice answer that matches one
  /// of the booking's pets (the public fields have optionsSource stripped, so
  /// the value itself is the only reliable signal).
  String? _petNameOf(List<Map<String, dynamic>> groupFields, Map<String, dynamic> repetition) {
    for (final f in groupFields) {
      if (f['type'] != 'choice') continue;
      final v = repetition[f['id']]?.toString();
      if (v != null && widget.presetPetNames.contains(v)) return v;
    }
    return null;
  }

  /// The read-only check-in answers for one pet, shown inside that pet's
  /// check-out section. Matches by pet name when both sides carry one, else
  /// by repetition order (both forms pre-fill one section per booked dog in
  /// the same order).
  Widget? _checkInBlock(List<Map<String, dynamic>> groupFields, Map<String, dynamic> repetition, int index) {
    final ref = _referenceGroup();
    if (ref == null) return null;
    final petName = _petNameOf(groupFields, repetition);
    Map<String, dynamic>? refRepetition;
    if (petName != null && ref.petFieldId != null) {
      for (final rep in ref.repetitions) {
        if (rep[ref.petFieldId]?.toString() == petName) refRepetition = rep;
      }
    }
    refRepetition ??= index < ref.repetitions.length ? ref.repetitions[index] : null;
    if (refRepetition == null) return null;

    final rows = <Widget>[];
    for (final f in ref.fields) {
      final type = f['type'] as String? ?? 'text';
      if (type == 'display' || type == 'group') continue;
      final label = f['label'] as String? ?? '';
      final value = refRepetition[f['id']];
      if (type == 'signature' && value is String && value.isNotEmpty) {
        rows.add(_refImageRow(label, [value], height: 48));
        continue;
      }
      if (type == 'file' && value is List && value.isNotEmpty) {
        rows.add(_refImageRow(label, value.whereType<String>().toList(), height: 56));
        continue;
      }
      rows.add(Padding(
        padding: const EdgeInsets.only(bottom: 3),
        child: Text.rich(TextSpan(children: [
          TextSpan(text: '$label  ', style: TextStyle(color: Colors.grey.shade600, fontSize: 12)),
          TextSpan(text: _formatRefAnswer(type, value), style: const TextStyle(fontSize: 13)),
        ])),
      ));
    }
    if (rows.isEmpty) return null;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Colors.green.shade50,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.green.shade100),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.login_outlined, size: 14, color: Colors.green.shade800),
              const SizedBox(width: 6),
              Text(
                'At check-in${petName != null ? ' · $petName' : ''}',
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Colors.green.shade800),
              ),
            ],
          ),
          const SizedBox(height: 6),
          ...rows,
        ],
      ),
    );
  }

  Widget _refImageRow(String label, List<String> sources, {required double height}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: TextStyle(color: Colors.grey.shade600, fontSize: 12)),
          const SizedBox(height: 3),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final src in sources)
                if (src.startsWith('data:') && src.contains(','))
                  ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: Image.memory(base64Decode(src.split(',').last), height: height, fit: BoxFit.contain),
                  ),
            ],
          ),
        ],
      ),
    );
  }

  String _formatRefAnswer(String type, dynamic value) {
    if (value == null || value == '') return '—';
    if (type == 'toggle') return value == true || value == 'true' ? 'Yes' : 'No';
    if (type == 'multichoice' && value is List) return value.isEmpty ? '—' : value.join(', ');
    if ((type == 'date' || type == 'today' || type == 'datetime') && value is String) {
      final parsed = DateTime.tryParse(value);
      if (parsed != null) {
        return type == 'datetime' ? _dateTimeFmt.format(parsed.toLocal()) : _dateFmt.format(parsed.toLocal());
      }
    }
    return '$value';
  }

  Widget _groupField(Map<String, dynamic> field) {
    final id = field['id'] as String;
    final label = field['label'] as String? ?? '';
    final groupFields = _groupFields(field);
    final repetitions = (_answers[id] as List<dynamic>? ?? []).cast<Map<String, dynamic>>();
    final minRepeats = (field['minRepeats'] as num?)?.toInt() ?? 0;
    final maxRepeats = (field['maxRepeats'] as num?)?.toInt();

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 8, bottom: 4),
            child: Text(label, style: Theme.of(context).textTheme.titleSmall),
          ),
          for (var i = 0; i < repetitions.length; i++)
            Card(
              margin: const EdgeInsets.only(bottom: 8),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text('$label ${i + 1}', style: const TextStyle(fontWeight: FontWeight.w600)),
                        ),
                        if (repetitions.length > minRepeats)
                          IconButton(
                            icon: const Icon(Icons.delete_outline, size: 20),
                            tooltip: 'Remove',
                            onPressed: () => setState(() {
                              _answers[id] = [...repetitions]..removeAt(i);
                            }),
                          ),
                      ],
                    ),
                    if (_checkInBlock(groupFields, repetitions[i], i) case final Widget block) block,
                    ...groupFields.where((gf) => _isFieldVisible(gf, repetitions[i])).map(
                          (gf) => _buildField(
                            gf,
                            repetitions[i],
                            (fieldId, v) => setState(() {
                              final next = [...repetitions];
                              next[i] = {...next[i], fieldId: v};
                              _answers[id] = next;
                            }),
                            keyPrefix: '$id-$i-',
                          ),
                        ),
                  ],
                ),
              ),
            ),
          if (maxRepeats == null || repetitions.length < maxRepeats)
            TextButton.icon(
              onPressed: () => setState(() {
                _answers[id] = [...repetitions, _defaultAnswersFor(groupFields)];
              }),
              icon: const Icon(Icons.add, size: 18),
              label: Text('Add ${label.toLowerCase()}'),
            ),
        ],
      ),
    );
  }

  Widget _fieldLabel(String text) => Text(
        text,
        style: TextStyle(color: Colors.grey.shade700, fontSize: 12, fontWeight: FontWeight.w600),
      );

  Widget _padded(Widget child) => Padding(padding: const EdgeInsets.only(bottom: 12), child: child);
}

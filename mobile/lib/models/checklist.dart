// Checklists for the Boarding & Day Care area, mirroring the backend's
// `checklists/` module: a ChecklistTemplate is a reusable named task list
// (admin Settings > Boarding > Checklists), and a ChecklistAssignment is one
// day's copy of it that staff tick off, add notes to and sign off.

const checklistCategoryLabels = {'boarding': 'Boarding', 'dayCare': 'Day Care'};

class ChecklistTemplate {
  final String id;
  final String category; // 'boarding' | 'dayCare'
  final String name;
  final String? completeByTime; // display only, e.g. "10:00"
  final List<String> items;
  final bool autoAssign;

  ChecklistTemplate({
    required this.id,
    required this.category,
    required this.name,
    this.completeByTime,
    required this.items,
    required this.autoAssign,
  });

  String get categoryLabel => checklistCategoryLabels[category] ?? category;

  factory ChecklistTemplate.fromJson(Map<String, dynamic> json) => ChecklistTemplate(
        id: json['_id'] as String,
        category: json['category'] as String? ?? 'boarding',
        name: json['name'] as String? ?? '',
        completeByTime: (json['completeByTime'] as String?)?.trim().isEmpty ?? true
            ? null
            : (json['completeByTime'] as String).trim(),
        items: (json['items'] as List<dynamic>? ?? []).map((e) => e.toString()).toList(),
        autoAssign: json['autoAssign'] as bool? ?? false,
      );
}

class ChecklistAssignment {
  final String id;
  final String templateId;
  final String category;
  final String name;
  final String? completeByTime;
  final List<String> items;
  final DateTime date;
  // Parallel to [items]: ticked state and who ticked it (server-attributed).
  final List<bool> completed;
  final List<String?> completedBy;
  final String? notes;
  final String? signatureImage; // base64 PNG data URI
  final String? signedBy;
  final DateTime? signedAt;

  ChecklistAssignment({
    required this.id,
    required this.templateId,
    required this.category,
    required this.name,
    this.completeByTime,
    required this.items,
    required this.date,
    required this.completed,
    required this.completedBy,
    this.notes,
    this.signatureImage,
    this.signedBy,
    this.signedAt,
  });

  String get categoryLabel => checklistCategoryLabels[category] ?? category;
  int get doneCount => completed.where((c) => c).length;
  bool get allDone => items.isNotEmpty && doneCount == items.length;
  bool get isSigned => (signatureImage ?? '').isNotEmpty;

  factory ChecklistAssignment.fromJson(Map<String, dynamic> json) {
    final items = (json['items'] as List<dynamic>? ?? []).map((e) => e.toString()).toList();
    // The parallel arrays can be shorter than items on an older record; pad
    // them so every item has a state.
    final rawDone = (json['completed'] as List<dynamic>? ?? []).map((e) => e == true).toList();
    final rawBy = (json['completedBy'] as List<dynamic>? ?? []).map((e) => e as String?).toList();
    final template = json['template'];
    final completeBy = (json['completeByTime'] as String?)?.trim();
    return ChecklistAssignment(
      id: json['_id'] as String,
      templateId: template is Map<String, dynamic> ? (template['_id'] as String? ?? '') : (template as String? ?? ''),
      category: json['category'] as String? ?? 'boarding',
      name: json['name'] as String? ?? '',
      completeByTime: completeBy == null || completeBy.isEmpty ? null : completeBy,
      items: items,
      date: DateTime.parse(json['date'] as String).toLocal(),
      completed: [for (var i = 0; i < items.length; i++) i < rawDone.length && rawDone[i]],
      completedBy: [for (var i = 0; i < items.length; i++) i < rawBy.length ? rawBy[i] : null],
      notes: json['notes'] as String?,
      signatureImage: json['signatureImage'] as String?,
      signedBy: json['signedBy'] as String?,
      signedAt: json['signedAt'] == null ? null : DateTime.tryParse(json['signedAt'] as String)?.toLocal(),
    );
  }
}

/// What {{petName}} reads as on a per-pet page with no pet name to show (an
/// older submission, or a group without fixed per-pet labels).
const petNameFallback = 'your dog';

/// The fixed label (the pet's name) for repetition [index] of a per-pet group
/// -- the pre-check-in form's "Pet"/"Boarding Specific Questions" sections,
/// sized to the booking's animals -- or null for an ordinary repeatable group.
String? repetitionLabel(Map<String, dynamic> group, int index) {
  final labels = group['repetitionLabels'];
  if (labels is! List || index >= labels.length) return null;
  final label = labels[index]?.toString().trim() ?? '';
  return label.isEmpty ? null : label;
}

/// Port of admin/src/forms/formDefaults.ts's withPetName: the pre-check-in
/// form's per-pet pages keep {{petName}} as literal text (see the backend's
/// groupPlaceholders) so each page can show its OWN pet's name.
List<Map<String, dynamic>> withPetName(List<Map<String, dynamic>> fields, String? name) {
  final resolved = (name == null || name.trim().isEmpty) ? petNameFallback : name.trim();
  return fields.map((f) {
    final label = f['label'];
    if (label is! String || !label.contains('{{petName}}')) return f;
    return {...f, 'label': label.replaceAll('{{petName}}', resolved)};
  }).toList();
}

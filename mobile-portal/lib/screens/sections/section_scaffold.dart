import 'package:flutter/material.dart';

/// Shared chrome for an editable Details sub-section: an app bar, an error
/// banner, the scrollable form body, and a sticky Save button.
class SectionScaffold extends StatelessWidget {
  final String title;
  final bool saving;
  final String? error;
  final Future<void> Function() onSave;
  final List<Widget> children;
  // Optional label override for the primary button (e.g. add vs save).
  final String saveLabel;

  const SectionScaffold({
    super.key,
    required this.title,
    required this.saving,
    required this.error,
    required this.onSave,
    required this.children,
    this.saveLabel = 'Save changes',
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: Column(
        children: [
          if (error != null)
            Container(
              width: double.infinity,
              color: const Color(0xFFFDECEA),
              padding: const EdgeInsets.all(12),
              child: Text(error!, style: const TextStyle(color: Color(0xFFC0392B))),
            ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: children,
            ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
              child: SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: saving ? null : onSave,
                  child: Text(saving ? 'Saving…' : saveLabel),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// A labelled text field with consistent spacing for section forms.
Widget sectionField(
  String label,
  TextEditingController controller, {
  TextInputType? keyboard,
  int maxLines = 1,
}) {
  return Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: TextField(
      controller: controller,
      keyboardType: keyboard,
      maxLines: maxLines,
      decoration: InputDecoration(labelText: label),
    ),
  );
}

import 'package:flutter/material.dart';

/// Deliberate delete confirmation: the user must tick a checkbox and then
/// press-and-hold the Delete button for a full 5 seconds. Releasing early
/// cancels. Pops `true` only once the hold completes.
class HoldToDeleteDialog extends StatefulWidget {
  final String title;
  final String message;
  const HoldToDeleteDialog({
    super.key,
    this.title = 'Delete?',
    required this.message,
  });

  @override
  State<HoldToDeleteDialog> createState() => _HoldToDeleteDialogState();
}

class _HoldToDeleteDialogState extends State<HoldToDeleteDialog>
    with SingleTickerProviderStateMixin {
  bool _checked = false;
  late final AnimationController _hold = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 5),
  )
    ..addListener(() => setState(() {}))
    ..addStatusListener((status) {
      if (status == AnimationStatus.completed) Navigator.of(context).pop(true);
    });

  @override
  void dispose() {
    _hold.dispose();
    super.dispose();
  }

  void _startHold() {
    if (_checked) _hold.forward();
  }

  void _cancelHold() {
    if (!_hold.isCompleted) _hold.reverse();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.title),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(widget.message),
          const SizedBox(height: 8),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            value: _checked,
            onChanged: (v) => setState(() {
              _checked = v ?? false;
              if (!_checked) _hold.reset();
            }),
            title: const Text('I understand this is permanent'),
          ),
          const SizedBox(height: 4),
          GestureDetector(
            onTapDown: _checked ? (_) => _startHold() : null,
            onTapUp: (_) => _cancelHold(),
            onTapCancel: _cancelHold,
            child: Opacity(
              opacity: _checked ? 1 : 0.4,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    Container(height: 48, width: double.infinity, color: Colors.red.shade600),
                    Positioned.fill(
                      child: Align(
                        alignment: Alignment.centerLeft,
                        child: FractionallySizedBox(
                          widthFactor: _hold.value,
                          child: Container(color: Colors.red.shade900),
                        ),
                      ),
                    ),
                    Text(
                      _hold.isAnimating ? 'Keep holding…' : 'Hold to delete (5s)',
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
      ],
    );
  }
}

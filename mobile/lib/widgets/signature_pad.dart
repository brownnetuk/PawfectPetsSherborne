import 'dart:convert';
import 'dart:ui' as ui;
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';

/// A draw-with-your-finger signature box. Emits the signature as a PNG data
/// URL (the same format the web apps' SignaturePad produces and the PDF
/// export expects) via [onChanged] after every completed stroke; null when
/// cleared.
///
/// The pad always sits inside a scrolling form, so it must win the touch
/// outright: a plain pan gesture competes with the list's vertical drag and
/// loses whenever a stroke starts by moving up or down (most letters do),
/// which scrolled the page instead of drawing. It also only started after the
/// touch-slop distance, clipping the start of every stroke and ignoring dots.
/// [_InkRecognizer] claims the pointer the moment it lands, so every stroke
/// is captured from its first pixel and the form never scrolls underneath.
class SignaturePad extends StatefulWidget {
  final ValueChanged<String?> onChanged;
  const SignaturePad({super.key, required this.onChanged});

  @override
  State<SignaturePad> createState() => _SignaturePadState();
}

class _SignaturePadState extends State<SignaturePad> {
  final List<List<Offset>> _strokes = [];
  final GlobalKey _boundaryKey = GlobalKey();

  Future<void> _emit() async {
    if (_strokes.isEmpty) {
      widget.onChanged(null);
      return;
    }
    // Rasterise the drawn strokes exactly as displayed. RepaintBoundary
    // capture keeps this in sync with what the user sees without
    // reimplementing the painting for export.
    final boundary = _boundaryKey.currentContext?.findRenderObject() as RenderRepaintBoundary?;
    if (boundary == null) return;
    final image = await boundary.toImage(pixelRatio: 2);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    if (bytes == null) return;
    widget.onChanged('data:image/png;base64,${base64Encode(bytes.buffer.asUint8List())}');
  }

  void _clear() {
    setState(() => _strokes.clear());
    widget.onChanged(null);
  }

  void _start(Offset p) => setState(() => _strokes.add([p]));

  void _move(Offset p) {
    if (_strokes.isEmpty) return;
    setState(() => _strokes.last.add(p));
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          height: 180,
          decoration: BoxDecoration(
            border: Border.all(color: Colors.grey.shade400),
            borderRadius: BorderRadius.circular(8),
          ),
          clipBehavior: Clip.antiAlias,
          child: RepaintBoundary(
            key: _boundaryKey,
            child: RawGestureDetector(
              behavior: HitTestBehavior.opaque,
              gestures: {
                _InkRecognizer: GestureRecognizerFactoryWithHandlers<_InkRecognizer>(
                  () => _InkRecognizer(),
                  (r) => r
                    ..onStart = _start
                    ..onMove = _move
                    ..onEnd = _emit,
                ),
              },
              child: CustomPaint(
                painter: _StrokesPainter(_strokes),
                child: _strokes.isEmpty
                    ? Center(
                        child: Text('Sign here', style: TextStyle(color: Colors.grey.shade500)),
                      )
                    : const SizedBox.expand(),
              ),
            ),
          ),
        ),
        TextButton(onPressed: _strokes.isEmpty ? null : _clear, child: const Text('Clear')),
      ],
    );
  }
}

/// Single-finger "ink" recognizer: accepts the pointer on touch-down (no slop,
/// no arena contest with the enclosing scroll view) and streams its path.
/// Additional fingers while a stroke is in progress are ignored.
class _InkRecognizer extends OneSequenceGestureRecognizer {
  ValueChanged<Offset>? onStart;
  ValueChanged<Offset>? onMove;
  VoidCallback? onEnd;
  int? _pointer;

  @override
  void addAllowedPointer(PointerDownEvent event) {
    if (_pointer != null) return;
    _pointer = event.pointer;
    startTrackingPointer(event.pointer, event.transform);
    resolve(GestureDisposition.accepted);
    onStart?.call(event.localPosition);
  }

  @override
  void handleEvent(PointerEvent event) {
    if (event.pointer != _pointer) return;
    if (event is PointerMoveEvent) {
      onMove?.call(event.localPosition);
    } else if (event is PointerUpEvent || event is PointerCancelEvent) {
      stopTrackingPointer(event.pointer);
      _pointer = null;
      onEnd?.call();
    }
  }

  @override
  void didStopTrackingLastPointer(int pointer) {}

  @override
  String get debugDescription => 'signature ink';
}

class _StrokesPainter extends CustomPainter {
  final List<List<Offset>> strokes;
  _StrokesPainter(this.strokes);

  @override
  void paint(Canvas canvas, Size size) {
    // A white background so the exported PNG reads on any surface (PDF, web).
    canvas.drawRect(Offset.zero & size, Paint()..color = Colors.white);
    final pen = Paint()
      ..color = Colors.black87
      ..strokeWidth = 2.2
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..style = PaintingStyle.stroke;
    for (final stroke in strokes) {
      if (stroke.length == 1) {
        canvas.drawCircle(stroke.first, 1.2, Paint()..color = Colors.black87);
        continue;
      }
      final path = Path()..moveTo(stroke.first.dx, stroke.first.dy);
      for (final p in stroke.skip(1)) {
        path.lineTo(p.dx, p.dy);
      }
      canvas.drawPath(path, pen);
    }
  }

  @override
  bool shouldRepaint(covariant _StrokesPainter oldDelegate) => true;
}

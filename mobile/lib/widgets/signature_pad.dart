import 'dart:convert';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';

/// A draw-with-your-finger signature box. Emits the signature as a PNG data
/// URL (the same format the web apps' SignaturePad produces and the PDF
/// export expects) via [onChanged] after every completed stroke; null when
/// cleared.
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

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          height: 160,
          decoration: BoxDecoration(
            border: Border.all(color: Colors.grey.shade400),
            borderRadius: BorderRadius.circular(8),
          ),
          clipBehavior: Clip.antiAlias,
          child: RepaintBoundary(
            key: _boundaryKey,
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onPanStart: (d) => setState(() => _strokes.add([d.localPosition])),
              onPanUpdate: (d) => setState(() => _strokes.last.add(d.localPosition)),
              onPanEnd: (_) => _emit(),
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

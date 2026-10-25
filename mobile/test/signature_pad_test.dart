import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pawfectpets_staff/widgets/signature_pad.dart';

/// The pad lives inside the check-in / check-out form's ListView. A stroke
/// that starts by moving vertically must draw, not scroll the form, and must
/// be captured from the very first pixel (no touch-slop gap).
void main() {
  Widget host(ScrollController controller, void Function(String?) onChanged) {
    return MaterialApp(
      home: Scaffold(
        body: ListView(
          controller: controller,
          children: [
            const SizedBox(height: 100),
            SignaturePad(onChanged: onChanged),
            const SizedBox(height: 2000),
          ],
        ),
      ),
    );
  }

  testWidgets('a vertical stroke draws and does not scroll the form', (tester) async {
    final controller = ScrollController();
    String? emitted;
    await tester.pumpWidget(host(controller, (v) => emitted = v));

    final pad = find.text('Sign here');
    expect(pad, findsOneWidget);

    // Drag straight down inside the pad: the gesture a letter like "l" starts with.
    final start = tester.getCenter(pad);
    final gesture = await tester.startGesture(start);
    await gesture.moveBy(const Offset(0, 40));
    await tester.pump();
    await gesture.moveBy(const Offset(0, 40));
    await tester.pump();

    // The ListView must not have consumed the drag.
    expect(controller.offset, 0);
    // Drawing started immediately: the placeholder is gone before the finger lifts.
    expect(find.text('Sign here'), findsNothing);

    // The PNG export (RepaintBoundary.toImage) is real async work, so let it run.
    await tester.runAsync(() async {
      await gesture.up();
      await tester.pump();
      await Future<void>.delayed(const Duration(milliseconds: 200));
    });
    expect(emitted, isNotNull);
    expect(emitted, startsWith('data:image/png;base64,'));
  });

  testWidgets('a tap leaves a dot and Clear resets', (tester) async {
    final controller = ScrollController();
    final emitted = <String?>[];
    await tester.pumpWidget(host(controller, emitted.add));

    await tester.runAsync(() async {
      await tester.tap(find.text('Sign here'));
      await tester.pump();
      await Future<void>.delayed(const Duration(milliseconds: 200));
    });
    expect(emitted, isNotEmpty);
    expect(emitted.last, isNotNull);

    await tester.tap(find.text('Clear'));
    await tester.pump();
    expect(emitted.last, isNull);
    expect(find.text('Sign here'), findsOneWidget);
  });

  testWidgets('scrolling the form outside the pad still works', (tester) async {
    final controller = ScrollController();
    await tester.pumpWidget(host(controller, (_) {}));
    await tester.drag(find.byType(ListView), const Offset(0, -300));
    await tester.pump();
    expect(controller.offset, greaterThan(0));
  });
}

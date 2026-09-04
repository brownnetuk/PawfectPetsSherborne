// Smoke test: the app boots to the login screen (no session in a fresh test
// environment) without throwing.
import 'package:flutter_test/flutter_test.dart';

import 'package:pawfectpets_portal/main.dart';

void main() {
  testWidgets('App boots', (WidgetTester tester) async {
    await tester.pumpWidget(const PawfectPetsPortalApp());
    await tester.pump();
    expect(find.text('Customer App'), findsOneWidget);
  });
}

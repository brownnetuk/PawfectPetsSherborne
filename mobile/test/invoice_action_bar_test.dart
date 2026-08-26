import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:pawfectpets_staff/screens/invoice_detail_screen.dart';

void main() {
  testWidgets('action bar lays out all three actions without overflow at phone width',
      (tester) async {
    // A narrow phone width is the case that overflowed with three-across.
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          bottomNavigationBar: InvoiceActionBar(
            enabled: true,
            onSendEmail: () {},
            onRecordPayment: () {},
            onRequestDeposit: () {},
          ),
        ),
      ),
    );
    // A RenderFlex overflow would throw here and fail the test.
    await tester.pumpAndSettle();

    expect(find.text('Record Payment'), findsOneWidget);
    expect(find.text('Send Email'), findsOneWidget);
    expect(find.text('Request Deposit'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('disabling greys out all three actions', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          bottomNavigationBar: InvoiceActionBar(
            enabled: false,
            onSendEmail: () {},
            onRecordPayment: () {},
            onRequestDeposit: () {},
          ),
        ),
      ),
    );

    for (final b in tester.widgetList<ButtonStyleButton>(find.byType(ButtonStyleButton))) {
      expect(b.onPressed, isNull);
    }
  });
}

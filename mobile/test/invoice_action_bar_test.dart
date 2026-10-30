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
            onActivity: () {},
            onSendEmail: () {},
            onRecordPayment: () {},
            onRequestDeposit: () {},
          ),
        ),
      ),
    );
    // A RenderFlex overflow would throw here and fail the test.
    await tester.pumpAndSettle();

    expect(find.text('Activity'), findsOneWidget);
    expect(find.text('Record Payment'), findsOneWidget);
    expect(find.text('Send Email'), findsOneWidget);
    expect(find.text('Request Deposit'), findsOneWidget);
    // Activity and Record Payment share the top row, Activity on the left.
    expect(tester.getCenter(find.text('Activity')).dx, lessThan(tester.getCenter(find.text('Record Payment')).dx));
    expect(tester.getCenter(find.text('Activity')).dy, closeTo(tester.getCenter(find.text('Record Payment')).dy, 1));
    expect(tester.takeException(), isNull);
  });

  testWidgets('Schedule Send row shows the scheduled time and a cancel button once scheduled', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    Widget host({VoidCallback? onSchedule, VoidCallback? onCancel, DateTime? at}) => MaterialApp(
          home: Scaffold(
            bottomNavigationBar: InvoiceActionBar(
              enabled: true,
              onActivity: () {},
              onSendEmail: () {},
              onRecordPayment: () {},
              onRequestDeposit: () {},
              onScheduleSend: onSchedule,
              onCancelScheduledSend: onCancel,
              scheduledSendAt: at,
            ),
          ),
        );

    // Not a draft: no row at all.
    await tester.pumpWidget(host());
    expect(find.text('Schedule Send'), findsNothing);

    // Draft: just the schedule button.
    await tester.pumpWidget(host(onSchedule: () {}));
    await tester.pumpAndSettle();
    expect(find.text('Schedule Send'), findsOneWidget);
    expect(find.text('Cancel Send'), findsNothing);

    // Scheduled: the time replaces the label and a cancel button appears.
    var cancelled = false;
    await tester.pumpWidget(host(onSchedule: () {}, onCancel: () => cancelled = true, at: DateTime(2026, 10, 29, 9)));
    await tester.pumpAndSettle();
    expect(find.text('Sends 29 Oct 09:00'), findsOneWidget);
    await tester.tap(find.text('Cancel Send'));
    expect(cancelled, isTrue);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Overdue Payment row only appears when a handler is given', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    Widget host(VoidCallback? onOverdue) => MaterialApp(
          home: Scaffold(
            bottomNavigationBar: InvoiceActionBar(
              enabled: true,
              onActivity: () {},
              onSendEmail: () {},
              onRecordPayment: () {},
              onRequestDeposit: () {},
              onOverdueReminder: onOverdue,
            ),
          ),
        );

    await tester.pumpWidget(host(null));
    expect(find.text('Overdue Payment'), findsNothing);

    var tapped = false;
    await tester.pumpWidget(host(() => tapped = true));
    await tester.pumpAndSettle();
    expect(find.text('Overdue Payment'), findsOneWidget);
    await tester.tap(find.text('Overdue Payment'));
    expect(tapped, isTrue);
    expect(tester.takeException(), isNull);
  });

  testWidgets('disabling greys out all three actions', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          bottomNavigationBar: InvoiceActionBar(
            enabled: false,
            onActivity: () {},
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

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'package:pawfectpets_staff/api/api_client.dart';
import 'package:pawfectpets_staff/api/repository.dart';
import 'package:pawfectpets_staff/models/customer.dart';
import 'package:pawfectpets_staff/screens/customers_screen.dart';

class _FakeRepository extends Repository {
  _FakeRepository() : super(ApiClient());

  int createCalls = 0;
  String? capturedName;
  String? capturedEmail;

  @override
  Future<List<Customer>> listCustomers() async => [];

  @override
  Future<Customer> createLead({required String name, required String email}) async {
    createCalls++;
    capturedName = name;
    capturedEmail = email;
    return Customer(id: 'c1', name: name, email: email, status: 'pending');
  }
}

void main() {
  testWidgets('New customer button creates a lead from name + email', (tester) async {
    await tester.binding.setSurfaceSize(const Size(600, 1200));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    final repo = _FakeRepository();
    await tester.pumpWidget(
      Provider<Repository>.value(
        value: repo,
        child: const MaterialApp(home: CustomersScreen()),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('New customer')); // the FAB
    await tester.pumpAndSettle();

    // Fields in tree order: [0] AppBar search, [1] name, [2] email.
    final fields = find.byType(TextField);
    await tester.enterText(fields.at(1), 'Jane Doe');
    await tester.enterText(fields.at(2), 'jane@example.com');

    await tester.tap(find.text('Add customer'));
    await tester.pumpAndSettle();

    expect(repo.createCalls, 1);
    expect(repo.capturedName, 'Jane Doe');
    expect(repo.capturedEmail, 'jane@example.com');
  });

  testWidgets('rejects an invalid email', (tester) async {
    await tester.binding.setSurfaceSize(const Size(600, 1200));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    final repo = _FakeRepository();
    await tester.pumpWidget(
      Provider<Repository>.value(
        value: repo,
        child: const MaterialApp(home: CustomersScreen()),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('New customer'));
    await tester.pumpAndSettle();

    final fields = find.byType(TextField);
    await tester.enterText(fields.at(1), 'Jane Doe');
    await tester.enterText(fields.at(2), 'not-an-email');
    await tester.tap(find.text('Add customer'));
    await tester.pumpAndSettle();

    expect(repo.createCalls, 0);
    expect(find.textContaining('valid email'), findsOneWidget);
  });
}

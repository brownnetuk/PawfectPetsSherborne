import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'package:pawfectpets_staff/api/api_client.dart';
import 'package:pawfectpets_staff/api/repository.dart';
import 'package:pawfectpets_staff/main.dart';
import 'package:pawfectpets_staff/state/auth_provider.dart';

void main() {
  // AuthProvider reads a persisted token via flutter_secure_storage on
  // startup; mock its platform channel so that resolves in the test harness
  // instead of hanging with no plugin implementation registered.
  const secureStorageChannel = MethodChannel('plugins.it_nomads.com/flutter_secure_storage');

  setUp(() {
    TestWidgetsFlutterBinding.ensureInitialized();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(secureStorageChannel, (call) async => null);
  });

  testWidgets('shows the staff login screen when logged out', (WidgetTester tester) async {
    final client = ApiClient();
    final repository = Repository(client);

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          Provider.value(value: client),
          Provider.value(value: repository),
          ChangeNotifierProvider(create: (_) => AuthProvider(client, repository)),
        ],
        child: const PawfectPetsStaffApp(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('PawfectPets Sherborne'), findsOneWidget);
    expect(find.text('Staff sign in'), findsOneWidget);
  });
}

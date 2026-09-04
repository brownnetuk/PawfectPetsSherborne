import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'api/api_client.dart';
import 'api/repository.dart';
import 'screens/home_shell.dart';
import 'screens/login_screen.dart';
import 'services/notification_store.dart';
import 'services/push_service.dart';
import 'state/auth_provider.dart';
import 'theme.dart';

void main() {
  // Required before touching platform channels (PushService installs a method
  // channel handler) — otherwise main() throws before runApp and the app
  // never renders.
  WidgetsFlutterBinding.ensureInitialized();
  final client = ApiClient();
  final repository = Repository(client);
  final notificationStore = NotificationStore();
  final pushService = PushService(repository, notificationStore);

  runApp(
    MultiProvider(
      providers: [
        Provider.value(value: client),
        Provider.value(value: repository),
        Provider.value(value: notificationStore),
        Provider.value(value: pushService),
        ChangeNotifierProvider(create: (_) => AuthProvider(client, repository)),
      ],
      child: const PawfectPetsPortalApp(),
    ),
  );
}

class PawfectPetsPortalApp extends StatelessWidget {
  const PawfectPetsPortalApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Pawfect Pets Customer',
      debugShowCheckedModeBanner: false,
      theme: appTheme,
      home: Consumer<AuthProvider>(
        builder: (context, auth, _) {
          if (auth.loading) {
            return const Scaffold(body: Center(child: CircularProgressIndicator()));
          }
          return auth.loggedIn ? const HomeShell() : const LoginScreen();
        },
      ),
    );
  }
}

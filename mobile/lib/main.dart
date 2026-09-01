import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'api/api_client.dart';
import 'api/repository.dart';
import 'screens/home_shell.dart';
import 'screens/login_screen.dart';
import 'screens/scan_qr_screen.dart';
import 'services/push_service.dart';
import 'state/auth_provider.dart';
import 'theme.dart';

void main() {
  // Required before touching platform channels (PushService installs a method
  // channel handler) — otherwise main() throws before runApp and the app
  // never renders (white screen).
  WidgetsFlutterBinding.ensureInitialized();
  final client = ApiClient();
  final repository = Repository(client);
  final pushService = PushService(repository);

  runApp(
    MultiProvider(
      providers: [
        Provider.value(value: client),
        Provider.value(value: repository),
        Provider.value(value: pushService),
        ChangeNotifierProvider(create: (_) => AuthProvider(client, repository)),
      ],
      child: const PawfectPetsStaffApp(),
    ),
  );
}

class PawfectPetsStaffApp extends StatelessWidget {
  const PawfectPetsStaffApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'PawfectPets Staff',
      debugShowCheckedModeBanner: false,
      theme: appTheme,
      home: Consumer<AuthProvider>(
        builder: (context, auth, _) {
          if (auth.loading) {
            return const Scaffold(body: Center(child: CircularProgressIndicator()));
          }
          if (auth.needsProvisioning) return const ScanQrScreen();
          return auth.staff != null ? const HomeShell() : const LoginScreen();
        },
      ),
    );
  }
}

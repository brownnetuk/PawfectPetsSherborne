import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'api/api_client.dart';
import 'api/repository.dart';
import 'screens/home_shell.dart';
import 'screens/login_screen.dart';
import 'state/auth_provider.dart';
import 'theme.dart';

void main() {
  final client = ApiClient();
  final repository = Repository(client);

  runApp(
    MultiProvider(
      providers: [
        Provider.value(value: client),
        Provider.value(value: repository),
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
          return auth.staff != null ? const HomeShell() : const LoginScreen();
        },
      ),
    );
  }
}

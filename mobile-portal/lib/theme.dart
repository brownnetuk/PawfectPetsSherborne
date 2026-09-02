import 'package:flutter/material.dart';

const brandGreen = Color(0xFF2F7A4F);
const brandGreenDark = Color(0xFF1F5C38);

final appTheme = ThemeData(
  useMaterial3: true,
  colorScheme: ColorScheme.fromSeed(seedColor: brandGreen, primary: brandGreen),
  scaffoldBackgroundColor: const Color(0xFFF6F8F7),
  appBarTheme: const AppBarTheme(
    backgroundColor: Colors.white,
    foregroundColor: Colors.black87,
    elevation: 0,
    centerTitle: false,
  ),
  elevatedButtonTheme: ElevatedButtonThemeData(
    style: ElevatedButton.styleFrom(
      backgroundColor: brandGreen,
      foregroundColor: Colors.white,
      padding: const EdgeInsets.symmetric(vertical: 14),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
    ),
  ),
  inputDecorationTheme: InputDecorationTheme(
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
    filled: true,
    fillColor: Colors.white,
  ),
);

Color statusColor(String status) {
  switch (status) {
    case 'active':
    case 'completed':
    case 'paid':
    case 'confirmed':
      return brandGreenDark;
    case 'pending':
    case 'requested':
      return const Color(0xFFB7791F);
    case 'cancelled':
      return const Color(0xFFC0392B);
    default:
      return Colors.grey.shade700;
  }
}

Color statusBg(String status) {
  switch (status) {
    case 'active':
    case 'completed':
    case 'paid':
    case 'confirmed':
      return const Color(0xFFEAF5EE);
    case 'pending':
    case 'requested':
      return const Color(0xFFFDF1E0);
    case 'cancelled':
      return const Color(0xFFFDECEA);
    default:
      return const Color(0xFFECEFF1);
  }
}

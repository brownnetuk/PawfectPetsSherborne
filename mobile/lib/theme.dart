import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

// Brand palette -- the same tokens as the admin's booking-confirmation PDFs
// (admin/src/pdf/brandPdf.ts), so the app and the documents customers receive
// read as one family.
const brandBlue = Color(0xFF0072B5);
const brandBlueDark = Color(0xFF005A8F);
const brandYellow = Color(0xFFFDF101);
// The PDF's pink is #D7385E; one step darker here so white text on a pink
// fill (buttons, the balance-due pill) stays readable at small sizes.
const brandPink = Color(0xFFC72F56);
const brandCream = Color(0xFFFBF7EE);
const brandInk = Color(0xFF1D2A33);
const brandMuted = Color(0xFF5F6F7A);
const brandRule = Color(0xFFD9E6EF);
const brandBlueTint = Color(0xFFE6F1F8);
const brandYellowTint = Color(0xFFFDF9C4);
const brandPinkTint = Color(0xFFFBE5EA);

const displayFont = 'ArchivoBlack';
const bodyFont = 'DMSans';

final _colorScheme = ColorScheme.fromSeed(seedColor: brandBlue).copyWith(
  primary: brandBlue,
  onPrimary: Colors.white,
  primaryContainer: brandBlueTint,
  onPrimaryContainer: brandBlueDark,
  // Selected chips, segmented buttons and the bottom-bar indicator use the
  // secondary container -- the PDF's yellow highlight.
  secondary: brandBlueDark,
  secondaryContainer: brandYellow,
  onSecondaryContainer: brandInk,
  tertiary: brandPink,
  onTertiary: Colors.white,
  error: brandPink,
  surface: Colors.white,
  onSurface: brandInk,
  onSurfaceVariant: brandMuted,
  outline: brandRule,
  outlineVariant: brandRule,
  surfaceTint: Colors.transparent,
);

final appTheme = ThemeData(
  useMaterial3: true,
  colorScheme: _colorScheme,
  fontFamily: bodyFont,
  scaffoldBackgroundColor: Colors.white,
  dividerColor: brandRule,
  dividerTheme: const DividerThemeData(color: brandRule, space: 1, thickness: 1),
  // The PDF's header band: brand blue with rounded lower corners, white text.
  appBarTheme: const AppBarTheme(
    backgroundColor: brandBlue,
    foregroundColor: Colors.white,
    elevation: 0,
    scrolledUnderElevation: 0,
    surfaceTintColor: Colors.transparent,
    centerTitle: false,
    systemOverlayStyle: SystemUiOverlayStyle.light,
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.vertical(bottom: Radius.circular(22))),
    titleTextStyle: TextStyle(fontFamily: displayFont, fontSize: 20, color: Colors.white),
  ),
  // The PDF's "Your booking" / "Payment" panels: flat cream cards.
  cardTheme: CardThemeData(
    color: brandCream,
    elevation: 0,
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
  ),
  listTileTheme: const ListTileThemeData(iconColor: brandBlue),
  navigationBarTheme: NavigationBarThemeData(
    backgroundColor: Colors.white,
    surfaceTintColor: Colors.transparent,
    indicatorColor: brandYellow,
    elevation: 0,
    iconTheme: WidgetStateProperty.resolveWith(
      (states) => IconThemeData(color: states.contains(WidgetState.selected) ? brandBlue : brandMuted),
    ),
    labelTextStyle: WidgetStateProperty.resolveWith(
      (states) => TextStyle(
        fontSize: 11.5,
        fontWeight: states.contains(WidgetState.selected) ? FontWeight.w700 : FontWeight.w400,
        color: states.contains(WidgetState.selected) ? brandBlue : brandMuted,
      ),
    ),
  ),
  floatingActionButtonTheme: const FloatingActionButtonThemeData(
    backgroundColor: brandPink,
    foregroundColor: Colors.white,
    elevation: 2,
    shape: StadiumBorder(),
    extendedTextStyle: TextStyle(fontFamily: bodyFont, fontWeight: FontWeight.w700, fontSize: 15),
  ),
  elevatedButtonTheme: ElevatedButtonThemeData(
    style: ElevatedButton.styleFrom(
      backgroundColor: brandBlue,
      foregroundColor: Colors.white,
      elevation: 0,
      padding: const EdgeInsets.symmetric(vertical: 14),
      textStyle: const TextStyle(fontFamily: bodyFont, fontWeight: FontWeight.w700),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
  ),
  filledButtonTheme: FilledButtonThemeData(
    style: FilledButton.styleFrom(
      backgroundColor: brandBlue,
      foregroundColor: Colors.white,
      textStyle: const TextStyle(fontFamily: bodyFont, fontWeight: FontWeight.w700),
    ),
  ),
  outlinedButtonTheme: OutlinedButtonThemeData(
    style: OutlinedButton.styleFrom(
      foregroundColor: brandBlue,
      side: const BorderSide(color: brandBlue, width: 1.5),
      textStyle: const TextStyle(fontFamily: bodyFont, fontWeight: FontWeight.w700),
    ),
  ),
  chipTheme: ChipThemeData(
    backgroundColor: brandCream,
    side: BorderSide.none,
    labelStyle: const TextStyle(fontFamily: bodyFont, fontWeight: FontWeight.w700, color: brandInk, fontSize: 13),
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
  ),
  inputDecorationTheme: InputDecorationTheme(
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: brandRule),
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: brandRule),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: brandBlue, width: 2),
    ),
    filled: true,
    fillColor: Colors.white,
  ),
);

/// Theme for controls placed on the blue header band (search fields, filter
/// chips and dropdowns in an AppBar's `bottom`, or a text action): floating
/// labels and outlined/text buttons go white so they read against the blue.
class OnBrandBar extends StatelessWidget {
  final Widget child;
  const OnBrandBar({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    final base = Theme.of(context);
    return Theme(
      data: base.copyWith(
        textButtonTheme: TextButtonThemeData(
          style: TextButton.styleFrom(
            foregroundColor: Colors.white,
            textStyle: const TextStyle(fontWeight: FontWeight.w700),
          ),
        ),
        outlinedButtonTheme: OutlinedButtonThemeData(
          style: OutlinedButton.styleFrom(
            foregroundColor: Colors.white,
            side: const BorderSide(color: Colors.white, width: 1.5),
          ),
        ),
        inputDecorationTheme: base.inputDecorationTheme.copyWith(
          // The floated label straddles the field's top edge, half over the
          // blue and half over the white fill -- a blue background keeps it
          // legible.
          floatingLabelStyle: const TextStyle(
            color: Colors.white,
            backgroundColor: brandBlue,
            fontWeight: FontWeight.w700,
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: Colors.white),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: brandYellow, width: 2),
          ),
        ),
        chipTheme: base.chipTheme.copyWith(backgroundColor: Colors.white),
      ),
      child: child,
    );
  }
}

Color statusColor(String status) {
  switch (status) {
    case 'active':
    case 'completed':
    case 'paid':
    case 'confirmed':
      return brandBlueDark;
    case 'pending':
    case 'requested':
    case 'partially_paid':
    // An invoice queued by Schedule Send: not yet with the customer.
    case 'scheduled':
      return brandInk;
    case 'cancelled':
      return const Color(0xFFA8243F);
    default:
      return brandMuted;
  }
}

Color statusBg(String status) {
  switch (status) {
    case 'active':
    case 'completed':
    case 'paid':
    case 'confirmed':
      return brandBlueTint;
    case 'pending':
    case 'requested':
    case 'partially_paid':
    case 'scheduled':
      return brandYellowTint;
    case 'cancelled':
      return brandPinkTint;
    default:
      return const Color(0xFFEEF1F3);
  }
}

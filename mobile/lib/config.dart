// Override at build/run time with:
//   flutter run --dart-define=API_BASE_URL=http://localhost:3000
// Defaults to the deployed backend so the app works out of the box.
const String apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'https://api.pawfectpetssherborne.co.uk',
);

// Public site that renders form-fill links (/forms/:id). Used when sending a
// customer a form to fill in -- mirrors the admin's VITE_INTAKE_URL.
const String intakeBaseUrl = String.fromEnvironment(
  'INTAKE_URL',
  defaultValue: 'https://pawfectpetssherborne.co.uk',
);

// SumUp affiliate (application) key from developer.sumup.com, tied to this
// app's bundle id. Empty (the default) disables the in-app card charge flow
// entirely -- Record Payment behaves exactly as before.
const String sumupAffiliateKey = String.fromEnvironment('SUMUP_AFFILIATE_KEY');

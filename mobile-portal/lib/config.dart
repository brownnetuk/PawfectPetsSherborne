// Override at build/run time with:
//   flutter run --dart-define=API_BASE_URL=http://localhost:3000
// Defaults to the deployed backend (the same one the staff app and admin use).
const String apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'https://api.pawfectpetssherborne.co.uk',
);

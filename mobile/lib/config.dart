// Override at build/run time with:
//   flutter run --dart-define=API_BASE_URL=http://localhost:3000
// Defaults to the deployed backend so the app works out of the box.
const String apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'https://pawfectpets-backend.onrender.com',
);

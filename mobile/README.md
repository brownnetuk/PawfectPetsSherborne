# PawfectPets Sherborne — Staff Field App

A Flutter mobile companion to the [admin dashboard](../admin) — built staff-first (per the brief),
structured so a customer-facing version can be added later without a rewrite. Staff use this out
and about (dog walks, drop-offs, deliveries) to see today's bookings, pull up a customer's
address/keys/alarm code before a visit, and log a quick CRM note, without needing a laptop.

## Getting started

```bash
flutter pub get
flutter run --dart-define=API_BASE_URL=https://pawfectpets-backend.onrender.com
```

`API_BASE_URL` defaults to the deployed backend (see [`lib/config.dart`](lib/config.dart)) so it
works out of the box; override it to point at a local backend during development:

```bash
flutter run --dart-define=API_BASE_URL=http://localhost:3000
```

Log in with a staff account seeded via `backend`'s `npm run seed:staff` — there's no self-registration.

## What's here

- **Login** — staff JWT, held in `flutter_secure_storage` and restored on launch.
- **Bookings** tab — every booking, most recent first; tap one to see customer/pets/dates and
  change its status (`requested` → `confirmed` → `in_progress` → `completed`/`cancelled`).
- **Customers** tab — search by name/email; tap through to a customer's client details,
  emergency contact/vet, security (alarm instructions decrypt on demand via "Reveal", same as
  admin), registered pets, and a quick "Add activity note" for CRM logging.
- Invoices are deliberately **not** in this app — that's a desktop/back-office concern per the
  original scope decision (staff field app: bookings, customer details, CRM notes).

## Platforms

Scaffolded for Android, iOS, and web (`flutter create --platforms=android,ios,web`). This repo
was built and verified on a Windows machine with no Android SDK or Xcode installed, so:

- **Web** is what was actually used to verify the app end-to-end against the live backend
  (`flutter run -d chrome`, or `-d web-server` for headless verification). It's a legitimate
  target, not just a dev convenience — Flutter's web renderer is fully supported.
- **Android** needs Android Studio/SDK on whatever machine builds it — nothing in the app code is
  platform-specific, so this is purely a "install the SDK" step, not a rewrite.
- **iOS** needs a Mac with Xcode to actually build/run/sign, full stop — Apple's toolchain doesn't
  run on Windows or Linux. The `ios/` project scaffold is present and correct; building it requires
  either a Mac or a cloud Mac CI (Codemagic, GitHub Actions macOS runners, Bitrise).

## Architecture

```
lib/
  api/           # ApiClient (http + auth header + error handling), Repository (per-resource calls)
  models/        # Plain Dart classes mirroring the backend's JSON shapes
  state/         # AuthProvider (ChangeNotifier) — the only global state; screens fetch their own data
  screens/       # One file per screen, feature-based
  theme.dart     # Shared colors/theme, mirroring the web apps' palette
  config.dart    # API_BASE_URL (overridable via --dart-define)
```

No routing package — screens push/pop via `Navigator` directly, which was simpler and more
robust than `go_router` for this screen count. State management is a single `AuthProvider` via
`package:provider`; individual screens own their own data-loading state rather than a global
store, since nothing here needs to be shared across screens beyond the auth session.

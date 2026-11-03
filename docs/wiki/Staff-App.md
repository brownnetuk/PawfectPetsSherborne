# Staff app

The Flutter app staff carry on their phones while out on walks and visits, or around the kennels.

- **Code:** `mobile/` (Flutter; iOS is the main target, Android and web builds exist).
- **Bundle:** distributed through App Store Connect (TestFlight) from a Mac.
- **Version:** `version:` in `mobile/pubspec.yaml`; see [Versioning and releases](Versioning-and-Releases).

## First launch: connecting the app

The app doesn't have the server address built in. On first launch it shows **Connect device**:

1. In the [Admin dashboard](Admin-Dashboard), click your initials in the top bar to show the QR code.
2. In the app, tap **Login with QR code** and scan it (or type the API URL).
3. Sign in with your staff username and password. Tick **Remember me** to use Face ID / Touch ID next time.

**Disconnect device** on the sign-in screen forgets the server address so you can connect to a different one.

## Tabs

| Tab | What you can do |
| --- | --- |
| **Customers** | Search customers (by name, email or pet), add a customer, view and edit details and pets, CRM notes, activity, forms sent and responses, customer defaults (app access, regular days, travel), send a form |
| **Business** | Invoicing (invoices and quotes: create, edit, send, schedule send, record payments, overdue reminders, activity), Financial (snapshot, payments, expenses with receipt scanning, bank transfers and account statements), Price List |
| **Bookings** | Day or week calendar with filters for walks, visits, day care, boarding and appointments; schedule dog walks, visits and appointments; generate the month's invoices |
| **Boarding** | Bookings, Next Booking (arriving and departing today), In Progress, Completed, Checklists; booking detail with arrive / depart forms, observations, booking confirmation |
| **Messages** | Two-way conversations with customers |

The bell in the app bar opens the staff notification feed. Tapping a push notification opens the invoice, quote, customer or message it's about.

## Taking card payments (SumUp)

From **Record Payment** on an invoice, choosing card opens the SumUp card reader flow. The SumUp affiliate key is set with `--dart-define=SUMUP_AFFILIATE_KEY=...`; an empty key turns card charging off.

## Push notifications

The app registers for Apple push after sign-in. Which notifications are sent is set in **Settings > Notifications** (in the app's gear menu on Customers, or in the admin dashboard): customer activated, appointment reminders and lead time, daily digest, invoice overdue, invoice read, checklist reminders. See [Communications](Communications-and-Notifications).

## Build and run

```bash
cd mobile
flutter pub get
flutter run                       # first launch shows Connect device
flutter test

# Release (Mac with Xcode)
flutter build ipa --release --export-options-plist=ios/ExportOptions.plist
```

Useful defines: `API_BASE_URL`, `INTAKE_URL`, `SUMUP_AFFILIATE_KEY`.

Notes:
- The app doesn't check staff roles; the backend still enforces permissions on each request.
- Sessions last 12 hours; Face ID then signs you in again with the saved login.

Screen-by-screen detail is in the README's [Staff app](https://github.com/brownnetuk/PawfectPetsSherborne/blob/main/README.md#staff-app-mobile) section.

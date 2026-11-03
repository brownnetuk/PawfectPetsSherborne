# Customer app

The Flutter app for signed-in customers, named **Pawfect Pets Customer** on the iPhone home screen.

- **Code:** `mobile-portal/` (Flutter, iOS only).
- **API:** only the backend's `/portal/*` routes, shared with the [Customer portal](Customer-Portal).
- **Version:** `version:` in `mobile-portal/pubspec.yaml` (`x.y.z+build`); see [Versioning and releases](Versioning-and-Releases).

## Giving a customer access

1. Open the customer in the [Admin dashboard](Admin-Dashboard) > **Customer Defaults** > **Mobile App Access** (or Customer Defaults in the staff app).
2. Switch access on. The customer gets the **Customer Portal Enabled** email.
3. **Additional access** lets other people (a partner, a family member) sign in for the same customer with their own email.

Switching access off signs the customer out on their next request, in both the app and the web portal.

## Signing in

- **First time:** tap **First time login**, then **Email me a code**. Enter the 6-digit code and choose a password (8+ characters).
- **After that:** email and password, with optional **Remember me (Face ID / Touch ID)**.
- **Forgot password:** the same emailed-code flow.
- Updating the app to a new version asks the customer to sign in again.

## Tabs

| Tab | What the customer can do |
| --- | --- |
| **Details** | Edit their details, emergency contact, emergency vet (pick from the business's vet practices or enter one), security information, pets (add and edit, including medication, vaccination card and off-lead consent signature), read their signed agreement, delete their account |
| **Invoices** | View invoices, open the PDF, share or download it |
| **Quotes** | View quotes and **Accept** or **Decline** them |
| **Bookings** | See their bookings |
| **Messages** | Chat with staff |

The bell shows notifications sent by staff. A push message can ask the customer to **Acknowledge** it, and staff see who has (Communications > Push Messages in the admin dashboard).

## Deleting an account

Details > **Delete Account** removes the person's app sign-in and can optionally ask the business to erase their personal data. This is required by the App Store.

## Build and run

```bash
cd mobile-portal
flutter pub get
flutter run --dart-define=API_BASE_URL=http://localhost:3000
flutter build ipa --release        # Mac with Xcode
```

Push uses the customer bundle id (`APNS_CUSTOMER_BUNDLE_ID` on the backend) with the same Apple key as the staff app.

Detail is in the README's [Customer app](https://github.com/brownnetuk/PawfectPetsSherborne/blob/main/README.md#customer-app-mobile-portal) section.

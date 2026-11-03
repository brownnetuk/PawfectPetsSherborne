# Customer portal

The browser version of the customer app, for customers who'd rather not install it.

- **URL:** `https://portal.pawfectpetssherborne.co.uk`
- **Code:** `portal/` (React 19, TypeScript, Vite)
- **API:** the same `/portal/*` routes as the [Customer app](Customer-App), so the same **Mobile App Access** switch on the customer record controls both.
- **Version:** shown in the page footer; see [Versioning and releases](Versioning-and-Releases).

## What customers can do

- Update their contact details, emergency contact and vet.
- See their invoices and quotes and download each as a PDF. The portal is read-only for documents: quotes are accepted in the app or from the emailed link.
- Update their pets: type, name, breed, health, medication, behaviour, up to 2 photos, and sign or withdraw a dog's off-lead consent.
- See their bookings.

## Signing in

1. The customer enters their email. If portal access is on, they're emailed a 6-digit code (template **Customer Portal Sign-in Code**, created automatically). The code lasts 10 minutes; 5 wrong tries and it's thrown away.
2. They enter the code.
3. They enter the **last 3 digits of the mobile number** on their record. 3 wrong tries and they start again. A customer with no mobile number on file can't finish signing in.

Sign-in is rate-limited per visitor (5 code emails and 10 checks a minute). The session lasts 12 hours and ends when the browser closes.

## Running locally

```bash
cd portal
cp .env.example .env    # VITE_API_URL=http://localhost:3000
npm install
npm run dev -- --port 5175
```

Add the portal's origin to `ALLOWED_ORIGINS` on the backend, or the browser will block its API calls.

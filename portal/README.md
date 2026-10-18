# Customer portal (web)

The browser version of the customer portal, served at
`https://portal.pawfectpetssherborne.co.uk`. Customers can:

- update their contact details, emergency contact and vet
- see their invoices and quotes and download each as a PDF (read-only: no
  accepting quotes or paying from here)
- update their pets' details: type, name, breed, health, medication,
  behaviour, up to 2 photos, and sign or withdraw a dog's off-lead consent
- see their bookings

It talks to the same `/portal/*` API as the customer iPhone app
(`mobile-portal/`), so the same **Customer Portal** switch on a customer's
record in the admin app controls access to both.

## Signing in

1. The customer enters their email. If it belongs to a customer with portal
   access switched on, we email a 6-digit code (template: Settings > Email
   Templates > **Customer Portal Sign-in Code**, created automatically on
   first start). The code lasts 10 minutes.
2. They enter the code. Five wrong codes and it is thrown away.
3. They enter the last 3 digits of the mobile number on their record. Three
   wrong tries and they have to start again from step 1. A customer with no
   mobile number on file can't finish signing in.

The routes are also rate-limited per visitor IP (5 code emails and 10 checks
a minute). The session lasts 12 hours and ends when the browser is closed.

## Running locally

```bash
cp .env.example .env   # VITE_API_URL=http://localhost:3000
npm install
npm run dev            # http://localhost:5173 (or --port 5175)
```

Bump `version` in `package.json` with every change you push; it is shown in
the page footer.

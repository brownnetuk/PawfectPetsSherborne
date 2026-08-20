# PawfectPets Sherborne — Staff Admin Dashboard

The staff-facing app (Vite + React + TypeScript). Office staff use this on a desktop browser to
manage customers, send them registration links, and track bookings, invoices, and CRM activity.
Wired directly to the [backend](../backend); customer self-registration happens on the separate
[public intake form](../frontend).

## Getting started

```bash
npm install
cp .env.example .env   # VITE_API_URL and VITE_INTAKE_URL default to localhost
npm run dev
```

Requires the backend running, and at least one staff account seeded:

```bash
cd ../backend
npm run seed:staff -- "Your Name" you@example.com "a-strong-password"
```

There's no open self-registration — the first account comes from that script; every account
after that is added by an already-logged-in staff member via `POST /auth/register`.

## What's here

- **Login** — JWT-based; the token is kept in `localStorage` and attached to every API call.
  A 401 from any request clears the session and bounces to `/login`.
- **Customers** — list, search, and a "New customer" flow that creates a minimal lead
  (`POST /customers/leads`) and hands you a `VITE_INTAKE_URL/intake/<id>` link to copy and send.
  There's no full customer-creation form here on purpose — the intake form is where that detail
  belongs, and duplicating it would just be two sources of truth for the same data.
- **Customer detail** — tabs for overview (client/emergency/vet/security/agreement — alarm
  instructions are only decrypted on demand via "Reveal"), pets, bookings, invoices, and CRM
  activity, plus per-customer booking/invoice/activity creation.
- **Bookings** / **Invoices** — global lists across all customers, inline status changes, and
  their own "New" flow with a customer picker (the customer-detail versions reuse the same
  create calls with the customer pre-selected).
- **Activity** — a read-only global CRM feed; activity itself is created from a customer's page
  so it's always tied to that customer.

## Auth model

The backend guards every route by default; only the specific endpoints the public intake form
itself calls (`POST /customers`, `GET/PATCH /customers/:id`, `POST /animals`) are marked public.
Everything in this app requires a valid staff JWT.

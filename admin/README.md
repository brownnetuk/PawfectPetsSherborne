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

## Build for production

```bash
npm run build    # tsc -b && vite build -> dist/
npm run preview  # serve that build locally to sanity-check it before deploying
```

Like `frontend`, `VITE_API_URL` (and here also `VITE_INTAKE_URL`) are baked in at build time, so
they must be correct in the environment the build runs in. Render (see
[`render.yaml`](../render.yaml)) runs `npm install && npm run build` and serves `dist/` as a
static site with an SPA rewrite so client-side routes (e.g. `/customers/:id`) resolve correctly.

## What's here

- **Login** — JWT-based; the token is kept in `localStorage` and attached to every API call.
  A 401 from any request clears the session and bounces to `/login`.
- **Customers** — list, search, and a "New customer" flow that creates a minimal lead
  (`POST /customers/leads`) and hands you a `VITE_INTAKE_URL/intake/<id>` link to copy and send.
  There's no full customer-creation form here on purpose — the intake form is where that detail
  belongs, and duplicating it would just be two sources of truth for the same data.
- **Customer detail** — tabs for overview (client/emergency/vet/security/agreement — alarm
  instructions are only decrypted on demand via "Reveal"), pets, bookings, invoices, and CRM
  activity, plus per-customer booking/invoice/activity creation. "Edit" on the overview covers
  client/emergency/vet/security fields; "Edit" on a pet row covers its full profile. Off-lead
  consent is deliberately read-only in the pet edit form — it's a customer-signed acknowledgment
  from the intake form, not something staff overwrite from here. A status dropdown next to the
  overview badge moves a customer between pending/active/inactive/update_info via a staff-only
  `PATCH /customers/:id/status`, kept separate from the customer PATCH the public intake form
  itself uses. Setting a customer to "Update info" (rather than "Pending") is how staff prompt an
  already-registered customer to review and refresh their details — "Copy registration link" (it
  reads "Copy update link" for this status) hands you the same `VITE_INTAKE_URL/intake/<id>` link
  as a brand-new lead would get, but the intake form behaves differently once it sees the customer
  already has data on file: see [`frontend`](../frontend/README.md#reviewing--updating-an-existing-customer).
  "New pet" on the Pets tab first asks staff to choose between two paths: "Add
  manually" opens a form that registers the pet directly (`POST /animals`, the same endpoint the
  intake form uses) — it does collect off-lead consent for dogs, since the endpoint requires it,
  but is explicit that this should only be used when the customer has confirmed consent with
  staff directly. "Send a link to the customer" instead hands you a `VITE_INTAKE_URL/intake/<id>
  /add-pet` link (see [`frontend`](../frontend/README.md#add-a-pet-link)) so the customer can add
  the pet's details themselves. "View" (next to Edit) generates a PDF of the customer's full
  submitted record on the fly — client/emergency/vet/security details, every pet including
  off-lead consent and its signature, the terms & conditions text, and the client agreement's
  signature — and shows it in a modal. Built client-side with `jsPDF` (`src/pdf/customerFormPdf.ts`);
  alarm instructions are decrypted the same way "Reveal" does, via the existing staff-only
  endpoint, rather than adding a separate server-side PDF route. Branded with the same colours as
  this app's CSS (copied by hand — there's no shared token source between a PDF and CSS) and the
  real logo. Each section (a pet's whole profile, including its off-lead consent and signature, is
  one section) is measured before it's drawn, so a section that doesn't fit the rest of the current
  page moves to a fresh one entirely rather than splitting across the page break.
- **Bookings** / **Invoices** — global lists across all customers, inline status changes, edit
  and delete on each row, and their own "New" flow with a customer picker (the customer-detail
  versions reuse the same create/edit/delete calls with the customer pre-selected).
- **Activity** — a read-only global CRM feed; activity itself is created from a customer's page
  so it's always tied to that customer.
- **Staff** — list, create, and delete staff logins. Deleting is blocked server-side if it would
  remove the last remaining account; self-delete is blocked in the UI while signed in as that
  account. JWT is stateless, so a deleted account's existing token still works until it expires —
  there's no server-side session to revoke.

## Auth model

The backend guards every route by default; only the specific endpoints the public intake form
itself calls (`POST /customers`, `GET/PATCH /customers/:id`, `POST /animals`) are marked public.
Everything in this app requires a valid staff JWT.

## Look and feel

The logo, colour palette (forest green `#1f3b2c` / warm orange `#e8963c` / sage-cream background),
and font pairing (Fraunces for headings, Work Sans for body) are pulled from the live marketing
site, [pawfectpetssherborne.co.uk](https://pawfectpetssherborne.co.uk), so the dashboard reads as
the same product rather than a generic admin theme. The logo file lives at
`src/assets/logo.png`; the palette and fonts are defined as CSS variables at the top of
`src/index.css`.

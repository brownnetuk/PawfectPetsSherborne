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
  belongs, and duplicating it would just be two sources of truth for the same data. A separate
  "Customer Enquiry" button opens a modal for informal, pre-customer contacts (name, email,
  address, phone, how they heard about us, services interested in, notes) that are logged to
  their own `Enquiry` collection (`/enquiries`) rather than forced into the Customer/Animal
  schema. Enquiries list below the Customers table with the same view-detail /
  delete-with-confirmation pattern used elsewhere in the app. Opening one shows a
  "Convert to Customer" button that creates a pending customer from its
  name/email/address/phone (same lead-creation call as "New customer", with address and
  phone patched in afterwards) and deletes the enquiry once it succeeds — an enquiry
  without an email is refused, since a customer record needs one to send the
  registration link. The result reuses the same "copy link / send email" screen as
  creating a customer from scratch.
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
- **Settings** — tabbed (`/settings`): **Business Info** (shown first, and the default tab) holds
  the business's own name, address, town, postcode, telephone, email, and website, plus a logo — the
  letterhead details invoices and email templates draw from. All fields are plain strings saved
  as-is (no "leave blank to keep unchanged" special case, unlike Email's secret below), so clearing
  one to blank and saving genuinely clears it. The logo is uploaded as a file but stored as a
  base64 data URI on the settings document itself (same approach as a customer's signature image)
  rather than as a file on disk, since Render's filesystem doesn't persist across deploys.
  **Staff** lists, creates, and deletes staff logins (still
  backed by `/auth/staff`, unchanged from before this was under Settings). Deleting is blocked
  server-side if it would remove the last remaining account; self-delete is blocked in the UI
  while signed in as that account. JWT is stateless, so a deleted account's existing token still
  works until it expires — there's no server-side session to revoke. **Email** holds the Microsoft
  365 connection used to send email from the app (see below) — tenant ID, client ID, client
  secret, and a from address/name, plus a "send a test email" button. The secret is encrypted at
  rest (`EncryptionService`, same as alarm instructions) and never sent back to the browser once
  saved; the field shows "Configured — leave blank to keep unchanged" instead. **Email Templates**
  lists all three fixed "send email" triggers (`registration` / `update_info` / `add_pet` — kept
  in sync by hand with the `EmailTrigger` enum and with the three "Send email" call sites below)
  always, whether or not each has a template yet, so it's obvious what still needs setting up.
  Each is one document — editing "the registration template" is an upsert on that trigger, not a
  pick-from-a-list, so a "Send email" click never has to guess which of several templates to use.
  Subject/body support `{{name}}` and `{{link}}` placeholders, interpolated server-side at send
  time; body is sent as plain text.

## Sending email via Microsoft 365

Settings → Email stores Microsoft Graph application credentials and uses them for
application-only (client credentials) auth — no per-user sign-in, no delegated permissions, and
no SMTP AUTH (which Microsoft has been phasing out tenant-by-tenant). To set it up:

1. In the [Azure Portal](https://portal.azure.com), go to **Microsoft Entra ID → App
   registrations → New registration**. Any name/account type is fine for a single-tenant setup.
2. Under **API permissions**, add **Microsoft Graph → Application permissions → `Mail.Send`**,
   then **Grant admin consent** for the tenant (this step needs a Global/Application
   Administrator — application permissions don't work without it).
3. Under **Certificates & secrets → New client secret**, create one and copy the **value**
   immediately — Azure only shows it once.
4. From the app's **Overview** page, copy the **Application (client) ID** and **Directory
   (tenant) ID**.
5. In Settings → Email, paste the tenant ID, client ID, and client secret, set **From address** to
   a real mailbox in the tenant (a shared mailbox or a licensed user, e.g.
   `bookings@pawfectpetssherborne.co.uk`) — `Mail.Send` at the application level can send as any
   mailbox in the tenant, so this is just which one you want mail to come from — and save.
6. Use **Send a test email** to confirm. A failure here surfaces Microsoft's own error text (e.g.
   `AADSTS...` errors from a wrong tenant/client ID, or a Graph error if the from address isn't a
   real mailbox), which is usually specific enough to point at what's wrong.

"Send email" now appears next to every "Copy link" in the app — the new-customer flow
(`CustomersPage`), a customer's status-driven registration/update-info link (`CustomerDetailPage`'s
header), and the add-a-pet link (`AddPetChoiceModal`) — each backed by `POST /settings/email/send`
with `{trigger, to, name, link}`. All three call sites already have the customer's name/email/link
in scope, so the endpoint takes them as-is rather than looking the customer up itself; if the
matching template in Settings → Email Templates isn't configured yet, or the connection above
isn't fully set up, the button surfaces that as a plain error instead of failing silently.

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

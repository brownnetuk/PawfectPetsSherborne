# PawfectPets Sherborne — Backend

NestJS + MongoDB (Mongoose) API for the PawfectPets Sherborne client intake, booking, invoicing,
and CRM system.

## Stack

- [NestJS 11](https://nestjs.com/) (TypeScript)
- MongoDB via [Mongoose](https://mongoosejs.com/) (`@nestjs/mongoose`)
- `class-validator` / `class-transformer` for request validation, enforced globally via
  `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`)
- Field-level encryption (AES-256-GCM, Node `crypto`) for sensitive data at rest
- JWT staff auth (`@nestjs/jwt` + `passport-jwt`), guarding every route by default

## Getting started

```bash
npm install
cp .env.example .env   # then fill in MONGODB_URI, ENCRYPTION_KEY, and JWT_SECRET
npm run start:dev
npm run seed:staff -- "Your Name" you@example.com "a-strong-password"   # first staff login
```

### Environment variables

| Variable         | Purpose                                                                 |
| ---------------- | ------------------------------------------------------------------------ |
| `PORT`           | HTTP port (default `3000`)                                              |
| `MONGODB_URI`    | Mongo connection string (Atlas `mongodb+srv://…` or local `mongodb://…`) |
| `ENCRYPTION_KEY` | Secret used to derive the AES-256-GCM key for encrypted fields — generate with `openssl rand -hex 32` |
| `JWT_SECRET`     | Secret used to sign staff login JWTs — generate with `openssl rand -hex 32` |

**Windows/Atlas note:** if the app hangs or fails to connect with `mongodb+srv://` URIs, the
local network's DNS resolver may not support SRV/TXT lookups. `main.ts` pins Node's DNS
resolver to `1.1.1.1`/`8.8.8.8` at startup to work around this — safe to remove once network DNS is fixed.

## Build for production

```bash
npm run build      # nest build -> dist/
npm run start:prod # node dist/main
```

This is exactly what Render runs (see [`render.yaml`](../render.yaml) at the repo root) — no
separate production config needed. `PORT`, `MONGODB_URI`, `ENCRYPTION_KEY`, and `JWT_SECRET` must
all be set in the environment `start:prod` runs in.

## Auth

Every route requires a staff JWT (`Authorization: Bearer <token>`) by default — enforced by a
global `JwtAuthGuard` (`APP_GUARD`). Routes the public [intake form](../frontend) itself calls
are opted out with `@Public()`:

- `POST /customers` and `PATCH /customers/:id` — the form creates or completes its own record
- `GET /customers/:id` — pre-fills screen 1 from a staff-sent lead link
- `POST /animals` — one call per pet on submit
- `POST /auth/login`

Everything else — including `POST /customers/leads` (staff creates a lead link),
`GET /customers/:id/alarm-instructions`, and all of `/bookings`, `/invoices`, `/crm`, and
`POST /auth/register` — requires a token. There's no open self-registration: the first staff
account comes from `npm run seed:staff -- "<name>" <email> <password>`; every account after that
is added by an already-logged-in staff member via `POST /auth/register`.

## Domain model

The schema mirrors the client intake form (client details, emergency contact/vet, per-pet
health & behaviour profile, security arrangements, signed agreement) plus the operational
modules needed to run the business day to day.

### Customer (`/customers`)

One record per client, created from the intake form submission.

- Client details: `name`, `address`, `telephone`, `mobile`, `email`
- `emergencyContact` — `sameAsClient` toggle; `name`/`address` required unless same-as-client,
  at least one of `telephone`/`mobile` required
- `emergencyVet` — practice details + `alternativeVetAuthorised` acknowledgment (required `true`)
- `security` — `keysProvided`, `furtherInformation`, and `alarmInstructionsEncrypted`. Alarm
  instructions are submitted as plain text (`alarmInstructions` in the DTO) and encrypted at
  rest with AES-256-GCM before saving; they're stripped from list/read responses and only
  decrypted via `GET /customers/:id/alarm-instructions`.
- `agreement` — typed signature (`signedName`), `signedAt`/`date` set server-side on creation
- `status` — `pending` | `active` | `inactive`; flips to `active` on successful creation

### Animal (`/animals`)

One record per pet, linked to a `Customer`. Covers type/breed, vaccination, colour/markings,
microchip, temperament, aggression flags, car travel, livestock chasing, allergies, and
medication. `offLeadConsent` (on/off lead + signature) is required for `species: dog` and
rejected for cats/other, enforced in `AnimalsService`.

### Booking (`/bookings`)

Links a `Customer` and one or more `Animal`s to a service (`boarding` | `daycare` | `grooming`
| `walking`) over a date range, with a status lifecycle (`requested` → `confirmed` →
`in_progress` → `completed`, or `cancelled`).

### Invoice (`/invoices`)

Line items (`description`, `quantity`, `unitPrice`, optional `discountPercent` 0–100, default 0)
with a server-computed `subtotal` — `sum(quantity × unitPrice × (1 − discountPercent / 100))` —
plus `tax`/`total`, an auto-generated `invoiceNumber` (`INV-<year>-<sequence>`), and an optional
free-text `subject`. Status lifecycle: `draft` → `sent` → `paid` | `overdue` | `cancelled`;
`paidAt` is stamped when status transitions to `paid`. Fully editable and deletable via the
standard `PATCH`/`DELETE /:id` (wired into the admin UI's per-row Edit/Delete — see
`admin/README.md`); an edit that includes `lineItems` recomputes `subtotal`/`tax`/`total`
server-side the same way creation does.

### Quote (`/quotes`)

Mirrors `Invoice` field-for-field (same `LineItem` sub-schema and totals formula, same optional
`subject`, same standard REST shape including edit/delete) except `dueDate` → `validUntil` — a
quote hasn't been billed yet, so nothing is "due", but it does have an expiry — and its own
`quoteNumber` sequence (`QUO-<year>-<sequence>`, independent of invoice numbers). Status
lifecycle: `draft` → `sent` → `accepted` | `declined` | `expired`, reflecting a quote's actual
outcomes rather than an invoice's payment states. Deliberately a separate collection/module
rather than an `Invoice` with an extra status, since a quote and an invoice are different
documents at different stages of a sale, not the same document in a different state.

### InvoiceTerm (`/invoice-terms`) and Product (`/products`)

Two small reference lists surfaced under Settings → Invoices, both `POST`/`GET`/`PATCH`/`DELETE`.
A `Product` (`productCode`, `name`, `description?`, `price`) is a catalog entry — the admin's line
item editor uses an HTML `<datalist>` of product names so staff can type or pick one to auto-fill
that row's rate from the product's price (a client-side convenience only; there's no
`Invoice`/`Quote` field referencing a `Product`, so editing or deleting a product afterward never
affects an already-created line item).

An `InvoiceTerm` (`text`, `plusDays?`, `endOfMonth?`) *is* connected to `Invoice`/`Quote`, one
level removed: `Invoice.paymentTerms`/`Quote.paymentTerms` are plain strings copied from the
chosen term's `text` at creation time (the admin's "New invoice"/"New quote" forms have a Payment
Terms dropdown sourced from `GET /invoice-terms`), not a reference to the `InvoiceTerm` document
— an already-issued invoice/quote shouldn't retroactively change if the term library entry it was
picked from is edited or deleted later. `plusDays` and `endOfMonth` aren't used server-side at
all — they only drive the admin app's client-side due-date calculation (issue date + `plusDays`
days, or the last working day of the issue date's month when `endOfMonth` is true) that auto-fills
the Due Date/Valid Until field when a term is picked. `endOfMonth` wins over `plusDays` when both
are somehow set; a fixed day-count doesn't make sense for "end of month" since months have
different lengths.

### CRM activity (`/crm/activities`)

Freeform activity log per customer — `note` | `call` | `email` | `task` | `status_change` —
with optional `dueDate`/`completed` for task tracking.

### Settings (`/settings`)

`GET/PATCH /settings/business` read and update the one `BusinessInfo` document (a singleton, same
pattern as `EmailSettings` below) — the business's own name/address/town/postcode/telephone/email/website
and a logo, meant to brand invoices, email templates, and other generated documents, plus
bankName/sortCode/accountNumber (surfaced as a separate "Bank Details" card under Settings →
Invoices, not Business Info, even though it's the same underlying document and endpoint — not
secret, since it's meant to be shown to customers on an invoice so they know where to pay, so no
encryption unlike the Microsoft 365 client secret below). The logo is
a base64 data URI stored on the document itself rather than a file on disk, since Render's
filesystem doesn't persist across deploys. All fields are plain `@IsString()` and always written
as sent (no "blank means leave unchanged" special-casing), so the default Express JSON body limit
(100kb) was raised to 8mb in `main.ts` to fit a logo or terms upload — nothing else in the app
sends a payload anywhere near that size.

`BusinessInfo` also holds the terms and conditions shown on the public intake form's agreement
step: `dto.termsFile` (a base64 data URI of an uploaded `.docx`) is parsed via
[`mammoth`](https://www.npmjs.com/package/mammoth) into HTML and stored as `termsHtml` — the
form actually rendered everywhere terms are shown. The original `.docx` is also kept as
`termsDocx` purely so staff can download it back unchanged; it's never re-parsed. `POST
/settings/terms/preview` (staff-only) runs the same parse without saving, backing the admin
template editor's "Preview" button for a file that hasn't been saved yet. `GET
/settings/terms/download` (staff-only) streams `termsDocx` back with a `Content-Disposition:
attachment` header carrying the original filename — `main.ts`'s `enableCors({ exposedHeaders:
['Content-Disposition'] })` is required for that header to survive a cross-origin fetch; without
it the browser can't read it and the admin app falls back to a generic filename. Terms saved
before this endpoint existed only ever had `termsHtml` stored, never `termsDocx`, so
`getTermsFile()` distinguishes "nothing uploaded" from "uploaded, but the original isn't
available" and throws a message telling staff to re-upload in the latter case, rather than a
generic 404. `GET /settings/terms` is the one `@Public()` route in this controller — it returns
just `{ html }` for the intake form to fetch and render
(`frontend/src/intake/steps/AgreementStep.tsx`), falling back to its own hardcoded text if
nothing's been uploaded.

`GET/PATCH /settings/email` read and update the one `EmailSettings` document (a singleton, not a
collection — Microsoft 365 Graph API credentials for sending mail from the app: tenant ID, client
ID, an encrypted client secret, from address/name). `POST /settings/email/test` sends a real email
via Microsoft Graph's application-only (client credentials) flow, to verify the saved credentials
actually work — see [`admin`](../admin/README.md#sending-email-via-microsoft-365) for the Azure
setup this requires and what staff see.

`/settings/email-templates` *does* follow the standard shape, except keyed by `trigger` (one of a
fixed `EmailTrigger` enum: `registration` | `update_info` | `add_pet`) instead of a Mongo `_id` --
`GET` lists all configured templates, `PUT /settings/email-templates/:trigger` upserts the one for
that trigger, `DELETE /settings/email-templates/:trigger` removes it. `POST /settings/email/send`
(body: `{trigger, to, name, link}`) looks up the template for that trigger, interpolates
`{{name}}`/`{{link}}` plus seven `{{business*}}` placeholders pulled from `BusinessInfo`
(`businessName`/`businessAddress`/`businessTown`/`businessPostcode`/`businessTelephone`/
`businessEmail`/`businessWebsite`) into its subject/body, and sends it the same way
`/settings/email/test` does -- this is what backs the "Send email" button next to "Copy link"
throughout the admin app.

The body is sent as HTML (subject stays plain text -- subjects don't support markup) so a
`{{logo}}` placeholder can render the business's actual logo. The rest of the (staff-authored)
body is HTML-escaped before placeholders are substituted in, and every non-`logo` placeholder
value is escaped the same way -- `{{logo}}` is the one exception, since its whole point is to
insert a raw `<img>` tag. The admin app's template editor keeps a hand-written copy of this same
escaping/interpolation logic for its "Preview" button, so what staff preview matches what
actually sends -- see `admin/README.md`.

Everything under `/settings/*` is staff-only except `GET /settings/terms` (see above), which the
public intake form needs to read.

### Enquiry (`/enquiries`)

A lightweight, pre-customer contact log — `POST /` creates one, `GET /` lists them
(newest first), `DELETE /:id` removes one. Deliberately a separate collection from
`Customer` rather than an extra status/fields on it: an enquiry only has a name plus
optional email/address/phone/`howHeard`/`servicesInterested` (a fixed enum —
`dog_walking` | `pet_visits` | `boarding` | `day_care` — distinct from the booking
`ServiceType` enum, since "interested in" and "booked as" aren't the same concept) and
`notes`, with no lifecycle of its own. It may never become a real `Customer`; when it
does, staff create that record by hand from the enquiry's details.

## API summary

All resources follow the same REST shape: `POST /`, `GET /`, `GET /:id`, `PATCH /:id`,
`DELETE /:id`. `Animal`, `Booking`, `Invoice`, and CRM activity listings additionally accept a
`?customer=<id>` query filter. Full route list is logged on boot; see each `*.controller.ts` for
exact paths.

Notable non-CRUD endpoint:

- `GET /customers/:id/alarm-instructions` — decrypts and returns the stored alarm instructions
  for operational use (e.g. dispatching staff to the property).

## Tests

```bash
npm run test       # unit
npm run test:e2e   # end-to-end
npm run test:cov   # coverage
```

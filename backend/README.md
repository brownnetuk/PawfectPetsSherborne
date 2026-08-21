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

- Client details: `firstName`, `surname`, `address1`/`address2`/`town`/`county`/`postcode`,
  `phoneNumber`, `email`. `name` and `address` are stored, server-computed fields — kept in sync
  from the structured fields above on every create/update (`customer-format.util.ts`) rather than
  submitted directly, so the many existing `.name`/`.address` consumers (admin, PDF export, the
  Flutter app) don't need to know about the split. Both are schema-optional (DTO enforces
  requiredness) to support `createLead()`'s minimal `{ name, email }` pre-created record.
- `emergencyContact` — `sameAsClient` toggle; `firstName`/address/`phoneNumber` required unless
  same-as-client. Same computed-`name`/`address` pattern as the top-level client.
- `emergencyVet` — practice details, structured address (`address1`/`town`/`postcode` required,
  `address2`/`county` optional), and an `authorisation` sub-object (`signedName`, optional
  `signatureImage`, server-set `signedAt`) modelled on `agreement` below — required to have a
  `signedName` (checked in `CustomersService.validateEmergencyVet`). A computed
  `alternativeVetAuthorised` boolean (`!!authorisation?.signedName`) is kept for existing
  consumers that only need a yes/no.
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
rejected for cats/other, enforced in `AnimalsService`. A few behaviour fields are similarly
species-gated there: `aggressionToOtherAnimals`, `travelsWellInCar`, and `chasesLivestock` don't
apply to cats (rejected if sent), and `chasesLivestock` only applies to dogs (rejected for
`other` too) — `chasesLivestock: 'yes'` requires `chasesLivestockDetails`.

### Booking (`/bookings`)

Links a `Customer` and one or more `Animal`s to a service (`boarding` | `daycare` | `grooming`
| `walking`) over a date range, with a status lifecycle (`requested` → `confirmed` →
`in_progress` → `completed`, or `cancelled`).

### Deletion safeguards

`Customer`, `Animal`, and `Booking` are all referenced by other records via a plain Mongoose
`ref` — Mongoose doesn't cascade or restrict deletes on its own, so deleting one of these without
checking first leaves dangling references (`.populate()` silently resolves them to `null`, which
previously crashed pages that read `.name`/`._id` straight off an unguarded populated field, e.g.
`BookingsPage`, `ActivityPage`). Each `remove()` now counts dependents first and throws a
`ConflictException` (409, human-readable message, see `describeBlockers` in
`common/delete-guard.util.ts`) instead of deleting when any exist:

- `CustomersService.remove` — blocked by existing `Animal`, `Booking`, `Invoice`, `Quote`, or
  `CrmActivity` records for that customer.
- `AnimalsService.remove` — blocked by any `Booking` whose `animals` array includes it.
- `BookingsService.remove` — blocked by any `Invoice`/`Quote` whose `booking` references it.

`Invoice`/`Quote`/`CrmActivity` have no guard on their own `remove()` since nothing references
them. The cross-module `@InjectModel` wiring this needs is set up in each entity's own
`*.module.ts` (`CustomersModule` imports `AnimalsModule`/`BookingsModule`/`InvoicesModule`/
`QuotesModule`/`CrmModule`, etc.) — there's no circular dependency since the reference graph only
flows one way (Customer ← Animal ← Booking ← Invoice/Quote).

### Invoice (`/invoices`)

Line items (`description`, `quantity`, `unitPrice`, optional `discountPercent` 0–100, default 0)
with a server-computed `subtotal`/`total` — `sum(quantity × unitPrice × (1 − discountPercent /
100))`, and `total` simply equals `subtotal` since there's no tax field — an auto-generated
`invoiceNumber` (see Document Numbering below), and an optional free-text `subject`. Status
lifecycle: `draft` → `sent` → `paid` | `overdue` | `cancelled`; `paidAt` is stamped when status
transitions to `paid`. Fully editable and deletable via the standard `PATCH`/`DELETE /:id`, plus
`POST /:id/send` to email it to the customer (see "Settings" below) — all three wired into the
admin UI's per-row "Actions" menu (View/Edit, Send, Delete) — see `admin/README.md`. An edit that
includes `lineItems` recomputes `subtotal`/`total` server-side the same way creation does.

`InvoicesService.markOverdue()` flips any invoice still at `sent` whose `dueDate` has passed to
`overdue` — run at the top of `findAll()` (a plain conditional `updateMany`), not on a schedule.
This backend runs on Render's free plan, which spins the process down after inactivity, so an
in-process cron (e.g. `@nestjs/schedule`'s `@Cron`) wouldn't fire while asleep and could leave
invoices stale for however long nobody was using the app; checking on every list fetch instead
self-heals the moment staff next open the Invoices page, regardless of how long the backend was
asleep, with no extra dependency.

### Quote (`/quotes`)

Mirrors `Invoice` field-for-field (same `LineItem` sub-schema and totals formula, same optional
`subject`, same standard REST shape including edit/delete/send) except `dueDate` → `validUntil` — a
quote hasn't been billed yet, so nothing is "due", but it does have an expiry — and its own
`quoteNumber` sequence (see Document Numbering below, independent of invoice numbers). Status
lifecycle: `draft` → `sent` → `accepted` | `declined` | `expired`, reflecting a quote's actual
outcomes rather than an invoice's payment states. Deliberately a separate collection/module
rather than an `Invoice` with an extra status, since a quote and an invoice are different
documents at different stages of a sale, not the same document in a different state.

### Document numbering

`invoiceNumber`/`quoteNumber` come from `formatDocumentNumber()` (`backend/src/common/document-number.util.ts`)
applied to a staff-editable template — `invoiceNumberTemplate`/`quoteNumberTemplate` on the
`BusinessInfo` settings singleton, defaulting to `INV-{year}-{seq}`/`QUO-{year}-{seq}` — with
`{year}` substituted for the current year and `{seq}` for the next sequence number,
zero-padded to 5 digits. The sequence itself is `invoiceNextNumber`/`quoteNextNumber`, also on
`BusinessInfo`: `InvoicesService.nextInvoiceNumber()`/`QuotesService.nextQuoteNumber()` read and
increment it in one atomic `findOneAndUpdate` (`$inc`, `new: false` so the returned document is
the pre-increment value — the number this document should use), so two documents created at once
can never collide, and it upserts the settings document with a default of `1` if it doesn't exist
yet. This replaced an earlier `countDocuments()`-based scheme, which reissued a stale, colliding
number after a document was deleted (the count drops, so the next `count + 1` reuses a number
already taken) — now numbers are never reused, matching how real invoice/quote numbering needs to
behave. Both the template and the next number are staff-editable via Settings → Invoices →
"Document Numbering" (see `admin/README.md`), letting staff skip ahead or realign the sequence —
useful the first time this shipped, to bump `invoiceNextNumber` past whatever `INV-<year>-<seq>`
numbers already existed under the old scheme.

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
bankName/sortCode/accountNumber and the document-numbering fields (both surfaced as separate cards
under Settings → Invoices, not Business Info, even though it's all the same underlying document
and endpoint — bank details aren't secret, since they're meant to be shown to customers on an
invoice so they know where to pay, so no encryption unlike the Microsoft 365 client secret below;
see "Document numbering" above for invoiceNumberTemplate/invoiceNextNumber/quoteNumberTemplate/quoteNextNumber).
The logo is a base64 data URI stored on the document itself rather than a file on disk, since
Render's filesystem doesn't persist across deploys. Most fields are plain `@IsString()` and always
written as sent (no "blank means leave unchanged" special-casing) — the numbering fields are the
exception, validated as `@IsInt() @Min(1)` — so the default Express JSON body limit (100kb) was
raised to 8mb in `main.ts` to fit a logo or terms upload — nothing else in the app sends a payload
anywhere near that size.

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

`/settings/email-templates` *does* follow the standard shape, except keyed by `trigger` (a fixed
`EmailTrigger` enum: `registration` | `update_info` | `add_pet` | `invoice` | `quote`) instead of a
Mongo `_id` -- `GET` lists all configured templates, `PUT /settings/email-templates/:trigger`
upserts the one for that trigger, `DELETE /settings/email-templates/:trigger` removes it. `POST
/settings/email/send` (body: `{trigger, to, name, link}`) is what backs the "Send email" button
next to "Copy link" throughout the admin app, for the first three triggers only -- it's a thin
wrapper that calls `SettingsService.sendTemplatedEmail(trigger, to, { name, link })`.

`sendTemplatedEmail(trigger, to, vars, rawVars?)` is the shared implementation, also called
directly by `InvoicesService.sendEmail()`/`QuotesService.sendEmail()` (see Document numbering
above's neighboring "Invoice"/"Quote" sections) for the `invoice`/`quote` triggers, which have no
`/settings/email/send` equivalent -- there's no generic "to/name/link" shape that fits an invoice,
so those two call `sendTemplatedEmail` with their own vars instead of going through the
`SendTriggeredEmailDto` route. It looks up the template for `trigger`, merges `vars` with seven
`{{business*}}` placeholders pulled from `BusinessInfo`, and interpolates them into the
subject/body before sending via the same Microsoft Graph path `/settings/email/test` uses.

Subject interpolation is always plain text substitution (subjects don't support markup) with one
addition beyond simple `{{key}}` replacement: `{{#if field}}...{{/if}}` blocks are stripped
entirely when `vars[field]` is falsy/empty, kept (tags removed) otherwise -- used for optional
fields like an invoice's `subject`. Body interpolation branches on `trigger`: for the original
three triggers, the (staff-authored, plain-text) body is HTML-escaped first, then conditionals are
resolved, then placeholders are substituted in (each value escaped individually) -- unchanged from
before. For `invoice`/`quote`, the body is already HTML (edited via a rich-text editor in the
admin, not a plain textarea -- see `admin/README.md`) and is used as-is aside from conditionals
and substitution; `rawVars` (currently `{{logo}}` for all triggers, plus `{{items_table}}` for
invoice/quote) inserts its value unescaped instead, since those are themselves already HTML the
caller built (`buildItemsTableHtml()` in `backend/src/common/invoice-email.util.ts`, from the
invoice/quote's actual line items) rather than user-authored text. `{{logo}}` renders as an `<img>`
pointing at `GET /settings/business/logo` (`@Public()`, backed by `SettingsService.getLogoFile()`)
rather than the stored data: URI directly — Gmail and several other mail clients strip data: URIs
from received email HTML, silently breaking the logo despite it rendering fine in every in-app
preview (those render in a browser, which has no such restriction); `getLogoFile()` parses the
`data:<mime>;base64,<data>` string apart and serves the raw bytes with the real content type. The admin app's template editor
keeps a hand-written copy of this same conditional/escaping/interpolation logic for its "Preview"
button, so what staff preview matches what actually sends -- see `admin/README.md` (the shared
`buildItemsTableHtml()` lives in `admin/src/utils/emailTemplate.ts`, also used to render an actual
Send-confirmation preview against a real invoice/quote's own data, not just the template editor's
sample data).

`POST /invoices/:id/send` and `POST /quotes/:id/send` load the document (customer populated),
call `sendTemplatedEmail` with its data (`customer_name`, `subject`, `subtotal`, `total`,
`invoice_number`/`quote_number`, the relevant dates formatted `DD/MM/YYYY` via `formatUkDate()`,
and `bank_name`/`sort_code`/`account_number` fetched fresh from the same `BusinessInfo` singleton
the "Bank Details" settings card writes -- letting a staff-authored template show payment details
directly in the email, e.g. wrapped in `{{#if bank_name}}...{{/if}}` so the section is skipped
entirely if bank details were never configured), append a tracking-pixel `<img>` to the rendered
body (see below), then -- if the document was still `draft` -- transition it to `sent`, the same
way manually picking "sent" from the status dropdown would. There's no deposit or payment-amount
tracking anywhere in the app; "Send" only emails the current line items/total, nothing more.

**Open tracking.** `sendTemplatedEmail`'s optional `appendHtml` param is added to the rendered
body after interpolation, unconditionally -- not a placeholder, so it can't be silently dropped by
editing the template. `InvoicesService.sendEmail()`/`QuotesService.sendEmail()` pass
`trackingPixelHtml(pixelUrl)` (`backend/src/common/tracking-pixel.util.ts`), an invisible 1x1
`<img>` pointing at the new public `GET /invoices/:id/pixel.gif` / `GET /quotes/:id/pixel.gif`.
When the recipient's mail client loads it, the route stamps `openedAt` (first time only --
`updateOne` with an `$exists: false` guard, so it's a genuine "first opened at" rather than a last-
seen timestamp) and always responds 200 with a static transparent GIF regardless of whether the id
resolves, since a broken image is the only signal a mail client could show either way. `openedAt`
is deliberately its own field rather than a `status` value: whether a customer has opened an
invoice has no bearing on where it sits in the `draft`/`sent`/`paid`/`overdue`/`cancelled`
lifecycle (both could be true at once), so the admin surfaces it as a separate "Read" badge next
to the status pill instead -- see `admin/README.md`.

Building the pixel's URL needs this backend's own publicly-reachable origin, which nothing else
here has a reason to know (CORS is wide open, and every other response is same-request JSON) --
`PUBLIC_API_URL` is a new env var for it (`backend/src/common/tracking-pixel.util.ts`'s
`publicApiUrl()`), falling back to `http://localhost:$PORT` for local dev. Must be set to the real
deployed backend URL in production (`render.yaml`) or opened-invoice tracking silently 404s.

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

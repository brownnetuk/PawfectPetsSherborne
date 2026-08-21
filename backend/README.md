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

Line items with server-computed `subtotal`/`tax`/`total` and an auto-generated
`invoiceNumber` (`INV-<year>-<sequence>`). Status lifecycle: `draft` → `sent` → `paid` |
`overdue` | `cancelled`; `paidAt` is stamped when status transitions to `paid`.

### CRM activity (`/crm/activities`)

Freeform activity log per customer — `note` | `call` | `email` | `task` | `status_change` —
with optional `dueDate`/`completed` for task tracking.

### Settings (`/settings`)

`GET/PATCH /settings/business` read and update the one `BusinessInfo` document (a singleton, same
pattern as `EmailSettings` below) — the business's own name/address/town/postcode/telephone/email/website
and a logo, meant to brand invoices, email templates, and other generated documents. The logo is
a base64 data URI stored on the document itself rather than a file on disk, since Render's
filesystem doesn't persist across deploys. All fields are plain `@IsString()` and always written
as sent (no "blank means leave unchanged" special-casing), so the default Express JSON body limit
(100kb) was raised to 5mb in `main.ts` to fit a logo upload — nothing else in the app sends a
payload anywhere near that size.

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

None of `/settings/*` is `@Public()` — it's staff-only like everything else.

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

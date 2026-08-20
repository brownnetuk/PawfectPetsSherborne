# PawfectPets Sherborne

A client intake, booking, invoicing, and CRM system for a pet-care business. Three separate
apps in this repo, each with its own README for setup details:

| App                    | What it is                                                        | Stack                       |
| ----------------------- | ------------------------------------------------------------------ | ---------------------------- |
| [`backend/`](backend/README.md)   | The API — customers, pets, bookings, invoices, CRM, staff auth      | NestJS + MongoDB (Mongoose)  |
| [`frontend/`](frontend/README.md) | Public, no-login intake form customers fill in to register          | React + TypeScript (Vite)    |
| [`admin/`](admin/README.md)       | Staff-facing dashboard (desktop browser) for running the business   | React + TypeScript (Vite)    |

## How the pieces fit together

1. Staff create a minimal "lead" record for a new customer in the **admin** dashboard and get
   back a link (`<frontend-url>/intake/<customerId>`).
2. The customer opens that link, which pre-fills their name/email in the **frontend** intake
   form, and completes the rest themselves — their own details, pets, security arrangements, and
   signed agreement.
3. Submitting the form calls the **backend** directly (no login required for this flow), creating
   the `Animal` records and flipping the `Customer` to `active`.
4. Staff then manage everything else — bookings, invoices, CRM activity — from **admin**, which
   requires a staff login.

The backend enforces this split itself: every route requires a staff JWT by default, except the
handful the intake form calls, which are explicitly marked `@Public()`. See
[`backend/README.md`](backend/README.md#auth) for the exact list.

## Local development

Each app runs independently; start the ones you need:

```bash
# backend — needs MONGODB_URI, ENCRYPTION_KEY, JWT_SECRET in backend/.env
cd backend && npm install && npm run start:dev

# then, in separate terminals:
cd frontend && npm install && npm run dev   # http://localhost:5173
cd admin && npm install && npm run dev      # http://localhost:5174
```

Seed a staff login before using `admin`:

```bash
cd backend && npm run seed:staff -- "Your Name" you@example.com "a-strong-password"
```

## Deployment

**Render** ([`render.yaml`](render.yaml)) is the primary target — a single Blueprint provisions
all three as separate services in one project: `pawfectpets-backend` (Node web service),
`pawfectpets-frontend` and `pawfectpets-admin` (static sites, both with an SPA rewrite so
client-side routes work). Deploy it via the Render dashboard: **New → Blueprint**, connect this
repo, apply. Secrets (`MONGODB_URI`, `ENCRYPTION_KEY`, `JWT_SECRET`) and the two `VITE_*` URLs are
left blank in the Blueprint and set per-service in Render's dashboard rather than committed.

`frontend` and `admin` are also linked to Vercel projects (`pawfect-pets-sherborne/frontend` and
`pawfect-pets-sherborne/admin`) from an earlier exploration of that route. They don't currently
have `VITE_API_URL` set, so they're not functional as deployed — either configure their env vars
to point at the Render backend, or remove them if Render is the settled choice.

Because the backend isn't containerized or tied to Render-specific features, moving host later
(self-hosted Docker, another PaaS) is mostly a matter of re-pointing environment variables — see
the "self-hosting" discussion in this repo's history for what that would involve.

## Security notes

- Alarm codes/instructions are encrypted at rest (AES-256-GCM) and only decrypted on demand via
  a staff-only endpoint — see [`backend/README.md`](backend/README.md).
- There's no self-registration for staff accounts; the first one is created via
  `npm run seed:staff`, and further accounts are added by an already-logged-in staff member.
- The intake-form link (`/intake/<customerId>`) is effectively a bearer token — anyone with the
  link can view and complete that customer's record. That's the intended design for a
  frictionless public entry point, but it means links should be treated as sensitive when sent.

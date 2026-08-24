# PawfectPets Sherborne

A client intake, booking, invoicing, and CRM system for a pet-care business. Four separate
apps in this repo, each with its own README for setup details:

| App                    | What it is                                                        | Stack                       |
| ----------------------- | ------------------------------------------------------------------ | ---------------------------- |
| [`backend/`](backend/README.md)   | The API — customers, pets, bookings, invoices, CRM, staff auth      | NestJS + MongoDB (Mongoose)  |
| [`frontend/`](frontend/README.md) | Public, no-login intake form customers fill in to register          | React + TypeScript (Vite)    |
| [`admin/`](admin/README.md)       | Staff-facing dashboard (desktop browser) for running the business   | React + TypeScript (Vite)    |
| [`mobile/`](mobile/README.md)     | Staff field app — bookings, customer details, CRM notes on the go   | Flutter (Android/iOS/web)    |

## How the pieces fit together

1. Staff create a minimal "lead" record for a new customer in the **admin** dashboard and get
   back a link (`<frontend-url>/intake/<customerId>`).
2. The customer opens that link, which pre-fills their name/email in the **frontend** intake
   form, and completes the rest themselves — their own details, pets, security arrangements, and
   signed agreement.
3. Submitting the form calls the **backend** directly (no login required for this flow), creating
   the `Animal` records and flipping the `Customer` to `active`.
4. Staff then manage everything else — bookings, invoices, CRM activity — from **admin** (desktop)
   or **mobile** (on the go), both of which require a staff login against the same backend.

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

# mobile (needs the Flutter SDK)
cd mobile && flutter pub get && flutter run --dart-define=API_BASE_URL=http://localhost:3000
```

Seed a staff login before using `admin` or `mobile`:

```bash
cd backend && npm run seed:staff -- "Your Name" you@example.com "a-strong-password"
```

Each app's own README has a "Build for production" section with the exact commands (and, for
`frontend`/`admin`/`mobile`, what gets baked in at build time vs. read at runtime) — see
[`backend`](backend/README.md#build-for-production), [`frontend`](frontend/README.md#build-for-production),
[`admin`](admin/README.md#build-for-production), [`mobile`](mobile/README.md#build-for-production).

## Deployment

**Render** ([`render.yaml`](render.yaml)) is live and is where the app actually runs: a single
Blueprint provisions `pawfectpets-backend` (Node web service, `pawfectpets-backend.onrender.com`),
`pawfectpets-frontend` and `pawfectpets-admin` (static sites with an SPA rewrite so client-side
routes work). Note the free plan spins the backend down after inactivity — the first request after
a quiet period takes 30-50s. `mobile`'s default `API_BASE_URL` (see `mobile/lib/config.dart`)
points at this same backend, so it works against real data without any extra setup.

`frontend` and `admin` are also linked to Vercel projects (`pawfect-pets-sherborne/frontend` and
`pawfect-pets-sherborne/admin`) from an earlier exploration of that route, left as-is since Render
is the settled choice — remove them if they're not needed.

`mobile` isn't deployed anywhere (no app-store builds) — it's built and run locally, or via CI on
a Mac for iOS. Nothing about how it talks to the backend is Render-specific.

### Self-hosting with Docker / Portainer

[`docker-compose.yml`](docker-compose.yml) (repo root) is an alternative to Render: a self-hosted
`mongo` container plus `backend`/`admin`/`frontend`, each built from that app's own `Dockerfile`
(`backend/Dockerfile`, `admin/Dockerfile`, `frontend/Dockerfile` — the latter two are a Vite build
stage feeding an `nginx:1.27-alpine` stage with an SPA-rewrite `nginx.conf`, same client-side-routing
need as Render's own rewrite rule above). Copy [`.env.example`](.env.example) to `.env` (or paste
its contents into Portainer's stack environment variables) and fill in real values before deploying
— see that file's comments for what each one is and, critically, why `ENCRYPTION_KEY` specifically
must be copied unchanged from the existing `backend/.env` rather than freshly generated (it would
otherwise permanently break decryption of already-stored `alarmInstructionsEncrypted` values).
`VITE_API_URL`/`VITE_INTAKE_URL` are Vite build-time values (see each frontend's own
"Build for production" section) baked into the `admin`/`frontend` images via Docker build args, not
ordinary runtime environment variables — they must be the real, publicly-reachable URLs a browser
will load, not the in-network `backend`/`admin`/`frontend` service names.

In Portainer: **Stacks → Add stack**, paste `docker-compose.yml`'s contents (or point it at this
Git repo), fill in the environment variables from `.env.example`, deploy. No reverse proxy or TLS
is bundled — `backend`/`admin`/`frontend` are exposed on host ports 3000/8080/8081 respectively;
put your own reverse proxy (Nginx Proxy Manager, Traefik, Caddy) in front for real domains/HTTPS,
routing to those ports. Migrating existing data: `mongodump --uri="<the Atlas URI from backend/.env>"
--archive=pawfectpets.archive --gzip`, copy the archive to wherever the new `mongo` container is
reachable from, then `mongorestore --uri="mongodb://<user>:<password>@<host>:27017/pawfectpets?authSource=admin"
--archive=pawfectpets.archive --gzip`. Verify the new stack works end-to-end (including a real
staff login and a test intake submission) before repointing DNS/`mobile`'s `API_BASE_URL` at it and
decommissioning the Render services — keeping both running in parallel during the switch costs
nothing and makes rollback a non-event if something's missed.

## Security notes

- Alarm codes/instructions are encrypted at rest (AES-256-GCM) and only decrypted on demand via
  a staff-only endpoint — see [`backend/README.md`](backend/README.md).
- There's no self-registration for staff accounts; the first one is created via
  `npm run seed:staff`, and further accounts are added by an already-logged-in staff member.
- The intake-form link (`/intake/<customerId>`) is effectively a bearer token — anyone with the
  link can view and complete that customer's record. That's the intended design for a
  frictionless public entry point, but it means links should be treated as sensitive when sent.

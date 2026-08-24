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

**Self-hosted via Docker/Portainer + Cloudflare Tunnel** is where the app actually runs now
(migrated from Render — see "Retired: Render" below for that history).
[`docker-compose.yml`](docker-compose.yml) (repo root) defines the whole stack: a self-hosted
`mongo` container plus `backend`/`admin`/`frontend`, each built from that app's own `Dockerfile`
(`backend/Dockerfile`, `admin/Dockerfile`, `frontend/Dockerfile` — no nginx anywhere in this setup;
the latter two are a Vite build stage feeding a `node:22-alpine` stage running the `serve` package
in `-s`/single mode, which gives the same SPA-fallback-to-`index.html` behaviour a rewrite rule
would, for the same reason — client-side routes like `/customers/:id` or `/intake/:id` aren't real
files). `.env.example` documents every stack-level variable — notably why `ENCRYPTION_KEY`
specifically must stay whatever it already was, never freshly generated (it would otherwise
permanently break decryption of already-stored `alarmInstructionsEncrypted` values).
`VITE_API_URL`/`VITE_INTAKE_URL` are Vite build-time values (see each frontend's own
"Build for production" section) baked into the `admin`/`frontend` images via Docker build args, not
ordinary runtime environment variables — they must be the real, publicly-reachable URLs a browser
will load, not the in-network `backend`/`admin`/`frontend` service names.

Public ingress is a `cloudflared` service in the same stack (Cloudflare Tunnel), not a reverse
proxy — it makes an outbound-only connection to Cloudflare's edge, so nothing needs a port opened
on the host or forwarded on the router, and TLS is handled by Cloudflare rather than anything in
this repo. Routing (which public hostname maps to which internal service) is configured as Public
Hostnames on the tunnel in the Cloudflare Zero Trust dashboard, not in this file.
`backend`/`admin`/`frontend` also still publish to host ports 3000/8080/8081 for direct/LAN access
(handy while debugging) — remove those `ports:` entries if you'd rather nothing but the tunnel
could reach them at all.

`mobile`'s default `API_BASE_URL` (see `mobile/lib/config.dart`) points at this same backend, so it
works against real data without any extra setup. `mobile` itself isn't deployed anywhere (no
app-store builds) — it's built and run locally, or via CI on a Mac for iOS.

### Keeping it updated

Portainer's stack is built from this Git repository (Business Edition's "GitOps updates"), not a
one-off copy-paste — so a push to `main` can redeploy automatically rather than needing someone to
click **Pull and redeploy** in Portainer by hand every time. Two ways to trigger it, both configured
on the stack itself in Portainer (Stacks → this stack → Edit → **GitOps updates**): **polling** (Portainer
checks the repo on an interval and redeploys if it changed) or a **webhook** (Portainer exposes a
unique URL; add it as a GitHub webhook — repo **Settings → Webhooks → Add webhook**, content type
`application/json`, "Just the push event" — so a push triggers an immediate redeploy instead of
waiting for the next poll). Either way, `docker-compose.yml`'s `pull_policy: build` on
`backend`/`admin`/`frontend` is what makes a redeploy actually *rebuild* those images from the newly
-pulled source, rather than silently reusing whatever was already built under that name — without
it, a webhook-triggered redeploy would fire but nothing running would actually change.

The webhook route (`portainer.pawfectpetssherborne.co.uk` → Portainer's `9443`) must be set to the
**HTTPS** service type on the Cloudflare Tunnel's Public Hostname config, not HTTP — Portainer's
`9443` is TLS-only, so an HTTP-typed route causes every request to fail with a TCP-level
`connection reset by peer` rather than a clean HTTP error.

Rolling back is the same shape in reverse: `git revert`/`git reset` the unwanted commit(s) on
`main` and push — the next poll/webhook redeploys from that reverted state, same as any other push.

### Retired: Render

Previously deployed on Render ([`render.yaml`](render.yaml), still in the repo for reference): a
Blueprint provisioning `pawfectpets-backend` (Node web service), `pawfectpets-frontend` and
`pawfectpets-admin` (static sites with an SPA rewrite). `frontend`/`admin` were also linked to
Vercel projects (`pawfect-pets-sherborne/frontend`/`admin`) from an earlier exploration of that
route. Both are retired now that the self-hosted stack above is live and verified against a real
data migration from the old Atlas database — remove the Render services and Vercel projects once
you're confident nothing still depends on them (e.g. an old bookmark hitting
`pawfectpets-backend.onrender.com`).

In Portainer: **Stacks → Add stack**, paste `docker-compose.yml`'s contents (or point it at this
Git repo), fill in the environment variables from `.env.example`, deploy. Migrating existing data:
`mongodump --uri="<the Atlas URI from backend/.env>" --archive=pawfectpets.archive --gzip`, copy
the archive to wherever the new `mongo` container is reachable from, then `mongorestore
--uri="mongodb://<user>:<password>@<host>:27017/pawfectpets?authSource=admin"
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

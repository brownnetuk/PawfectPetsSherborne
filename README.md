# PawfectPets Sherborne

A complete client-intake, booking, invoicing, CRM, compliance and staff-management platform for a
pet-care business (dog boarding, day care, home visits/pet sitting). The repository is a monorepo of
five applications that all talk to one NestJS + MongoDB API.

> This README is the single, granular reference for the whole system: architecture, every app, every
> URL, every API route, data models, email/push sending, templates, scheduled jobs, deployment, and a
> roadmap of suggested fixes, improvements and new features. Each app also keeps a shorter
> setup-focused README of its own ([`backend/`](backend/README.md), [`frontend/`](frontend/README.md),
> [`admin/`](admin/README.md), [`mobile/`](mobile/README.md), [`mobile-portal/`](mobile-portal/README.md)),
> and there is a prioritised security review in [`docs/security-review.md`](docs/security-review.md).

## Table of contents

1. [The five apps](#the-five-apps)
2. [System architecture](#system-architecture)
3. [Repository layout](#repository-layout)
4. [End-to-end business workflows](#end-to-end-business-workflows)
5. [Public URLs and hostnames](#public-urls-and-hostnames)
6. [Local development](#local-development)
7. [Deployment](#deployment)
8. [Backend (API)](#backend)
9. [Admin dashboard (admin/)](#admin-dashboard)
10. [Public intake site (frontend/)](#public-intake-site-frontend)
11. [Customer app (mobile-portal/)](#customer-app-mobile-portal)
12. [Staff app (mobile/)](#staff-app-mobile)
13. [Security notes](#security-notes)
14. [Roadmap: fixes, improvements and new features](#roadmap-fixes-improvements-and-new-features)

## The five apps

| App | Who uses it | What it is | Stack | Default dev URL |
| --- | --- | --- | --- | --- |
| [`backend/`](backend/) | Every other app | The API: customers, pets, bookings, invoices, quotes, payments, CRM, email, push, forms, compliance, staff auth | NestJS 11, Mongoose 9 / MongoDB 7, Passport JWT, `@nestjs/schedule`, `@nestjs/throttler`, helmet, jsPDF, sharp, mammoth, qrcode | `http://localhost:3000` |
| [`admin/`](admin/) | Staff (desktop browser) | The back-office dashboard for running the business | React 19, TypeScript, Vite, react-router-dom 7, dnd-kit, jsPDF + html2canvas | `http://localhost:5174` |
| [`frontend/`](frontend/) | Customers (no login) | Public intake/registration site, plus public form, pre-boarding, invoice and quote links | React 19, TypeScript, Vite, jsPDF | `http://localhost:5173` |
| [`mobile/`](mobile/) | Staff (in the field) | Staff companion app: calendar, customers, pets, invoices, payments (SumUp card reader), CRM notes, push reminders | Flutter (iOS primary; Android/web builds exist), provider, http, flutter_secure_storage, local_auth, mobile_scanner, sumup | n/a |
| [`portal/`](portal/) | Customers (logged in, browser) | Web customer portal: update their details and their pets' details, view and download invoices and quotes, see bookings. Sign-in is an emailed 6-digit code then the last 3 digits of their mobile | React 19, TypeScript, Vite | `http://localhost:5175` |
| [`mobile-portal/`](mobile-portal/) | Customers (logged in) | Customer app: quotes, invoices, pets, bookings, forms, messages with staff | Flutter (iOS), provider, http, flutter_secure_storage, local_auth, signature | n/a |

## System architecture

### Container / runtime view

```mermaid
flowchart LR
    subgraph Internet
        StaffBrowser["Staff browser<br/>(admin dashboard)"]
        CustBrowser["Customer browser<br/>(intake / form / invoice links)"]
        StaffApp["Staff iPhone app<br/>(mobile/)"]
        CustApp["Customer iPhone app<br/>(mobile-portal/)"]
    end

    subgraph Cloudflare["Cloudflare edge (TLS)"]
        CF["Cloudflare Tunnel<br/>Public Hostnames"]
    end

    subgraph Host["Docker host (Portainer stack)"]
        cloudflared["cloudflared<br/>(outbound-only tunnel)"]
        admin["admin<br/>serve -s dist :80<br/>(host :8080)"]
        frontend["frontend<br/>serve -s dist :80<br/>(host :8081)"]
        backend["backend<br/>NestJS :3000<br/>(host :3000)"]
        mongo[("mongo:7<br/>volume mongo_data")]
    end

    subgraph External["External services"]
        Graph["Microsoft Graph<br/>sendMail (email)"]
        AAD["login.microsoftonline.com<br/>(OAuth client credentials)"]
        APNs["Apple Push Notification service"]
        SumUp["SumUp card reader SDK"]
    end

    StaffBrowser --> CF
    CustBrowser --> CF
    StaffApp --> CF
    CustApp --> CF
    CF <--> cloudflared
    cloudflared --> admin
    cloudflared --> frontend
    cloudflared --> backend
    admin -. "XHR (VITE_API_URL)" .-> backend
    frontend -. "XHR (VITE_API_URL)" .-> backend
    backend --> mongo
    backend --> AAD
    backend --> Graph
    backend --> APNs
    StaffApp --> SumUp
```

### Logical view: who calls what

```mermaid
flowchart TB
    subgraph Clients
        A[admin<br/>staff JWT]
        M[mobile<br/>staff JWT]
        F[frontend<br/>public, link = token]
        P[mobile-portal<br/>customer JWT]
    end
    subgraph API["backend (NestJS)"]
        G1{{"Global guards:<br/>ThrottlerGuard -> JwtAuthGuard -> PermissionsGuard"}}
        Pub["@Public() routes<br/>(intake, forms, pixels, health,<br/>public invoice/quote, logins)"]
        Staff["Staff routes<br/>(default: JWT + permission)"]
        Portal["/portal/* routes<br/>(@Public at router,<br/>CustomerJwtGuard inside)"]
        Cron["@Cron jobs<br/>(reminders, overdue, reviews,<br/>pre-check-in, training)"]
    end
    DB[(MongoDB)]
    A --> G1 --> Staff
    M --> G1
    F --> Pub
    P --> Portal
    Staff --> DB
    Pub --> DB
    Portal --> DB
    Cron --> DB
```

### Request lifecycle inside the backend

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant H as helmet / CORS (ALLOWED_ORIGINS)
    participant T as ThrottlerGuard (300 req/min default)
    participant J as JwtAuthGuard (skips @Public)
    participant PG as PermissionsGuard (@RequirePermissions)
    participant V as ValidationPipe (whitelist, forbidNonWhitelisted, transform)
    participant Ctl as Controller
    participant S as Service
    participant DB as MongoDB
    C->>H: HTTPS request (via Cloudflare Tunnel)
    H->>T: allowed origin
    T->>J: under rate limit
    J->>PG: valid staff JWT (or public route)
    PG->>V: role has permission
    V->>Ctl: DTO validated & transformed
    Ctl->>S: business call
    S->>DB: Mongoose query
    DB-->>S: documents
    S-->>Ctl: result (side effects: email / push / audit log)
    Ctl-->>C: JSON
```

## Repository layout

```text
.
├── README.md                 ← this file
├── docker-compose.yml        ← production stack (mongo, backend, admin, frontend, cloudflared)
├── .env.example              ← stack-level env vars for docker-compose / Portainer
├── render.yaml               ← retired Render blueprint (kept for reference)
├── .claude/launch.json       ← dev launch configs (backend :3000, frontend :5173, admin :5174)
├── docs/security-review.md   ← prioritised security review
├── backend/                  ← NestJS API (~25k lines TS)
│   ├── src/<module>/         ← one folder per domain: *.controller.ts, *.service.ts, *.module.ts, dto/, schemas/
│   ├── src/common/           ← encryption, tracking-pixel helpers, shared utils
│   ├── scripts/seed-staff.js ← creates the first staff login
│   └── test/                 ← e2e test scaffold
├── admin/                    ← React staff dashboard (~41k lines TSX)
│   └── src/{api,auth,layout,pages,components,forms,pdf,utils,assets}
├── frontend/                 ← React public intake site (~6.6k lines TSX)
│   └── src/{api,intake/steps,forms,pre-boarding,documents,pdf,components}
├── mobile/                   ← Flutter staff app (~20k lines Dart)
│   └── lib/{api,models,screens,widgets,state,services,utils}
└── mobile-portal/            ← Flutter customer app (~4.3k lines Dart)
    └── lib/{api,models,screens/sections,services,state,widgets}
```

Backend domain modules (each `backend/src/<name>/`): `animals`, `annual-leave`, `appointments`,
`audit-log`, `auth`, `bank-accounts`, `bank-holidays`, `bank-transfers`, `boarding-bookings`,
`bookings`, `checklists`, `credit-notes`, `crm`, `customer-notifications`, `customers`,
`day-bookings`, `email-groups`, `email-messages`, `enquiries`, `expense-categories`, `expenses`,
`form-submissions`, `forms`, `invoice-terms`, `invoices`, `messages`, `notifications`,
`payment-methods`, `payments`, `policies`, `portal`, `pre-boarding`, `products`, `push`,
`push-messages`, `quotes`, `reports`, `risk-assessments`, `roles`, `settings`, `staff`,
`staff-training`, `vendors`, `vet-practices`.

## End-to-end business workflows

### Customer journey (lead → active customer → paying customer)

```mermaid
flowchart TD
    E[Enquiry arrives<br/>phone / email / website] --> L[Staff create lead customer<br/>in admin]
    L --> RL[Registration link emailed<br/>frontend /intake/:customerId]
    RL --> IF[Customer completes intake wizard:<br/>details, pets, vet, security,<br/>agreement + signature]
    IF --> ACT[Customer becomes active;<br/>Animal records created;<br/>registration PDF stored]
    ACT --> PB{Boarding?}
    PB -- yes --> PBF[Pre-boarding eligibility form<br/>scored pass / review / fail]
    PB -- no --> Q
    PBF --> Q[Quote created and emailed<br/>quote link]
    Q --> QA[Customer accepts quote<br/>public link or portal]
    QA --> BK[Bookings / visits on the Calendar]
    BK --> PCI[Pre-check-in form sent<br/>automatically before stay]
    PCI --> CI[Check-in checklist + observations]
    CI --> CO[Check-out checklist]
    CO --> INV[Invoice generated and emailed<br/>invoice link]
    INV --> PAY[Payment recorded:<br/>bank transfer / card via SumUp / cash]
    PAY --> TY[Thank-you email; invoice paid]
    ACT --> PORTAL[Portal access enabled:<br/>customer app login]
```

### Staff operations at a glance

```mermaid
flowchart LR
    Cal[Calendar<br/>boarding, day care,<br/>visits, appointments] --> Inv[Invoices & quotes]
    Inv --> Fin[Financial:<br/>payments, credit notes,<br/>bank accounts, transfers,<br/>expenses, vendors]
    Fin --> Rep[Reports & cash-flow charts]
    Cust[Customers & pets] --> Cal
    Cust --> CRM[CRM activity,<br/>messages, emails, push]
    Comp[Compliance:<br/>risk assessments, policies,<br/>staff training, checklists] --> Staff[Staff, roles,<br/>annual leave]
```

## Public URLs and hostnames

Production runs behind a Cloudflare Tunnel; each public hostname is mapped in the Cloudflare Zero
Trust dashboard to an in-network Docker service.

| Purpose | Env var that holds it | Tunnel target | Notes |
| --- | --- | --- | --- |
| API | `PUBLIC_API_URL` (e.g. `https://api.pawfectpetssherborne.co.uk`) | `http://backend:3000` | Also baked into admin/frontend as `VITE_API_URL`; default `API_BASE_URL` in both Flutter apps; used to build email tracking-pixel URLs |
| Staff dashboard | — (in `ALLOWED_ORIGINS`) | `http://admin:80` | e.g. `https://admin.pawfectpetssherborne.co.uk` |
| Public intake site | `PUBLIC_INTAKE_URL` (e.g. `https://intake.pawfectpetssherborne.co.uk`) | `http://frontend:80` | Base for `{{invoice_link}}`, `{{quote_link}}`, form and registration links in emails; baked into admin as `VITE_INTAKE_URL` |
| Customer portal (web) | — (in `ALLOWED_ORIGINS`) | `http://portal:80` | `https://portal.pawfectpetssherborne.co.uk`; see [`portal/`](portal/README.md) |
| Portainer webhook | — | `https://<host>:9443` (HTTPS service type) | `portainer.pawfectpetssherborne.co.uk`, used for GitOps redeploy on push |

Health check: `GET /health` on the backend (used by Docker `HEALTHCHECK` and the retired Render blueprint).

## Local development

Each app runs independently; start the ones you need:

```bash
# backend — needs MONGODB_URI, ENCRYPTION_KEY, JWT_SECRET in backend/.env
cd backend && npm install && npm run start:dev          # http://localhost:3000

# then, in separate terminals:
cd frontend && npm install && npm run dev               # http://localhost:5173
cd admin && npm install && npm run dev                  # http://localhost:5174
cd portal && npm install && npm run dev                 # http://localhost:5175 (customer portal)

# Flutter apps (need the Flutter SDK)
cd mobile && flutter pub get && flutter run --dart-define=API_BASE_URL=http://localhost:3000
cd mobile-portal && flutter pub get && flutter run --dart-define=API_BASE_URL=http://localhost:3000
```

Seed a staff login before using `admin` or `mobile`:

```bash
cd backend && npm run seed:staff -- "Your Name" you@example.com "a-strong-password"
```

Useful scripts:

| App | Command | What it does |
| --- | --- | --- |
| backend | `npm run start:dev` / `start:debug` / `start:prod` | Watch mode / debugger / run compiled `dist/main` |
| backend | `npm run build` | `nest build` |
| backend | `npm test`, `test:watch`, `test:cov`, `test:e2e` | Jest unit / watch / coverage / e2e (`test/jest-e2e.json`) |
| backend | `npm run lint`, `format` | ESLint with `--fix`, Prettier |
| backend | `npm run seed:staff -- <name> <email> <password>` | Create a staff account (`scripts/seed-staff.js`) |
| admin, frontend | `npm run dev`, `build` (`tsc -b && vite build`), `lint` (oxlint), `preview` | Vite dev / production build / lint / preview |
| mobile, mobile-portal | `flutter run`, `flutter build ios`, `flutter test` | Run / build / test |

`.claude/launch.json` defines launch configs for `backend` (3000), `frontend` (5173, strict port) and
`admin` (5174, strict port).

## Deployment

**Self-hosted via Docker/Portainer + Cloudflare Tunnel** is where the app runs (migrated from
Render, see "Retired: Render" below).

### The stack (`docker-compose.yml`)

| Service | Image / build | Ports (host:container) | Key config |
| --- | --- | --- | --- |
| `mongo` | `mongo:7` | none (internal only) | `MONGO_INITDB_ROOT_USERNAME/PASSWORD`, db `pawfectpets`, volume `mongo_data:/data/db` |
| `backend` | `./backend/Dockerfile` (node:22-alpine, multi-stage, non-root `app` user, `HEALTHCHECK /health`) | `3000:3000` | `TZ=Europe/London`, `MONGODB_URI` built from mongo creds, `ENCRYPTION_KEY`, `JWT_SECRET`, `PUBLIC_API_URL`, `PUBLIC_INTAKE_URL`, `ALLOWED_ORIGINS`, `APNS_*` |
| `admin` | `./admin/Dockerfile` (Vite build → `serve -s dist` on :80) | `8080:80` | Build args `VITE_API_URL`, `VITE_INTAKE_URL` |
| `frontend` | `./frontend/Dockerfile` (Vite build → `serve -s dist` on :80) | `8081:80` | Build arg `VITE_API_URL` |
| `cloudflared` | `cloudflare/cloudflared:latest` | none | `tunnel run` with `TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}` |

All services share the `pawfectpets` bridge network. `backend`/`admin`/`frontend` use
`pull_policy: build` so a GitOps redeploy rebuilds images from the newly pulled source.
`TZ=Europe/London` matters: date handling normalises to local midnight and appointment reminders use
the server clock.

### Stack environment variables (`.env.example` / Portainer)

| Variable | Used by | Notes |
| --- | --- | --- |
| `MONGO_ROOT_USERNAME`, `MONGO_ROOT_PASSWORD` | mongo, backend | Avoid `@ : / ? #` in the password (it is interpolated into a URI) |
| `ENCRYPTION_KEY` | backend | **Never change once data exists**: it decrypts alarm codes and the stored Microsoft Graph client secret |
| `JWT_SECRET` | backend | Changing it only forces everyone to log in again (customer realm secret is derived from it) |
| `PUBLIC_API_URL` | backend, admin & frontend builds | Public API URL, no trailing slash |
| `PUBLIC_INTAKE_URL` | backend, admin build | Public intake site URL |
| `ALLOWED_ORIGINS` | backend | Comma-separated CORS allow-list |
| `APNS_KEY`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `APNS_CUSTOMER_BUNDLE_ID`, `APNS_PRODUCTION` | backend | Apple push; leave unset to disable push (backend logs and skips) |
| `CLOUDFLARE_TUNNEL_TOKEN` | cloudflared | From Zero Trust → Networks → Tunnels |

`VITE_*` values are **build-time** (inlined into the JS bundle by Vite), passed as Docker build args;
they must be the real public URLs a browser can load, not the in-network service names.

### Deployment pipeline

```mermaid
flowchart LR
    Dev[Developer] -->|git push main| GH[GitHub repo]
    GH -->|webhook push event| CFw[Cloudflare Tunnel<br/>portainer hostname, HTTPS]
    CFw --> Portainer[Portainer BE<br/>GitOps updates]
    GH -. polling alternative .-> Portainer
    Portainer -->|git pull + docker compose up<br/>pull_policy: build| Stack[Rebuilt backend / admin / frontend]
```

There is no GitHub Actions CI in this repo (`.github/` does not exist): tests and lint run locally only.

### Keeping it updated

Portainer's stack is built from this Git repository (Business Edition "GitOps updates"), so a push to
`main` redeploys automatically. Configure on the stack (Stacks → this stack → Edit → **GitOps
updates**) either **polling** or a **webhook** (GitHub repo **Settings → Webhooks → Add webhook**,
content type `application/json`, "Just the push event"). The webhook route
(`portainer.pawfectpetssherborne.co.uk` → Portainer's `9443`) must use the **HTTPS** service type on
the tunnel's Public Hostname; an HTTP-typed route fails with `connection reset by peer`.

Rolling back: `git revert` the unwanted commit(s) on `main` and push; the next poll/webhook redeploys.

### Data migration (Atlas → self-hosted)

```bash
mongodump --uri="<the Atlas URI from backend/.env>" --archive=pawfectpets.archive --gzip
mongorestore --uri="mongodb://<user>:<password>@<host>:27017/pawfectpets?authSource=admin" \
  --archive=pawfectpets.archive --gzip
```

Verify end to end (a real staff login and a test intake submission) before repointing DNS or the
mobile apps' `API_BASE_URL`.

### Retired: Render

[`render.yaml`](render.yaml) is kept for reference: a Blueprint provisioning `pawfectpets-backend`
(Node web service, health check `/health`) and `pawfectpets-frontend` / `pawfectpets-admin` (static
sites with an SPA rewrite `/* → /index.html`). `frontend`/`admin` were also linked to Vercel
projects. Both are retired; remove them once nothing depends on them (e.g. old bookmarks to
`pawfectpets-backend.onrender.com`).

### Mobile distribution

Neither Flutter app is in an app store pipeline in this repo; both are built locally (or on a Mac for
iOS) with `--dart-define` values. See the staff app and customer app sections for the defines.


## Backend

The API is a single NestJS application (`backend/`). It is documented in three parts: core platform (bootstrap, auth, customers, portal, push, settings and email templates), bookings and finance, and communications and compliance (including exactly how email is sent).

### Backend core: scope of this section

This section covers the NestJS backend's foundations: bootstrap, auth and permissions, staff and roles, customers, animals, vet practices, the customer portal realm, push notifications (APNs), the staff and customer notification feeds, settings (business info, email, templates, visit mapping, boarding workflow), the audit log, and the build, test and deploy files under `backend/`. Everything here comes from the source under `backend/src/`. File paths are relative to `backend/`.

| Item | Value |
|---|---|
| Framework | NestJS 11 (`@nestjs/core ^11.0.1`), Express platform |
| DB | MongoDB via Mongoose 9 (`mongoose ^9.9.3`, `@nestjs/mongoose ^11.0.4`) |
| Auth libs | `@nestjs/passport`, `passport-jwt`, `@nestjs/jwt`, `bcryptjs` (cost 10) |
| Rate limiting | `@nestjs/throttler ^6.5.0` |
| Scheduling | `@nestjs/schedule ^6.1.3` (`ScheduleModule.forRoot()`) |
| Other notable deps | `helmet ^8.3.0`, `mammoth` (.docx→HTML), `jspdf`, `qrcode`, `sharp` |
| Node runtime (Docker) | `node:22-alpine` |

---

### Bootstrap (`src/main.ts`, `src/app.module.ts`)

Startup order in `src/main.ts`:

1. **DNS override**: `dns.setServers(['1.1.1.1', '8.8.8.8'])` runs before Nest boots. This makes `mongodb+srv://` SRV/TXT lookups work on ISP resolvers that don't support them. The setting is process-wide and applies to every `dns.resolve*` call.
2. `NestFactory.create<NestExpressApplication>(AppModule)`.
3. **Helmet**: `app.use(helmet({ contentSecurityPolicy: false }))`. CSP is off and every other Helmet default stays on (HSTS, `X-Content-Type-Options`, `Cross-Origin-Resource-Policy: same-origin`, and so on).
4. **CORS**: `app.enableCors({ origin, exposedHeaders: ['Content-Disposition'] })`.
   - `origin` = the comma-separated `ALLOWED_ORIGINS` (trimmed, empties dropped). If that list is empty, `origin: true` reflects whatever origin called.
   - `Content-Disposition` is exposed so the admin can read the terms-download filename.
   - Native mobile apps send no `Origin` header, so CORS doesn't affect them.
5. **Body limit**: `app.useBodyParser('json', { limit: '8mb' })`. This is for base64 logo and .docx uploads, PDF snapshots and photos. The urlencoded parser keeps Express's default limit.
6. **Global ValidationPipe**: `{ whitelist: true, forbidNonWhitelisted: true, transform: true }`. A property not declared on the DTO gets a 400, not a silent strip.
7. `app.listen(process.env.PORT ?? 3000)`.

`AppModule` (`src/app.module.ts`):

| Concern | Configuration |
|---|---|
| Config | `ConfigModule.forRoot({ isGlobal: true })`. Loads `.env` into `process.env`. |
| Scheduler | `ScheduleModule.forRoot()` |
| Throttling | `ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 300 }] })` (300 requests per 60 s per tracker, the default throttler name `default`) |
| Mongo | `MongooseModule.forRootAsync`, `uri = MONGODB_URI` with fallback `mongodb://localhost:27017/pawfectpets` |
| Global encryption | `EncryptionModule` (`@Global`) |
| Global guards (`APP_GUARD`, in this order) | 1. `JwtAuthGuard` → 2. `PermissionsGuard` → 3. `ClientIpThrottlerGuard` (`ThrottlerGuard` keyed on `CF-Connecting-IP`, see `common/client-ip-throttler.guard.ts`) |
| Controllers | `AppController` (`GET /health`) |
| Imports | Every feature module (≈45). `StaffModule` is imported directly so `PermissionsGuard` can inject the `Staff` model. |

Per-route throttle overrides (`@Throttle({ default: { limit, ttl: 60_000 } })`):

| Route | Limit / 60 s |
|---|---|
| `POST /auth/login` | 10 |
| `POST /portal/request-code` | 5 |
| `POST /portal/request-reset` | 5 |
| `POST /portal/verify-code` | 10 |
| `POST /portal/login` | 10 |
| `POST /portal/web/request-code` | 5 |
| `POST /portal/web/verify-code` | 10 |
| `POST /portal/web/verify-phone` | 10 |
| `POST /customers/:id/send-registration-copy` | 5 |
| Everything else (incl. `POST /portal/set-password`) | 300 (global) |

The throttler's tracker is Nest's default (`req.ip`). There is no `app.set('trust proxy', …)`, and no custom `getTracker`, anywhere in `src/`. The code handles client IPs separately: `src/common/client-ip.util.ts` reads `CF-Connecting-IP`, then the first entry of `X-Forwarded-For`, then `req.socket.remoteAddress`. That logic is only used for the trusted-IP login check and `GET /settings/my-ip`.

No global exception filter is registered. Mongoose `CastError`s (for example, a malformed `:id`) fall through to Nest's default handler and come back as 500s.

---

### Common utilities (`src/common/`)

| File | Exports | Behaviour |
|---|---|---|
| `encryption/encryption.service.ts` | `EncryptionService.encrypt(plain)` / `decrypt(payload)` | AES-256-GCM with a 12-byte random IV. Key = `scryptSync(ENCRYPTION_KEY, 'pawfectpets-field-encryption', 32)`, derived in `onModuleInit`. Boot throws if `ENCRYPTION_KEY` is unset. Ciphertext format is `ivHex:authTagHex:dataHex`. `decrypt` throws `Malformed encrypted payload` if any part is missing. |
| `encryption/encryption.module.ts` | `EncryptionModule` | `@Global()`. Provides and exports `EncryptionService`. |
| `tracking-pixel.util.ts` | `transparentGifBuffer()`, `trackingPixelHtml(url)`, `publicApiUrl()`, `publicFrontendUrl()` | 1×1 transparent GIF (base64 constant). The `<img … style="display:none;width:1px;height:1px;border:0;">` tag is appended to sent emails. `publicApiUrl()` = `PUBLIC_API_URL ?? http://localhost:${PORT??3000}`. `publicFrontendUrl()` = `PUBLIC_INTAKE_URL ?? http://localhost:5173`. Both use `??`, so an **empty string** env var is used as-is. |
| `client-ip.util.ts` | `getClientIp(req)` | `CF-Connecting-IP` → first `X-Forwarded-For` → `req.socket.remoteAddress` |
| `html.util.ts` | `escapeHtml(s)` | Escapes `& < > " '` |
| `invoice-email.util.ts` | `formatUkDate(d)` (`dd/mm/yyyy`), `buildItemsTableHtml(lineItems)` | Builds the inline-styled `{{items_table}}` HTML: Description / Qty / Rate / Discount / Amount. Amount = `qty × unitPrice × (1 − discount%/100)`. Description is HTML-escaped. |
| `document-number.util.ts` | `formatDocumentNumber(template, seq)`, `nextSequenceNumber(model, field)` | Substitutes `{year}` (current year) and `{seq}` (zero-padded to 5 digits). `nextSequenceNumber` does an atomic `$inc` with upsert on the singleton. If the field never existed it sets the field to 2 and returns 1. |
| `field-diff.util.ts` | `diffFields(patch, before, specs)`, `formatDate`, `formatCapitalised` | Dot-path field diff for audit messages. Fields missing from `patch` are skipped. Default format: `—` for empty, `Yes`/`No` for booleans. |
| `delete-guard.util.ts` | `describeBlockers({label: n})` | Builds text like `"2 invoices and 1 quote"` for 409 delete-blocked messages. Returns `null` when every count is 0. |

---

### Auth & permissions

#### Realms

| Realm | Strategy name | Secret | Payload | TTL | Extracted as | Guard |
|---|---|---|---|---|---|---|
| Staff | `jwt` (`src/auth/jwt.strategy.ts`) | `JWT_SECRET` (`getOrThrow`) | `{ sub: staffId, email, name }` | `12h` default (`JwtModule.registerAsync … signOptions.expiresIn`). `30d` when `LoginDto.rememberMe === true`. | `Authorization: Bearer` | Global `JwtAuthGuard` + global `PermissionsGuard` |
| Customer portal | `portal-jwt` (`src/portal/portal-jwt.strategy.ts`) | `sha256(JWT_SECRET + "|portal")` hex (`portalJwtSecret()` in `portal-jwt.util.ts`) | `{ sub: customerId, email, typ: 'portal' }` | `90d` (`PORTAL_TOKEN_TTL`) | `Authorization: Bearer` | `@Public()` on the class + `@UseGuards(PortalJwtGuard)` per route |

`JwtStrategy.validate()` maps the payload to `req.user = { id: sub, email, name }` (`CurrentUserShape`). It doesn't hit the database. `PortalJwtStrategy.validate()` loads `Customer.portalActive` on **every request**. If the customer is missing or `portalActive` is false it throws `401 'Mobile app access has been disabled.'`. Otherwise it returns `{ customerId, email }`. The two realms use different signing secrets, so a staff token can't validate as a portal token and vice versa.

#### Decorators and guards

| Item | File | Semantics |
|---|---|---|
| `@Public()` | `auth/public.decorator.ts` | `SetMetadata('isPublic', true)`, handler or class level |
| `@RequirePermission(key)` | `auth/require-permission.decorator.ts` | `SetMetadata('requiredPermission', key)`, handler or class level (`getAllAndOverride`, so the handler wins) |
| `@CurrentUser()` | `auth/current-user.decorator.ts` | Returns `req.user` or a fallback `{ id:'', email:'', name:'Staff' }` |
| `@CurrentCustomer()` | `portal/current-customer.decorator.ts` | Returns `req.user` (`{ customerId, email }`) |
| `actorFromRequest(req)` | `auth/actor.util.ts` | Display-only label for public routes. **Decodes the JWT payload's `name` without verifying it.** No bearer token → `'Customer'`. Payload with no `name` → `'Staff'`. Decode error → `'Customer'`. |
| `JwtAuthGuard` | `auth/jwt-auth.guard.ts` | `AuthGuard('jwt')`. Skipped when `isPublic`. |
| `PermissionsGuard` | `auth/permissions.guard.ts` | See the decision flow below |
| `PortalJwtGuard` | `portal/portal-jwt.guard.ts` | `AuthGuard('portal-jwt')` |

How the three global guards combine on every request (in order):

1. **JwtAuthGuard**: `@Public()` → pass. Otherwise Passport validates the staff bearer token. Missing, invalid or expired → **401**.
2. **PermissionsGuard**:
   - `@Public()` → pass.
   - No `req.user.id` → `false`, which Nest returns as **403**.
   - Loads `Staff.findById(id).populate('role')`. No staff found → `false` (**403**).
   - `staff.locked` → **403** `'This account has been locked…'`. This runs on *every* authenticated route, so an already-issued token stops working as soon as the account is locked.
   - No `@RequirePermission` → pass.
   - `staff.isBreakGlass` → pass (bypasses every permission).
   - `!staff.role` (no role assigned, or the populated role is null) → pass, because no role means **full access**.
   - `role.permissions.includes(required)` → pass.
   - Otherwise **403** `You don't have permission to do that -- … "<key>" permission.`
3. **ThrottlerGuard** runs on everything, including `@Public()` routes.

Portal routes: `PortalController` is `@Public()` at class level, so guards 1 and 2 step aside. Protected portal routes then add `@UseGuards(PortalJwtGuard)`.

#### Permission keys (`src/auth/permissions.catalog.ts` → `ALL_PERMISSION_KEYS`)

These are kept in sync by hand with `admin/src/utils/permissionCatalog.ts`. `RolesService.onModuleInit` seeds an **"Admin"** role holding all of them (`$setOnInsert`, so an existing Admin role is never overwritten).

| Key | Used in this section's scope | Uses across the repo (`@RequirePermission` count) |
|---|---|---|
| `customers.manage` | `DELETE /customers/:id`, `POST /animals/:id/copy`, `/move`, `/unlink`, `DELETE /animals/:id` | 6 |
| `customers.viewSecurity` | `GET /customers/:id/alarm-instructions` | 1 |
| `bookings.manage` | — | 21 (bookings, day-bookings, boarding-bookings, appointments …) |
| `invoicing.manage` | — | 2 (invoices, quotes) |
| `financial.manage` | — | 7 (payments, credit notes, expenses, bank accounts and transfers …) |
| `settings.manage` | Vet-practice create, update and delete. All `PATCH /settings/*`. `POST /settings/terms/preview`, `/settings/email/test`. `PUT` and `DELETE /settings/email-templates/:trigger`. `PATCH /settings/notifications`. | 41 |
| `staff.manage` | `POST /auth/register`, `GET`/`PATCH`/`DELETE /auth/staff[/:id]`, `POST /auth/staff/:id/password`, all `/roles` (class-level) | 6 |
| `training.manage` | — (gates all of Training Admin, read access included) | 10 |

`CreateRoleDto.permissions` is `string[]` and isn't validated against the catalog. Unknown strings are stored but never match anything.

#### Staff login (`AuthService.login`)

Steps in order:

1. Look up `Staff` by `username.toLowerCase()`. Not found → `401 'Invalid username or password'`.
2. `bcrypt.compare(password, passwordHash)`. Mismatch → the same 401.
3. **Lock check** (after the password check, so a wrong password doesn't reveal that an account is locked): `staff.locked` → `401 'This account has been locked. Ask another staff member to unlock it.'`. Break-glass does **not** bypass this.
4. **Trusted-IP check**, applied only when the request header `x-client-app: admin` is present (only the admin web app sends it; the mobile app never does) **and** `!staff.isBreakGlass`:
   - Read `BusinessInfo.trustedIps`. An empty list means no restriction.
   - Compute the client IP with `getClientIp(req)` and require an exact string match against the list. Otherwise → `401 "Login blocked: this device's IP address (x) is not on the admin Trusted IPs list."`
5. Sign a JWT with `{ sub, email, name }`, `expiresIn: 30d` if `rememberMe`, otherwise the 12h default.
6. Return `{ accessToken, staff: shapeStaff(populated) }`, where `shapeStaff` = `{ id, name, username, email, isBreakGlass, locked, role: { id, name, permissions } | null }`.

There is **no automatic failed-attempt lockout** and no attempt counter. "Lockout" means only the manual `Staff.locked` flag plus the throttler (10 per minute per tracker). There is **no backend QR-login endpoint**. `BusinessInfo.qrCodeUrl` only overrides the API URL that the admin encodes in a QR code for the mobile app's first-launch provisioning screen.

Other auth behaviour:

- `AuthService.onModuleInit` backfills `username := email` for any `Staff` with no `username`, on every boot.
- `register`:
  - Lower-cases `email` and `username`.
  - Returns 409 on a duplicate email or username.
  - Hashes with bcrypt cost 10.
  - Sets the optional `isBreakGlass` and `role` (an ObjectId; whether the role exists is not checked).
- `updateStaff`:
  - Partial `$set`.
  - `role: null` → `$unset: { role }` (= full access).
  - Returns 409 on email or username collisions.
- `deleteStaff` refuses when `countDocuments() <= 1` (400 `Cannot delete the last remaining staff account`).
- `changePassword` (`MinLength(8)`) overwrites `passwordHash`. Existing JWTs stay valid.

```mermaid
sequenceDiagram
    autonumber
    participant A as Admin web / Staff app
    participant G as Global guards
    participant C as AuthController
    participant S as AuthService
    participant DB as MongoDB
    A->>G: POST /auth/login {username,password,rememberMe?} (+ x-client-app: admin from web)
    Note over G: JwtAuthGuard/PermissionsGuard skip (@Public)<br/>ThrottlerGuard: 10 req/60s
    G->>C: login(dto, req)
    C->>S: login(dto, req)
    S->>DB: Staff.findOne({username: lower})
    alt not found / bcrypt mismatch
        S-->>A: 401 Invalid username or password
    end
    alt staff.locked
        S-->>A: 401 This account has been locked
    end
    opt x-client-app == admin AND !isBreakGlass
        S->>DB: BusinessInfo.findOne().select(trustedIps)
        alt trustedIps non-empty AND getClientIp(req) not in list
            S-->>A: 401 Login blocked: IP not on Trusted IPs
        end
    end
    S->>S: jwt.sign({sub,email,name}, rememberMe ? 30d : 12h)
    S->>DB: Staff.findById().populate(role)
    S-->>A: 200 {accessToken, staff{id,name,username,email,isBreakGlass,locked,role}}
    A->>G: Subsequent request, Authorization: Bearer <token>
    G->>G: JwtAuthGuard verifies signature/expiry → req.user
    G->>DB: PermissionsGuard: Staff.findById(sub).populate(role)
    alt locked
        G-->>A: 403 locked
    else @RequirePermission(k) and role present and k not in role.permissions and !isBreakGlass
        G-->>A: 403 missing permission k
    else
        G->>C: handler runs
    end
```

#### Customer portal auth (`src/portal/portal.service.ts`)

- **Lookup** (`findActiveWithCreds`): a case-insensitive anchored regex on `email` (input regex-escaped), requiring `portalActive: true`, and selecting `+portalCredentials` (that sub-document is `select: false` on the schema).
- **Codes**: 6 digits from `crypto.randomInt(0, 1_000_000)`, zero-padded, bcrypt-hashed, TTL **48 h** (`CODE_TTL_MS`).
  - Stored as `loginCodeHash`/`loginCodeExpiresAt` for `kind='login'`, or `resetCodeHash`/`resetCodeExpiresAt` for `kind='reset'`.
  - Issuing a new code overwrites that slot.
- **Emails**: `kind='login'` uses trigger `portal_login_code`; `kind='reset'` uses `portal_password_reset`. Variables passed are `{ customer_name, code }`.
- **`requestCode`** resolves quietly whether or not the email exists, so the endpoint can't be used to probe for accounts. It always returns `{ ok: true }`.
- **`matchCode`** accepts a code from **either** slot as long as it hasn't expired.
- **`verifyCode`** is a pre-check only. Invalid → `401 'Invalid or expired code.'`
- **`setPassword(email, code, password≥8)`**:
  - Validates the code.
  - Replaces `portalCredentials` with `{ passwordHash }`, which drops both codes.
  - Sets `portalLastLoginAt = now`.
  - Returns `{ token }`.
- **`login(email, password)`**: bcrypt compare. Failure → `401 'Incorrect email or password.'`. Success → sets `portalLastLoginAt` and returns `{ token }`.
- **Staff toggles** (`PortalAdminController`, any logged-in staff):
  - `setPortalActive`:
    - Turning access off when it was on → `PushService.removeCustomerTokens`.
    - Turning access on when it was off → best-effort `portal_enabled` email (`{ customer_name }`).
  - `adminSendReset` issues a reset code. It requires `portalActive` and an email address (otherwise 400).

```mermaid
sequenceDiagram
    autonumber
    participant App as Customer app
    participant P as PortalController (@Public)
    participant S as PortalService
    participant DB as MongoDB
    participant M as SettingsService / MS Graph
    rect rgb(240,240,240)
    Note over App,M: First-time login (or forgotten password)
    App->>P: POST /portal/request-code {email}  (or /request-reset) — 5/min
    P->>S: requestCode(email, 'login'|'reset')
    S->>DB: Customer.findOne({email:/^e$/i, portalActive:true}).select(+portalCredentials)
    alt no match
        S-->>App: 200 {ok:true} (silent)
    else match
        S->>S: code = randomInt 6 digits, hash = bcrypt(code)
        S->>DB: save loginCode*/resetCode* (expires now+48h)
        S->>M: sendTemplatedEmail(portal_login_code | portal_password_reset, {customer_name, code})
        S-->>App: 200 {ok:true}
    end
    App->>P: POST /portal/verify-code {email, code} — 10/min
    P->>S: verifyCode → matchCode(login OR reset slot, unexpired)
    alt invalid
        S-->>App: 401 Invalid or expired code
    else ok
        S-->>App: 200 {ok:true}
    end
    App->>P: POST /portal/set-password {email, code, password(≥8)} — global 300/min
    P->>S: setPassword → matchCode again
    S->>DB: portalCredentials = {passwordHash}, portalLastLoginAt = now
    S-->>App: 200 {token} (portal JWT, 90d, typ:'portal')
    end
    rect rgb(245,245,255)
    Note over App,DB: Returning login
    App->>P: POST /portal/login {email, password} — 10/min
    P->>S: login → bcrypt.compare(passwordHash)
    S->>DB: portalLastLoginAt = now
    S-->>App: 200 {token}
    end
    App->>P: GET /portal/me  Authorization: Bearer <portal token>
    P->>P: PortalJwtGuard → PortalJwtStrategy.validate
    P->>DB: Customer.findById(sub).select(portalActive)
    alt !portalActive
        P-->>App: 401 Mobile app access has been disabled.
    else
        P-->>App: 200 profile
    end
```

---

### Endpoints

Auth column legend:

- **public**: `@Public()`, no token.
- **staff**: any valid, unlocked staff JWT.
- **staff: `<perm>`**: a staff JWT plus that permission (break-glass and role-less staff always pass).
- **customer**: a portal JWT via `PortalJwtGuard`.

#### `AppController` (`src/app.controller.ts`)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | public | Liveness. Returns `{ status: 'ok' }`. Used by the Docker `HEALTHCHECK`. |

#### `AuthController` (`src/auth/auth.controller.ts`, prefix `/auth`)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/login` | public (10/min) | Staff login → `{ accessToken, staff }` |
| POST | `/auth/register` | staff: `staff.manage` | Create a staff account (`name, username, email, password≥8, isBreakGlass?, role?`) |
| GET | `/auth/me` | staff | The current staff profile with populated role and permissions (used to restore a session on refresh) |
| GET | `/auth/staff` | staff: `staff.manage` | List all staff sorted by name |
| PATCH | `/auth/staff/:id` | staff: `staff.manage` | Partial update of `name, username, email, isBreakGlass, locked, role` (`null` unassigns) |
| DELETE | `/auth/staff/:id` | staff: `staff.manage` | Delete a staff account (refused if it's the last one) |
| POST | `/auth/staff/:id/password` | staff: `staff.manage` | Set a new password (`MinLength(8)`) |

#### `RolesController` (`src/roles/roles.controller.ts`, prefix `/roles`, class-level `staff.manage`)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/roles` | staff: `staff.manage` | Create a role `{ name, permissions[] }`. Returns `{ id, name, permissions }`. |
| GET | `/roles` | staff: `staff.manage` | List roles sorted by name |
| PATCH | `/roles/:id` | staff: `staff.manage` | Replace name and permissions (full `CreateRoleDto`) |
| DELETE | `/roles/:id` | staff: `staff.manage` | Delete. 409 if any `Staff.role` still references the role. |

#### `CustomersController` (`src/customers/customers.controller.ts`, prefix `/customers`)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/customers` | public | Create a full customer (intake form or the admin's "New customer"). Validates the emergency contact, requires a signed vet authorisation, returns 409 on a case-insensitive duplicate email, encrypts alarm instructions, stamps the agreement with `termsVersion`/`termsDocumentDate`, sets `status = active`, and audits `customer_created` (actor via `actorFromRequest`). |
| POST | `/customers/leads` | staff | Create a minimal `pending` lead `{ firstName, surname?, email, sendEmail? }`. Unless `sendEmail === false`, fires the `registration` email with `link = ${PUBLIC_INTAKE_URL}/intake/<id>` (best-effort). |
| GET | `/customers` | staff | List all customers, newest first, excluding `security.alarmInstructionsEncrypted`, `agreement.signatureImage` and `emergencyVet.authorisation.signatureImage` |
| GET | `/customers/:id` | public | Get one customer, excluding only `security.alarmInstructionsEncrypted` (`portalCredentials` is hidden by `select:false`). Used by the intake prefill. |
| GET | `/customers/:id/alarm-instructions` | staff: `customers.viewSecurity` | Decrypt and return `{ instructions }` |
| PATCH | `/customers/:id` | public | Partial update (`PartialType(CreateCustomerDto)`). Recomputes `name`/`address`. Carries the vet authorisation forward if it isn't resent. Field-level `security.*` `$set`. A signed `agreement.signedName` sets status `active` and re-stamps terms. Audits a field diff. |
| PATCH | `/customers/:id/status` | staff | Set `status` (`pending`/`active`/`inactive`/`update_info`). `pending→active` fires the `customerActivated` staff notification. Entering `update_info` **clears** `agreement`, the vet-authorisation signature fields and every pet's `offLeadConsent.signature`, and audits "Update requested". |
| POST | `/customers/:id/form-snapshot` | staff | Attach a PDF snapshot to an existing audit entry (`entryId`), or create a `registration_email_sent` entry |
| POST | `/customers/:id/completion-snapshot` | public | Same service method, called by the intake wizard after it submits |
| POST | `/customers/:id/send-registration-copy` | public (5/min) | Email the customer's on-file address a client-supplied PDF using the `post_registration` template, then audit it |
| DELETE | `/customers/:id?force=true` | staff: `customers.manage` | Delete. Without `force`, returns 409 if any pets, bookings, invoices, quotes or CRM activity exist. With `force=true`, cascades: boarding bookings → (payments, credit notes, invoice) per invoice → quotes → bookings → animals → CRM activities. |

#### `AnimalsController` (`src/animals/animals.controller.ts`, prefix `/animals`)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/animals` | public | Create a pet (`CreateAnimalDto` includes `customer`). Dogs need `offLeadConsent`, which gets stamped with `acknowledgedAt`/`date`. Species-specific field rules apply. Audits `animal_created`. |
| GET | `/animals?customer=` | staff | Without `customer`, a light projection (`name species customer`) of every animal. With it, full documents with `linkedAnimal` populated. |
| GET | `/animals/for-customer/:customerId` | public | Full pets for one customer (intake review) |
| GET | `/animals/:id` | staff | One pet, `linkedAnimal` populated |
| PATCH | `/animals/:id` | staff | Staff edit. Audits a field diff and photo changes, and mirrors the change onto `linkedAnimal` (minus `customer`). |
| PATCH | `/animals/:id/for-customer/:customerId` | public | Customer-scoped edit (`PublicUpdateAnimalDto` has no `customer`). Ownership is checked against the stored `customer` (otherwise 404). |
| POST | `/animals/:id/copy` | staff: `customers.manage` | Copy the pet to `{ customerId }` and link both docs bidirectionally (400 if the pet is already linked or the target is the same customer) |
| POST | `/animals/:id/move` | staff: `customers.manage` | Reassign the owner (same doc id; keeps any existing link) |
| POST | `/animals/:id/unlink` | staff: `customers.manage` | Break the copy link on both sides |
| DELETE | `/animals/:id` | staff: `customers.manage` | Delete (409 if referenced by `Booking.animals`). Clears the counterpart's `linkedAnimal`. Audits `animal_removed`. |

#### `VetPracticesController` (`src/vet-practices/vet-practices.controller.ts`, prefix `/vet-practices`)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/vet-practices` | staff: `settings.manage` | Create a library entry |
| GET | `/vet-practices` | public | List, sorted by `practiceName` (intake-form dropdown) |
| PATCH | `/vet-practices/:id` | staff: `settings.manage` | Update (full `CreateVetPracticeDto`) |
| DELETE | `/vet-practices/:id` | staff: `settings.manage` | Delete |

#### `PortalController` (`src/portal/portal.controller.ts`, prefix `/portal`, class-level `@Public()`)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/portal/request-code` | public (5/min) | Email a first-time login code. Always `{ ok: true }`. |
| POST | `/portal/request-reset` | public (5/min) | Email a password-reset code. Always `{ ok: true }`. |
| POST | `/portal/verify-code` | public (10/min) | Check `{ email, code }`. 200 or 401. |
| POST | `/portal/set-password` | public (global 300/min) | Consume the code, set the password, return `{ token }` |
| POST | `/portal/login` | public (10/min) | Email and password → `{ token }` |
| POST | `/portal/web/request-code` | public (5/min) | Web portal sign-in step 1: email a 6-digit code (10-minute expiry, own slot so it never touches the app's codes). Always `{ ok: true }`. |
| POST | `/portal/web/verify-code` | public (10/min) | Step 2: `{ email, code }` → `{ stepToken }`. 5 wrong codes discards the code. 400 if no mobile number is on file. |
| POST | `/portal/web/verify-phone` | public (10/min) | Step 3: `{ email, stepToken, digits }` (last 3 digits of `phoneNumber`) → `{ token }` (portal JWT, 12h). 3 wrong tries discards the step. |
| GET | `/portal/quotes/:id/pdf` | customer | Ownership check, then inline PDF (`quote-<id>.pdf`) |
| GET | `/portal/me` | customer | Curated profile: contact details, emergency contact and vet, `security { keysProvided, furtherInformation, hasAlarmInstructions }`, the agreement (including `signatureImage`), current `terms { html, version, documentDate }` and `offLeadConsentText` |
| PATCH | `/portal/me` | customer | Update `UpdateMeDto` (contact fields, `emergencyContact`, `emergencyVet` without authorisation, `security`; **email can't be changed**) through `CustomersService.update(actor 'Customer (portal)')`. Then dispatches the staff notification `customerUpdated`. |
| GET | `/portal/invoices` | customer | `InvoicesService.findAll(customerId)` (all statuses) |
| GET | `/portal/invoices/:id/pdf` | customer | Ownership check, then inline PDF (`invoice-<id>.pdf`) |
| POST | `/portal/invoices/:id/send` | customer | Ownership check, then `InvoicesService.sendEmail(id, 'Customer (portal)')` |
| GET | `/portal/quotes` | customer | `QuotesService.findAll(customerId)` |
| POST | `/portal/quotes/:id/accept` | customer | Ownership check, then `acceptAndConvert`. Dispatches staff notification `quoteAccepted`. |
| POST | `/portal/quotes/:id/decline` | customer | Ownership check, then `reject`. Dispatches staff notification `quoteDeclined`. |
| GET | `/portal/bookings` | customer | `DayBooking.find({ customer })`, sorted `date desc`, with `animal`, `additionalAnimals` and `product` names populated |
| GET | `/portal/animals` | customer | The customer's pets |
| POST | `/portal/animals` | customer | Create a pet (`PortalCreateAnimalDto` = CreateAnimalDto minus `customer`; the customer id is forced) |
| PATCH | `/portal/animals/:id` | customer | `updateForCustomer` (ownership enforced) |
| POST | `/portal/push/register` | customer | Register an APNs token `{ token, platform? }` tagged `customer` |
| GET | `/portal/messages` | customer | Open the customer's message thread (`MessagesService.openThreadAsCustomer`) |
| GET | `/portal/messages/unread-count` | customer | `{ count }` |
| POST | `/portal/messages` | customer | Send `{ body ≤5000 }`. Staff are notified (`message`). |
| DELETE | `/portal/messages/:id` | customer | Delete the customer's own message |
| GET | `/portal/notifications` | customer | Latest 50 `CustomerNotification`s |
| GET | `/portal/notifications/unread-count` | customer | `{ count }` |
| POST | `/portal/notifications/read` | customer | Mark all read |
| POST | `/portal/push-messages/:id/acknowledge` | customer | Set `acknowledgedAt` on this customer's recipient row (no-op if the customer isn't a recipient or has already acknowledged) |

#### `PortalAdminController` (`src/portal/portal-admin.controller.ts`, prefix `/customers/:id/portal`)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/customers/:id/portal/status` | staff | `{ portalActive, setUp (has passwordHash), lastLoginAt, deviceCount, lastDeviceAt }` |
| PATCH | `/customers/:id/portal` | staff | `{ active }`: toggle access. Disabling drops the customer's device tokens. First enable sends the `portal_enabled` email. |
| POST | `/customers/:id/portal/reset` | staff | Email a reset code |
| POST | `/customers/:id/portal/test-push` | staff | Record a bell item (type `test`), push it, and return `{ sent, total, failures, customerPushConfigured }` |

#### `PushController` (`src/push/push.controller.ts`, prefix `/push`)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/push/register` | staff | Register a staff-app APNs token `{ token, platform? }` (`staff = user.id`, `customer = null`) |
| GET | `/push/status` | staff | `{ configured, tokenCount, keyParsed, keyRawLength, keyId, teamId, bundleId, customerBundleId, production }` |
| POST | `/push/test` | staff | `sendToAll('Test notification', 'Push is working 🎉', { type: 'test' })` (not stored in the feed) |
| DELETE | `/push/register/:token` | staff | Delete a token (any token) |

#### `PushMessagesController` (`src/push-messages/push-messages.controller.ts`, prefix `/push-messages`)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/push-messages` | staff | History, newest first, with recipient customers' `name email` and `sentBy.name` populated |
| POST | `/push-messages` | staff | Broadcast `{ title, body, customerIds[], acknowledgementRequired? }`. Sends to each customer in turn and records `received` or `not_received` (`No device registered` / an APNs reason). |
| DELETE | `/push-messages/:id` | staff | Remove the history record (doesn't unsend the push) |

#### `NotificationFeedController` (`src/notifications/notification-feed.controller.ts`, prefix `/notifications`)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/notifications` | staff | Latest 50 `NotificationItem`s |
| GET | `/notifications/unread-count` | staff | `{ count }` |
| POST | `/notifications/mark-read` | staff | Mark all read (global, not per-staff) |
| DELETE | `/notifications` | staff | Delete **all** items (global) |

#### `NotificationSettingsController` (`src/notifications/notification-settings.controller.ts`, prefix `/settings/notifications`)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/settings/notifications` | staff | The singleton, created with defaults on first access |
| PATCH | `/settings/notifications` | staff: `settings.manage` | Update the toggles, `appointmentLeadMinutes ≥1` and `dailyDigestTime` (`HH:mm`) |

#### `SettingsController` (`src/settings/settings.controller.ts`, prefix `/settings`)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/settings/business` | staff | Full business-info projection with defaults (see the BusinessInfo model) |
| GET | `/settings/business/public` | public | **The same full projection** as above (used by the public invoice and quote pages) |
| PATCH | `/settings/business` | staff: `settings.manage` | Partial update. Uploading `termsFile` parses the .docx to HTML with mammoth and stores the raw .docx. An empty `termsFile` clears all terms fields. `bookingRefTemplate` must contain `{seq}`. Upserts the singleton. |
| GET | `/settings/my-ip` | staff | `{ ip }` via `getClientIp` (for the "add my current IP" button) |
| GET | `/settings/business/logo` | public | Decodes the `logoImage` data URI and serves the bytes (`Cache-Control: public, max-age=3600`). Referenced by `{{logo}}` in emails. |
| POST | `/settings/terms/preview` | staff: `settings.manage` | `{ termsFile }` → `{ html }` (mammoth) without saving |
| GET | `/settings/terms` | public | `{ html }`, the parsed terms |
| GET | `/settings/vet-authorisation` | public | `{ text }` (falls back to the default) |
| GET | `/settings/off-lead-consent` | public | `{ text }` (default contains `{{petName}}`) |
| GET | `/settings/declaration` | public | `{ text }` |
| GET | `/settings/terms/download` | staff | The original .docx as an attachment (400 if only legacy HTML exists, 404 if nothing was uploaded) |
| GET | `/settings/visits` | staff | VisitMapping product ids (or `null`) |
| PATCH | `/settings/visits` | staff: `settings.manage` | Partial update of the VisitMapping |
| GET | `/settings/boarding` | staff | BoardingWorkflowSettings with defaults |
| PATCH | `/settings/boarding` | staff: `settings.manage` | Partial update |
| GET | `/settings/email` | staff | `{ tenantId, clientId, fromAddress, fromName, clientSecretConfigured }` (the secret is never returned) |
| PATCH | `/settings/email` | staff: `settings.manage` | Update the Graph config. `clientSecret` is encrypted, and only replaced when non-empty. |
| POST | `/settings/email/test` | staff: `settings.manage` | Send a fixed test email to `{ to }` |
| POST | `/settings/email/send` | staff | Generic triggered send `{ trigger, to, name, link, customerId?, formName? }` (see Settings and email templates) |
| GET | `/settings/email-templates` | staff | All stored templates |
| PUT | `/settings/email-templates/:trigger` | staff: `settings.manage` | Upsert the template for `trigger` (`ParseEnumPipe(EmailTrigger)`), `{ label?, name, subject, body }` |
| DELETE | `/settings/email-templates/:trigger` | staff: `settings.manage` | Delete (404 if none exists) |

#### `AuditLogController` (`src/audit-log/audit-log.controller.ts`, prefix `/audit-log`)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/audit-log?customer=&invoice=` | staff | Entries for an invoice (takes precedence) or a customer, newest first. 400 if neither is given. |
| GET | `/audit-log/:id/pixel.gif` | public | Tracking pixel. `markOpened(id)` (first open only) creates an `email_read` entry titled with `readTitle`. Always serves the GIF with `no-store`. |
| GET | `/audit-log/income?customer=&months=` | staff | Per-month net of `payment_received − payment_removed` amounts for the last `months` (default 6) |
| GET | `/audit-log/registration-snapshots` | `settings.manage` | Every `registration_email_sent` entry with a stored PDF: `customer`, `title`, `createdAt`, `attachmentName`, `regeneratedAt` only (no PDF data). Used by Settings > Forms "Regenerate registration PDFs". |
| DELETE | `/audit-log/registration-snapshots/orphaned` | `settings.manage` | Deletes `registration_email_sent` entries whose customer no longer exists; returns `{ deleted }`. |
| PATCH | `/audit-log/:id/attachment` | `settings.manage` | `{ attachmentData, attachmentName }` replaces a registration snapshot's PDF, stamps `regeneratedAt` and, the first time only, keeps the previous PDF in `originalAttachmentData`/`originalAttachmentName`. 404 for any other entry type. |

---

### Data model

All schemas below use `@Schema({ timestamps: true })` (`createdAt`/`updatedAt`) unless marked as a sub-document (`_id: false`).

#### `Staff` (`src/staff/schemas/staff.schema.ts`), collection `staffs`

| Field | Type | Constraints / default | Notes |
|---|---|---|---|
| `name` | String | required | |
| `email` | String | required, **unique**, lowercase | Contact address |
| `username` | String | required, **unique, sparse**, lowercase | The login identifier. Backfilled from `email` on boot. |
| `passwordHash` | String | required | bcrypt |
| `isBreakGlass` | Boolean | default `false` | Bypasses the trusted-IP check and every permission check |
| `role` | ObjectId → `Role` | optional | Unset means full access |
| `locked` | Boolean | default `false` | Blocks login and every authenticated request |

#### `Role` (`src/roles/schemas/role.schema.ts`), collection `roles`

| Field | Type | Constraints / default |
|---|---|---|
| `name` | String | required, **unique** |
| `permissions` | [String] | default `[]` |

#### `Customer` (`src/customers/schemas/customer.schema.ts`), collection `customers`

Enum `CustomerStatus`: `pending` | `active` | `inactive` | `update_info`.

| Field | Type | Constraints / default | Notes |
|---|---|---|---|
| `firstName`, `surname` | String | optional | Source of truth for `name` |
| `name` | String | **required** | Computed `firstName + ' ' + surname` |
| `address1`, `address2`, `town`, `county`, `postcode` | String | optional | |
| `address` | String | optional | Computed, newline-joined |
| `phoneNumber` | String | optional | |
| `email` | String | **required** | Not unique at DB level. Uniqueness is checked case-insensitively in the service. |
| `emergencyContact` | EmergencyContact | optional | See below |
| `emergencyVet` | EmergencyVet | optional | See below |
| `security` | SecurityArrangements | default `{}` | |
| `agreement` | Agreement | default `{}` | |
| `status` | String enum `CustomerStatus` | default `pending` | |
| `defaultProduct` | ObjectId → `Product` | optional | |
| `travelChargeable` | Boolean | default `false` | |
| `travelProduct` | ObjectId → `Product` | optional | |
| `regularDays` | [String] | default `[]` | DTO restricts values to `monday`…`sunday` |
| `portalActive` | Boolean | default `false` | |
| `portalLastLoginAt` | Date | optional | |
| `portalCredentials` | PortalCredentials | **`select: false`** | |

Sub-documents (`_id: false`):

| Sub-doc | Fields |
|---|---|
| `EmergencyContact` | `sameAsClient: Boolean (default false)`, `firstName`, `surname`, `name` (computed), `address1`, `address2`, `town`, `county`, `postcode`, `address` (computed), `phoneNumber`, `email` |
| `EmergencyVet` | `practiceName (required)`, `address1`, `address2`, `town`, `county`, `postcode`, `address` (computed), `telephone (required)`, `email`, `authorisation: EmergencyVetAuthorisation`, `alternativeVetAuthorised: Boolean` (computed `!!authorisation.signedName`) |
| `EmergencyVetAuthorisation` | `signedName`, `signatureImage` (base64), `signedAt: Date` |
| `SecurityArrangements` | `keysProvided: Boolean (default false)`, `alarmInstructionsEncrypted` (AES-GCM `iv:tag:data`), `furtherInformation` |
| `Agreement` | `signedName`, `signatureImage`, `signedAt: Date`, `date: Date`, `termsVersion`, `termsDocumentDate` (copied from BusinessInfo at signing) |
| `PortalCredentials` | `passwordHash`, `loginCodeHash`, `loginCodeExpiresAt: Date`, `resetCodeHash`, `resetCodeExpiresAt: Date` |

Indexes: none declared beyond `_id`.

#### `Animal` (`src/animals/schemas/animal.schema.ts`), collection `animals`

Enums:

- `Species`: `dog` | `cat` | `other`
- `Sex`: `male` | `female`
- `TriState`: `yes` | `no` | `unsure`
- `LeadMode`: `on_lead` | `off_lead`
- `NeuteredStatus`: `neutered` | `spayed` | `no`

| Field | Type | Constraints / default | Notes |
|---|---|---|---|
| `customer` | ObjectId → `Customer` | required, **indexed** | |
| `linkedAnimal` | ObjectId → `Animal` | optional | Bidirectional copy link. Edits are mirrored onto the linked copy. |
| `species` | enum `Species` | required | |
| `breed`, `name` | String | required | |
| `sex` | enum `Sex` | required | |
| `age` | Number | required, `min: 0` | DTO: `IsInt` |
| `dateOfBirth` | Date | optional | |
| `vaccinated` | Boolean | required | |
| `vaccineExpiryDate` | Date | optional (schema) | The DTO marks it `@IsNotEmpty @IsDateString`. |
| `vaccineRecordPhoto` | String (data URI) | optional | |
| `photos` | [String] (data URIs) | optional | DTO `ArrayMaxSize(2)` |
| `colourMarkings`, `microchipNumber`, `insurer` | String | optional | |
| `insured` | Boolean | optional | |
| `neuteredStatus` | enum `NeuteredStatus` | optional | |
| `lastSeasonEndDate` | Date | optional | |
| `temperamentNotes` | String | optional | |
| `aggressionToPeople` | Boolean | required | |
| `aggressionToPeopleDetails` | String | optional | |
| `aggressionToOtherAnimals` | Boolean | optional | Rejected for cats |
| `aggressionToOtherAnimalsDetails` | String | optional | |
| `travelsWellInCar` | enum `TriState` | optional | Rejected for cats |
| `travelsWellInCarDetails` | String | optional | |
| `chasesLivestock` | enum `TriState` | optional | Dogs only |
| `chasesLivestockDetails` | String | optional | |
| `allergies` | `{ status: TriState (required), details? }` | required | |
| `medication` | `{ onMedication: Boolean (required), medications: [MedicationEntry] (default []), details? (legacy, read-only) }` | required | |
| `offLeadConsent` | `{ mode: LeadMode (required), signature?, acknowledgedAt?: Date, date?: Date }` | optional | Required on create for dogs, rejected for non-dogs |

`MedicationEntry`: `name (required)`, `illnessTreating`, `dosage`, `frequency`, `vetPrescribed: Boolean (required)`, `administeredByPawfectPets: Boolean (required)`, `additionalInfo`.

#### `VetPractice` (`src/vet-practices/schemas/vet-practice.schema.ts`)

`practiceName`, `address1`, `town`, `postcode` and `telephone` are required strings. `address2`, `county` and `email` are optional. No indexes.

#### `PushToken` (`src/push/schemas/push-token.schema.ts`)

| Field | Type | Constraints / default |
|---|---|---|
| `token` | String | required, **unique** |
| `platform` | String | default `'ios'` |
| `staff` | String (staff id) | optional (`null` for customer tokens) |
| `customer` | String (customer id; **not** an ObjectId) | optional, **indexed** (`null` for staff tokens) |

#### `PushMessage` (`src/push-messages/schemas/push-message.schema.ts`)

| Field | Type | Constraints / default |
|---|---|---|
| `title`, `body` | String | required |
| `recipients` | [PushMessageRecipient] | required |
| `acknowledgementRequired` | Boolean | default `false` |
| `sentBy` | ObjectId → `Staff` | optional |

`PushMessageRecipient` (`_id: false`): `customer: ObjectId → Customer (required)`, `status: 'received' | 'not_received' (required)`, `reason?: String`, `acknowledgedAt?: Date`.

#### `NotificationItem` (`src/notifications/schemas/notification-item.schema.ts`)

`title (required)`, `body (required)`, `type?: String`, `read: Boolean (default false, **indexed**)`.

#### `NotificationSettings` (`src/notifications/schemas/notification-settings.schema.ts`), singleton

| Field | Type | Default |
|---|---|---|
| `customerActivated` | Boolean | `true` |
| `appointmentReminders` | Boolean | `true` |
| `appointmentLeadMinutes` | Number (`min: 1`) | `60` |
| `dailyDigest` | Boolean | `false` |
| `dailyDigestTime` | String `HH:mm` | `'07:30'` |
| `invoicesOverdue` | Boolean | `true` |
| `invoicesRead` | Boolean | `true` |
| `lastDigestSentOn` | String `YYYY-MM-DD` | (unset) |

#### `CustomerNotification` (`src/customer-notifications/schemas/customer-notification.schema.ts`)

`customer: ObjectId → Customer (required, **indexed**)`, `title (required)`, `body (required)`, `type?`, `reference?` (for example an invoice or quote number), `read: Boolean (default false)`.

#### `BusinessInfo` (`src/settings/schemas/business-info.schema.ts`), singleton

| Field | Type | Default (schema / `getBusinessInfo()` fallback) |
|---|---|---|
| `name`, `address`, `town`, `postcode`, `telephone`, `email`, `website` | String | `''` |
| `logoImage` | String (data URI) | `''` |
| `termsHtml` | String | `''` (mammoth output) |
| `termsDocx` | String (data URI) | not returned by `getBusinessInfo()` |
| `termsFileName`, `termsVersion`, `termsDocumentDate` | String | `''` |
| `emergencyVetAuthorisationText` | String | "I authorise PawfectPets Sherborne to arrange alternative veterinary care…" |
| `offLeadConsentText` | String | "I consent to {{petName}} being exercised off the lead, and understand this is at my own risk." |
| `declarationText` | String | "I confirm that the information provided in this form is accurate…" |
| `depositPercentage` | Number | `20` (DTO 0–100) |
| `bankName`, `sortCode`, `accountNumber` | String | `''` |
| `invoiceNotesMessage`, `quoteNotesMessage` | String | `'Thanks for your business.'` |
| `invoiceNumberTemplate` / `invoiceNextNumber` | String / Number | `'INV-{year}-{seq}'` / `1` |
| `quoteNumberTemplate` / `quoteNextNumber` | String / Number | `'QUO-{year}-{seq}'` / `1` |
| `paymentNumberTemplate` / `paymentNextNumber` | String / Number | `'PAY-{year}-{seq}'` / `1` |
| `creditNoteNumberTemplate` / `creditNoteNextNumber` | String / Number | `'CN-{year}-{seq}'` / `1` |
| `bookingRefTemplate` / `bookingRefNextNumber` | String / Number | `'BK-{year}-{seq}'` / `1` |
| `bookingTerms`, `bookingInformation` | String (HTML) | `''` |
| `riskAssessmentNextNumber`, `policyNextNumber`, `expenseNextNumber` | Number | `1` (not in the `getBusinessInfo()` projection) |
| `invoicePdfTemplate` | [Mixed] | `[]` |
| `trustedIps` | [String] | `[]` (empty = unrestricted) |
| `qrCodeUrl` | String | `''` |

Templates in the DTO (`invoice`, `quote`, `payment`, `creditNote`, `bookingRef`) must match `/\{seq\}/` when non-empty. `*NextNumber` must be an `IsInt` with `Min(1)`.

#### `EmailSettings` (`src/settings/schemas/email-settings.schema.ts`), singleton

`tenantId`, `clientId`, `clientSecretEncrypted` (AES-GCM), `fromAddress`, `fromName`. All optional.

#### `EmailTemplate` (`src/settings/schemas/email-template.schema.ts`)

`trigger: enum EmailTrigger (required, **unique**)`, `label?`, `name (required)`, `subject (required)`, `body (required, HTML)`.

#### `VisitMapping` (`src/settings/schemas/visit-mapping.schema.ts`), singleton

Each of these is an ObjectId → `Product`, all optional:

- `oneVisitWeekdayProduct`, `oneVisitWeekendProduct`, `oneVisitBankHolidayProduct`
- `twoVisitWeekdayProduct`, `twoVisitWeekendProduct`, `twoVisitBankHolidayProduct`
- The same six for 30 and 40 minute visits, with a `30Min`/`40Min` infix: `oneVisit30MinWeekdayProduct` … `twoVisit40MinBankHolidayProduct`. The un-suffixed slots above are the 20 minute visits.
- `dayCareHalfDayProduct`, `dayCareFullDayProduct`
- `dayCareSecondDogHalfDayProduct`, `dayCareSecondDogFullDayProduct`
- `boardingPerDayProduct`, `boardingSecondDogPerDayProduct`
- `boardingHalfDayProduct`, `boardingSecondDogHalfDayProduct`

#### `BoardingWorkflowSettings` (`src/settings/schemas/boarding-workflow-settings.schema.ts`), singleton

| Field | Type | Default |
|---|---|---|
| `preCheckInDaysBefore` | Number | `2` |
| `preCheckInFormBoarding`, `preCheckInFormDayCare`, `checkInFormBoarding`, `checkInFormDayCare`, `checkOutFormBoarding`, `checkOutFormDayCare` | ObjectId → `Form` | unset |
| `checkInRequirePhoto`, `checkInRequireSignature`, `checkOutRequireSignature` | Boolean | `true` |

#### `AuditLogEntry` (`src/audit-log/schemas/audit-log-entry.schema.ts`)

The `AuditEventType` enum has these values:

- **Customer**: `customer_created`, `customer_updated`
- **Invoice**: `invoice_created`, `invoice_updated`, `invoice_emailed`, `invoice_removed`, `invoice_read`
- **Quote**: `quote_created`, `quote_updated`, `quote_emailed`, `quote_removed`, `quote_read`
- **Payment**: `payment_received`, `payment_removed`, `deposit_requested`
- **Animal**: `animal_created`, `animal_updated`, `animal_removed`
- **Booking**: `booking_created`, `booking_updated`, `booking_removed`
- **Credit note**: `credit_note_issued`, `credit_note_removed`
- **Forms and email**: `form_submitted`, `registration_email_sent`, `email_read`

| Field | Type | Constraints / default |
|---|---|---|
| `customer` | ObjectId → `Customer` | required, **indexed** |
| `invoice` | ObjectId → `Invoice` | optional, **indexed** |
| `type` | enum `AuditEventType` | required |
| `title` | String | required |
| `description` | String | optional |
| `amount` | Number | optional (payment events) |
| `actor` | String | required, default `'System'` |
| `attachmentData` / `attachmentName` | String (data URI) / String | optional |
| `originalAttachmentData` / `originalAttachmentName` | String (data URI) / String | `select: false`; the PDF as first stored, kept when a regeneration replaces it |
| `regeneratedAt` | Date | set when the PDF was rebuilt in the current style |
| `openedAt` | Date | set by the pixel |
| `readTitle` | String | title for the auto "read" entry |

`AuditLogService.record()` swallows every error and returns `undefined` on failure.

#### Relationships

```mermaid
erDiagram
    ROLE ||--o{ STAFF : "Staff.role (optional)"
    STAFF ||--o{ PUSH_MESSAGE : "sentBy"
    STAFF ||--o{ PUSH_TOKEN : "staff (string id)"
    CUSTOMER ||--o{ ANIMAL : "Animal.customer"
    ANIMAL |o--o| ANIMAL : "linkedAnimal (bidirectional copy)"
    CUSTOMER ||--o{ PUSH_TOKEN : "customer (string id)"
    CUSTOMER ||--o{ CUSTOMER_NOTIFICATION : "customer"
    CUSTOMER ||--o{ AUDIT_LOG_ENTRY : "customer"
    INVOICE ||--o{ AUDIT_LOG_ENTRY : "invoice (optional)"
    PUSH_MESSAGE ||--|{ PUSH_MESSAGE_RECIPIENT : "recipients[] (embedded)"
    CUSTOMER ||--o{ PUSH_MESSAGE_RECIPIENT : "customer"
    PRODUCT ||--o{ CUSTOMER : "defaultProduct / travelProduct"
    PRODUCT ||--o{ VISIT_MAPPING : "14 product refs"
    FORM ||--o{ BOARDING_WORKFLOW_SETTINGS : "6 form refs"
    CUSTOMER ||--|| PORTAL_CREDENTIALS : "embedded, select:false"
    CUSTOMER ||--o| EMERGENCY_VET : "embedded"
    CUSTOMER ||--o| EMERGENCY_CONTACT : "embedded"
    EMAIL_TEMPLATE }o--|| BUSINESS_INFO : "placeholders read from (no FK)"
    VET_PRACTICE }o..o{ CUSTOMER : "copied into emergencyVet at selection (no FK)"
    STAFF {
        string name
        string email UK
        string username UK
        string passwordHash
        bool isBreakGlass
        ObjectId role FK
        bool locked
    }
    ROLE {
        string name UK
        string_array permissions
    }
    CUSTOMER {
        string name
        string email
        enum status
        bool portalActive
        date portalLastLoginAt
    }
    ANIMAL {
        ObjectId customer FK
        ObjectId linkedAnimal FK
        enum species
        string name
    }
    PUSH_TOKEN {
        string token UK
        string platform
        string staff
        string customer
    }
    PUSH_MESSAGE {
        string title
        string body
        bool acknowledgementRequired
        ObjectId sentBy FK
    }
    CUSTOMER_NOTIFICATION {
        ObjectId customer FK
        string title
        string type
        bool read
    }
    AUDIT_LOG_ENTRY {
        ObjectId customer FK
        ObjectId invoice FK
        enum type
        string actor
        date openedAt
    }
    EMAIL_TEMPLATE {
        enum trigger UK
        string subject
        string body
    }
    NOTIFICATION_ITEM {
        string title
        string type
        bool read
    }
```

`NotificationItem`, `NotificationSettings`, `EmailSettings`, `BusinessInfo`, `VisitMapping` and `BoardingWorkflowSettings` have no foreign keys except those shown. `NotificationItem` is global, not per staff member.

---

### Scheduled jobs

Only one in-scope service has an `@Cron`.

| Job | File | Schedule | What it does |
|---|---|---|---|
| `NotificationService.dailyDigest` | `src/notifications/notification.service.ts` | `CronExpression.EVERY_5_MINUTES` | 1. Return early if `!settings.dailyDigest` or APNs isn't configured.<br>2. Build `todayKey` from **server-local** time and skip if it equals `lastDigestSentOn`.<br>3. Skip if the current local `HH:mm` is earlier than `dailyDigestTime` (default `07:30`).<br>4. Group today's `DayBooking`s by `VisitMapping` product slot: visits (a two-visit product counts as 2), day care and boarding. Rows on any other product (travel, extras) are skipped. Name each group's distinct pets (`animal` + `additionalAnimals`) by species. Count today's `Appointment`s.<br>5. `dispatch("Today's schedule", "1 visit (3 cats), boarding for 2 dogs and 0 appointments today.", 'dailyDigest')` (or "no bookings and …" when there are none), then `markDigestSent(todayKey)`. |

Crons outside this scope that dispatch through `NotificationService`:

| Cron | Schedule | Type dispatched |
|---|---|---|
| `AppointmentsService.sendDueReminders` | every 5 min | `appointment` (uses `appointmentReminders` and `appointmentLeadMinutes`) |
| `InvoicesService.markOverdue` | hourly, and also on every `findAll` | `invoicesOverdue` (staff) and `invoiceOverdue` (customer) |
| `PoliciesService.notifyDueReviews` | hourly | `policyReviewDue` |
| `RiskAssessmentsService.notifyDueReviews` | hourly | `riskAssessmentReviewDue` |
| Training modules service cron | hourly | `trainingReviewDue` |
| `BoardingBookingsService` hourly look-ahead | hourly | Sends the pre-check-in `form` email |

Docker Compose sets `TZ: Europe/London` for the backend so these local-time comparisons match UK time. The Dockerfile itself sets no `TZ`.

---

### Push notifications (APNs)

`src/push/apns.service.ts` is a dependency-free APNs client:

- **Provider JWT**: ES256, header `{ alg: 'ES256', kid: APNS_KEY_ID }`, payload `{ iss: APNS_TEAM_ID, iat }`, signed with `crypto.createSign('SHA256')` and `dsaEncoding: 'ieee-p1363'`. It's cached and re-minted every 50 minutes.
- **Key loading**: `APNS_KEY` is normalised from a PEM, a literal `\n`, single-line or space-separated text, or a base64 of the whole file. The base64 body is re-wrapped at 64 columns as `-----BEGIN PRIVATE KEY-----`.
- **Transport**:
  - `http2.connect(host)` **per send**, where host is `https://api.push.apple.com` if `APNS_PRODUCTION === 'true'` (it defaults to `'true'` when the var is unset), otherwise `https://api.sandbox.push.apple.com`.
  - `POST /3/device/<token>` with headers `apns-topic`, `apns-push-type: alert`, `authorization: bearer <jwt>`.
  - Payload: `{ aps: { alert: { title, body }, sound: 'default' }, ...data }`.
- **Result**: `{ ok: status===200, unregistered, status, reason }`. `unregistered` is true for status 410 or reason `BadDeviceToken`, `Unregistered` or `DeviceTokenNotForTopic`.
- **Audiences and topics**: staff uses `APNS_BUNDLE_ID`; customer uses `APNS_CUSTOMER_BUNDLE_ID`. The same key, Key ID and Team ID serve both.
  - `configured` = key, keyId, teamId and bundleId are all present.
  - `customerConfigured` = the same, with customerBundleId in place of bundleId.

`src/push/push.service.ts`:

- `registerToken(token, platform, {staff?|customer?})`: upserts by token and sets the *other* audience field to `null`.
- `sendToAll(title, body, data)`: sends to tokens where `customer: null` (staff devices only) under the staff topic.
- `sendToCustomer(customerId, …)`: sends to that customer's tokens under the customer topic. It's a no-op unless `customerConfigured`.
- `deliver(...)`: sends to each token one at a time, deletes tokens APNs reports as unregistered, and returns `{ sent, total, failures[] }`.
- `removeCustomerTokens(customerId)`: called when portal access is disabled.

```mermaid
sequenceDiagram
    participant Ev as Domain event (service)
    participant NS as NotificationService
    participant CNS as CustomerNotificationsService
    participant PS as PushService
    participant AP as ApnsService
    participant Apple as APNs
    Ev->>NS: dispatch(title, body, type)  [staff]
    NS->>NS: NotificationItem.create (admin bell)
    NS->>PS: sendToAll(title, body, {type})
    PS->>AP: send(token, ..., topic=APNS_BUNDLE_ID) for each staff token
    AP->>Apple: HTTP/2 POST /3/device/{token}
    Apple-->>AP: 200 | 410/BadDeviceToken
    AP-->>PS: result → prune unregistered tokens
    Ev->>CNS: record(customerId, title, body, type, reference)  [customer]
    CNS->>CNS: CustomerNotification.create (app bell)
    CNS->>PS: sendToCustomer(customerId, ..., {type, reference, notificationId, title, body})
    PS->>AP: send(..., topic=APNS_CUSTOMER_BUNDLE_ID)
```

Staff notification types (the `NotificationItem.type` values plus the push `data.type`):

| `type` | Title (body) | Fired from | Gated by NotificationSettings |
|---|---|---|---|
| `customerActivated` | "Customer activated" (`<name> is now Active`) | `CustomersService.updateStatus` (pending→active) | `customerActivated` |
| `invoicesOverdue` | "Invoice overdue" | `InvoicesService.markOverdue` | `invoicesOverdue` |
| `invoiceRead` | "Invoice read" (`<number> was opened`) | `InvoicesService` pixel `markOpened` | `invoicesRead` |
| `dailyDigest` | "Today's schedule" | `NotificationService.dailyDigest` cron | `dailyDigest` |
| `appointment` | "Appointment in <lead>" | `AppointmentsService.sendDueReminders` | `appointmentReminders` |
| `message` | "New message" (`<customer>: <preview 80 chars>`) | `MessagesService` (customer send) | — |
| `customerUpdated` | "Customer updated their details" | `PortalService.updateProfile` | — |
| `quoteAccepted` / `quoteDeclined` | "Quote accepted" / "Quote declined" | `PortalService.acceptQuote` / `declineQuote` | — |
| `trainingReviewDue` | "Training review due" | Training modules cron | — |
| `policySignOffReminder` | "Policy sign-off reminder" | `PoliciesService` | — |
| `policyReviewDue` | "Policy review due" | `PoliciesService` cron | — |
| `riskAssessmentReviewDue` | "Risk assessment review due" | `RiskAssessmentsService` cron | — |
| `test` | "Test notification" (push only, **not** stored) | `POST /push/test` | — |

Customer notification types (`CustomerNotification.type`, persisted and pushed via `CustomerNotificationsService.record`):

| `type` | Title | Fired from |
|---|---|---|
| `invoiceReceived` | "New invoice" | `InvoicesService` when an invoice becomes `sent` |
| `invoiceUpdated` | "Invoice updated" | Edit of an already-sent invoice |
| `invoicePaid` / `invoiceOverdue` / `invoiceCancelled` | "Invoice paid" / "Invoice overdue" / "Invoice cancelled" | `notifyCustomerInvoiceStatus` (status change of a sent invoice, `applyPayment`, `markOverdue`) |
| `quoteReceived` | "New quote" | `QuotesService.create` (any quote with a customer) |
| `quoteUpdated` | "Quote updated" | `QuotesController` PATCH |
| `message` | "New message" | `MessagesService.staffSend` |
| `test` | "Pawfect Pets" | `POST /customers/:id/portal/test-push` |
| `broadcast` | (staff-composed) | `PushMessagesService.send`. **Push only.** It's stored as a `PushMessage`, not a `CustomerNotification`. The payload is `{ type:'broadcast', pushMessageId, ackRequired, title, body }`. |

---

### Settings, email templates and placeholders

#### Sending pipeline (`src/settings/settings.service.ts`)

1. **`sendTemplatedEmail(trigger, to, vars, rawVars={}, appendHtml='', attachment?)`**
   - Loads `EmailTemplate` by trigger. If there isn't one → 400 `No email template is set up for this yet -- add one in Settings > Email Templates first.`
   - Merges the **business variables** with the caller's `vars`: `businessName`, `businessAddress`, `businessTown`, `businessPostcode`, `businessTelephone`, `businessEmail` and `businessWebsite`, all from `BusinessInfo`.
   - Raw (unescaped) variables: `logo` (`<img src="${PUBLIC_API_URL}/settings/business/logo" …>`, or `''` when no logo is set) plus the caller's `rawVars`.
   - Rendering:
     - Every trigger is treated as an HTML body (`htmlBody = true`), so the stored template HTML isn't escaped.
     - `{{#if key}}…{{/if}}` is evaluated against `vars` only, not `rawVars`.
     - `{{key}}` is replaced with `rawVars[key]` if present, otherwise `escapeHtml(vars[key] ?? '')`.
     - The subject uses the same substitution, unescaped.
   - Wraps the body in `<div style="max-width:600px;margin:0 auto;">…</div>`, then appends `appendHtml` (the tracking pixel).
   - Sends through **Microsoft Graph**:
     - Gets a client-credentials token from `login.microsoftonline.com/<tenant>/oauth2/v2.0/token` with scope `https://graph.microsoft.com/.default`.
     - Calls `POST /v1.0/users/<fromAddress>/sendMail` with `saveToSentItems: true` and an optional single PDF `fileAttachment` (the `data:` prefix is stripped).
     - Missing settings or a decrypt failure → descriptive 400.
2. **`sendTriggeredEmail(dto)`** (`POST /settings/email/send`, `CustomersService.createLead`, the boarding pre-check-in):
   - Rewrites `link`:
     - `add_pet` with `customerId` → `${PUBLIC_INTAKE_URL}/intake/<customerId>/add-pet`.
     - `form` → `${PUBLIC_INTAKE_URL}` + the pathname of the supplied link.
   - If `customerId` is given and the trigger has titles (`registration`, `update_info`, `add_pet`, `form`), it first creates a `registration_email_sent` audit entry (actor `'Staff'`) with `readTitle`, and embeds `${PUBLIC_API_URL}/audit-log/<entryId>/pixel.gif`.
     - Sent/read titles: "Registration email sent/read", "Update request email sent/read", "Add pet email sent/read", "Form email sent/read".
     - For `form`, the titles become "`<formName>` form email sent/read".
   - Calls `sendTemplatedEmail` with `{ name, link, form_name }` and returns `{ entryId }`.
3. **`sendDirectEmail(to, subject, html, attachment?)`**: no template, just the 600 px wrapper. Used by `ProductsService` (price list).
4. **`sendTestEmail({to})`**: fixed subject "PawfectPets Sherborne — test email" and fixed plain-text body.

#### Every `EmailTrigger`

The business placeholders `{{logo}}`, `{{businessName}}`, `{{businessAddress}}`, `{{businessTown}}`, `{{businessPostcode}}`, `{{businessTelephone}}`, `{{businessEmail}}` and `{{businessWebsite}}` are available on **every** trigger. The table lists only the trigger-specific ones that the backend actually passes.

| Trigger value | Admin label | Fired from (backend) | Trigger-specific placeholders actually supplied | Attachment / tracking |
|---|---|---|---|---|
| `registration` | New customer registration | `CustomersService.createLead` (auto unless `sendEmail:false`); `POST /settings/email/send` (admin `RegistrationLinkModal`) | `{{name}}`, `{{link}}` (`${PUBLIC_INTAKE_URL}/intake/<id>`), `{{form_name}}` (empty) | Pixel → "Registration email read" when `customerId` is given |
| `update_info` | Update info request | `POST /settings/email/send` (admin "Request Update") | `{{name}}`, `{{link}}` | Pixel → "Update request email read" |
| `add_pet` | Add a pet | `POST /settings/email/send` | `{{name}}`, `{{link}}` (rewritten to `/intake/<customerId>/add-pet`) | Pixel → "Add pet email read" |
| `invoice` | Invoice Template | `InvoicesService.sendEmail` (`POST /invoices/:id/send`, `POST /portal/invoices/:id/send`) | `{{customer_name}}`, `{{customer_address}}`, `{{customer_phone}}`, `{{subject}}`, `{{invoice_number}}`, `{{invoice_date}}`, `{{due_date}}`, `{{payment_terms}}`, `{{subtotal}}`, `{{total}}`, `{{invoice_link}}` (`${PUBLIC_INTAKE_URL}/invoices/<id>`), `{{bank_name}}`, `{{sort_code}}`, `{{account_number}}`; raw `{{items_table}}` | Pixel `/invoices/<id>/pixel.gif` |
| `quote` | Quote Template | `QuotesService.sendEmail` | `{{customer_name}}` (or the manual customer name), `{{customer_address}}`, `{{customer_phone}}`, `{{subject}}`, `{{quote_number}}`, `{{quote_date}}`, `{{valid_until}}`, `{{payment_terms}}`, `{{subtotal}}`, `{{total}}`, `{{quote_link}}` (`/quotes/<id>`), `{{bank_name}}`, `{{sort_code}}`, `{{account_number}}`; raw `{{items_table}}` | Pixel `/quotes/<id>/pixel.gif` |
| `payment_received` | Thank You for Payment | `PaymentsService.create` (best-effort, unless `skipThankYouEmail`), `sendReceivedEmail`, `sendReceipt` | `{{customer_name}}`, `{{customer_address}}`, `{{customer_phone}}`, `{{invoice_number}}`, `{{amount}}`, `{{payment_date}}`, `{{due_date}}`, `{{total}}`, `{{balance_due}}` (undefined when fully paid), `{{payment_method}}`, `{{invoice_link}}` | `sendReceipt` attaches the PDF receipt |
| `form` | Forms | `POST /settings/email/send` (admin `SendFormModal`); `BoardingBookingsService` pre-check-in (`formName = "Pre-check-in (<ref>)"`) | `{{name}}`, `{{link}}` (host swapped to `PUBLIC_INTAKE_URL`), `{{form_name}}` | Pixel → "`<form>` form email read" |
| `deposit_request` | Request Deposit | `InvoicesService.requestDeposit`, and the full-payment request variant | `{{customer_name}}`, `{{customer_address}}`, `{{customer_phone}}`, `{{invoice_number}}`, `{{invoice_total}}`, `{{due_date}}`, `{{payment_terms}}`, `{{deposit_percentage}}` (`'100'` for full payment), `{{deposit_amount}}`, `{{remaining_balance}}`, `{{invoice_link}}`, `{{bank_name}}`, `{{sort_code}}`, `{{account_number}}` | Pixel on the `deposit_requested` audit entry ("Deposit request read" / "Payment request read") |
| `portal_login_code` | Portal Login Code | `PortalService.issueCode('login')` | `{{customer_name}}`, `{{code}}` | — |
| `portal_password_reset` | Portal Password Reset | `PortalService.issueCode('reset')` (public `request-reset`, staff `POST /customers/:id/portal/reset`) | `{{customer_name}}`, `{{code}}` | — |
| `portal_enabled` | Customer Portal Enabled | `PortalService.setPortalActive` (first enable, best-effort) | `{{customer_name}}` | — |
| `post_registration` | Post Registration Email | `CustomersService.sendRegistrationCopy` (public `POST /customers/:id/send-registration-copy`) | `{{name}}` | The PDF the client supplied |
| `form_copy` | Form Copy | `FormSubmissionsService.sendCopy` | `{{name}}`, `{{form_name}}` | PDF attachment |
| `booking_confirmation` | Booking Confirmation | `BoardingBookingsService.sendConfirmation` | `{{name}}`, `{{booking_reference}}`, `{{booking_type}}` (`Boarding` or `Day Care`), `{{pet_names}}`, `{{drop_off}}`, `{{pick_up}}` (long en-GB date plus time) | PDF attachment |
| `generic` | Generic Email | `EmailMessagesService.send` (Communications > Email); `PoliciesService.sendPolicyEmail`; `RiskAssessmentsService` email | `{{name}}` (`'there'` for policy and risk-assessment sends), `{{campaignSubject}}`; raw `{{emailBodyText}}` | Per-recipient pixel `/email-messages/<id>/recipients/<rid>/pixel.gif` (Communications only) |
| `pre_boarding` | Pre-Boarding Questionnaire | `PreBoardingService.send` | `{{name}}` (first name), `{{link}}` (`${PUBLIC_INTAKE_URL}/pre-boarding/<id>`), `{{dog_names}}` (joined names, or "your dog"/"your dogs") | — |

Other substitution tokens in the codebase that the email engine does **not** handle:

- `{{petName}}` in `offLeadConsentText` is substituted client-side by the intake form and PDF.
- `{year}` and `{seq}` (single braces) in numbering templates are handled by `formatDocumentNumber`.

#### Default template content

- **No templates are seeded by `SettingsService`.** Until staff set a template up, every trigger returns 400 at send time.
- **`pre_boarding`** is the one exception. `PreBoardingService.onModuleInit` seeds it with `$setOnInsert`:
  - name "Pre-Boarding Questionnaire".
  - subject "A few questions before your dog stays with us".
  - an HTML body: `{{logo}}{{businessName}}` header, "Hi {{name}}", an explanation of the questionnaire (about 10 minutes), a "Fill in the questionnaire" button linking `{{link}}`, and a footer `{{businessName}} · {{businessAddress}}, {{businessTown}} {{businessPostcode}} · {{businessTelephone}}`.
  - It also migrates the previous default subject and body if they're still unchanged.
- **Admin-side starters** (`admin/src/pages/SettingsPage.tsx`, prefilled only when staff click "Set up"):
  - `invoice` and `quote` (`buildDocumentTemplateStarter`): a branded header (`{{logo}}`, `{{businessName}}`), "Hi {{customer_name}}", "Please find your invoice/quote below.{{#if subject}} {{subject}}{{/if}}", a details card (number, date, `{{#if due_date}}`/`{{#if valid_until}}` row), `{{items_table}}`, a totals card (`£{{subtotal}}`, `£{{total}}`) and a `{{#if bank_name}}` payment-details card.
  - `generic`: a header, "Hi {{name}}", `{{emailBodyText}}` and a business footer.
  - All other triggers start blank.

---

### Audit log & tracking pixels

- `AuditLogService.record(customer, type, title, description?, amount?, actor='System', attachment?, readTitle?, invoiceId?)` is fire-and-forget (errors are swallowed).
- **Pixel flow**:
  1. A "sent" entry with `readTitle` is created before the send.
  2. Its id is embedded in `<img src="${PUBLIC_API_URL}/audit-log/<id>/pixel.gif">`.
  3. When the mail client loads the image, `markOpened` does `findOneAndUpdate({ _id, openedAt: {$exists:false} }, { openedAt: now })`.
  4. If the entry has a `readTitle`, a new `email_read` entry is recorded with actor `'Customer'`.
- `attachFile(entryId, data, name)` adds a PDF to an existing entry (`POST /customers/:id/form-snapshot` with `entryId`).
- `findBookingConfirmationSentAt(customerId, reference)` finds the latest "Booking confirmation emailed" entry whose description starts with `<reference> `.
- `incomeByMonth(customer, months)` runs aggregation `$match{customer,type,createdAt≥since}` → `$group` by `%Y-%m` `$sum amount`, separately for received and removed, then nets them per month.

Actor strings in use:

- A staff `name` (from `@CurrentUser` or the unverified `actorFromRequest`)
- `'Customer'`, `'Customer (portal)'`
- `'Staff'` (hard-coded in `sendTriggeredEmail`)
- `'System'` (default)

---

### Scripts, tests, Docker

| File | Purpose / behaviour |
|---|---|
| `scripts/seed-staff.js` (`npm run seed:staff`) | `node scripts/seed-staff.js "<name>" <email> <password>`. Loads `.env` via `require('dotenv')` (dotenv is in the lockfile only as a transitive dependency, not in `package.json`) and applies the same DNS override. Connects to `MONGODB_URI` and upserts `{ name, email (lowercased), passwordHash (bcrypt 10) }` into `Staff` using its **own minimal schema**: no `username`, `role`, `locked` or `isBreakGlass`. The account only becomes loginable once `AuthService.onModuleInit` backfills `username = email` on the next backend boot. |
| `test/app.e2e-spec.ts` + `test/jest-e2e.json` | A single e2e test: boots the full `AppModule` and asserts `GET /health` → `200 { status: 'ok' }`. It needs a real MongoDB plus `ENCRYPTION_KEY` and `JWT_SECRET` (`mongodb-memory-server` is a devDependency but isn't used here). |
| Unit tests | `jest` with `rootDir: src` and `testRegex: .*\.spec\.ts$`. Only `src/quotes/quotes-visit-plan.spec.ts` and `src/pre-boarding/pre-boarding.service.spec.ts` exist, both outside this section's scope. **No tests cover auth, guards, the portal, customers, animals, push or settings.** |
| `Dockerfile` | Two stages on `node:22-alpine`. Build stage: `npm ci` + `npm run build`. Production stage: `NODE_ENV=production`, `npm ci --omit=dev`, copies `dist`, runs as non-root user `app`, `EXPOSE 3000`. `HEALTHCHECK` every 30 s (timeout 5 s, start period 15 s, 3 retries) runs `GET http://localhost:$PORT/health`. `CMD node dist/main`. |
| `.dockerignore` | `node_modules`, `dist`, `coverage`, `test`, `.env`, `.env.*` (except `.env.example`), `.git`, `*.md`, `Dockerfile`, `.dockerignore` |
| npm scripts | `build`, `start`, `start:dev`, `start:debug`, `start:prod`, `lint`, `format`, `test`, `test:watch`, `test:cov`, `test:debug`, `test:e2e`, `seed:staff` |

---

### Environment variables

| Var | Required | Default if unset | Read by | Notes |
|---|---|---|---|---|
| `PORT` | no | `3000` | `main.ts`, `publicApiUrl()`, Docker healthcheck | |
| `MONGODB_URI` | no | `mongodb://localhost:27017/pawfectpets` | `app.module.ts` (ConfigService), `scripts/seed-staff.js` (required there) | |
| `ENCRYPTION_KEY` | **yes** (boot fails) | — | `EncryptionService.onModuleInit` | scrypt-derived AES-256 key. Changing it makes stored ciphertext (alarm codes, the Graph client secret) undecryptable. |
| `JWT_SECRET` | **yes** (`getOrThrow`) | — | `AuthModule`, `JwtStrategy`, `PortalJwtStrategy`, `PortalService.sign` | Also derives the portal secret |
| `ALLOWED_ORIGINS` | no | reflects any origin | `main.ts` CORS | Comma-separated |
| `PUBLIC_API_URL` | prod: yes | `http://localhost:$PORT` (only when *undefined*) | `publicApiUrl()` → tracking pixels, `{{logo}}` URL | `.env.example` and docker-compose define it as empty when unset, which yields `''` (relative URLs) |
| `PUBLIC_INTAKE_URL` | prod: yes | `http://localhost:5173` (only when *undefined*) | `publicFrontendUrl()` → `{{link}}`, `{{invoice_link}}`, `{{quote_link}}`, pre-boarding link | Same empty-string caveat |
| `APNS_KEY` | no (push disabled) | — | `ApnsService.loadKey` | .p8 contents (PEM, `\n`-escaped, single-line or base64) |
| `APNS_KEY_ID` | no | `''` | `ApnsService` | 10-character Key ID |
| `APNS_TEAM_ID` | no | `''` | `ApnsService` | |
| `APNS_BUNDLE_ID` | no | `''` | `ApnsService` (staff topic) | |
| `APNS_CUSTOMER_BUNDLE_ID` | no | `''` (customer push disabled) | `ApnsService` (customer topic) | |
| `APNS_PRODUCTION` | no | `'true'` (only when *undefined*) | `ApnsService` | Anything other than the string `true`, including `''`, selects the sandbox host |
| `NODE_ENV` | — | Dockerfile sets `production` | (not read in `src/`) | |
| `TZ` | — | (container default) | Node `Date` | docker-compose sets `Europe/London`. Affects the digest, reminders and "today" logic. |

`backend/.env.example` documents `PORT`, `MONGODB_URI`, `PUBLIC_API_URL`, `PUBLIC_INTAKE_URL`, `ENCRYPTION_KEY`, `JWT_SECRET` and `ALLOWED_ORIGINS`. It does **not** list any `APNS_*` variable. Those appear only in `docker-compose.yml` and in comments in `apns.service.ts`.

---

### Suggested improvements (backend core)

#### Security

1. **Throttling probably shares one bucket across all clients behind Cloudflare.**
   - `ThrottlerGuard` uses its default tracker (`req.ip`), and `main.ts` never sets `trust proxy`.
   - `src/common/client-ip.util.ts` itself says `req.ip` reports cloudflared's own address in production.
   - The effect is that the 10/min login limit, the 5/min `request-code`/`request-reset` limits and the global 300/min limit apply to *all users combined*. That is both easy to denial-of-service and weak protection per attacker.
   - Fix: override `getTracker` to use `getClientIp(req)`, or set `app.set('trust proxy', …)` with a matching config.
2. **`POST /portal/set-password` has no strict throttle and codes have no attempt counter.**
   - In `src/portal/portal.controller.ts`, set-password falls back to the global 300/min. It accepts a code from either slot (`matchCode`), and codes live for 48 h (`CODE_TTL_MS`).
   - Together these let someone brute-force the 6-digit space against a known email with no per-account failure limit.
   - Fix: add `@Throttle`, a per-customer failed-attempt counter that invalidates the code, and a shorter TTL.
3. **Public customer routes expose and accept full records by ObjectId** (`src/customers/customers.controller.ts`).
   - `GET /customers/:id` returns the whole document (signatures, emergency contacts, `portalActive`).
   - `PATCH /customers/:id` accepts the full `UpdateCustomerDto`, including `email`, `defaultProduct`, `travelChargeable`, `regularDays` and `security`.
   - `POST /customers` and `POST /animals` (`src/animals/animals.controller.ts`, with a body `customer` field) are unauthenticated.
   - ObjectIds aren't secrets. Consider signed or expiring intake tokens, and a narrower public DTO.
4. **`POST /customers/:id/send-registration-copy` is a phishing vector.** It's public and emails an arbitrary client-supplied PDF from the business's Microsoft 365 address to the stored customer email (`CustomersService.sendRegistrationCopy`). Likewise `POST /customers/:id/completion-snapshot` lets anyone attach arbitrary up-to-8 MB base64 blobs to any customer's audit log.
5. **`GET /settings/business/public` returns the staff projection.** `SettingsController.getBusinessInfoPublic` returns `getBusinessInfo()` in full, including `trustedIps`, `qrCodeUrl`, the numbering counters and `invoicePdfTemplate`. Return a dedicated public subset (name, address, contact details, logo, bank details).
6. **Portal admin and push routes have no permission gate.**
   - `PortalAdminController` (toggle portal access, send reset codes, test push), `PushMessagesController` (broadcast to any customers), `PushController` (`DELETE /push/register/:token` deletes any token) and `POST /settings/email/send` (send any template to any address) are available to every logged-in staff member.
   - Consider `customers.manage`, `settings.manage` or a new key.
7. **Tokens survive password changes.**
   - Staff: `AuthService.changePassword` and the portal `setPassword` don't invalidate outstanding JWTs. Staff tokens live 30 days with remember-me; portal tokens live 90 days.
   - A `tokenVersion` or `passwordChangedAt` claim checked in `PermissionsGuard` and `PortalJwtStrategy.validate` (both already query the database on every request) would fix this cheaply.
8. **Login timing reveals which usernames exist.** `AuthService.login` returns before `bcrypt.compare` when the username isn't found, and `PortalService.login` does the same when the customer or hash is missing. Compare against a dummy hash instead.
9. **Dangling role references grant full access.** `PermissionsGuard` treats a null-populated `role` (for example, a Role deleted directly in the database) as "no role", which means full access. `register` doesn't check that `dto.role` exists, and `RolesService.update` lets anyone remove permissions from the seeded "Admin" role. Treat a missing role as deny.
10. **Helmet's default `Cross-Origin-Resource-Policy: same-origin`** (`main.ts`) applies to `GET /settings/business/logo` and the `pixel.gif` routes, which are designed to be embedded cross-origin in emails. Browser-based mail clients that honour CORP may block them. Set `crossOriginResourcePolicy: { policy: 'cross-origin' }` on those routes and verify.

#### Bugs and correctness

11. **Empty-string environment variables defeat the fallbacks.**
    - `publicApiUrl()` and `publicFrontendUrl()` (`src/common/tracking-pixel.util.ts`) and `APNS_PRODUCTION` (`src/push/apns.service.ts`) use `??`.
    - `.env.example` ships `PUBLIC_API_URL=` and `PUBLIC_INTAKE_URL=`, and docker-compose passes `${VAR}`, which is empty when unset. Those configurations produce relative pixel and logo URLs, `/intake/...` links with no host, and the **sandbox** APNs host.
    - Use `||`, or trim and validate at boot.
12. **`{{#if …}}` ignores raw variables.** `stripConditionals` in `src/settings/settings.service.ts` only looks at `vars`, so `{{#if logo}}`, `{{#if items_table}}` and `{{#if emailBodyText}}` always strip their content.
13. **The portal shows and acts on drafts.**
    - `PortalService.listInvoices` and `listQuotes` don't filter by status, so draft invoices and quotes are visible.
    - `sendInvoice` calls `InvoicesService.sendEmail`, which flips a draft to `sent`, so a customer can "send" a draft.
    - `QuotesService.create` pushes "New quote" to the customer even for drafts. Filter out `draft` in the portal service.
14. **No ObjectId validation on `:id` parameters.** None of the controllers in scope use a `ParseObjectIdPipe`, and there's no exception filter, so a malformed id becomes a Mongoose `CastError`, which surfaces as a 500. Add a pipe or a global `CastError` → 400 filter.
15. **`notifyInvoiceRead` never gets a customer name.** It's called without `customerName` (`src/invoices/invoices.service.ts`), so the body is always "`<number>` was opened" even though `NotificationService.notifyInvoiceRead` supports the name.
16. **Singleton race.** `NotificationSettingsService.get()` does `findOne()`, then `create({})`. Two concurrent first calls (the 5-minute crons) can create duplicate documents. Use `findOneAndUpdate({}, {}, { upsert: true, new: true })`.
17. **Customer uniqueness is enforced only in the service.** `assertEmailNotTaken` does a check-then-insert with `$expr/$toLower`. `Customer.email` has no unique (collation) index, so concurrent intake submissions can create duplicates.
18. **`seed-staff.js` doesn't set `username`.** It writes no `username`, `locked` or `isBreakGlass` fields and relies on a transitive `dotenv`. A freshly seeded admin can't log in until the backend restarts and the backfill runs. Write `username` explicitly and add `dotenv` to `devDependencies`.
19. **APNs sends can hang.** `ApnsService.send` registers no request-level `'error'` or timeout handler (only `client.on('error')`), so a stalled stream never resolves. It also opens a new HTTP/2 connection per token. Add `req.on('error')` and `req.setTimeout`, and reuse one session per send batch.

#### Performance

20. **Portal email lookups scan the whole collection.** `findActiveWithCreds` uses a case-insensitive regex and `assertEmailNotTaken` uses `$expr`; neither can use an index. Store a normalised `emailLower` with an index, or use a case-insensitive collation index.
21. **`PermissionsGuard` populates the role on every authenticated request.** That's fine at the current scale, but a short in-process cache keyed by staff id plus `updatedAt` would remove a round trip. The same applies to `PortalJwtStrategy.validate`.
22. **Large base64 payloads in documents.** `GET /customers/:id`, `GET /animals?customer=` and `GET /portal/me` return base64 signatures and photos inline, and audit-log attachments are stored in the same documents. Consider GridFS or object storage and a projection on the list endpoints. `GET /customers` has no pagination.

#### Developer experience and tests

23. **No tests for security-critical code.** There are no unit or e2e tests for `PermissionsGuard`, `JwtAuthGuard` with `@Public`, `AuthService.login` (lock, trusted IP, break-glass), the portal code and set-password flow, `CustomersService.update` (signature carry-forward, `update_info` clearing), the email interpolation helpers, or `EncryptionService`. `mongodb-memory-server` is already a devDependency (see `pre-boarding.service.spec.ts`), so the e2e suite could drop its real-Mongo requirement.
24. **`.env.example` is incomplete.** It omits all six `APNS_*` variables, and the comment in `src/common/tracking-pixel.util.ts` is stale (it still says "CORS is wide open"). Add the APNs variables and validate config at boot (for example `ConfigModule.forRoot({ validate })`).
25. **The permission catalog is duplicated by hand.** It lives in `src/auth/permissions.catalog.ts` and `admin/src/utils/permissionCatalog.ts`, and the email-trigger and placeholder lists are similarly duplicated in `admin/src/pages/SettingsPage.tsx`. `CreateRoleDto` doesn't validate against `ALL_PERMISSION_KEYS`. Expose `GET /roles/catalog` and `GET /settings/email-triggers` (with placeholders) from the backend, and validate role permissions with `@IsIn(ALL_PERMISSION_KEYS, { each: true })`.
26. **The DNS override is process-wide.** `dns.setServers(['1.1.1.1','8.8.8.8'])` in `main.ts` and `seed-staff.js` applies to all c-ares lookups (Graph, APNs SRV/TXT) and fails in networks that block public DNS. Gate it behind an environment flag, or apply it only when `MONGODB_URI` starts with `mongodb+srv://`.

### Bookings & finance modules

This section covers the NestJS modules under `backend/src/` that handle scheduling (bookings, boarding/day-care stays, calendar day rows, appointments, products, bank holidays, annual leave) and money (invoices, PDFs, terms, quotes, payments, payment methods, credit notes, bank accounts, transfers, expenses, expense categories, vendors, reports). Everything here comes from reading the source files named in each subsection.

#### Auth model used by every route below

- `JwtAuthGuard`, `PermissionsGuard` and `ThrottlerGuard` are all registered globally as `APP_GUARD` (`backend/src/app.module.ts:126-132`). So **every route needs a staff JWT** unless it is marked `@Public()` (`backend/src/auth/public.decorator.ts`).
- `PermissionsGuard` (`backend/src/auth/permissions.guard.ts`) loads the `Staff` document on every non-public request:
  - A locked account gets **403**.
  - A route with no `@RequirePermission()` only gets the lock check.
  - A gated route is allowed when the staff member is break-glass, **has no role assigned** (so existing accounts keep full access), or their role's `permissions` contains the key.
- The permission keys used in this scope are `bookings.manage`, `invoicing.manage`, `financial.manage` and `settings.manage` (`backend/src/auth/permissions.catalog.ts`).
- In the tables, **JWT** means a staff JWT with no permission key, **JWT + `x`** means `@RequirePermission('x')`, and **Public** means `@Public()` (no JWT).
- The controllers show no global route prefix (none was found via `setGlobalPrefix`), so paths are listed as the controllers declare them.

---

### API reference

#### `BookingsController` (legacy) — `backend/src/bookings/bookings.controller.ts`

| Method | Path | Auth/permission | Purpose |
|---|---|---|---|
| POST | `/bookings` | JWT | Create a legacy `Booking` (`CreateBookingDto`). Writes a `BOOKING_CREATED` audit entry with the staff member's name as actor. |
| GET | `/bookings?customer=<id>` | JWT | List bookings, optionally for one customer, newest first. Populates `animals` and `customer(name,email)`. |
| GET | `/bookings/:id` | JWT | One booking (populated). 404 if missing. |
| PATCH | `/bookings/:id` | JWT | Partial update, including `status` (`UpdateBookingDto`). Writes a `BOOKING_UPDATED` audit entry. |
| DELETE | `/bookings/:id` | JWT + `bookings.manage` | Delete. **409** if any `Invoice` or `Quote` has `booking = id`. Writes a `BOOKING_REMOVED` audit entry. |

#### `BoardingBookingsController` — `backend/src/boarding-bookings/boarding-bookings.controller.ts`

| Method | Path | Auth/permission | Purpose |
|---|---|---|---|
| GET | `/boarding-bookings` | JWT | All boarding/day-care bookings, newest first. Each is wrapped by `withStatus()` into `{ booking, invoice, stages, status }`. |
| GET | `/boarding-bookings/by-stay/:stayId` | JWT | Finds the `BoardingBooking` with that `stayId`, or returns `null`, not 404. Used by the Dashboard's Arriving/Departing lists. |
| GET | `/boarding-bookings/:id` | JWT | One booking. Runs `backfillConfirmationSent()` first, then returns `withStatus()`. |
| POST | `/boarding-bookings` | JWT | `createDirect()`: staff "+ New booking" with no quote. Creates the DayBooking rows, then the invoice, then the reference. |
| PATCH | `/boarding-bookings/:id/amend-dates` | JWT | `amendDates()`: rebuilds the stay's rows and re-prices the linked invoice's line items. |
| PATCH | `/boarding-bookings/:id/status` | JWT | Pins or clears `statusOverride` (`{status: label \| null}`), then re-fetches and returns `withStatus()`. |
| PATCH | `/boarding-bookings/:id/archive` | JWT | Sets `archived` (`{archived: boolean}`). Display-list toggle only. |
| POST | `/boarding-bookings/:id/request-payment` | JWT | `{type:'deposit'\|'full'}` → `InvoicesService.requestDeposit()` or `requestFullPayment()`, then sets `paymentRequestType`. |
| POST | `/boarding-bookings/:id/send-pre-check-in` | JWT | Creates a pre-filled pre-check-in `FormSubmission` and emails the form link. |
| POST | `/boarding-bookings/:id/send-confirmation` | JWT | Emails the client-built Booking Confirmation PDF (`attachmentData` base64 data URI, `attachmentName`). |
| POST | `/boarding-bookings/:id/check-in` | JWT | Body `{submission}` records `checkInSubmission`, `checkInAt=now` and `checkInBy=staff name`. |
| POST | `/boarding-bookings/:id/check-out` | JWT | Body `{submission}` records `checkOutSubmission`, `checkOutAt` and `checkOutBy`. |
| DELETE | `/boarding-bookings/:id?deleteAll=true` | JWT + `bookings.manage` | Deletes the invoice, then the stay rows, observations and booking. With `deleteAll=true` it first removes every payment and credit note against the invoice through their own services. |

#### `BookingObservationsController` — `backend/src/boarding-bookings/booking-observations.controller.ts`

| Method | Path | Auth/permission | Purpose |
|---|---|---|---|
| GET | `/boarding-bookings/:bookingId/observations` | JWT | Care notes for a booking, sorted `observedAt` desc, then `createdAt` desc. |
| POST | `/boarding-bookings/:bookingId/observations` | JWT | Create a note. 404 if the booking is missing. `observedBy` is always the logged-in staff name. |
| PATCH | `/boarding-bookings/:bookingId/observations/:id` | JWT | Replace `observedAt`, `category`, `description` and `photos`. `observedBy` is left unchanged. |
| DELETE | `/boarding-bookings/:bookingId/observations/:id` | JWT | Delete a note, scoped to the booking. **Not** permission-gated. |

#### `DayBookingsController` — `backend/src/day-bookings/day-bookings.controller.ts`

| Method | Path | Auth/permission | Purpose |
|---|---|---|---|
| POST | `/day-bookings` | JWT | Create one calendar row. `customer` is copied from `animal.customer`. Best-effort checklist auto-assign. |
| GET | `/day-bookings?from=YYYY-MM-DD&to=YYYY-MM-DD` | JWT | Rows with `date ∈ [from, to)`. Both params are required by convention; nothing validates them. |
| GET | `/day-bookings/by-customer/:customerId` | JWT | All rows for a customer, sorted by date. |
| GET | `/day-bookings/boarding-plan?start=&end=&dogCount=` | JWT | `computeBoardingPlan()` preview: whole boarding days, Half Day leftover, product lines and missing mappings. |
| GET | `/day-bookings/stay/:stayId` | JWT | Every row of one stay. |
| DELETE | `/day-bookings/stay/:stayId` | JWT + `bookings.manage` | Delete a whole stay. Returns `{deleted}`. |
| PATCH | `/day-bookings/:id` | JWT | Partial update. `animal` cannot change (`OmitType`). `invoice: null` clears the link. |
| DELETE | `/day-bookings/:id` | JWT + `bookings.manage` | Delete one row. |

#### `AppointmentsController` — `backend/src/appointments/appointments.controller.ts`

| Method | Path | Auth/permission | Purpose |
|---|---|---|---|
| POST | `/appointments` | JWT | Create `{customer, reason, date, time:'HH:mm'}`. `date` is normalised to local midnight. |
| GET | `/appointments?from=&to=` | JWT | Appointments with `date ∈ [from, to)`, sorted by `date`, then `time`. |
| PATCH | `/appointments/:id` | JWT | Partial update. |
| DELETE | `/appointments/:id` | JWT + `bookings.manage` | Delete. |

#### `ProductsController` — `backend/src/products/products.controller.ts`

| Method | Path | Auth/permission | Purpose |
|---|---|---|---|
| POST | `/products` | JWT + `settings.manage` | Create a catalogue product. |
| GET | `/products` | JWT | List, sorted by name (the item picker). |
| POST | `/products/price-list/email` | JWT | Emails a staff-app-built price-list PDF to any `recipientEmail` via `sendDirectEmail`. |
| PATCH | `/products/:id` | JWT + `settings.manage` | Update. |
| DELETE | `/products/:id` | JWT + `settings.manage` | Delete. No check for references from `VisitMapping` or `DayBooking`. |

#### `BankHolidaysController` — `backend/src/bank-holidays/bank-holidays.controller.ts`

| Method | Path | Auth/permission | Purpose |
|---|---|---|---|
| POST | `/bank-holidays` | JWT + `settings.manage` | Create `{name, date}`. The date is parsed as local Y/M/D. |
| GET | `/bank-holidays` | JWT | List, sorted by date. |
| PATCH | `/bank-holidays/:id` | JWT + `settings.manage` | Full replace of name and date. |
| DELETE | `/bank-holidays/:id` | JWT + `settings.manage` | Delete. |

#### `AnnualLeaveController` — `backend/src/annual-leave/annual-leave.controller.ts`

| Method | Path | Auth/permission | Purpose |
|---|---|---|---|
| POST | `/annual-leave` | JWT + `settings.manage` | Create `{name, startDate, endDate}`. |
| GET | `/annual-leave` | JWT | List, sorted by `startDate` (the calendar's red-X days). |
| PATCH | `/annual-leave/:id` | JWT + `settings.manage` | Full replace. |
| DELETE | `/annual-leave/:id` | JWT + `settings.manage` | Delete. |

#### `InvoicesController` — `backend/src/invoices/invoices.controller.ts`

| Method | Path | Auth/permission | Purpose |
|---|---|---|---|
| POST | `/invoices` | JWT | Create. Always `status=draft` with a new invoice number. Writes an `INVOICE_CREATED` audit entry. |
| GET | `/invoices?customer=<id>` | JWT | Runs `markOverdue()` first, then lists newest first. Populates `customer(name,email,address,phoneNumber)` and `visitPlan.animals(name)`. |
| GET | `/invoices/:id` | JWT | One invoice. |
| GET | `/invoices/:id/pdf` | JWT | Server-rendered PDF (`application/pdf`, `inline; filename="invoice-<id>.pdf"`). |
| PATCH | `/invoices/:id` | JWT | Partial update. Recalculates totals if `lineItems` is present. `status=paid` stamps `paidAt`. Customer push depends on the status transition. |
| DELETE | `/invoices/:id` | JWT + `invoicing.manage` | Delete. **409** if any `Payment` or `CreditNote` references it. |
| POST | `/invoices/:id/send` | JWT | Emails the `invoice` template. Draft → sent. |
| POST | `/invoices/:id/request-deposit` | JWT | Emails the `deposit_request` template using `depositPercentage`. Draft → sent. |
| GET | `/invoices/:id/public` | **Public** | Customer invoice page data. Same response as `findOne`; the id is the access token. |
| GET | `/invoices/:id/pixel.gif` | **Public** | 1×1 tracking GIF. Stamps `openedAt` on first load (errors are swallowed). |

#### `InvoiceTermsController` — `backend/src/invoice-terms/invoice-terms.controller.ts`

| Method | Path | Auth/permission | Purpose |
|---|---|---|---|
| POST | `/invoice-terms` | JWT + `settings.manage` | Create. `isDefault:true` clears every other default. |
| GET | `/invoice-terms` | JWT | List, newest first. |
| PATCH | `/invoice-terms/:id` | JWT + `settings.manage` | Update. Same default handling. |
| DELETE | `/invoice-terms/:id` | JWT + `settings.manage` | Delete. |

#### `QuotesController` — `backend/src/quotes/quotes.controller.ts`

| Method | Path | Auth/permission | Purpose |
|---|---|---|---|
| POST | `/quotes` | JWT | Create. Needs `customer` **or** `manualCustomerName` + `manualCustomerEmail`. `validUntil` is forced to issueDate + 7 days. Pushes "New quote" to the customer. |
| GET | `/quotes?customer=<id>` | JWT | List, newest first. |
| GET | `/quotes/:id` | JWT | One quote. |
| GET | `/quotes/:id/pdf` | JWT | Server-rendered quote PDF (`quote-<id>.pdf`). |
| PATCH | `/quotes/:id` | JWT | Update. If `status==='accepted'` and there is no invoice yet, also runs `acceptAndConvert()`. **Always** pushes "Quote updated" when the quote has a customer. |
| DELETE | `/quotes/:id` | JWT + `invoicing.manage` | Delete. No blocker check, even when an invoice is linked. |
| POST | `/quotes/:id/send` | JWT | Emails the `quote` template. Draft → sent. |
| GET | `/quotes/:id/public` | **Public** | Customer quote page data. |
| POST | `/quotes/:id/accept` | **Public** | `acceptAndConvert()` (idempotent). |
| POST | `/quotes/:id/reject` | **Public** | Sets `declined`. 409 if already accepted. |
| GET | `/quotes/:id/pixel.gif` | **Public** | Tracking pixel. Stamps `openedAt`. |

#### `PaymentsController` — `backend/src/payments/payments.controller.ts`

| Method | Path | Auth/permission | Purpose |
|---|---|---|---|
| POST | `/payments` | JWT | Record a payment against an invoice. Applies it to the invoice and bank balance, creates a charges expense when needed, and sends the "Thank You" email unless `skipThankYouEmail`. |
| GET | `/payments` | JWT | All payments, sorted by `date` desc. Populates `invoice(invoiceNumber)` and `account(name,type)`. |
| PATCH | `/payments/:id` | JWT + `financial.manage` | Reverses every effect, then re-applies with the new values. |
| DELETE | `/payments/:id` | JWT + `financial.manage` | Delete and reverse every effect. |
| POST | `/payments/:id/send-email` | JWT | Re-sends the `payment_received` email. Errors propagate. |
| POST | `/payments/:id/send-receipt` | JWT | Same template, with a client-built receipt PDF attached. |

#### `PaymentMethodsController` — `backend/src/payment-methods/payment-methods.controller.ts`

| Method | Path | Auth/permission | Purpose |
|---|---|---|---|
| POST | `/payment-methods` | JWT + `settings.manage` | Create `{name, isDefault?}`. A new default clears the others. |
| GET | `/payment-methods` | JWT | List, sorted by name. |
| PATCH | `/payment-methods/:id` | JWT + `settings.manage` | Update. |
| DELETE | `/payment-methods/:id` | JWT + `settings.manage` | Delete. |

#### `CreditNotesController` — `backend/src/credit-notes/credit-notes.controller.ts`

| Method | Path | Auth/permission | Purpose |
|---|---|---|---|
| POST | `/credit-notes` | JWT | Issue a credit note. Optionally reverses it against an invoice and debits an account. |
| GET | `/credit-notes?customer=<id>` | JWT | List, sorted by `date` desc. Populates customer, invoice number and account. |
| DELETE | `/credit-notes/:id` | JWT + `financial.manage` | Delete and undo its effects. |

There is no PATCH route for credit notes.

#### `BankAccountsController` — `backend/src/bank-accounts/bank-accounts.controller.ts`

| Method | Path | Auth/permission | Purpose |
|---|---|---|---|
| POST | `/bank-accounts` | JWT | Create an account. **Not** gated. |
| GET | `/bank-accounts` | JWT | List, sorted by name. |
| GET | `/bank-accounts/:id/transactions?month=&year=` | JWT | Monthly running-balance statement. Defaults to the current month and year. |
| PATCH | `/bank-accounts/:id` | JWT | Update details or default. **Not** gated. |
| PATCH | `/bank-accounts/:id/opening-balance` | JWT | Reconciliation: sets the anchor `{date, balance}` and recomputes `currentBalance`. **Not** gated. |
| DELETE | `/bank-accounts/:id` | JWT + `financial.manage` | Delete. 409 if payments, other income, expenses or credit notes reference it. |

#### `BankTransfersController` — `backend/src/bank-transfers/bank-transfers.controller.ts`

| Method | Path | Auth/permission | Purpose |
|---|---|---|---|
| POST | `/bank-transfers` | JWT | Create. `from != to`. Debits the source and credits the destination. |
| GET | `/bank-transfers` | JWT | List, sorted by `date` desc. |
| PATCH | `/bank-transfers/:id` | JWT + `financial.manage` | Reverse, then re-apply. |
| DELETE | `/bank-transfers/:id` | JWT + `financial.manage` | Delete and reverse. |

#### `OtherIncomeController` — `backend/src/other-income/other-income.controller.ts`

Money received without an invoice (refunds, interest). Credits `account` like a payment; included in bank statements (`type: 'other_income'`), opening-balance reconciliation and the income side of `/reports`.

| Method | Path | Auth/permission | Purpose |
|---|---|---|---|
| POST | `/other-income` | JWT | Create `{date, receivedFrom, description?, amount, account}`. Credits the account. |
| GET | `/other-income` | JWT | List, sorted by `date` desc, `account` populated. |
| PATCH | `/other-income/:id` | JWT + `financial.manage` | Reverse, then re-apply. |
| DELETE | `/other-income/:id` | JWT + `financial.manage` | Delete and reverse. |

#### `ExpensesController` — `backend/src/expenses/expenses.controller.ts`

| Method | Path | Auth/permission | Purpose |
|---|---|---|---|
| POST | `/expenses` | JWT | Create. Debits `account` if one is set. |
| GET | `/expenses?from=&to=` | JWT | List, sorted by `date` desc. `from` is `$gte` and `to` is `$lte` (inclusive), unlike other range routes. |
| GET | `/expenses/:id` | JWT | One expense. |
| PATCH | `/expenses/:id` | JWT | Update. Re-credits the old account, then debits the new one. |
| POST | `/expenses/:id/send-email` | JWT | Email the stored receipt as an attachment to `{to, subject, message?}` (`sendDirectEmail`). 400 if the expense has no receipt. |
| DELETE | `/expenses/:id` | JWT + `financial.manage` | Delete and re-credit the account. |

#### `ExpenseCategoriesController` — `backend/src/expense-categories/expense-categories.controller.ts`

| Method | Path | Auth/permission | Purpose |
|---|---|---|---|
| POST | `/expense-categories` | JWT + `settings.manage` | Create `{name}`. |
| GET | `/expense-categories` | JWT | List, sorted by name. |
| PATCH | `/expense-categories/:id` | JWT + `settings.manage` | Rename. |
| DELETE | `/expense-categories/:id` | JWT + `settings.manage` | Delete. |

#### `VendorsController` — `backend/src/vendors/vendors.controller.ts`

| Method | Path | Auth/permission | Purpose |
|---|---|---|---|
| POST | `/vendors` | JWT + `settings.manage` | Create `{name}`. |
| GET | `/vendors` | JWT | List, sorted by name (the payee dropdown). |
| PATCH | `/vendors/:id` | JWT + `settings.manage` | Rename. |
| DELETE | `/vendors/:id` | JWT + `settings.manage` | Delete. |

#### `ReportsController` — `backend/src/reports/reports.controller.ts`

| Method | Path | Auth/permission | Purpose |
|---|---|---|---|
| GET | `/reports/income-vs-expenses?months=6` | JWT | Per-month income (payments minus credit notes), expenses and net for the last N months, default 6. |
| GET | `/reports/expenses-by-category?months=6` | JWT | Expense totals per category over the same window, highest first. |

---

### Data model

Every schema here uses `@Schema({ timestamps: true })`, so each document gets `createdAt` and `updatedAt`, except the embedded `_id:false` sub-schemas. The only indexes are the ones listed. No compound indexes are declared in these modules.

#### `Booking` (legacy) — `backend/src/bookings/schemas/booking.schema.ts`

This model is still used by the mobile app (`listBookings`/`updateBookingStatus`, per the comment in `boarding-booking.schema.ts`).

| Field | Type | Notes |
|---|---|---|
| `customer` | ObjectId → `Customer` | required, **indexed** |
| `animals` | ObjectId[] → `Animal` | required |
| `serviceType` | enum `ServiceType` | `boarding`, `daycare`, `grooming`, `walking`; required |
| `startDate` / `endDate` | Date | required |
| `status` | enum `BookingStatus` | `requested` (default), `confirmed`, `in_progress`, `completed`, `cancelled` |
| `notes` | string | optional |
| `price` | number | optional; DTO enforces `>= 0` |

#### `BoardingBooking` — `backend/src/boarding-bookings/schemas/boarding-booking.schema.ts`

| Field | Type | Notes |
|---|---|---|
| `reference` | string | required, **unique**; `BK-{year}-{seq}` by default |
| `customer` | ObjectId → `Customer` | required, **indexed** |
| `animals` | ObjectId[] → `Animal` | required |
| `type` | `'boarding' \| 'dayCare'` | required |
| `startDate`, `endDate` | string `YYYY-MM-DD` | required |
| `dropOffTime`, `pickUpTime` | string `HH:mm` | required |
| `notes` | string | optional |
| `quote` | ObjectId → `Quote` | set only when created from a quote |
| `stayId` | string (UUID) | links the booking to its `DayBooking` rows |
| `invoice` | ObjectId → `Invoice` | |
| `paymentRequestType` | `'deposit' \| 'full'` | set on the first payment request |
| `preCheckInSentAt` | Date | |
| `confirmationSentAt` | Date | back-filled from the audit log on first `GET /:id` |
| `preCheckInSubmission`, `checkInSubmission`, `checkOutSubmission` | ObjectId → `FormSubmission` | |
| `checkInAt`, `checkOutAt` | Date | |
| `checkInBy`, `checkOutBy` | string | staff name |
| `statusOverride` | enum `BOOKING_STATUS_LABELS` | see the list below |
| `archived` | boolean | default `false` |

`BOOKING_STATUS_LABELS`: `Confirmed`, `Invoice Raised`, `Invoice Raised - Draft`, `Invoice Raised - Sent`, `Deposit Requested`, `Deposit Paid`, `Deposit Not Required`, `Pre Check In Complete`, `Check In Complete`, `In Progress`, `Check Out Complete`, `Booking Complete`.

#### `BookingObservation` — `backend/src/boarding-bookings/schemas/booking-observation.schema.ts`

| Field | Type | Notes |
|---|---|---|
| `booking` | ObjectId → `BoardingBooking` | required, **indexed** |
| `observedAt` | Date | required |
| `category` | enum | `Toilet`, `Play`, `Medication`, `Feed`, `Groom`, `General`; required |
| `description` | string | trimmed; empty becomes unset |
| `photos` | string[] | default `[]`; DTO allows at most `MAX_OBSERVATION_PHOTOS = 5`, each matching `^data:image/` |
| `observedBy` | string | required; taken from the JWT user name |

#### `DayBooking` — `backend/src/day-bookings/schemas/day-booking.schema.ts`

| Field | Type | Notes |
|---|---|---|
| `animal` | ObjectId → `Animal` | required, **indexed** |
| `additionalAnimals` | ObjectId[] → `Animal` | default `[]`; other pets on a shared Visits row |
| `customer` | ObjectId → `Customer` | required, **indexed**; copied from `animal.customer` on the server |
| `date` | Date | required, **indexed**; local midnight |
| `product` | ObjectId → `Product` | required |
| `quantity` | number | required, min 1, default 1 |
| `invoice` | ObjectId → `Invoice` | set means already billed |
| `visitTime` | `'AM' \| 'PM'` | single-visit override |
| `dropOffPeriod`, `collectionPeriod` | `'AM' \| 'PM'` | day care |
| `dropOffTime`, `collectionTime`, `pickUpTime` | string `HH:mm` | |
| `placeholder` | boolean | default `false`; presence-only pick-up-day row, never billed |
| `boardingStay` | boolean | default `false`; row belongs to a boarding stay |
| `stayId` | string | **indexed** |

#### `Appointment` — `backend/src/appointments/schemas/appointment.schema.ts`

| Field | Type | Notes |
|---|---|---|
| `customer` | ObjectId → `Customer` | required, **indexed** |
| `reason` | string | required |
| `date` | Date | required, **indexed**; local midnight |
| `time` | string | required; `HH:mm` regex in the DTO |
| `reminderSentAt` | Date | set by the reminder cron |

#### `Product` — `backend/src/products/schemas/product.schema.ts`

| Field | Type | Notes |
|---|---|---|
| `productCode` | string | required (not unique) |
| `name` | string | required |
| `description` | string | |
| `price` | number | required, min 0 |
| `availability` | enum | `weekday`, `weekend`, `bank_holiday`; unset means no restriction |
| `displayInPriceList` | boolean | default `false` |

#### `BankHoliday` and `AnnualLeave`

- `BankHoliday` (`backend/src/bank-holidays/schemas/bank-holiday.schema.ts`): `name` (string, required), `date` (Date, required). No unique index on `date`.
- `AnnualLeave` (`backend/src/annual-leave/schemas/annual-leave.schema.ts`): `name`, `startDate`, `endDate`, all required.

#### `Invoice` — `backend/src/invoices/schemas/invoice.schema.ts`

| Field | Type | Notes |
|---|---|---|
| `customer` | ObjectId → `Customer` | required, **indexed** |
| `booking` | ObjectId → `Booking` (legacy) | optional |
| `invoiceNumber` | string | required, **unique** |
| `lineItems` | `LineItem[]` | required; each `{description (req), quantity (req, >=0), unitPrice (req, >=0), discountPercent (0–100, default 0)}` |
| `subtotal`, `total` | number | required, min 0, default 0; `total === subtotal` (no tax) |
| `status` | enum `InvoiceStatus` | `draft` (default), `sent`, `paid`, `overdue`, `cancelled` |
| `paymentTerms`, `subject` | string | the terms text is copied, not referenced |
| `issueDate`, `dueDate` | Date | required |
| `paidAt` | Date | |
| `amountPaid` | number | default 0; running total kept by `applyPayment` and `reversePayment` |
| `openedAt` | Date | set by the tracking pixel |
| `visitPlan` | `InvoiceVisitPlan` | `{animals[] → Animal, startDate, endDate, visitsPerDay '1'\|'2', visitsFirstDay '1'\|'2', visitsLastDay '1'\|'2', visitDuration '20'\|'30'\|'40' (default '20')}` |
| `dayCarePlan` | `InvoiceDayCarePlan` | `{animals[], date, dropOffPeriod AM\|PM, dropOffTime, collectionPeriod AM\|PM, collectionTime}` |
| `boardingPlan` | `InvoiceBoardingPlan` | `{animals[], startDate, dropOffTime, endDate, pickUpTime}` |

#### `InvoiceTerm` — `backend/src/invoice-terms/schemas/invoice-term.schema.ts`

| Field | Type | Notes |
|---|---|---|
| `text` | string | required |
| `plusDays` | number | days after issue; DTO: integer >= 0, `null` clears it |
| `endOfMonth` | boolean | default `false`; due date is the last working day of the month |
| `isDefault` | boolean | default `false`; "at most one" is enforced in the service |

#### `Quote` — `backend/src/quotes/schemas/quote.schema.ts`

| Field | Type | Notes |
|---|---|---|
| `customer` | ObjectId → `Customer` | optional, **indexed** |
| `manualCustomerName`, `manualCustomerEmail` | string | used when there is no customer record yet |
| `booking` | ObjectId → `Booking` (legacy) | |
| `quoteNumber` | string | required, **unique** |
| `lineItems` | `LineItem[]` | same shape as on `Invoice` |
| `subtotal`, `total` | number | required, min 0 |
| `status` | enum `QuoteStatus` | `draft` (default), `sent`, `accepted`, `declined`, `expired` |
| `issueDate`, `validUntil` | Date | required; `validUntil` = issue + 7 days on create |
| `paymentTerms`, `subject` | string | |
| `openedAt` | Date | |
| `invoice` | ObjectId → `Invoice` | set on conversion; this is the idempotency key |
| `visitPlan` / `dayCarePlan` / `boardingPlan` | sub-docs | same shapes as on `Invoice`; at most one per quote, but the backend does not enforce that |

#### `Payment` — `backend/src/payments/schemas/payment.schema.ts`

| Field | Type | Notes |
|---|---|---|
| `paymentId` | string | required, **unique**; `PAY-{year}-{seq}` |
| `invoice` | ObjectId → `Invoice` | required, **indexed** |
| `date` | Date | required |
| `amount` | number | required, min 0 |
| `charges` | number | min 0, default 0 |
| `paymentMethod` | string | name copied from `PaymentMethod` |
| `account` | ObjectId → `BankAccount` | required |
| `chargesExpense` | ObjectId → `Expense` | linked "Payment Charges" expense |

#### `PaymentMethod` — `backend/src/payment-methods/schemas/payment-method.schema.ts`

`name` (string, required) and `isDefault` (boolean, default `false`).

#### `CreditNote` — `backend/src/credit-notes/schemas/credit-note.schema.ts`

| Field | Type | Notes |
|---|---|---|
| `creditNoteNumber` | string | required, **unique**; `CN-{year}-{seq}` |
| `customer` | ObjectId → `Customer` | required, **indexed** |
| `invoice` | ObjectId → `Invoice` | optional |
| `date` | Date | required |
| `amount` | number | required, min 0 |
| `reason` | string | required |
| `account` | ObjectId → `BankAccount` | optional; the refund source |

#### `BankAccount` — `backend/src/bank-accounts/schemas/bank-account.schema.ts`

| Field | Type | Notes |
|---|---|---|
| `type` | enum `BankAccountType` | `bank` (default), `savings`, `pot` |
| `name`, `sortCode`, `accountNumber` | string | required |
| `currentBalance` | number | default 0; changed by `adjustBalance` (`$inc`) |
| `openingBalanceDate` | Date | reconciliation anchor |
| `openingBalance` | number | default 0 |
| `isDefault` | boolean | default `false` |

#### `BankTransfer` — `backend/src/bank-transfers/schemas/bank-transfer.schema.ts`

`date` (Date, required), `reference` (string), `fromAccount` and `toAccount` (ObjectId → `BankAccount`, required), `amount` (number, required, min 0).

#### `OtherIncome` — `backend/src/other-income/schemas/other-income.schema.ts`

`date` (Date, required), `receivedFrom` (string, required), `description` (string), `amount` (number, required, min 0), `account` (ObjectId → `BankAccount`, required).

#### `Expense` — `backend/src/expenses/schemas/expense.schema.ts`

| Field | Type | Notes |
|---|---|---|
| `date` | Date | required |
| `category` | string | required; name copied from `ExpenseCategory` |
| `payee` | string | name copied from `Vendor` |
| `paymentMethod` | string | name copied |
| `reference` | string | optional free text, e.g. the payee's invoice number |
| `description` | string | |
| `amount` | number | required, min 0 |
| `account` | ObjectId → `BankAccount` | optional |
| `receipt` | string | base64 data URI |

#### `ExpenseCategory` and `Vendor`

- `ExpenseCategory` (`backend/src/expense-categories/schemas/expense-category.schema.ts`): `name` (required).
- `Vendor` (`backend/src/vendors/schemas/vendor.schema.ts`): `name` (required).
- Both are copied onto `Expense` by name, not by reference.

#### Related singletons read by these modules (defined in `settings/`)

- `BusinessInfo` (`backend/src/settings/schemas/business-info.schema.ts`):
  - Number templates and counters: `invoiceNumberTemplate` `INV-{year}-{seq}` / `invoiceNextNumber` 1, `quoteNumberTemplate` `QUO-{year}-{seq}` / `quoteNextNumber`, `paymentNumberTemplate` `PAY-{year}-{seq}` / `paymentNextNumber`, `creditNoteNumberTemplate` `CN-{year}-{seq}` / `creditNoteNextNumber`, `bookingRefTemplate` `BK-{year}-{seq}` / `bookingRefNextNumber`.
  - `depositPercentage`: falls back to `DEFAULT_DEPOSIT_PERCENTAGE = 20` in `settings.service.ts:44`.
  - Also read here: `invoiceNotesMessage`, `quoteNotesMessage`, `invoicePdfTemplate`, the bank details, and `logoImage`.
- `VisitMapping` (`backend/src/settings/schemas/visit-mapping.schema.ts`): product slots `oneVisit{Weekday,Weekend,BankHoliday}Product`, `twoVisit{…}Product`, `dayCare{HalfDay,FullDay}Product`, `dayCareSecondDog{HalfDay,FullDay}Product`, `boardingPerDayProduct`, `boardingSecondDogPerDayProduct`, `boardingHalfDayProduct`, `boardingSecondDogHalfDayProduct`.
- `BoardingWorkflowSettings`, via `SettingsService.getBoardingWorkflowSettings()`: `preCheckInDaysBefore` (default 2), `preCheckInFormBoarding` and `preCheckInFormDayCare`, plus the check-in/out form ids and flags.

#### Entity-relationship diagram

```mermaid
erDiagram
    CUSTOMER ||--o{ BOOKING : has
    CUSTOMER ||--o{ BOARDING_BOOKING : has
    CUSTOMER ||--o{ DAY_BOOKING : "denormalised owner"
    CUSTOMER ||--o{ APPOINTMENT : has
    CUSTOMER ||--o{ INVOICE : billed
    CUSTOMER |o--o{ QUOTE : "optional (manual customer)"
    CUSTOMER ||--o{ CREDIT_NOTE : has
    ANIMAL }o--o{ BOOKING : animals
    ANIMAL }o--o{ BOARDING_BOOKING : animals
    ANIMAL ||--o{ DAY_BOOKING : "animal + additionalAnimals"
    PRODUCT ||--o{ DAY_BOOKING : product
    VISIT_MAPPING }o--o{ PRODUCT : "slot -> product"
    BOARDING_BOOKING |o--o| QUOTE : "quote (if from quote)"
    BOARDING_BOOKING |o--o| INVOICE : invoice
    BOARDING_BOOKING ||--o{ DAY_BOOKING : "stayId (string)"
    BOARDING_BOOKING ||--o{ BOOKING_OBSERVATION : booking
    BOARDING_BOOKING }o--o| FORM_SUBMISSION : "preCheckIn/checkIn/checkOut"
    DAY_BOOKING }o--o| INVOICE : "invoice (billed)"
    BOOKING |o--o{ INVOICE : "booking (legacy link)"
    BOOKING |o--o{ QUOTE : "booking (legacy link)"
    QUOTE |o--o| INVOICE : "invoice (on accept)"
    INVOICE ||--o{ PAYMENT : invoice
    INVOICE |o--o{ CREDIT_NOTE : "invoice (optional)"
    BANK_ACCOUNT ||--o{ PAYMENT : account
    BANK_ACCOUNT |o--o{ CREDIT_NOTE : account
    BANK_ACCOUNT |o--o{ EXPENSE : account
    BANK_ACCOUNT ||--o{ BANK_TRANSFER : "fromAccount / toAccount"
    PAYMENT |o--o| EXPENSE : chargesExpense

    BOARDING_BOOKING {
        string reference UK
        string type
        string startDate
        string endDate
        string stayId
        string statusOverride
        bool archived
    }
    DAY_BOOKING {
        date date
        int quantity
        bool placeholder
        bool boardingStay
        string stayId
    }
    INVOICE {
        string invoiceNumber UK
        string status
        number subtotal
        number total
        number amountPaid
        date dueDate
    }
    QUOTE {
        string quoteNumber UK
        string status
        date validUntil
    }
    PAYMENT {
        string paymentId UK
        number amount
        number charges
    }
    CREDIT_NOTE {
        string creditNoteNumber UK
        number amount
        string reason
    }
    BANK_ACCOUNT {
        string type
        number currentBalance
        number openingBalance
        date openingBalanceDate
    }
```

The diagram leaves out a few schemas. `PaymentMethod`, `ExpenseCategory`, `Vendor`, `InvoiceTerm`, `BankHoliday` and `AnnualLeave` are lookup lists that are copied **by value** (or only read), so they have no ObjectId relationships.

---

### Business logic

#### 1. Two booking systems side by side

| | Legacy `Booking` (`bookings/`) | `BoardingBooking` + `DayBooking` (`boarding-bookings/`, `day-bookings/`) |
|---|---|---|
| Granularity | Customer + date range + animals + one price | A reference-numbered stay (`BoardingBooking`) plus one `DayBooking` row per dog per day per product |
| Status | Stored enum, freely PATCHable, no transition rules | **Derived** label from fields, with an optional pinned `statusOverride` |
| Billing | Optional `price`; Invoice/Quote can point at it via `booking` | Invoice line items built from `DayBooking` products, or copied from the quote |
| Consumers | Mobile app | Admin Bookings tab, calendar, Dashboard |

Legacy `Booking.status` has no service-side transition rules. Any value in the enum can be set through `PATCH /bookings/:id`:

```mermaid
stateDiagram-v2
    [*] --> requested
    requested --> confirmed
    confirmed --> in_progress
    in_progress --> completed
    requested --> cancelled
    confirmed --> cancelled
    note right of requested: Any status can be PATCHed to any other -- no enforcement in BookingsService.update()
```

#### 2. BoardingBooking lifecycle (derived status)

`automaticStatusLabel()` (`backend/src/boarding-bookings/boarding-bookings.service.ts:864-881`) checks these conditions in order. The first match wins:

1. `checkOutAt` set **and** invoice `status === paid` → **Booking Complete**
2. `checkOutAt` set → **Check Out Complete**
3. `checkInAt` set → **In Progress** ("Check In Complete" is only ever pinned manually)
4. `preCheckInSubmission` set → **Pre Check In Complete**
5. `invoice.amountPaid > 0` → **Deposit Paid**
6. `paymentRequestType` set → **Deposit Requested**
7. `invoice` set → **Invoice Raised - Draft** (invoice draft), **Invoice Raised** (invoice cancelled), otherwise **Invoice Raised - Sent**
8. otherwise → **Confirmed**

```mermaid
stateDiagram-v2
    [*] --> Confirmed : created (no invoice)
    Confirmed --> InvoiceRaisedDraft : invoice linked (draft)
    InvoiceRaisedDraft --> InvoiceRaisedSent : invoice sent / overdue
    InvoiceRaisedDraft --> DepositRequested : POST request-payment
    InvoiceRaisedSent --> DepositRequested : POST request-payment
    DepositRequested --> DepositPaid : payment recorded (amountPaid > 0)
    InvoiceRaisedSent --> DepositPaid : payment recorded
    DepositPaid --> PreCheckInComplete : pre-check-in form submitted
    DepositRequested --> PreCheckInComplete : pre-check-in form submitted
    PreCheckInComplete --> InProgress : POST check-in
    DepositPaid --> InProgress : POST check-in
    InProgress --> CheckOutComplete : POST check-out
    CheckOutComplete --> BookingComplete : invoice status = paid
    BookingComplete --> [*]
    note right of BookingComplete
      isComplete() = checkOutAt && invoice.paid
      -> read-only; only delete/archive allowed
    end note
```

Both direct and quote-created stays always carry an invoice. So in practice a new booking is first shown as one of the "Invoice Raised" labels, not "Confirmed".

**Manual override (`statusOverride`):**

- `PATCH /:id/status` with a label pins it. `null` clears it.
- `effectiveOverride()` (lines 857-862): before check-in, a pinned label always wins. After `checkInAt` exists, the pin is dropped if it ranks below the automatic label in `STATUS_DONE_THROUGH_INDEX`.
- `recordCheckIn` and `recordCheckOut` rewrite `statusOverride = effectiveOverride(booking, null)`, so a stale pin is cleared at those moments. Because they pass `invoice=null`, the automatic label used there can never be "Booking Complete".
- `applyStatusOverride()` reshapes the stage timeline so it matches the pinned label. For **Deposit Not Required**, it also renames the `paymentReceived` stage label.

**Stage timeline (`computeStages`, lines 741-801):**

| Order | Key | Done when |
|---|---|---|
| 0 | `quote` | Shown only when `booking.quote` is set; always done |
| 1 | `confirmed` | always |
| 2 | `invoiceRaised` | `booking.invoice` set; `sub` = invoice number |
| 3 | `paymentReceived` | `invoice.amountPaid > 0`; `sub` = `£amount` |
| 4 | `preCheckIn` | `preCheckInSubmission`; `sub` "Sent" if `preCheckInSentAt` |
| 5 | `checkedIn` | `checkInAt` |
| 6 | `inProgress` | `checkOutAt` |
| 7 | `checkedOut` | `checkOutAt` |
| 8 | `invoicePaid` | `invoice.status === paid` |

Once `checkInAt` is set, every stage before `checkedIn` is forced to done. The first not-done stage is marked `current`, unless an override is in effect.

**Read-only guard:** `assertNotComplete()` is called by `requestPayment`, `amendDates`, `recordCheckIn`, `recordCheckOut`, `sendPreCheckIn`, `sendConfirmation` and `setStatus`. It throws 400 once the booking is checked out **and** its invoice is paid. `setArchived` and `remove` are not guarded.

#### 3. Creating stays: direct vs. from quote

**Direct (`createDirect`, lines 337-417):**

1. For day care, `dropOffPeriod` and `collectionPeriod` are required. Day care uses `endDate = startDate`.
2. `DayBookingsService.createDayCareStay()` or `createBoardingStay()` creates the rows under a fresh `stayId` (UUID).
3. `buildLineItems()` groups the non-placeholder rows by product. Each group becomes `{description: product.name, unitPrice: product.price, quantity: Σ quantity}`. It throws 400 if nothing is priced.
4. `InvoicesService.create()` is called with `issueDate = today (UTC ISO date)`, `dueDate = endDate` and the matching `dayCarePlan`/`boardingPlan`. The invoice starts as **draft**.
5. `attachInvoiceToStay()` patches `invoice` onto every non-placeholder row.
6. `nextReference()` assigns `BK-{year}-{seq}` and the `BoardingBooking` is saved. No audit entry is written for a direct booking.

**From quote (`createFromQuote`, lines 257-332):** `QuotesService.acceptAndConvert()` calls this after it has created the invoice. It builds the stay with `invoiceId` already set, mints a reference, and writes a `BOOKING_CREATED` audit entry with actor `Customer`.

#### 4. Boarding pricing and visit plans

**Boarding (`DayBookingsService.computeBoardingPlan`, `backend/src/day-bookings/day-bookings.service.ts`):**

- `hours = (end − start)/3.6e6`, from `startDate T dropOffTime` and `endDate T pickUpTime`.
- `wholeDays = floor(hours/24)` and `remainder = hours − 24·wholeDays`.
- `remainder > 12h` → `boardingDays = wholeDays + 1` with no partial day.
- `0 < remainder ≤ 12h` → `boardingDays = wholeDays` plus **one Half Day** on day offset `boardingDays`.
- `remainder == 0` (and `boardingDays > 0`) → a **placeholder** row on the pick-up day. It carries the boarding product but is never billed.
- **Only the 2nd dog** (`dogIndex === 1`) uses the `…SecondDog…` products. Dogs 1 and 3 onwards use the standard ones.
- Each slot without a configured product is added to `missing`. `createBoardingStay()` throws 400 listing them, and also throws if the plan has no lines.
- `createBoardingStay` stamps `dropOffTime` on each dog's first row and `pickUpTime` on its last. It sets `boardingStay: true` and leaves `invoice` off placeholders.

**Day care (`createDayCareStay`):**

- AM drop-off with PM collection uses `dayCareFullDayProduct`. Any other combination uses `dayCareHalfDayProduct`.
- One row per animal, with `quantity` 1, on a shared `stayId`.
- The `dayCareSecondDog*` slots exist in `VisitMapping` and in `classifyBooking()`, but `createDayCareStay` never uses them, so every dog is charged the first-dog rate.

**Visits (`QuotesService.createBookingsFromVisitPlan`, `backend/src/quotes/quotes.service.ts:367-456`):** runs only when a quote with a `visitPlan` is accepted.

- It iterates every day from `startDate` to `endDate` inclusive.
- Visit count per day: a single-day plan or the first day uses `visitsFirstDay`, the last day uses `visitsLastDay`, and days in between use `visitsPerDay`.
- Day type: `bank_holiday` if the local date key is in the `BankHoliday` list, `weekend` on Sat/Sun, otherwise `weekday`.
- The product comes from `VisitMapping[{one|two}Visit{Weekday|Weekend|BankHoliday}Product]` for 20 minute visits, or `{one|two}Visit{30|40}Min{…}Product` when the plan's `visitDuration` is `'30'`/`'40'` (unset counts as `'20'`). An unmapped day is **skipped** and logged with `console.error`.
- For a single visit, the first day is `visitTime = PM` and the last day is `AM`.
- One row is created **per day** (not per pet): the first animal goes in `animal` and the rest in `additionalAnimals`, with `invoice = new invoice`. A summary `BOOKING_CREATED` audit entry is written.

**Bank holidays:** no surcharge calculation happens on the server. A bank holiday only changes which product is chosen:

- for Visits, through the `…BankHolidayProduct` mapping in `createBookingsFromVisitPlan`;
- through `Product.availability = 'bank_holiday'`, which the controller comment says the admin calendar and item picker check on the client.

Boarding and day-care pricing never look at bank holidays.

**Annual leave:** stored and listed only. No service in scope rejects a booking that falls on a leave day; the schema comment says the frontend draws a red X.

#### 5. Capacity and availability checks

No capacity or availability check exists in these modules. A search for `capacity` under `backend/src` found nothing. `DayBookingsService.create`, `createDayCareStay`, `createBoardingStay` and `BoardingBookingsService.createDirect` do not:

- count existing rows for the date,
- check `AnnualLeave`,
- check `Product.availability`, or
- check whether the animal is already booked.

#### 6. Amending dates (`amendDates`, lines 492-553)

1. Guarded by `assertNotComplete`. The booking must have an invoice.
2. **Deletes** the current stay rows (`removeStay(stayId)`).
3. Rebuilds the rows for the new dates with the invoice already linked. Day care falls back to `AM`/`PM` when no periods are given.
4. Adopts the new rows' fresh `stayId`.
5. Computes `newTotal` with the same grouping, ignoring discounts. If `newTotal < invoice.amountPaid`, it throws 400 and suggests a refund or credit note.
6. `invoicesService.update(invoiceId, {lineItems}, 'Staff')` recalculates totals. `amountPaid` is unchanged, so a deposit is absorbed.

#### 7. Deposits and payment requests

| Path | Amount | Email trigger | Status effect |
|---|---|---|---|
| `POST /invoices/:id/request-deposit` → `requestDeposit()` | `Math.round(total × depositPercentage)/100` (default 20%) | `deposit_request` | draft → sent |
| `POST /boarding-bookings/:id/request-payment {type:'deposit'}` | same | `deposit_request` | draft → sent, `paymentRequestType='deposit'` |
| `POST /boarding-bookings/:id/request-payment {type:'full'}` → `requestFullPayment()` | `invoice.total` | `deposit_request` (`deposit_percentage='100'`, `remaining_balance='0.00'`) | draft → sent, `paymentRequestType='full'` |
| Quote accept (plain or Visits quote only) | deposit, as above | `deposit_request` | draft → sent; best-effort, failures are logged |

- Each request writes a `DEPOSIT_REQUESTED` audit entry before sending, with a paired "read" title ("Deposit request read" / "Payment request read").
- A tracking pixel `GET {PUBLIC_API_URL}/audit-log/<entryId>/pixel.gif` is appended to the email, which marks the request as read.
- Recording a payment (`amountPaid > 0`) is what moves a boarding booking to "Deposit Paid", whether the request was for a deposit or the full balance.

#### 8. Booking confirmations

- `POST /boarding-bookings/:id/send-confirmation` (`sendConfirmation`, lines 667-709) receives the PDF already built by the admin client (`admin/src/pdf/bookingConfirmationPdf.ts`, per the code comment). The server only emails it.
- It uses the `booking_confirmation` template with the PDF attached.
- It writes an audit entry: type `REGISTRATION_EMAIL_SENT`, title "Booking confirmation emailed", description `"<ref> confirmation emailed to <email>"`.
- It sets `confirmationSentAt`.
- `backfillConfirmationSent()` covers bookings emailed before that field existed. It finds the latest audit entry titled "Booking confirmation emailed" whose description starts with `"<ref> "` (`AuditLogService.findBookingConfirmationSentAt`) and saves its `createdAt`.

#### 9. Pre-check-in

`sendPreCheckIn` (lines 582-661):

1. Requires a customer email and a configured pre-check-in form id for the booking type (`Settings > Boarding`).
2. Loads the form and builds `formFieldsSnapshot` via `shapeSnapshotForBooking()`:
   - replaces `{{bookingReference}}` in every top-level label;
   - resizes every `group` field to exactly the booking's pets (`minRepeats = maxRepeats = count`, `repetitionLabels` = pet names).
3. Pre-fills the answers with `buildPreCheckInAnswers()`. Each field's `mapping.path` is read from the live `Customer` (top-level fields with `target: 'customer'`) or from each `Animal` (group children with `target: 'animal'`). Dates become `YYYY-MM-DD`, toggles become booleans, and medications go through `toMedicationEntries`.
4. Saves a `FormSubmission` with status `pending`. A single pet goes in `animal`; several go in `animals`.
5. Calls `SettingsService.sendTriggeredEmail` with trigger `form`, `link = {PUBLIC_INTAKE_URL}/forms/<submissionId>` (the host is re-derived from `PUBLIC_INTAKE_URL`) and `formName = "Pre-check-in (<ref>)"`.
6. Sets `preCheckInSentAt` and `preCheckInSubmission`.

#### 10. Deletion cascade (`BoardingBookingsService.remove`, lines 431-464)

1. If `deleteAll=true`: every `Payment` against the invoice goes through `PaymentsService.remove()` (reverses invoice, bank and charges expense, writes audit), then every `CreditNote` through `CreditNotesService.remove()`.
2. `InvoicesService.remove()`: a `ConflictException` from remaining payments or credit notes propagates. A `NotFoundException` (invoice already gone) is ignored.
3. `DayBookingsService.removeStay(stayId)`.
4. `BookingObservationsService.removeForBooking(id)`.
5. Deletes the `BoardingBooking`.

#### 11. Invoice numbering (and every other document counter)

`nextSequenceNumber(model, field)` (`backend/src/common/document-number.util.ts`):

- Does `findOneAndUpdate({}, {$inc:{[field]:1}}, {upsert:true, new:false})` and returns the **pre-increment** value.
- If the field was never set, it sets it to 2 and returns 1. Without that, plain `$inc` from 0 would hand out the same number twice.

`formatDocumentNumber(template, seq)` replaces `{year}` with the **current** year (not the issue date's year) and `{seq}` with the number zero-padded to 5 digits.

Counters:

| Counter field | Template default | Caller |
|---|---|---|
| `invoiceNextNumber` | `INV-{year}-{seq}` | `InvoicesService.nextInvoiceNumber` |
| `quoteNextNumber` | `QUO-{year}-{seq}` | `QuotesService.nextQuoteNumber` |
| `paymentNextNumber` | `PAY-{year}-{seq}` | `PaymentsService.nextPaymentId` |
| `creditNoteNextNumber` | `CN-{year}-{seq}` | `CreditNotesService.nextCreditNoteNumber` |
| `bookingRefNextNumber` | `BK-{year}-{seq}` | `BoardingBookingsService.nextReference` |

The sequence never resets on a new year. Only the `{year}` text changes.

#### 12. Generate Invoices flow (monthly Walks/Visits)

There is no dedicated backend endpoint. The flow is driven by `admin/src/components/GenerateInvoicesModal.tsx` using the routes above:

```mermaid
flowchart TD
    A[Open Generate Invoices for a month] --> B["GET /day-bookings?from=monthStart&to=nextMonthStart<br/>GET /invoices"]
    B --> C[Keep rows with no invoice and placeholder=false]
    C --> D[Group by customer, then by product -> line items qty=sum quantity, unitPrice=product.price]
    D --> E{Customer already has a fully-paid invoice<br/>with subject 'Bookings for Month' or linked from a row?}
    E -- yes --> F[Unticked by default]
    E -- no --> G[Ticked]
    G --> H{Staff picked an existing invoice to match?}
    H -- no --> I["GET /invoice-terms -> default term"]
    I --> J["POST /invoices {customer, lineItems, issueDate=today,<br/>dueDate = customer's last booked date (fallback: term rule),<br/>paymentTerms=term.text, subject='Bookings for Month'}"]
    J --> K["PATCH /day-bookings/:id {invoice} for every row"]
    H -- yes --> L["PATCH /day-bookings/:id {invoice: matchedId} for every row"]
```

Rows that a quote acceptance (Visits) or a boarding/day-care stay created already carry `invoice`, so this flow skips them.

#### 13. Invoice status lifecycle

```mermaid
stateDiagram-v2
    [*] --> draft : POST /invoices (always draft)
    draft --> sent : POST /:id/send, /:id/request-deposit, requestFullPayment, or PATCH status
    sent --> overdue : markOverdue() cron hourly or GET /invoices (status=sent AND dueDate < now)
    sent --> paid : applyPayment() amountPaid >= total or PATCH status=paid
    overdue --> paid : applyPayment() amountPaid >= total
    draft --> paid : applyPayment() (no status precondition)
    paid --> sent : reversePayment() / credit note when amountPaid < total
    sent --> cancelled : PATCH status=cancelled
    draft --> cancelled : PATCH status=cancelled
    overdue --> cancelled : PATCH status=cancelled
    note right of sent
      PATCH /invoices/:id accepts any enum value;
      no server-side transition validation.
      reversePayment returns paid -> sent (never overdue);
      next markOverdue re-flags if past due.
    end note
```

What each step does to the data:

- **`calculateTotals`:** `Σ qty × unitPrice × (1 − discount/100)`, with `total = subtotal`. There is no VAT and no rounding.
- **`PATCH` with `status: 'paid'`:** sets `paidAt` but does **not** change `amountPaid`.
- **`applyPayment(id, amount)`:** `amountPaid += amount`. If that reaches `total`, it sets `status=paid` and `paidAt`. When status actually changes to paid, it pushes "Invoice paid" to the customer.
- **`reversePayment(id, amount)`:** `amountPaid = max(0, amountPaid − amount)`. If the invoice was `paid` and is now under `total`, it sets `status=sent` and unsets `paidAt`.
- **`markOpened`:** first open only. Sets `openedAt`, writes an `INVOICE_READ` audit entry with actor `Customer`, and sends the staff notification `notifyInvoiceRead(invoiceNumber)` (no customer name).

#### 14. Overdue cron

`InvoicesService.markOverdue()` (`backend/src/invoices/invoices.service.ts:120-142`):

- **Schedule:** `@Cron(CronExpression.EVERY_HOUR)`. It is **also** called at the start of every `GET /invoices`.
- **Filter:** `{status: 'sent', dueDate: {$lt: now}}`. It selects `customer` and `invoiceNumber`, then sets `status: 'overdue'` with `updateMany`.
- **Staff:** one `notifyInvoicesOverdue(count)` dispatch ("Invoice overdue" / "N invoices are now overdue"), gated by `NotificationSettings.invoicesOverdue`.
- **Customers:** `notifyCustomerInvoiceStatus(customer, number, 'overdue')` for each flipped invoice.

#### 15. Quote → accept → invoice/booking

```mermaid
flowchart TD
    S[POST /quotes] -->|draft, validUntil=issue+7d| D[(Quote draft)]
    D -->|POST /quotes/:id/send| SENT[(Quote sent)]
    SENT -->|customer: POST /quotes/:id/accept| ACC
    SENT -->|staff: PATCH status=accepted| ACC
    SENT -->|customer: POST /quotes/:id/reject| DEC[(declined)]
    ACC{acceptAndConvert}
    ACC -->|status declined| E1[409 already declined]
    ACC -->|status expired| E2[409 expired]
    ACC -->|accepted AND invoice set| RET[Return existing invoice - idempotent]
    ACC -->|else| U["update(status=accepted, actor=Customer)<br/>manual customer? -> resolveOrCreateCustomer<br/>(match email case-insensitively or create PENDING Customer)"]
    U --> DUE["dueDate = visitPlan.endDate | dayCarePlan.date | boardingPlan.endDate<br/>else default InvoiceTerm (endOfMonth -> last working day; plusDays; fallback 14)"]
    DUE --> INV["InvoicesService.create(lineItems copied, plan copied, actor=Customer) -> draft"]
    INV --> LINK[quote.invoice = invoice._id]
    LINK --> BK["try: createBookingsFromVisitPlan()<br/>then BoardingBookingsService.createFromQuote()<br/>(errors logged, not thrown)"]
    BK --> PLAN{dayCarePlan or boardingPlan?}
    PLAN -- yes --> R1[Return invoice - no deposit auto-request]
    PLAN -- no --> DEP["try: requestDeposit(invoice, 'Customer')<br/>-> deposit_request email, draft->sent"]
    DEP --> R2[Return invoice + depositAmount/percentage]
```

Points to note:

- The `QuoteStatus.EXPIRED` value exists, and `acceptAndConvert` refuses expired quotes, but **nothing in the codebase ever sets `expired`**. A search found no reference outside the schema and that guard. `validUntil` is not enforced when a quote is accepted.
- `QuotesService.reject` returns the quote unchanged if it is already `declined`, and throws 409 if it is `accepted`.
- `QuotesService.remove` has no guard against a linked invoice or bookings.

#### 16. Payments and allocation

Each payment is allocated to exactly **one** invoice. There is no splitting across invoices and no unallocated-credit concept.

`PaymentsService.create` (`backend/src/payments/payments.service.ts`):

1. `paymentId = nextPaymentId()`.
2. If `charges > 0`: `ExpensesService.create({category:'Payment Charges', description:'Processing charges on payment <id>', amount: charges, account})`, which debits the account. The expense is linked as `chargesExpense`.
3. Saves the payment.
4. `InvoicesService.applyPayment(invoice, amount)`. There is no overpayment check and no check that the invoice is cancelled or draft.
5. `BankAccountsService.adjustBalance(account, +amount)`, the gross amount.
6. Writes a `PAYMENT_RECEIVED` audit entry with the amount.
7. Unless `skipThankYouEmail`, sends the `payment_received` email best-effort (all errors swallowed).

- `update`: reverses the charges expense, invoice and bank effects, works out the new values (falling back to the current ones), re-creates the charges expense, saves, re-applies, and writes an audit entry "Payment updated".
- `remove`: deletes the payment, removes the charges expense, `reversePayment`s the invoice, `adjustBalance(−amount)`, and writes a `PAYMENT_REMOVED` audit entry.
- None of these steps run in a Mongo transaction.

#### 17. Credit notes

`CreditNotesService` (`backend/src/credit-notes/credit-notes.service.ts`) treats a credit note as a **refund**:

- **Create:**
  - Number `CN-{year}-{seq}`.
  - If `invoice` is set, calls `invoicesService.reversePayment(invoice, amount)`. This **lowers `amountPaid`**, which raises the balance due, and can move the invoice back from paid to sent.
  - If `account` is set, `adjustBalance(account, −amount)`.
  - Writes a `CREDIT_NOTE_ISSUED` audit entry.
- **Remove:** `applyPayment(invoice, amount)` (this can mark the invoice paid and push "Invoice paid"), `adjustBalance(account, +amount)`, and a `CREDIT_NOTE_REMOVED` audit entry.
- There is no update route.

#### 18. Bank accounts, reconciliation and transfers

- **Running balance:** `currentBalance` changes only through `adjustBalance` (`$inc`):

  | Source | Effect |
  |---|---|
  | Payment | + amount |
  | Expense | − amount |
  | Credit note | − amount |
  | Transfer | − from source, + to destination |

- **Reconciliation (`setOpeningBalance`):** sets `openingBalanceDate` and `openingBalance`, then **recomputes** `currentBalance = balance + Σpayments − Σexpenses − ΣcreditNotes + Σtransfers(signed)` for `date >= openingBalanceDate`, via aggregations.
- **Statement (`getTransactions(id, month, year)`):**
  - The anchor is `openingBalanceDate`, or the account's `createdAt` when never reconciled, with `openingBalance` defaulting to 0.
  - The period opening balance is the anchor balance plus the signed sums from the anchor up to the start of the month.
  - It lists the month's payments ("Payment PAY-… — INV-…"), expenses (description or category), credit notes ("Credit note CN-… — reason") and transfers ("Transfer to/from <name> — ref"), sorted by date, each with a running `balance`.
  - Returns `{openingBalance, transactions}`.
- **Delete guard:** blocks deletion when payments, expenses or credit notes reference the account. Bank transfers are **not** checked.
- **Transfers:** `create` rejects `from === to`. `update` reverses the old effect, validates, saves and applies the new one. `remove` reverses.
  - In `update`, the reversal runs **before** the `from === to` validation. If validation then fails, the balances stay reversed while the transfer record is unchanged.

#### 19. Expenses

- Create, update and delete keep the linked account's balance in step: create debits, update re-credits the old account and debits the new one, delete re-credits.
- `category`, `payee` and `paymentMethod` are free strings. They are not validated against the `ExpenseCategory`, `Vendor` or `PaymentMethod` lists.
- `receipt` is a base64 string stored on the document and returned in `GET /expenses` list responses.
- `expenseId` is `EXP{seq}` (5-digit zero-padded) from `BusinessInfo.expenseNextNumber`, set in `create()`. On startup `onModuleInit` numbers any expenses without one, oldest first.
- The automatic "Payment Charges" category is a hard-coded string. It does not have to exist in `ExpenseCategory`.

#### 20. Reports

`ReportsService` (`backend/src/reports/reports.service.ts`):

- **Window:** `since` = the first day of the month `months − 1` months ago, at local midnight.
- **`incomeVsExpenses(months)`:**
  - Three aggregations (`Payment`, `CreditNote`, `Expense`) with `$match {date >= since}` and `$group` by `$dateToString '%Y-%m'` on `date`, summing `amount`.
  - Merged per month from a local-time cursor: `income = payments − creditNotes`, `expenses`, `net = income − expenses`.
  - Months with no data are filled with 0.
  - Payments count gross; the processing charge already appears in expenses as "Payment Charges".
- **`expensesByCategory(months)`:** `$group` by `category`, summing `amount`, sorted descending. Returns `[{category, total}]`.
- Both are cash-based: they use payment and expense dates, not invoice issue dates. No route reports accounts receivable or invoice aging.

#### 21. PDF generation

`buildInvoicePdfBuffer(record, businessInfo, kind)` (`backend/src/invoices/pdf/invoice-pdf.util.ts`) uses `jspdf` and `qrcode` on A4 in points (595.28 × 841.89), with 40pt top and bottom margins. The file is a hand-synced port of `admin/src/pdf/invoicePdf.ts` and `frontend/src/pdf/invoicePdf.ts`.

- **Template:** `BusinessInfo.invoicePdfTemplate` if it is non-empty, otherwise `DEFAULT_INVOICE_TEMPLATE`. Quotes use the same template.
- **Element types:** `text` (substitutes `{{var}}`, wraps, align, colour, optional rotation), `image` (`src:'logo'`), `line`, `rect` (fill and/or stroke), `qrcode` (QR of the substituted content), `itemTable`, and `visitTable`.
- **Visibility:** `visibleWhen` takes `always`, `paid`, `unpaid`, `invoice-only` or `quote-only`. `paid` is true only for an invoice with `status === 'paid'`.
- **Quote handling (`prepareForKind`):**
  - drops every text or QR element that references `{{balanceDue}}` or `{{amountPaid}}`;
  - rewrites the wording "Invoice Date" → "Quote Date", "Due Date" → "Valid Until", "Invoice#" → "Quote#", and "Invoice(s)" → "Quote(s)".
- **Variables (`buildPdfVars`):**
  - Document: `invoiceNumber` (or the quote number), `invoiceDate`, `dueDate` (or `validUntil`), `terms`, `docTypeLabel`, `docNumberLabel`, `docToLabel`, `docDateLabel`, `dueDateLabel`, `status`.
  - Customer: `customerName` (falls back to the manual name or `(deleted customer)`), `customerAddress`, `customerEmail`, `customerPhone`.
  - Money: `subtotal`, `total`, `amountPaid`, `balanceDue = total − amountPaid`.
  - Text: `subject`; `notes` = the notes message (or "Thanks for your business.") plus `scheduleText()`.
  - Business: `businessName`, `businessAddress`, `businessTown`, `businessPostcode`, `businessTelephone`, `businessEmail`, `businessWebsite`, `bankName`, `sortCode`, `accountNumber`.
- **Schedule:**
  - `scheduleFor()` produces "Visit Schedule" (Dates, Visits, Pets), "Day Care Schedule" (Date, Drop off, Collection, Pets) or "Boarding Schedule" (Dates, Drop off, Pick up, Pets).
  - When the template has no `{{notes}}` element, `injectVisitSchedule()` adds a `visitTable` element below `notes-body` (or the lowest text element).
  - Only `visitPlan.animals` is populated by `findOne`, so Day Care and Boarding schedules usually show no Pets row (names are only drawn for populated objects).
- **Item table:**
  - Columns `#`, "Item & Description" (wrapped), "Qty" (2 decimals), "Unit Price", "Line Total". The line total applies the discount, but there is **no discount column**.
  - A dark header row is redrawn on every new page.
  - The table paginates its own rows.
- **Layout:** `resolveLayout()` pushes elements down when text or tables above them in overlapping x-ranges grow past their designed height. Elements that would overflow the page are drawn on a new page, offset to the top margin.
- **Default template contents:** logo, business name, address block, title, number, "Balance Due" (invoice-only), rotated "PAID" stamp (paid only), divider, "Invoice To" block, date, terms and due-date rows, item table, Sub Total and Total, "Payment Made" plus a shaded "Balance Due" box (invoice-only), Notes, "BANK Transfer Details" (account name, sort code, account number), a QR code of `"{{bankName}} {{sortCode}} {{accountNumber}}"`, and a caption.
- **Logo:** always the embedded `INVOICE_LOGO_DATA_URL` (`backend/src/invoices/pdf/logo.ts`, a base64 copy of `admin/src/assets/logo.png`). `BusinessInfo.logoImage` is **not** used for PDFs.
- **Client-built PDFs:** Booking Confirmation, payment receipt and price list PDFs are built on the client and only attached on the server.

---

### Email and push triggers fired from these modules

#### Email

All emails go through `SettingsService.sendTemplatedEmail(trigger, to, vars, rawVars, appendHtml, attachment)`:

- It loads the template for the trigger, or throws 400 "No email template is set up…".
- It merges the business variables `businessName`, `businessAddress`, `businessTown`, `businessPostcode`, `businessTelephone`, `businessEmail` and `businessWebsite`, plus the raw `{{logo}}` (`<img src="{PUBLIC_API_URL}/settings/business/logo">`).
- It sends through Microsoft Graph.

URL helpers (`backend/src/common/tracking-pixel.util.ts`):

- `publicApiUrl()` = `PUBLIC_API_URL`, or `http://localhost:${PORT:-3000}`.
- `publicFrontendUrl()` = `PUBLIC_INTAKE_URL`, or `http://localhost:5173`.

| Event (code) | Trigger | Placeholders passed | Links / pixels built |
|---|---|---|---|
| Invoice emailed: `InvoicesService.sendEmail` (`POST /invoices/:id/send`) | `invoice` | `customer_name`, `customer_address`, `customer_phone`, `subject`, `invoice_number`, `invoice_date`, `due_date`, `payment_terms`, `subtotal`, `total`, `invoice_link`, `bank_name`, `sort_code`, `account_number`; raw `items_table` | `{{invoice_link}}` = `{PUBLIC_INTAKE_URL}/invoices/<invoiceId>`; pixel `{PUBLIC_API_URL}/invoices/<id>/pixel.gif` |
| Deposit requested: `InvoicesService.requestDeposit` (invoice route, boarding request-payment `deposit`, quote accept) | `deposit_request` | `customer_name`, `customer_address`, `customer_phone`, `invoice_number`, `invoice_total`, `due_date`, `payment_terms`, `deposit_percentage`, `deposit_amount`, `remaining_balance`, `invoice_link`, `bank_name`, `sort_code`, `account_number` | `{{invoice_link}}` as above; pixel `{PUBLIC_API_URL}/audit-log/<auditEntryId>/pixel.gif` |
| Full payment requested: `InvoicesService.requestFullPayment` (boarding request-payment `full`) | `deposit_request` | same keys; `deposit_percentage='100'`, `deposit_amount=total`, `remaining_balance='0.00'` | same |
| Quote emailed: `QuotesService.sendEmail` (`POST /quotes/:id/send`) | `quote` | `customer_name` (or manual name), `customer_address`, `customer_phone`, `subject`, `quote_number`, `quote_date`, `valid_until`, `payment_terms`, `subtotal`, `total`, `quote_link`, `bank_name`, `sort_code`, `account_number`; raw `items_table` | `{{quote_link}}` = `{PUBLIC_INTAKE_URL}/quotes/<quoteId>`; pixel `{PUBLIC_API_URL}/quotes/<id>/pixel.gif` |
| Payment recorded: `PaymentsService.create` (auto, best-effort), `sendReceivedEmail`, `sendReceipt` (with PDF) | `payment_received` | `customer_name`, `customer_address`, `customer_phone`, `invoice_number`, `amount`, `payment_date`, `due_date`, `total`, `balance_due` (only if > 0), `payment_method`, `invoice_link` | `{{invoice_link}}` = `{PUBLIC_INTAKE_URL}/invoices/<invoiceId>` |
| Pre-check-in: `BoardingBookingsService.sendPreCheckIn` (manual or hourly cron) | `form` (via `sendTriggeredEmail`) | `name`, `link`, `form_name = "Pre-check-in (<ref>)"` | `{{link}}` = `{PUBLIC_INTAKE_URL}/forms/<submissionId>`; audit pixel `{PUBLIC_API_URL}/audit-log/<entryId>/pixel.gif` (titles "Pre-check-in (<ref>) form email sent/read") |
| Booking confirmation: `BoardingBookingsService.sendConfirmation` | `booking_confirmation` | `name`, `booking_reference`, `booking_type` (`Boarding`/`Day Care`), `pet_names`, `drop_off`, `pick_up` (e.g. "Friday, 25 December 2026, 09:00") | none; PDF attachment |
| Price list: `ProductsService.emailPriceList` | none (`sendDirectEmail`, hard-coded HTML) | subject `"<business> — Price List"`; body includes logo, recipient name and contact line | PDF attachment |

Dates in emails use `formatUkDate` (`dd/mm/yyyy`, `backend/src/common/invoice-email.util.ts`). `{{items_table}}` is an inline-styled HTML table with Description, Qty, Rate, Discount and Amount columns.

#### Push and in-app notifications

- **Customer** pushes go through `CustomerNotificationsService.record`, which saves to the customer bell feed and calls `PushService.sendToCustomer`.
- **Staff** pushes go through `NotificationService.dispatch`, which saves a `NotificationItem` and calls `PushService.sendToAll`.

| Event | Recipient | Title / body | `type` | Gate |
|---|---|---|---|---|
| `QuotesService.create` (customer set) | Customer | "New quote" / "You've received quote <no>." | `quoteReceived` | none (fires even for drafts) |
| `PATCH /quotes/:id` (any change, customer set) | Customer | "Quote updated" / "Your quote <no> has been updated." | `quoteUpdated` | none |
| `InvoicesService.update` → status now `sent` | Customer | "New invoice" (was not sent) or "Invoice updated" (was sent) | `invoiceReceived` / `invoiceUpdated` | none |
| `InvoicesService.update` → sent → paid/overdue/cancelled | Customer | "Invoice paid" / "Invoice overdue" / "Invoice cancelled" | `invoicePaid` / `invoiceOverdue` / `invoiceCancelled` | the previous status must be `sent` |
| `InvoicesService.applyPayment` reaches total | Customer | "Invoice paid" / "Invoice <no> is now marked as paid. Thank you!" | `invoicePaid` | only when the status actually changes |
| `markOverdue` | Customer (each) + Staff (one) | "Invoice overdue"; staff body "An invoice is now overdue" / "N invoices are now overdue" | `invoiceOverdue` / `invoicesOverdue` | staff: `NotificationSettings.invoicesOverdue` |
| `InvoicesService.markOpened` | Staff | "Invoice read" / "<no> was opened" | `invoiceRead` | `NotificationSettings.invoicesRead` |
| `AppointmentsService.sendDueReminders` | Staff | "Appointment in <lead>" / "<customer> at HH:mm — <reason>" | `appointment` | `pushService.configured`, `appointmentReminders` |

Quote opens (`markOpened`) only write a `QUOTE_READ` audit entry. They send no push.

---

### Scheduled jobs (`@Cron`) in scope

| Job | File | Schedule | What it does |
|---|---|---|---|
| `InvoicesService.markOverdue` | `backend/src/invoices/invoices.service.ts:120` | `EVERY_HOUR` (also run on every `GET /invoices`) | sent + past due → overdue; staff and customer pushes. |
| `BoardingBookingsService.sendDuePreCheckIns` | `backend/src/boarding-bookings/boarding-bookings.service.ts:716` | `EVERY_HOUR` | Finds bookings with an invoice, no `preCheckInSentAt`, no `checkInAt`, and `startDate <= today + preCheckInDaysBefore` (string compare of `YYYY-MM-DD`). Calls `sendPreCheckIn` for each; errors are logged per booking. Archived bookings are not excluded. |
| `AppointmentsService.sendDueReminders` | `backend/src/appointments/appointments.service.ts:48` | `EVERY_5_MINUTES` | Skips when APNs is not configured or reminders are off. `lead = appointmentLeadMinutes \|\| 60`. Loads **every** appointment without `reminderSentAt` and keeps those where `now < date+time <= now+lead`. Dispatches a staff push and stamps `reminderSentAt`. |

Other crons in the codebase (`notification.service.ts` daily digest, training, policies, risk assessments) are outside this scope.

---

### Tests

| Spec | Covers |
|---|---|
| `backend/src/quotes/quotes-visit-plan.spec.ts` | `QuotesService.createBookingsFromVisitPlan` (private, called by cast) against `mongodb-memory-server`. **Case 1:** a 5-day plan (Wed 23 – Sun 27 Dec 2026) with 2 pets, first and last day 1 visit, middle days 2. It checks: one row per day carrying both pets; weekday, bank holiday (25 Dec) and weekend products resolved correctly; the unmapped Saturday 2-visit combination skipped (4 rows); first day `visitTime='PM'` and last day `'AM'`; `customer`, `invoice` and `quantity=1` set. **Case 2:** a quote with no visit plan creates nothing. |

Other notes:

- The spec builds `QuotesService` with **12** positional arguments, while the constructor now declares **13** (`boardingBookingsService` was added last). Under `ts-jest`'s default type checking (`backend/package.json` `jest.transform`), this may fail with TS2554. Not verified: dependencies are not installed in this checkout.
- The first test's title says "one booking per animal per day", but its assertions check one booking **per day** covering every animal.
- No spec exists for any other module in this scope: invoices, payments, credit notes, bank accounts, reports, boarding bookings, `computeBoardingPlan` or the PDF util.
- The only other spec in the backend, `backend/src/pre-boarding/pre-boarding.service.spec.ts`, is outside this scope.

---

### Suggested improvements (bookings & finance)

**Correctness and data integrity**

1. **Credit note against an unpaid invoice inflates `amountPaid` on removal.**
   - `CreditNotesService.create` calls `reversePayment`, which clamps `amountPaid` at 0. `remove` then calls `applyPayment(+amount)` without clamping.
   - So issuing and then deleting a £50 credit note on an invoice with £0 paid leaves `amountPaid = 50`, which can also mark the invoice paid.
   - Fix: store the amount actually reversed on the credit note and re-apply only that (`backend/src/credit-notes/credit-notes.service.ts`).
2. **Credit notes model refunds, not credits.** A credit note on an invoice *increases* the balance due. Consider a separate `creditedAmount` on `Invoice`, so `balanceDue = total − amountPaid − creditedAmount`, plus a distinct "refund" document. This affects `invoice-pdf.util.ts` `buildPdfVars` and `boarding-bookings.service.ts` `computeStages`.
3. **No transactions around multi-document money operations.** `PaymentsService.create/update/remove`, `CreditNotesService`, `BankTransfersService.update` and `BoardingBookingsService.remove` (deleteAll) each make several separate writes. Wrap them in `connection.startSession().withTransaction()`; this needs a replica set.
4. **`BankTransfersService.update` reverses balances before validating `from !== to`** (`backend/src/bank-transfers/bank-transfers.service.ts`). A rejected edit leaves both accounts out by the transfer amount. Validate first.
5. **`BoardingBookingsService.amendDates` deletes the stay before validating the new total** (lines 500-545). If the new total is below `amountPaid`, or no products resolve, it throws after the new rows are already saved. The old rows are gone and `booking.stayId` still points at them. Compute the plan with `computeBoardingPlan` (or a dry run) first, and swap rows only when it passes.
6. **`PaymentsService.create` has no overpayment or status guard.** It accepts payments against `cancelled` or `draft` invoices, and amounts above the balance. `applyPayment` can then push "Invoice paid" for a draft the customer never received. Add checks in `backend/src/payments/payments.service.ts`.
7. **`PATCH /invoices/:id` with `status: 'paid'` leaves `amountPaid` unchanged**, so `balanceDue` on the PDF stays non-zero while the PAID stamp shows. Also, editing `lineItems` never re-checks paid versus total. Re-evaluate status in `InvoicesService.update`, or restrict which statuses can be set by hand.
8. **The bank account delete guard ignores transfers** (`BankAccountsService.remove`). `getTransactions` then dereferences `from._id` on a null populated account. Add a `bankTransferModel.countDocuments({$or:[{fromAccount:id},{toAccount:id}]})` blocker.
9. **`QuotesService.remove` has no guard** even when `quote.invoice` or a `BoardingBooking.quote` points at the quote. Add a `describeBlockers` check like the one in `InvoicesService.remove`.
10. **Quotes never expire.** `QuoteStatus.EXPIRED` is checked in `acceptAndConvert` but never set. Add an hourly `@Cron` (like `markOverdue`) to flip `sent` quotes with `validUntil < now` to `expired`, or check `validUntil` inside `acceptAndConvert`.
11. **Appointment reminders don't reset when the date changes.** `AppointmentsService.update` keeps `reminderSentAt`. Clear it when `date` or `time` changes. Also, the cron loads every unreminded appointment ever created; add a `date: {$gte: startOfToday}` filter to the query.
12. **Day-care second-dog pricing is unused.** `DayBookingsService.createDayCareStay` gives every dog `dayCareHalfDayProduct`/`dayCareFullDayProduct`, while `VisitMapping` defines `dayCareSecondDog*` slots. Apply them to `dogIndex === 1`, as boarding does.
13. **The legacy `Booking.status` and `PATCH /invoices` status accept any transition.** Add explicit transition maps in the services.
14. **`formatDocumentNumber` uses `new Date().getFullYear()`**, not the document's issue date, and the sequence never resets. Decide whether `{seq}` should reset yearly, and pass the issue date in (`backend/src/common/document-number.util.ts`).
15. **The Reports month key may disagree with the fill cursor.** `ReportsService` groups by `$dateToString` (UTC by default) while it fills months from a local-time cursor. Pass `timezone: 'Europe/London'` to `$dateToString` (`backend/src/reports/reports.service.ts`).
16. **`createDirect` writes no audit entry**, while `createFromQuote` does, and `amendDates` passes the hard-coded actor `'Staff'`. Thread the actor through `BoardingBookingsController.amendDates` and record `BOOKING_CREATED`/`BOOKING_UPDATED`.

**Security and permissions**

17. **Public invoice and quote routes use the ObjectId as the token** (`GET /invoices/:id/public`, `/quotes/:id/public`, `POST /quotes/:id/accept|reject`). ObjectIds are partly predictable (timestamp plus counter). Add a random `publicToken` field and build `{{invoice_link}}`/`{{quote_link}}` from it (`invoices.service.ts`, `quotes.service.ts`, `payments.service.ts`). The public routes also return the full populated customer address and phone.
18. **Several money-moving routes have no permission gate:**
    - `POST/PATCH /bank-accounts` and `PATCH /bank-accounts/:id/opening-balance`, which can rewrite `currentBalance`;
    - `POST /payments`, `POST /credit-notes`, `POST /bank-transfers`, `POST|PATCH /expenses`.
    Consider `financial.manage` on these, at least on opening-balance.
19. **Observation deletes are ungated.** `DELETE /boarding-bookings/:bookingId/observations/:id` has no `@RequirePermission`, unlike the other booking deletes.

**Performance**

20. **`GET /invoices` runs `markOverdue()`, including customer pushes, on every list fetch.** The hourly cron already covers this. Consider dropping it from `findAll`, or keeping just the cheap `updateMany` without notifications.
21. **`GET /expenses` returns base64 `receipt` blobs**, and `GET /boarding-bookings` populates whole invoices. Use `.select('-receipt')` in `ExpensesService.findAll` and expose the receipt on `findOne` only.
22. **Missing indexes for common queries:** add `{stayId:1}` on `BoardingBooking` (`findByStayId`), `{invoice:1}` on `CreditNote` and `DayBooking`, `{account:1, date:1}` on `Payment`/`Expense`/`CreditNote` (statement aggregations), and `{status:1, dueDate:1}` on `Invoice` (`markOverdue`).

**Feature ideas grounded in the current code**

23. **Capacity and availability enforcement.** Add a configurable kennel and day-care capacity per day, and check it in `DayBookingsService.createBoardingStay/createDayCareStay` against `DayBooking.countDocuments({date, boardingStay})`. Reject dates that overlap `AnnualLeave`, and products whose `availability` doesn't match the day type (weekday, weekend, or bank holiday from `BankHoliday`).
24. **Bank-holiday surcharge for boarding and day care.** At the moment only Visits switch product on bank holidays (`createBookingsFromVisitPlan`). Add a surcharge product slot to `VisitMapping`, applied in `computeBoardingPlan` for bank-holiday day offsets.
25. **Server-side Generate Invoices endpoint.** Move the grouping logic from `admin/src/components/GenerateInvoicesModal.tsx` to `POST /invoices/generate?month=` in one transaction, so a failure part-way through cannot leave rows half-linked.
26. **Automatic deposit chasing and reminders.** Add a cron, similar to `sendDuePreCheckIns`, that re-sends `deposit_request` or a new `payment_reminder` trigger N days before `dueDate` for sent or overdue invoices with `amountPaid < total`.
27. **Accounts-receivable and aging report.** Add `/reports/aged-debtors`, bucketing unpaid invoices by days overdue, beside the cash-based `incomeVsExpenses`.
28. **Online payment.** `{{invoice_link}}` already reaches a public page. Adding a card-payment provider there, recording into `PaymentsService.create` through a webhook, would remove manual bank-transfer matching.
29. **Use `BusinessInfo.logoImage` in server PDFs.** It is used in emails, but `buildInvoicePdfBuffer` always uses the bundled `INVOICE_LOGO_DATA_URL`. Also add a Discount column to the PDF item table, since the line total already applies the discount.
30. **Test coverage.** Add specs for:
    - `computeBoardingPlan`: the 12h and 24h boundaries, the 2nd-dog rate, placeholders;
    - `automaticStatusLabel`/`effectiveOverride`;
    - `applyPayment`/`reversePayment`;
    - `CreditNotesService` round-trips (this would catch item 1);
    - `BankAccountsService.getTransactions`;
    - `ReportsService`.

    Fix the `quotes-visit-plan.spec.ts` constructor arity at the same time.

### Communications & compliance modules

This section covers these `backend/src` modules: `email-messages/`, `email-groups/`, `messages/`, `crm/`, `enquiries/`, `forms/`, `form-submissions/`, `pre-boarding/`, `checklists/`, `risk-assessments/`, `policies/`, `staff-training/`. It also covers the email pipeline that lives in `settings/`, because every module sends email through it.

**How auth works on these routes.** Three global guards are registered in `backend/src/app.module.ts`:

1. `JwtAuthGuard` (`auth/jwt-auth.guard.ts`). Every route needs a staff JWT unless it is marked `@Public()`.
2. `PermissionsGuard` (`auth/permissions.guard.ts`). On every non-public route it loads the `Staff` record and rejects locked accounts. On routes marked `@RequirePermission(key)` it also checks the permission. Access is granted when:
   - `staff.isBreakGlass` is true, or
   - the staff member has no role, or
   - `role.permissions` includes the required key.
3. `ThrottlerGuard`, with a global limit of 300 requests per 60 s. Some routes set a stricter `@Throttle` of their own.

In the tables below, **"Staff JWT"** means "logged in, no extra permission". A permission key such as **`settings.manage`** is the one the route requires. **"Public"** means `@Public()`, with no auth at all.

---

### Email sending

#### Transport: Microsoft Graph `sendMail` (HTTP API). No SMTP, no SDK.

- The backend has **no mail library at all**: no nodemailer, SendGrid, Resend, SES or SMTP. `backend/package.json` contains no mail dependency.
- Every outgoing email ends in one private method, `SettingsService.graphSendMail()` (`backend/src/settings/settings.service.ts`). It uses the global `fetch` to call:
  - `POST https://graph.microsoft.com/v1.0/users/{fromAddress}/sendMail`
  - with header `Authorization: Bearer <token>`
  - and body `{ message, saveToSentItems: true }`. Every sent email therefore also appears in the Sent Items folder of the sending mailbox.
- **Auth** uses the OAuth2 client-credentials flow (application-only). `SettingsService.getAccessToken()` calls `POST https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token` with:
  - `grant_type=client_credentials`
  - `scope=https://graph.microsoft.com/.default`
  - `client_id`, `client_secret`
  - The Azure app needs the **application** permission `Mail.Send` with admin consent. The setup steps are in `admin/README.md`, section "Sending email via Microsoft 365".
- **A new access token is requested for every single email.** Tokens are not cached.
- The message shape:
  - `subject`
  - `body: { contentType: 'Text' | 'HTML', content }`. Only the test email uses `Text`; everything else uses `HTML`.
  - `toRecipients: [{ emailAddress: { address: to } }]`. There is always exactly **one** recipient. No CC or BCC is ever used.
  - `from: { emailAddress: { address: fromAddress } }`
  - An optional single `attachments[0]` of type `#microsoft.graph.fileAttachment`:
    - `contentType` is hard-coded to `application/pdf`;
    - `contentBytes` is the base64 data with any `data:...;base64,` prefix stripped.

#### Where the configuration lives

| Setting | Stored in | Notes |
|---|---|---|
| `tenantId`, `clientId`, `fromAddress`, `fromName` | Mongo collection for `EmailSettings` (`settings/schemas/email-settings.schema.ts`). Holds a single document. | Edited via `PATCH /settings/email` (`settings.manage`). `fromName` is saved but **never used** by `graphSendMail()`. |
| `clientSecretEncrypted` | Same document | Encrypted by `EncryptionService` (`common/encryption/encryption.service.ts`): AES-256-GCM, key = `scryptSync(ENCRYPTION_KEY, 'pawfectpets-field-encryption', 32)`, stored as `iv:authTag:ciphertext` in hex. `GET /settings/email` returns only `clientSecretConfigured: boolean`. If decryption fails, the error asks staff to re-enter the secret. |
| Templates | `EmailTemplate` collection (`settings/schemas/email-template.schema.ts`) | One document per `trigger`, enforced by a unique index. Fields: `label?`, `name`, `subject`, `body`. Managed via `GET /settings/email-templates`, `PUT/DELETE /settings/email-templates/:trigger` (`settings.manage`). |
| Branding values | `BusinessInfo` document | Supplies `businessName/Address/Town/Postcode/Telephone/Email/Website` and the logo. |
| `PUBLIC_API_URL` (env) | `common/tracking-pixel.util.ts → publicApiUrl()` | Absolute base URL for tracking pixels and the logo `<img>`. Falls back to `http://localhost:$PORT`. |
| `PUBLIC_INTAKE_URL` (env) | `publicFrontendUrl()` | Base URL for links in emails (`/intake/:id`, `/forms/:id`, `/pre-boarding/:id`, `/invoices/:id`, `/quotes/:id`). Falls back to `http://localhost:5173`. |
| `ENCRYPTION_KEY` (env) | `EncryptionService.onModuleInit` | The app refuses to boot without it. |

`getSendableSettings()` throws `400 "Email sending isn't set up yet..."` unless `tenantId`, `clientId`, `clientSecretEncrypted` and `fromAddress` are all set.

#### Email triggers (`EmailTrigger` enum)

`registration`, `update_info`, `add_pet`, `invoice`, `quote`, `payment_received`, `form`, `deposit_request`, `portal_login_code`, `portal_password_reset`, `portal_enabled`, `post_registration`, `form_copy`, `booking_confirmation`, `generic`, `pre_boarding`.

Only `pre_boarding` has a template seeded at boot, by `PreBoardingService.onModuleInit()`. It is an `$setOnInsert` upsert. A second step upgrades an untouched copy of the older `{{dog_names}}` template.

Every other trigger fails with `400 "No email template is set up for this yet -- add one in Settings > Email Templates first."` until staff create its template.

#### The three public send methods on `SettingsService`

| Method | Template? | Body | Used by |
|---|---|---|---|
| `sendTestEmail(dto)` | No | Hard-coded plain text. Subject: "PawfectPets Sherborne — test email". | `POST /settings/email/test` |
| `sendDirectEmail(to, subject, html, attachment?)` | No | Caller's HTML, wrapped in `<div style="max-width:600px;margin:0 auto;">` | `ProductsService.emailPriceList` |
| `sendTemplatedEmail(trigger, to, vars, rawVars = {}, appendHtml = '', attachment?)` | Yes | Rendered template (see the steps below) | Every other call site |
| `sendTriggeredEmail(dto)` | Yes (wraps `sendTemplatedEmail`) | Adds an audit-log tracking pixel and rewrites links | `POST /settings/email/send`, `CustomersService.createLead`, `BoardingBookingsService.sendPreCheckIn` |

How `sendTemplatedEmail()` renders an email:

1. Loads `EmailTemplate` by `trigger`. Throws 400 if none exists.
2. Loads `getBusinessInfo()`. Merges the `business*` variables with the caller's `vars`; the caller's values win.
3. Adds `rawVars.logo`, set to `<img src="${PUBLIC_API_URL}/settings/business/logo" ...>`. The logo is served by `GET /settings/business/logo` (Public, `Cache-Control: public, max-age=3600`), because Gmail strips `data:` URIs.
4. `interpolateSubject()`:
   - strips `{{#if key}}…{{/if}}` blocks whose variable is falsy;
   - replaces `{{key}}` with the raw value (no escaping in the subject).
5. `interpolateBody()` with `htmlBody = true`, which is hard-coded for every trigger:
   - same conditional stripping as the subject;
   - `{{key}}` → `rawVars[key]` as-is when the key is in `rawVars`, otherwise `escapeHtml(vars[key])`.
6. Final body = `<div style="max-width:600px;margin:0 auto;">${rendered}</div>${appendHtml}`. `appendHtml` is the tracking pixel and is always appended, whatever the template contains.
7. `getSendableSettings()` → `getAccessToken()` → `graphSendMail(..., 'HTML', attachment)`.

`sendTriggeredEmail(dto)` adds these steps before calling `sendTemplatedEmail`:

- **Link rewriting.**
  - `add_pet` with a `customerId`: link becomes `${PUBLIC_INTAKE_URL}/intake/{customerId}/add-pet`.
  - `form`: the caller's URL is kept, but its host is swapped to `PUBLIC_INTAKE_URL`.
- **Activity entry.** When `customerId` is given and the trigger has a title pair, it creates an `AuditLogEntry` first, before the email goes out:
  - type `REGISTRATION_EMAIL_SENT`
  - title such as "Registration email sent"
  - `readTitle` such as "Registration email read"
  - Title pairs exist for `registration`, `update_info`, `add_pet` and `form`. For `form` with a `formName`, the titles become "`<formName>` form email sent" and "`<formName>` form email read".
- Appends a tracking pixel pointing at `${PUBLIC_API_URL}/audit-log/{entryId}/pixel.gif`.
- Template variables passed: `{ name, link, form_name }`.
- Returns `{ entryId }`, so the admin can later attach a PDF snapshot to the same entry via `CustomersService.logFormSnapshot`.

#### Open tracking (tracking pixels)

`common/tracking-pixel.util.ts` provides two helpers:

- `transparentGifBuffer()` returns a 1×1 transparent GIF.
- `trackingPixelHtml(url)` returns `<img src=url width=1 height=1 style="display:none;...">`.

| Pixel route (all `@Public()`) | Embedded by | Effect when loaded (first open only) |
|---|---|---|
| `GET /email-messages/:id/recipients/:recipientId/pixel.gif` | `EmailMessagesService.send` (one URL per recipient) | `updateOne` sets `recipients.$.openedAt`, guarded by `openedAt: {$exists:false}` |
| `GET /audit-log/:id/pixel.gif` | `sendTriggeredEmail`, `InvoicesService.requestDeposit`, `requestFullPayment` | `AuditLogService.markOpened` sets `openedAt` on the entry. If the entry has a `readTitle`, it also records an `EMAIL_READ` entry with actor `'Customer'`. |
| `GET /invoices/:id/pixel.gif` | `InvoicesService.sendEmail` | `InvoicesService.markOpened` sets `invoice.openedAt` and records `INVOICE_READ` |
| `GET /quotes/:id/pixel.gif` | `QuotesService.sendEmail` | `QuotesService.markOpened` sets `quote.openedAt` and records `QUOTE_READ` |

All pixel handlers:

- swallow errors with `.catch(() => {})`;
- always return the GIF;
- send `Cache-Control: no-store, no-cache, must-revalidate`.

Emails with **no** pixel: test email, price list, booking confirmation, payment received (all three variants), post-registration copy, form copy, portal login/reset/enabled, pre-boarding, policy email, risk assessment email.

#### Failures and retries

- **No queue, no retry, no outbox.** Every send runs synchronously inside the HTTP request, or inside the cron for pre-check-ins. A Graph error (`!res.ok`) becomes `BadRequestException(error.message || 'Microsoft Graph rejected the send request.')`.
- Token failure → `BadRequestException(error_description || 'Microsoft rejected the tenant ID, client ID, or client secret.')`.
- **Best-effort (errors swallowed):**
  - `PaymentsService.create`: empty `catch {}`.
  - `CustomersService.createLead`: `console.error`.
  - `PortalService.setPortalActive`: `console.error`.
  - `BoardingBookingsService.sendDuePreCheckIns` (cron): `console.error` per booking. `preCheckInSentAt` is only set after a successful send, so the hourly cron **effectively retries** every hour until the send succeeds. Each failed attempt has already saved a new pending `FormSubmission` and, through `sendTriggeredEmail`, an Activity entry, so each retry leaves another orphan behind.
- **Per-recipient failure capture:** `EmailMessagesService.send` catches each recipient's error. It sets `recipient.status = 'failed'` and `recipient.reason = err.message`, and the other recipients are still sent.
- **Errors propagate to the caller** for every other call site.
- Order of side effects: in `sendTriggeredEmail`, `requestDeposit` and `requestFullPayment` the "sent" Activity entry is created **before** the email is attempted. If Graph fails, the Activity feed still says "... sent".

#### Sequence: a templated send with open tracking (e.g. `POST /settings/email/send`)

```mermaid
sequenceDiagram
    autonumber
    participant Admin as Admin / Staff app
    participant SC as SettingsController
    participant SS as SettingsService
    participant AL as AuditLogService
    participant DB as MongoDB
    participant AAD as login.microsoftonline.com
    participant Graph as graph.microsoft.com
    participant Client as Recipient mail client

    Admin->>SC: POST /settings/email/send {trigger,to,name,link,customerId?,formName?}
    SC->>SS: sendTriggeredEmail(dto)
    SS->>SS: rewrite link host to PUBLIC_INTAKE_URL (add_pet / form)
    alt customerId and trigger has a title pair
        SS->>AL: record(REGISTRATION_EMAIL_SENT, sent title, readTitle)
        AL->>DB: insert AuditLogEntry
        SS->>SS: appendHtml = pixel(PUBLIC_API_URL/audit-log/entryId/pixel.gif)
    end
    SS->>DB: EmailTemplate.findOne({trigger})
    SS->>DB: BusinessInfo.findOne()
    SS->>SS: interpolateSubject / interpolateBody (+logo, escape vars)
    SS->>DB: EmailSettings.findOne() then decrypt clientSecret
    SS->>AAD: POST /tenantId/oauth2/v2.0/token (client_credentials)
    AAD-->>SS: access_token
    SS->>Graph: POST /v1.0/users/fromAddress/sendMail {message, saveToSentItems:true}
    alt res.ok
        Graph-->>SS: 202 Accepted
        SS-->>Admin: {entryId}
    else error
        Graph-->>SS: error JSON
        SS-->>Admin: 400 BadRequest (Graph error message)
    end
    Client->>SC: GET /audit-log/entryId/pixel.gif (Public)
    SC->>AL: markOpened(entryId) first open only
    AL->>DB: set openedAt and insert EMAIL_READ entry (readTitle)
    SC-->>Client: 1x1 GIF (no-store)
```

#### Every email-sending call site in `backend/src`

| # | File : function | Trigger (HTTP route / job) | Recipient | Template / body | Tracking | Attachment | On failure |
|---|---|---|---|---|---|---|---|
| 1 | `settings/settings.service.ts : sendTestEmail` | `POST /settings/email/test` (`settings.manage`) | `dto.to` | None. Hard-coded **plain text**. | – | – | Throws |
| 2 | `products/products.service.ts : emailPriceList` → `SettingsService.sendDirectEmail` | `POST /products/price-list/email` (Staff JWT, ungated) | `dto.recipientEmail`, typed in ad hoc | None. Hand-built HTML (logo, greeting, contact). Subject `"{business.name} — Price List"`. | – | Price list PDF (built client-side) | Throws |
| 3 | `settings/settings.service.ts : sendTriggeredEmail` | `POST /settings/email/send` (Staff JWT, ungated). Called by admin `RegistrationLinkModal`, "Request Update", `SendFormModal`, `AddPetChoiceModal`. | `dto.to` | `dto.trigger`. The DTO accepts **any** `EmailTrigger`. Variables: `name`, `link`, `form_name`. | Audit-log pixel when `customerId` is given and the trigger is registration/update_info/add_pet/form | – | Throws (the "sent" entry already exists) |
| 4 | `customers/customers.service.ts : createLead` → `sendTriggeredEmail` | `POST /customers/leads` (Staff JWT), unless `dto.sendEmail === false` | New lead's `dto.email` | `registration`, link `${PUBLIC_INTAKE_URL}/intake/{id}` | Audit-log pixel | – | Swallowed (`console.error`) |
| 5 | `boarding-bookings/boarding-bookings.service.ts : sendPreCheckIn` → `sendTriggeredEmail` | `POST /boarding-bookings/:id/send-pre-check-in` (Staff JWT) **and** hourly cron `sendDuePreCheckIns` | Booking customer's email | `form`, `formName = "Pre-check-in ({booking.reference})"`, link `${PUBLIC_INTAKE_URL}/forms/{submissionId}` | Audit-log pixel | – | Manual: throws. Cron: logged and retried next hour. |
| 6 | `boarding-bookings/boarding-bookings.service.ts : sendConfirmation` | `POST /boarding-bookings/:id/send-confirmation` (Staff JWT) | Booking customer | `booking_confirmation`. Variables: `name`, `booking_reference`, `booking_type`, `pet_names`, `drop_off`, `pick_up`. | – (Activity "Booking confirmation emailed" recorded **after** the send) | Confirmation PDF | Throws |
| 7 | `invoices/invoices.service.ts : sendEmail` | `POST /invoices/:id/send` (Staff JWT) | Invoice customer | `invoice`. Variables: `customer_*`, `subject`, `invoice_number`, `invoice_date`, `due_date`, `payment_terms`, `subtotal`, `total`, `invoice_link`, `bank_name`, `sort_code`, `account_number`. rawVars: `items_table`. | `/invoices/:id/pixel.gif` | – | Throws |
| 8 | `invoices/invoices.service.ts : requestDeposit` | `POST /invoices/:id/request-deposit` (Staff JWT); `POST /boarding-bookings/:id/request-payment {type:'deposit'}` | Invoice customer | `deposit_request`. Variables: `deposit_percentage`, `deposit_amount`, `remaining_balance`, `invoice_total`, etc. | Audit-log pixel ("Deposit request read") | – | Throws (DEPOSIT_REQUESTED entry already written) |
| 9 | `invoices/invoices.service.ts : requestFullPayment` | `POST /boarding-bookings/:id/request-payment {type:'full'}` | Invoice customer | `deposit_request` with `deposit_percentage='100'` and `remaining_balance='0.00'` | Audit-log pixel ("Payment request read") | – | Throws |
| 10 | `quotes/quotes.service.ts : sendEmail` | `POST /quotes/:id/send` (Staff JWT) | `customer.email`, or `quote.manualCustomerEmail` | `quote` (quote_* variables + `items_table`) | `/quotes/:id/pixel.gif` | – | Throws |
| 11 | `payments/payments.service.ts : create` | `POST /payments` (Staff JWT), unless `dto.skipThankYouEmail` | Invoice customer | `payment_received` (`paymentEmailVars`) | – | – | Swallowed (empty catch) |
| 12 | `payments/payments.service.ts : sendReceivedEmail` | `POST /payments/:id/send-email` (Staff JWT) | Invoice customer | `payment_received` | – | – | Throws |
| 13 | `payments/payments.service.ts : sendReceipt` | `POST /payments/:id/send-receipt` (Staff JWT) | Invoice customer | `payment_received` | – | Receipt PDF | Throws |
| 14 | `customers/customers.service.ts : sendRegistrationCopy` | `POST /customers/:id/send-registration-copy` (**Public**, `@Throttle` 5 per 60 s) | `customer.email` from the record | `post_registration` (`name`) | – | Registration PDF from the intake app | Throws |
| 15 | `portal/portal.service.ts : issueCode` (via `requestCode` / `adminSendReset`) | `POST /portal/request-code` and `POST /portal/request-reset` (Public, throttled 5 per 60 s); `POST /customers/:id/portal/reset` (Staff JWT) | Customer email | `portal_login_code` / `portal_password_reset`. Variables: `customer_name`, `code` (6 digits). | – | – | Public routes always return 200 for unknown emails |
| 16 | `portal/portal.service.ts : setPortalActive` | `PATCH /customers/:id/portal` (Staff JWT), only on the first `false → true` switch | Customer email | `portal_enabled` (`customer_name`) | – | – | Swallowed (`console.error`) |
| 17 | `form-submissions/form-submissions.service.ts : sendCopy` | `POST /form-submissions/:id/send-copy` (Staff JWT) | `submission.recipientEmail` | `form_copy` (`name`, `form_name`) | – (Activity "Form copy emailed" recorded after the send, if a customer is set) | Submission PDF | Throws |
| 18 | `pre-boarding/pre-boarding.service.ts : send` | `POST /pre-boarding/:id/send` (Staff JWT) | `form.email` | `pre_boarding` (`name`, `link = ${PUBLIC_INTAKE_URL}/pre-boarding/{id}`, `dog_names`) | – | – | Throws. `lastEmailedAt` is set only on success. |
| 19 | `email-messages/email-messages.service.ts : send` | `POST /email-messages` (Staff JWT, ungated) | Each customer resolved from `customerIds` ∪ members of `groupIds`. One email per recipient. | `generic`. Variables: `name`, `campaignSubject`. rawVars: `emailBodyText = dto.bodyHtml` (raw HTML). | Per-recipient pixel | – | Per recipient: `status='failed'`, `reason` |
| 20 | `policies/policies.service.ts : sendPolicyEmail` | `POST /policies/:id/send-email` (`bookings.manage`) | `dto.email` (any address) | `generic`, `name='there'`, `campaignSubject=policy.name`, `emailBodyText` = heading + meta + **raw `current.content` HTML** | – | – | Throws. Audit entry "Emailed" recorded after the send. |
| 21 | `risk-assessments/risk-assessments.service.ts : sendRiskAssessmentEmail` | `POST /risk-assessments/:id/send-email` (`bookings.manage`) | `dto.email` (any address) | `generic`, `campaignSubject=assessment.name`, `emailBodyText` = escaped header + risk table (columns: Hazard, Who, Controls, Further Actions, L, S, Score = L×S, Residual) | – | – | Throws. Audit entry "Emailed" recorded after the send. |

The subject of the `generic` template must reference `{{campaignSubject}}`. Otherwise every bulk, policy and risk-assessment email goes out with the template's fixed subject.

---

### Controllers (exhaustive route tables)

#### `EmailMessagesController` — `/email-messages` (`email-messages/email-messages.controller.ts`)

| Method | Path | Auth / permission | Purpose |
|---|---|---|---|
| GET | `/email-messages` | Staff JWT | List every bulk email, newest first. Populates `recipients.customer` (name, email) and `sentBy` (name). |
| GET | `/email-messages/:id` | Staff JWT | One bulk email with its recipients. 404 if missing. |
| POST | `/email-messages` | Staff JWT (deliberately ungated, "same as /push-messages") | Compose and send. Body `{subject, bodyHtml, customerIds?, groupIds?}`. Expands groups, de-duplicates ids, saves the record, then sends one `generic` email per recipient. |
| DELETE | `/email-messages/:id` | Staff JWT | Deletes the record. Emails already sent cannot be recalled. |
| GET | `/email-messages/:id/recipients/:recipientId/pixel.gif` | **Public** | Open-tracking pixel. Stamps the recipient's `openedAt` on first open. |

#### `EmailGroupsController` — `/email-groups` (`email-groups/email-groups.controller.ts`)

| Method | Path | Auth / permission | Purpose |
|---|---|---|---|
| GET | `/email-groups` | Staff JWT | List groups sorted by name. Populates `customers` (name, email). |
| GET | `/email-groups/:id` | Staff JWT | One group. |
| POST | `/email-groups` | Staff JWT | Create `{name, customers?: ObjectId[]}`. Mongo error 11000 → 409 "A group named ... already exists." |
| PATCH | `/email-groups/:id` | Staff JWT | Rename or replace the member list. Duplicate name → 409. |
| DELETE | `/email-groups/:id` | Staff JWT | Delete the group. Customers are untouched. |

#### `MessagesController` — `/messages`, staff side (`messages/messages.controller.ts`)

| Method | Path | Auth / permission | Purpose |
|---|---|---|---|
| GET | `/messages/conversations` | Staff JWT | Aggregation, one row per customer: `customerId, name, email, lastBody, lastAt, lastSender, unread` (customer messages with `readByStaff=false`). Sorted by `lastAt` descending. |
| GET | `/messages/unread-count` | Staff JWT | `{count}` of customer messages not yet read by staff. |
| GET | `/messages/:customerId` | Staff JWT | Opens a thread. Marks all of that customer's messages `readByStaff=true`, then returns the thread oldest first. |
| POST | `/messages/:customerId` | Staff JWT | Staff reply `{body ≤ 5000}`. `sender='staff'`, `senderName = JWT user.name`. Calls `CustomerNotificationsService.record(customerId,'New message',body,'message')`, which writes the bell-feed item and pushes to the customer's devices. |
| DELETE | `/messages/:customerId/:messageId` | Staff JWT | Moderation: delete any message by id. `customerId` in the path is **not checked**. |

#### Portal message routes — customer side (`portal/portal.controller.ts`, class-level `@Public()` plus `@UseGuards(PortalJwtGuard)` on each route)

| Method | Path | Auth / permission | Purpose |
|---|---|---|---|
| GET | `/portal/messages` | Customer portal JWT | Marks staff messages `readByCustomer=true`, then returns the thread. |
| GET | `/portal/messages/unread-count` | Customer portal JWT | Count of staff messages with `readByCustomer=false`. |
| POST | `/portal/messages` | Customer portal JWT | Customer message. `sender='customer'`, `senderName=customer.name`. Calls `NotificationService.dispatch('New message', '<name>: <first 80 chars>…', 'message')`, which writes the admin feed and pushes to all staff devices. |
| DELETE | `/portal/messages/:id` | Customer portal JWT | A customer may delete only their **own** messages in their own thread. A staff message gives 403; a message from another thread gives 404. |

#### `CrmController` — `/crm/activities` (`crm/crm.controller.ts`)

| Method | Path | Auth / permission | Purpose |
|---|---|---|---|
| POST | `/crm/activities` | Staff JWT | Create a note, call, email, task or status-change record. Sets `attachmentCount` and `attachmentsCompressed=true`. |
| GET | `/crm/activities?customer=<id>` | Staff JWT | List (optionally for one customer), newest first. **Excludes `attachments`**. Populates the customer's name and email. |
| GET | `/crm/activities/:id` | Staff JWT | One activity, **with** its attachments. |
| PATCH | `/crm/activities/:id` | Staff JWT | Partial update. Recomputes `attachmentCount` when `attachments` is sent. |
| DELETE | `/crm/activities/:id` | `customers.manage` | Delete. |

#### `EnquiriesController` — `/enquiries` (`enquiries/enquiries.controller.ts`)

| Method | Path | Auth / permission | Purpose |
|---|---|---|---|
| POST | `/enquiries` | Staff JWT (not public) | Log a prospect's enquiry. |
| GET | `/enquiries` | Staff JWT | List, newest first. |
| DELETE | `/enquiries/:id` | Staff JWT | Delete. |

There is no PATCH or GET-by-id, and no status field.

#### `FormsController` — `/forms` (`forms/forms.controller.ts`)

| Method | Path | Auth / permission | Purpose |
|---|---|---|---|
| POST | `/forms` | `settings.manage` | Create a form `{name, description?, customerVisible?, fields[]}`. `fields` is only checked to be an array. |
| GET | `/forms` | Staff JWT (ungated so any staff member can pick a form to send) | List, newest first. |
| GET | `/forms/:id` | Staff JWT | One form. |
| PATCH | `/forms/:id` | `settings.manage` | Update (`findByIdAndUpdate`). |
| DELETE | `/forms/:id` | `settings.manage` | Delete. Existing submissions keep their snapshot. |

#### `FormSubmissionsController` — `/form-submissions` (`form-submissions/form-submissions.controller.ts`)

| Method | Path | Auth / permission | Purpose |
|---|---|---|---|
| POST | `/form-submissions` | Staff JWT | "Generate a link". Body `{form, customer?, animals?[], recipientEmail, recipientName?}`. Snapshots the form. With 2+ animals, wraps the fields per pet. **Sends no email**; the admin sends it afterwards via `POST /settings/email/send` with trigger `form`. |
| GET | `/form-submissions?customer=<id>` | Staff JWT | List, newest first. Populates customer, animal and animals. |
| GET | `/form-submissions/:id` | Staff JWT | `findOneForStaff`: the snapshot with `{{token}}` labels resolved. |
| PATCH | `/form-submissions/:id` | Staff JWT | Edit `recipientName` / `recipientEmail`. Allowed in any status. |
| DELETE | `/form-submissions/:id` | Staff JWT | Delete the record only. Customers and animals it created are kept. |
| POST | `/form-submissions/:id/send-copy` | Staff JWT | Email a client-built PDF of the submission (`form_copy`). |
| GET | `/form-submissions/:id/public` | **Public** | The fill page's data: `{_id, formName, formDescription, fields (mapping stripped, placeholders and pet options resolved), status, recipientName, answers}`. |
| POST | `/form-submissions/:id/submit` | **Public** | Customer submission `{answers}`. Validates, writes Customer and Animal records, marks the submission completed, records `FORM_SUBMITTED`. |

#### `PreBoardingController` — `/pre-boarding` (`pre-boarding/pre-boarding.controller.ts`)

| Method | Path | Auth / permission | Purpose |
|---|---|---|---|
| GET | `/pre-boarding/settings` | Staff JWT | `{maxScore, questions}`. Defaults are used when nothing is stored. |
| PUT | `/pre-boarding/settings` | `settings.manage` | Update `maxScore` (int ≥ 0) and/or `questions`. Each question is normalised and validated by `normaliseQuestion`. |
| POST | `/pre-boarding/settings/reset-questions` | `settings.manage` | Replace the stored questions with `DEFAULT_PRE_BOARDING_QUESTIONS`. |
| POST | `/pre-boarding` | Staff JWT | Create a questionnaire `{firstName, surname?, email, dogCount 1–10}`. Snapshots the active questions and `maxScore`. 400 if there are no active questions. |
| GET | `/pre-boarding` | Staff JWT | List, without `questionsSnapshot` or `answers`. |
| GET | `/pre-boarding/:id` | Staff JWT | Full record. Invalid ObjectId → 404. |
| DELETE | `/pre-boarding/:id` | Staff JWT | Delete. |
| POST | `/pre-boarding/:id/send` | Staff JWT | Email the link (`pre_boarding`). 400 if already completed. Sets `lastEmailedAt`. |
| GET | `/pre-boarding/:id/public` | **Public** | Owner view: questions **without `score` or `autoFail`**, plus `firstName`, `dogCount`, `dogNames`, `status`. |
| POST | `/pre-boarding/:id/submit` | **Public** | `{dogNames[], answers[]}`. Validates, scores each dog, sets `results`, `suitable`, `status=completed`. Returns `{ok:true}`. Scores are not returned. |

#### `ChecklistTemplatesController` — `/checklist-templates` (`checklists/checklists.controller.ts`)

| Method | Path | Auth / permission | Purpose |
|---|---|---|---|
| GET | `/checklist-templates` | Staff JWT | List templates by name. |
| POST | `/checklist-templates` | `settings.manage` | Create `{category: boarding\|dayCare, name, completeByTime?, items[≥1], autoAssign?}`. |
| PATCH | `/checklist-templates/:id` | `settings.manage` | Update. |
| DELETE | `/checklist-templates/:id` | `settings.manage` | Delete. Existing assignments keep their snapshot. |

#### `ChecklistAssignmentsController` — `/checklist-assignments` (same file)

| Method | Path | Auth / permission | Purpose |
|---|---|---|---|
| GET | `/checklist-assignments?from=YYYY-MM-DD&to=YYYY-MM-DD` | Staff JWT | Assignments with `date ≥ from` and `< to`, at local midnight. |
| POST | `/checklist-assignments` | Staff JWT | Assign `{template, date}`. Snapshots `name`, `items`, `category`, `completeByTime`. **No duplicate check** for manual assignment. |
| PATCH | `/checklist-assignments/:id/items/:index` | Staff JWT | Toggle item *index*. `completedBy[index] = JWT user.name` when ticked, `null` when unticked. |
| PATCH | `/checklist-assignments/:id` | Staff JWT | Update `notes`, or the sign-off `signatureImage`. `signedBy` and `signedAt` are set server-side; an empty string clears all three. |
| DELETE | `/checklist-assignments/:id` | Staff JWT | Delete. |

#### `RiskAssessmentsController` — `/risk-assessments` (`risk-assessments/risk-assessments.controller.ts`)

| Method | Path | Auth / permission | Purpose |
|---|---|---|---|
| GET | `/risk-assessments` | Staff JWT | List, oldest first (`createdAt` ascending). |
| GET | `/risk-assessments/:id` | Staff JWT | One assessment, including its risks and audit log. |
| POST | `/risk-assessments` | `bookings.manage` | Create. `raId = RA{n}` from `BusinessInfo.riskAssessmentNextNumber`. `assessmentDate` = today. Audit entry "Assessment Created". |
| PATCH | `/risk-assessments/:id` | `bookings.manage` | Update the header fields. Records the changed fields in the audit log. Going `live` (and not already live) with a `reviewFrequency` sets `nextReviewDate`. |
| DELETE | `/risk-assessments/:id` | `bookings.manage` | Delete. |
| POST | `/risk-assessments/:id/review` | `bookings.manage` | "Review Policy" sign-off. `nextReviewDate` = today + interval; resets `reviewDueNotified`. Audit entry "Policy Reviewed". |
| POST | `/risk-assessments/:id/risks` | `bookings.manage` | Add a risk item. Audit entry "Risk Item Added". |
| PATCH | `/risk-assessments/:id/risks/:riskId` | `bookings.manage` | Update a risk item. Audit entry "Risk Item Updated". |
| DELETE | `/risk-assessments/:id/risks/:riskId` | `bookings.manage` | Remove a risk item. Audit entry "Risk Item Removed". |
| POST | `/risk-assessments/:id/send-email` | `bookings.manage` | Email `{email}` a rendered summary (`generic`). Audit entry "Emailed". |

#### `PoliciesController` — `/policies` (`policies/policies.controller.ts`)

| Method | Path | Auth / permission | Purpose |
|---|---|---|---|
| GET | `/policies` | Staff JWT | List by name, including every version and its sign-offs. |
| GET | `/policies/staff` | Staff JWT | Active (non-locked) staff `{_id, name}`, for the sign-off picker. |
| GET | `/policies/:id` | Staff JWT | One policy. |
| POST | `/policies` | `bookings.manage` | Create with v1 content. `policyId = POL{n}`. Sign-offs default to all active staff. Status `draft` or `published`. |
| PATCH | `/policies/:id` | `bookings.manage` | Update metadata only (name, category, reference, reviewFrequency, status). First publish sets `nextReviewDate`. |
| DELETE | `/policies/:id` | `bookings.manage` | Delete. |
| POST | `/policies/:id/versions` | `bookings.manage` | Publish a new immutable version `{content, changeSummary?, signOffStaffIds?}`. Builds a fresh, all-unsigned set of sign-offs. Recomputes `nextReviewDate`. |
| POST | `/policies/:id/sign` | Staff JWT (self-service) | The caller signs the **latest** version `{signedName}`. 404 if they are not listed as a reviewer. Calling again is a no-op. |
| POST | `/policies/:id/remind` | `bookings.manage` | Stamps `reminderSentAt` on outstanding sign-offs and **broadcasts** a feed + push notification to all staff. 400 if nobody is outstanding. |
| POST | `/policies/:id/reset-to-v1` | `bookings.manage` | Drop every version after v1. Recomputes `nextReviewDate`. |
| POST | `/policies/:id/send-email` | `bookings.manage` | Email the latest version to `{email}` (`generic`). |
| PATCH | `/policies/:id/assign-users` | `bookings.manage` | Replace the reviewer list on the latest version `{staffIds}`. Rows for kept staff (including signatures) are preserved. |

#### `TrainingModulesController` — `/training/modules` (`staff-training/training-modules.controller.ts`)

| Method | Path | Auth / permission | Purpose |
|---|---|---|---|
| GET | `/training/modules` | `training.manage` | List modules (full, including `questionBank` with `correctIndex`). |
| GET | `/training/modules/staff` | `training.manage` | Active staff `{_id, name}`. |
| GET | `/training/modules/compliance` | `training.manage` | Flattened rows, one per module × assigned staff member, with the computed `status`. |
| GET | `/training/modules/:id` | `training.manage` | One module. |
| POST | `/training/modules` | `training.manage` | Create. `validateLiveReadiness` applies when the status is `live`. |
| PATCH | `/training/modules/:id` | `training.manage` | Update. Content blocks and the question bank are replaced wholesale. |
| DELETE | `/training/modules/:id` | `training.manage` | Delete the module **and all its `TrainingAttempt` documents**. |
| PATCH | `/training/modules/:id/assign-users` | `training.manage` | Merge-replace assignments `{staffIds}`. Kept staff keep their history. |
| PATCH | `/training/modules/:id/assign-all` | `training.manage` | Set `assignAllStaff` `{enabled}`. Enabling adds a row for every active staff member not yet assigned. |
| GET | `/training/modules/:id/attempts?staffId=` | `training.manage` | Attempt history, newest first. |
| GET | `/training/modules/:id/content/:blockId/file` | Staff JWT (ungated) | Streams a PDF block's bytes, `Content-Disposition: inline`. |

#### `MyTrainingController` — `/training/my` (`staff-training/my-training.controller.ts`)

| Method | Path | Auth / permission | Purpose |
|---|---|---|---|
| GET | `/training/my` | Staff JWT | `[{module, assignment, status}]` for live modules assigned to the caller. The question bank is excluded. |
| GET | `/training/my/:id` | Staff JWT | One assigned live module. 404 if it is not assigned to the caller. |
| POST | `/training/my/:id/start` | Staff JWT | Start an attempt. Picks `questionsPerAttempt` random questions and snapshots them. Returns `{attemptId, passMarkPercent, questions}` **without `correctIndex`**. |
| POST | `/training/my/attempts/:attemptId/submit` | Staff JWT | `{answers:number[]}`. Grades against the snapshot, updates the cached assignment, and returns the score plus a review that includes `correctIndex`. |

---

### Data model

All schemas use `@Schema({ timestamps: true })` (adding `createdAt` and `updatedAt`) unless marked *embedded*.

#### `EmailMessage` (`email-messages/schemas/email-message.schema.ts`)

| Field | Type | Required / default | Notes |
|---|---|---|---|
| `subject` | string | required | |
| `bodyHtml` | string | required | Rich HTML, inserted as `{{emailBodyText}}` |
| `recipients` | `EmailMessageRecipient[]` | required | Each embedded row has its **own `_id`** |
| `sentBy` | ObjectId → `Staff` | optional | |

*Embedded* `EmailMessageRecipient` (`@Schema()`, has `_id`, no timestamps):

| Field | Type | Notes |
|---|---|---|
| `customer` | ObjectId → `Customer`, required | |
| `email` | string, required | Snapshot taken at send time |
| `name` | string, required | Snapshot |
| `status` | enum `'sent' \| 'failed'`, required | Saved as `'sent'` up front, changed to `'failed'` on error |
| `reason` | string? | Error message |
| `openedAt` | Date? | First pixel load |

#### `EmailGroup` (`email-groups/schemas/email-group.schema.ts`)

| Field | Type | Notes |
|---|---|---|
| `name` | string, required, **unique** | |
| `customers` | ObjectId[] → `Customer`, default `[]` | Static, hand-picked membership |

#### `EmailSettings` and `EmailTemplate` (`settings/schemas/`)

- `EmailSettings`: `tenantId?`, `clientId?`, `clientSecretEncrypted?`, `fromAddress?`, `fromName?`. One document only.
- `EmailTemplate`: `trigger` (enum `EmailTrigger`, required, **unique**), `label?`, `name` (required), `subject` (required), `body` (required).

#### `Message` (`messages/schemas/message.schema.ts`)

| Field | Type | Default | Notes |
|---|---|---|---|
| `customer` | ObjectId → `Customer`, required, **indexed** | | A conversation = all messages for one customer |
| `sender` | enum `'staff' \| 'customer'`, required | | |
| `senderName` | string? | | Snapshot of the staff or customer name |
| `body` | string, required | | DTO allows ≤ 5000 characters, not empty |
| `readByStaff` | boolean | `false` | |
| `readByCustomer` | boolean | `false` | |

#### `CrmActivity` (`crm/schemas/crm-activity.schema.ts`)

| Field | Type | Default | Notes |
|---|---|---|---|
| `customer` | ObjectId → `Customer`, required, indexed | | |
| `type` | enum `ActivityType`: `note`, `call`, `email`, `task`, `status_change` | required | |
| `subject` | string, required | | |
| `description` | string? | | |
| `dueDate` | Date? | | Used for tasks |
| `completed` | boolean | `false` | |
| `createdBy` | string, required | | **Supplied by the client** (DTO `@IsNotEmpty`), not taken from the JWT |
| `attachments` | string[] (base64 data-URL images) | `undefined` | Removed from list responses |
| `attachmentCount` | number | `0` | Maintained on create and update |
| `attachmentsCompressed` | boolean? | `false` | Set by the legacy recompression job |

#### `Enquiry` (`enquiries/schemas/enquiry.schema.ts`)

| Field | Type | Notes |
|---|---|---|
| `name` | string, required | |
| `email` | string? | DTO `@IsEmail` |
| `address`, `phone`, `howHeard`, `notes` | string? | |
| `servicesInterested` | enum[] `EnquiryService`: `dog_walking`, `pet_visits`, `boarding`, `day_care`; default `[]` | |

#### `Form` (`forms/schemas/form.schema.ts`)

| Field | Type | Default |
|---|---|---|
| `name` | string, required | |
| `description` | string? | |
| `customerVisible` | boolean | `true` (shown in the per-customer "Choose a form" picker) |
| `fields` | Mixed[] (interpreted as `FormField[]`) | `[]` |

#### `FormSubmission` (`form-submissions/schemas/form-submission.schema.ts`)

| Field | Type | Default | Notes |
|---|---|---|---|
| `form` | ObjectId → `Form`, required | | |
| `formName` | string, required | | Snapshot |
| `formDescription` | string? | | Snapshot |
| `formFieldsSnapshot` | Mixed[] | `[]` | Snapshot, possibly reshaped per pet |
| `status` | enum `FormSubmissionStatus`: `pending`, `completed` | `pending` | |
| `customer` | ObjectId → `Customer`? | | Set at creation, or on the first successful submit |
| `animal` | ObjectId → `Animal`? | | Single-pet send |
| `animals` | ObjectId[] → `Animal`? | | Multi-pet send |
| `recipientEmail` | string, required | | |
| `recipientName` | string? | | |
| `answers` | Mixed? | | Keyed by field id. Group answers are arrays of per-repetition objects. |
| `submittedAt` | Date? | | |

#### `PreBoardingSettings` and `PreBoardingForm` (`pre-boarding/schemas/`)

`PreBoardingSettings` (one document): `maxScore` (number, default `10`), `questions` (Mixed[]; default `undefined`, which means the service uses `DEFAULT_PRE_BOARDING_QUESTIONS`).

`PreBoardingForm`:

| Field | Type | Default | Notes |
|---|---|---|---|
| `firstName` | string, required | | |
| `surname` | string? | | |
| `email` | string, required | | |
| `dogCount` | number? | | Older forms only have `dogNames`; read through `dogCountOf()` |
| `dogNames` | string[] | `[]` | Typed by the owner on submit |
| `status` | enum `pending`, `completed` | `pending` | |
| `questionsSnapshot` | Mixed[] | `[]` | Active questions at creation time |
| `maxScore` | number, required | | Snapshot |
| `answers` | Mixed[]? | | Per dog: `{[questionId]: {value, details?}}` |
| `results` | Mixed[]? | | Per dog: `PreBoardingDogResult` |
| `suitable` | boolean? | | True only if every dog is suitable |
| `lastEmailedAt`, `submittedAt` | Date? | | |

#### `ChecklistTemplate` and `ChecklistAssignment` (`checklists/schemas/`)

`ChecklistTemplate`: `category` (enum `boarding \| dayCare`, required, default `boarding`), `name` (required), `completeByTime?` (display only, e.g. "10:00"), `items` (string[], default `[]`), `autoAssign` (boolean, default `false`).

`ChecklistAssignment`:

| Field | Type | Default | Notes |
|---|---|---|---|
| `template` | ObjectId → `ChecklistTemplate`, required | | |
| `category` | enum `boarding \| dayCare`, required | `boarding` | Snapshot |
| `name` | string, required | | Snapshot |
| `completeByTime` | string? | | Snapshot |
| `items` | string[], required | | Snapshot |
| `date` | Date, required | | Local midnight |
| `completed` | boolean[] | `[]` | Parallel to `items` |
| `completedBy` | (string \| null)[] | `[]` | Parallel to `items`; staff name taken from the JWT |
| `notes` | string? | | |
| `signatureImage` | string? (base64 PNG) | | |
| `signedBy` | string? | | Taken from the JWT |
| `signedAt` | Date? | | |

#### `RiskAssessment` (`risk-assessments/schemas/risk-assessment.schema.ts`)

Shared enums:

- `REVIEW_FREQUENCIES`: `weekly`, `monthly`, `quarterly`, `6-monthly`, `annually`
- `RISK_ASSESSMENT_STATUSES`: `draft`, `review`, `live`
- `RESIDUAL_RISK_LEVELS`: `low`, `medium`, `high`

| Field | Type | Default |
|---|---|---|
| `raId` | string, required, **unique** (`RA{n}`) | |
| `assessmentDate` | string `YYYY-MM-DD`, required | today at creation |
| `name` | string, required | |
| `regulationReference` | string? | |
| `reviewFrequency` | enum? | |
| `nextReviewDate` | string `YYYY-MM-DD`? | |
| `scope` | string? | |
| `status` | enum | `draft` |
| `risks` | `RiskItem[]` | `[]` |
| `auditLog` | `RiskAssessmentAuditEntry[]` | `[]` |
| `reviewDueNotified` | boolean? | `false` |

*Embedded* `RiskItem` (has `_id`): `hazard` (required), `whoAtRisk?`, `existingControls` (string[], `[]`), `furtherActions` (string[], `[]`), `likelihood` (number 1–5, required), `severity` (number 1–5, required), `residualRisk` (enum, required; staff judgement, **not** derived from L×S), `reviewPeriod?` (enum; stored and shown only, never scheduled).

*Embedded* `RiskAssessmentAuditEntry` (`_id: false`): `action` (required), `changes?`, `actor` (required), `at` (Date, required, default `Date.now`).

#### `Policy` (`policies/schemas/policy.schema.ts`)

| Field | Type | Default |
|---|---|---|
| `policyId` | string, required, **unique** (`POL{n}`) | |
| `name` | string, required | |
| `category` | string? (free text) | |
| `reference` | string? | |
| `status` | enum `draft \| published` | `draft` |
| `reviewFrequency` | enum (same 5 values)? | |
| `nextReviewDate` | string `YYYY-MM-DD`? | |
| `reviewDueNotified` | boolean? | `false` |
| `versions` | `PolicyVersion[]` | `[]` |
| `auditLog` | `PolicyAuditEntry[]` | `[]` |

- *Embedded* `PolicyVersion` (has `_id`): `version` (number, required), `content` (HTML, required), `changeSummary?`, `publishedAt` (Date, required), `publishedBy` (string, required), `signOffs` (`PolicySignOff[]`, `[]`).
- *Embedded* `PolicySignOff` (`_id: false`): `staff` (ObjectId → `Staff`, required), `staffName` (required), `signedAt?`, `signedName?`, `reminderSentAt?`.
- *Embedded* `PolicyAuditEntry`: same shape as the risk-assessment audit entry.

#### `TrainingModule` (`staff-training/schemas/training-module.schema.ts`)

| Field | Type | Default |
|---|---|---|
| `name` | string, required | |
| `description` | string? | |
| `status` | enum `draft \| review \| live` | `draft` |
| `contentBlocks` | `TrainingContentBlock[]` | `[]` |
| `questionBank` | `TrainingQuestion[]` | `[]` |
| `passMarkPercent` | number, required | `80` |
| `questionsPerAttempt` | number, required | `5` |
| `reviewFrequency` | enum (5 values)? | |
| `dueWithinDays` | number, required | `14` |
| `assignAllStaff` | boolean | `false` |
| `assignments` | `TrainingAssignment[]` | `[]` |
| `auditLog` | `TrainingAuditEntry[]` | `[]` |

- *Embedded* `TrainingContentBlock` (has `_id`): `order` (number, required), `type` (enum `video \| reading \| pdf`, required), `title?`, `videoUrl?`, `readingText?` (HTML), `pdfFile?` (base64 data URI), `pdfFileName?`.
- *Embedded* `TrainingQuestion` (has `_id`): `text`, `options` (string[], DTO requires ≥ 2), `correctIndex` (all required).
- *Embedded* `TrainingAssignment` (`_id: false`):
  - `staff` (ObjectId → `Staff`, required), `staffName` (required)
  - `assignedAt` (default `Date.now`)
  - `dueDate` (`YYYY-MM-DD`, required: assignment date + `dueWithinDays`)
  - `lastAttemptAt?`, `lastScorePercent?`, `lastPassed?`
  - `lastCompletedAt?` (`YYYY-MM-DD`)
  - `nextDueDate?` (`YYYY-MM-DD`, advanced **only on a pass**)
  - `reviewDueNotified?` (default `false`)
- *Embedded* `TrainingAuditEntry`: same shape as the other audit entries.

#### `TrainingAttempt` (`staff-training/schemas/training-attempt.schema.ts`)

| Field | Type | Default |
|---|---|---|
| `module` | ObjectId → `TrainingModule`, required | |
| `moduleName` | string, required (snapshot) | |
| `staff` | ObjectId → `Staff`, required | |
| `staffName` | string, required | |
| `status` | enum `in-progress \| submitted` | `in-progress` |
| `passMarkPercent` | number, required (snapshot) | |
| `questionsAsked` | `AttemptQuestionSnapshot[]`, required | |
| `answers` | number[]? | |
| `scorePercent` | number? | |
| `passed` | boolean? | |
| `startedAt` | Date, required | `Date.now` |
| `submittedAt` | Date? | |

*Embedded* `AttemptQuestionSnapshot` (`_id: false`): `questionId` (ObjectId), `text`, `options[]`, `correctIndex` (all required).

#### ER diagram

```mermaid
erDiagram
    CUSTOMER ||--o{ MESSAGE : "conversation"
    CUSTOMER ||--o{ CRM_ACTIVITY : "has"
    CUSTOMER }o--o{ EMAIL_GROUP : "member of"
    EMAIL_MESSAGE ||--|{ EMAIL_MESSAGE_RECIPIENT : "embeds"
    EMAIL_MESSAGE_RECIPIENT }o--|| CUSTOMER : "customer"
    EMAIL_MESSAGE }o--o| STAFF : "sentBy"
    EMAIL_TEMPLATE ||--o{ EMAIL_MESSAGE : "generic trigger renders"
    FORM ||--o{ FORM_SUBMISSION : "snapshotted into"
    FORM_SUBMISSION }o--o| CUSTOMER : "customer"
    FORM_SUBMISSION }o--o| ANIMAL : "animal"
    FORM_SUBMISSION }o--o{ ANIMAL : "animals"
    BOARDING_BOOKING }o--o| FORM_SUBMISSION : "pre/checkIn/checkOut submission"
    PRE_BOARDING_SETTINGS ||--o{ PRE_BOARDING_FORM : "questions snapshotted"
    CHECKLIST_TEMPLATE ||--o{ CHECKLIST_ASSIGNMENT : "snapshotted per day"
    RISK_ASSESSMENT ||--o{ RISK_ITEM : "embeds"
    RISK_ASSESSMENT ||--o{ RA_AUDIT_ENTRY : "embeds"
    POLICY ||--|{ POLICY_VERSION : "embeds"
    POLICY_VERSION ||--o{ POLICY_SIGN_OFF : "embeds"
    POLICY_SIGN_OFF }o--|| STAFF : "staff"
    POLICY ||--o{ POLICY_AUDIT_ENTRY : "embeds"
    TRAINING_MODULE ||--o{ TRAINING_CONTENT_BLOCK : "embeds"
    TRAINING_MODULE ||--o{ TRAINING_QUESTION : "embeds"
    TRAINING_MODULE ||--o{ TRAINING_ASSIGNMENT : "embeds"
    TRAINING_ASSIGNMENT }o--|| STAFF : "staff"
    TRAINING_MODULE ||--o{ TRAINING_ATTEMPT : "module"
    TRAINING_ATTEMPT }o--|| STAFF : "staff"
    TRAINING_ATTEMPT ||--|{ ATTEMPT_QUESTION_SNAPSHOT : "embeds"

    EMAIL_MESSAGE {
        string subject
        string bodyHtml
        ObjectId sentBy
    }
    EMAIL_MESSAGE_RECIPIENT {
        ObjectId _id
        ObjectId customer
        string email
        string name
        string status
        string reason
        date openedAt
    }
    EMAIL_GROUP {
        string name_unique
        ObjectIdArray customers
    }
    EMAIL_SETTINGS {
        string tenantId
        string clientId
        string clientSecretEncrypted
        string fromAddress
        string fromName
    }
    EMAIL_TEMPLATE {
        string trigger_unique
        string label
        string name
        string subject
        string body
    }
    MESSAGE {
        ObjectId customer
        string sender
        string senderName
        string body
        boolean readByStaff
        boolean readByCustomer
    }
    CRM_ACTIVITY {
        ObjectId customer
        string type
        string subject
        string description
        date dueDate
        boolean completed
        string createdBy
        stringArray attachments
        number attachmentCount
        boolean attachmentsCompressed
    }
    ENQUIRY {
        string name
        string email
        string address
        string phone
        string howHeard
        stringArray servicesInterested
        string notes
    }
    FORM {
        string name
        string description
        boolean customerVisible
        mixedArray fields
    }
    FORM_SUBMISSION {
        ObjectId form
        string formName
        string formDescription
        mixedArray formFieldsSnapshot
        string status
        ObjectId customer
        ObjectId animal
        ObjectIdArray animals
        string recipientEmail
        string recipientName
        mixed answers
        date submittedAt
    }
    PRE_BOARDING_SETTINGS {
        number maxScore
        mixedArray questions
    }
    PRE_BOARDING_FORM {
        string firstName
        string surname
        string email
        number dogCount
        stringArray dogNames
        string status
        mixedArray questionsSnapshot
        number maxScore
        mixedArray answers
        mixedArray results
        boolean suitable
        date lastEmailedAt
        date submittedAt
    }
    CHECKLIST_TEMPLATE {
        string category
        string name
        string completeByTime
        stringArray items
        boolean autoAssign
    }
    CHECKLIST_ASSIGNMENT {
        ObjectId template
        string category
        string name
        string completeByTime
        stringArray items
        date date
        booleanArray completed
        stringArray completedBy
        string notes
        string signatureImage
        string signedBy
        date signedAt
    }
    RISK_ASSESSMENT {
        string raId_unique
        string assessmentDate
        string name
        string regulationReference
        string reviewFrequency
        string nextReviewDate
        string scope
        string status
        boolean reviewDueNotified
    }
    RISK_ITEM {
        ObjectId _id
        string hazard
        string whoAtRisk
        stringArray existingControls
        stringArray furtherActions
        number likelihood
        number severity
        string residualRisk
        string reviewPeriod
    }
    RA_AUDIT_ENTRY {
        string action
        string changes
        string actor
        date at
    }
    POLICY {
        string policyId_unique
        string name
        string category
        string reference
        string status
        string reviewFrequency
        string nextReviewDate
        boolean reviewDueNotified
    }
    POLICY_VERSION {
        ObjectId _id
        number version
        string content
        string changeSummary
        date publishedAt
        string publishedBy
    }
    POLICY_SIGN_OFF {
        ObjectId staff
        string staffName
        date signedAt
        string signedName
        date reminderSentAt
    }
    POLICY_AUDIT_ENTRY {
        string action
        string changes
        string actor
        date at
    }
    TRAINING_MODULE {
        string name
        string description
        string status
        number passMarkPercent
        number questionsPerAttempt
        string reviewFrequency
        number dueWithinDays
        boolean assignAllStaff
    }
    TRAINING_CONTENT_BLOCK {
        ObjectId _id
        number order
        string type
        string title
        string videoUrl
        string readingText
        string pdfFile
        string pdfFileName
    }
    TRAINING_QUESTION {
        ObjectId _id
        string text
        stringArray options
        number correctIndex
    }
    TRAINING_ASSIGNMENT {
        ObjectId staff
        string staffName
        date assignedAt
        string dueDate
        date lastAttemptAt
        number lastScorePercent
        boolean lastPassed
        string lastCompletedAt
        string nextDueDate
        boolean reviewDueNotified
    }
    TRAINING_ATTEMPT {
        ObjectId module
        string moduleName
        ObjectId staff
        string staffName
        string status
        number passMarkPercent
        numberArray answers
        number scorePercent
        boolean passed
        date startedAt
        date submittedAt
    }
    ATTEMPT_QUESTION_SNAPSHOT {
        ObjectId questionId
        string text
        stringArray options
        number correctIndex
    }
```

---

### Workflows

#### Bulk email (Communications > Email)

1. Staff compose `{subject, bodyHtml}` and pick customers and/or groups.
2. `EmailMessagesService.send` builds a `Set` of customer ids: the explicit `customerIds`, plus every member of every `groupIds` group.
   - Empty set → 400 "Select at least one customer or group to send to."
   - No matching customers → 400.
3. It loads the customers' `name` and `email`, then saves the `EmailMessage` with every recipient at `status: 'sent'`. That `save()` creates a recipient `_id` for each pixel URL.
4. It loops through the recipients **one at a time**. Each gets a `generic` email with `name`, `campaignSubject`, raw `emailBodyText` and its own pixel. Each failure sets that recipient to `'failed'` with a `reason`.
5. It saves again and returns the populated record.
6. Opens arrive later through the per-recipient pixel.

#### Customer ↔ staff messaging

```mermaid
flowchart LR
    C[Customer app] -->|POST /portal/messages| CS[MessagesService.customerSend]
    CS --> M[(Message sender=customer readByStaff=false)]
    CS --> N[NotificationService.dispatch 'New message'] --> FEED[(NotificationItem)] & PUSHALL[PushService.sendToAll staff]
    S[Admin / Staff app] -->|POST /messages/:customerId| SS[MessagesService.staffSend]
    SS --> M2[(Message sender=staff readByCustomer=false)]
    SS --> CN[CustomerNotificationsService.record] --> CFEED[(CustomerNotification)] & PUSHC[PushService.sendToCustomer]
    S -->|GET /messages/:customerId| R1[markReadByStaff then thread]
    C -->|GET /portal/messages| R2[markReadByCustomer then thread]
```

- No email is sent for messages; notification is by push and in-app feeds only.
- Unread counters:
  - `GET /messages/unread-count` (staff, global);
  - `GET /messages/conversations` (per customer);
  - `GET /portal/messages/unread-count` (customer).

#### CRM activities

- These are free-standing notes, calls, emails, tasks and status changes attached to a customer.
- `type: email` is **only a log entry**. Creating one sends nothing.
- `dueDate` and `completed` support simple tasks. No scheduler reads `dueDate`.
- Attachments are base64 image data URLs stored inline in Mongo. Lists leave them out; `GET /crm/activities/:id` returns them.
- On boot, `CrmService.onModuleInit()` starts `compressLegacyAttachments()` without waiting for it:
  - finds notes with `attachmentCount > 0` and `attachmentsCompressed ≠ true`;
  - re-encodes any `data:image/*` attachment over 250 KB with `sharp` (rotate → resize to width 1200 → JPEG quality 60), keeping the result only if it is smaller;
  - flags each note with `attachmentsCompressed: true`;
  - errors are logged and retried on the next boot.

#### Enquiries "pipeline"

- The code has **no pipeline**: no status, no stages, no assignee, no follow-up date, and no conversion endpoint.
- The schema comment says staff "create a proper customer lead separately if/when it's worth following up". In practice that is `POST /customers/leads`, done by hand.
- An enquiry has create, list and delete only.
- Nothing links an `Enquiry` to the `Customer` it may become.

#### Form builder: field types (`forms/form-field.types.ts`)

**Fields every type has (`FormFieldBase`):**

- `id`, `label`, `required`;
- optional `mapping {target: 'customer'|'animal', path}`, a dot-path into the Create/Update DTOs that supports one `[N]` index per segment;
- optional `visibleWhen {mode: 'all'|'any', conditions: [{fieldId, equals}]}`. Values are compared as strings, and a condition can only point at a field in the same scope.

| `type` | Extra properties | Answer / behaviour |
|---|---|---|
| `text`, `textarea`, `number`, `date`, `time` | `defaultValue?` (`{{token}}` placeholders; not for `time`) | Plain value. `number` is converted with `Number()`. |
| `toggle` | – | Boolean. Visibility conditions compare against `'true'`/`'false'`. |
| `signature` | – | Data URI string |
| `today`, `datetime` | – | Filled automatically by the client when the form opens. Not editable. |
| `display` | `startsNewPage?`, `content?: 'terms'\|'declaration'` | Read-only text in `label`, which supports `**bold**`/`__underline__`. `content` shows the live text from `/settings/terms` or `/settings/declaration`. `startsNewPage` creates a PDF page break and a wizard page. |
| `medications` | – | Array of medication entries, trimmed by `toMedicationEntries()` to `name`, `vetPrescribed`, `administeredByPawfectPets`, `illnessTreating`, `dosage`, `frequency`, `additionalInfo`. Unnamed entries are dropped. |
| `file` | `maxFiles?` | Array |
| `choice`, `multichoice` | `options[]`, `optionLabels?`, `optionsSource?: 'static'\|'customerPets'` | With `customerPets`, `options` is replaced at read time by the recipient's pet names. |
| `group` | `repeatable: true`, `minRepeats`, `maxRepeats?`, `createsAnimal?` (default **true**), `fields[]`, `repetitionLabels?` | Answer is an array of per-repetition objects. Groups cannot be nested. |

**Placeholders** (`forms/form-placeholders.util.ts`):

- Supported: `customerName`, `firstName`, `surname`, `email`, `phone`, `address`, `postcode`, `petNames`, `petName`.
- `staffMemberSignedIn` is left as literal text; the admin's `FormFillModal` replaces it.
- Unknown tokens stay as literal text.

**Seeded forms** (`FormsService.onModuleInit`). Each is an atomic `$setOnInsert` upsert by `name`:

- **"Arrival Check-In"** (`default-boarding-checkin-checkout-forms.ts`):
  - arrival datetime;
  - "Received by" text defaulting to `{{staffMemberSignedIn}}`;
  - 4 toggles: vaccination checked, feeding confirmed, emergency contact confirmed, consent completed;
  - a repeatable `ci-pets` group (`createsAnimal: false`):
    - dog name (`customerPets` choice);
    - belongings multichoice: Food, Medication, Lead, Harness, Collar, Bed, Blanket, Crate, Toys, Bowls, Other;
    - belongings notes;
    - coat/skin, weight/body, eyes/ears/teeth, behaviour, injuries;
    - photos (file);
  - owner signature and staff signature (both required).
- **"Departure Check-Out"**:
  - departure datetime;
  - "Released by";
  - three toggle + details pairs (`CHECKOUT_STAY_TOGGLES`): incidents, vet treatment, medication administered. Each details box is required while visible.
  - fees-paid toggle;
  - a `co-pets` group with belongings returned and the condition notes;
  - owner and staff signatures.
- **"Pre-Check In Form"** (`default-pre-checkin-form.ts`, about 85 field ids). It mirrors the real intake wizard:
  - client details;
  - emergency contact;
  - emergency vet, with the alternative-care authorisation (typed name + signature);
  - additional information & agreement: terms/declaration `display` fields with `content`, then typed name + signature;
  - a mapped **Pet** group (`createsAnimal: false`, patches existing animals). Fields: type, name, breed, sex, age, DOB, vaccinated/expiry, photos, colour, microchip, insured/insurer, neutered, last season, temperament, the aggression/travel/livestock questions with details, allergies, on-medication + `medications`, on/off lead with consent signature;
  - a second, unmapped group **"Boarding Specific Questions"**: feeds per day, amount, feeding notes, left alone (+ details), sleeping, toileting, crate trained, crate consent (typed name + signature), date;
  - a "Drop-off" page with a drop-off time.

**Boot-time migrations:**

- `addMissingCheckOutDetailsFields()` inserts a missing details box after each check-out toggle.
- `upgradePreCheckInForms()`:
  - removes the old key/alarm fields;
  - renames the "Security & Agreement" heading;
  - sets `content` on the terms/declaration display fields;
  - replaces the old single-medication fields with `pf-medications`;
  - adds lead `optionLabels`, the extra boarding questions and the drop-off fields.

#### Form assignment, sending, public filling and submission

```mermaid
flowchart TD
    A[Staff: SendFormModal] -->|POST /form-submissions form,customer?,animals?,recipientEmail| B[FormSubmissionsService.create]
    B --> B1{animals.length}
    B1 -->|0| B2[snapshot fields as-is]
    B1 -->|1| B3[snapshot, set animal]
    B1 -->|2+| B4[wrapFieldsForPets: unmapped non-group fields into per-pet group with repetitionLabels]
    B2 & B3 & B4 --> C[(FormSubmission status=pending)]
    C --> D[Admin: POST /settings/email/send trigger=form, link=/forms/:id, customerId, formName]
    D --> E[Activity 'X form email sent' + pixel + Graph send]
    BB[BoardingBookingsService.sendPreCheckIn manual or hourly cron] -->|creates submission + pre-filled answers| C
    BB --> E
    E --> F[Customer opens PUBLIC_INTAKE_URL/forms/:id]
    F -->|GET /form-submissions/:id/public| G[resolveFieldsForRecipient: strip mapping, interpolate placeholders, customerPets options]
    G --> H[Customer fills and submits]
    H -->|POST /form-submissions/:id/submit answers| I{status completed?}
    I -->|yes| X[400 already submitted]
    I -->|no| J[buildCustomerPatch top-level mapped fields -> validate Create/UpdateCustomerDto]
    J --> K[For groups createsAnimal!=false: buildAnimalPatch per repetition, business rules, validate CreateAnimalDto]
    K --> L[For groups createsAnimal=false: patch existing animals by order -> validate PublicUpdateAnimalDto]
    L --> M{new customer?}
    M -->|yes| N[CustomersService.create, save submission.customer immediately]
    M -->|no| O[CustomersService.update]
    N & O --> P[create new animals, update existing animals]
    P --> Q[answers saved, status=completed, submittedAt]
    Q --> R[AuditLog FORM_SUBMITTED]
    Q --> S[Optional staff: POST /form-submissions/:id/send-copy -> form_copy email + PDF]
```

How `submit` validates:

- Everything is validated before anything is written.
- Customer patches go through `class-validator` with `whitelist: true`. A brand-new customer gets stub `emergencyContact: {}` and `emergencyVet: {}` objects.
- `stripSpeciesInapplicableFields`:
  - cats lose the other-animals aggression, travel and livestock fields;
  - `other` loses livestock;
  - anything that is not a dog loses `offLeadConsent`.
- `dropIncompleteMedicationEntry` empties the medication list when not on medication, or when the first entry has no name.
- `validateAnimalBusinessRules`: a dog requires `offLeadConsent`.
- `emergencyContact.sameAsClient` defaults to `false`.
- `actorFromRequest(req)` supplies the audit actor.
- There are no DB transactions. The customer id is persisted first, so a retried submit updates the existing customer instead of creating a second one.

**Check-in / check-out** (BoardingBookings + Forms):

- Settings > Boarding (`BoardingWorkflowSettings`) chooses which forms are used:
  - `preCheckInForm{Boarding,DayCare}`
  - `checkInForm{Boarding,DayCare}`
  - `checkOutForm{Boarding,DayCare}`
- It also holds `checkInRequirePhoto`, `checkInRequireSignature` and `checkOutRequireSignature` (all default `true`) and `preCheckInDaysBefore` (default `2`).
- Staff fill the check-in or check-out form as a `FormSubmission`, then call `POST /boarding-bookings/:id/check-in` or `/check-out` with `{submission}`. This sets `checkInSubmission`/`checkInAt`/`checkInBy` (or the check-out equivalents) and recomputes the status override.
- Staff can then email the customer a PDF copy with `POST /form-submissions/:id/send-copy`.

#### Pre-boarding eligibility questionnaire

**Question model** (`pre-boarding/pre-boarding.types.ts`):

- `{id, section, text (may contain {{dogName}}), type: 'yesno'|'choice'|'text', options[], detailsPrompt?, required, active, showWhen?: [{questionId, value}]}`.
- Each option: `{value, label, score ≥ 0, askDetails, autoFail}`.
- `showWhen` uses **AND** logic and may only point at **earlier** questions. This is enforced by `normaliseQuestion`.
- `normaliseQuestion` also enforces: unique ids, non-empty text, a known type, ≥ 2 options with unique non-empty values (for non-text types), and scores rounded and clamped to ≥ 0. `required` defaults to true for yes/no and choice questions and false for text.

**Default question set** (`DEFAULT_PRE_BOARDING_QUESTIONS`, `DEFAULT_MAX_SCORE = 10`):

| Section | Question id → scoring (answer: points / AF = auto-fail / d = asks for details) |
|---|---|
| Basic eligibility | `sex` (male/female); `neutered`; `entire_male_6m` (shown if male & not neutered) yes:4 d; `season_during_stay` (female & not neutered) yes:AF; `pregnant` (female & not neutered) yes:AF; `puppy_vaccines` no:AF; `weight` (text) |
| Health | `kennel_cough` no:5 (yes asks date); `flea_worm` no:3; `recent_illness` yes:AF d; `recent_surgery` yes:2 d; `conditions` yes:2 d; `vet_restriction` yes:5 d; `mobility` yes:1 d |
| Behaviour and safety | `bitten` yes:6 d; `asked_to_leave` yes:6 d; `guarding` yes:3 d; `other_dogs` good:0 / selective:2 d / poor:6 d; `cats` yes:2 d; `reactive_lead` yes:2 d; `escape` yes:4 d; `recall` reliable:0 / mostly:1 / unreliable:2; `fears` yes:1 d; `handling` no:2 d |
| Living in our home | `settle_overnight` yes:0 / sometimes:1 / no:3 d; `sleep_with_person` yes:1 d; `night_toilet` yes:1; `house_trained` no:4 d; `marking` yes:3 d; `chewing` yes:3 d; `swallowing` yes:2 d; `children` good:0 / excitable:1 d / nervous:2 d / unknown:1 / incident:6 d; `barking` yes:1; `lived_with_dogs` no:1; `furniture` (0) |
| Energy, walks and garden | `exercise` (text); `pulls` yes:1; `scavenging` yes:1 d; `counter_surfing` yes:1 |
| Settling and history | `owned_6m` no:2 d; `stayed_away` no:1 (yes asks how they coped); `recent_changes` yes:1 d; `visitors` (text); `stress_signs` (text); `meet_greet` no:2 |
| Care needs | `raw_fed` yes d; `grooming` yes d; `water` (0) |

**Scoring** (`scoreDog`):

1. For each **visible** non-text question, add the chosen option's `score`.
2. A chosen option with `autoFail` sets `autoFailed`.
3. Every option with `score > 0` or `autoFail` is added to `flags[]` as `{question (with dog name filled in), answer label, score, autoFail, details?}`.
4. `suitable = !autoFailed && score <= maxScore`.
5. The form's `suitable` is true only if **every** dog is suitable.

```mermaid
flowchart TD
    S1[Staff: POST /pre-boarding firstName,email,dogCount] --> S2[snapshot active questions + maxScore]
    S2 --> S3[POST /pre-boarding/:id/send -> pre_boarding email with link]
    S3 --> O1[Owner: GET /pre-boarding/:id/public - no scores/autoFail]
    O1 --> O2[POST /pre-boarding/:id/submit dogNames, answers per dog]
    O2 --> V{count matches dogCount and names non-empty?}
    V -->|no| E1[400]
    V -->|yes| W[walk questions in order per dog; skip hidden; required check; option must exist; keep details only if askDetails]
    W --> SC[scoreDog per dog: sum scores, autoFail, flags]
    SC --> R[results, suitable = all dogs suitable, status=completed]
    R --> ST[Staff review in GET /pre-boarding/:id]
```

Answers are capped at 5000 characters and dog names at 100. Staff are **not notified** when a questionnaire is submitted.

#### Checklists

```mermaid
flowchart LR
    T[ChecklistTemplate category,items,autoAssign] -->|manual POST /checklist-assignments| A[(ChecklistAssignment snapshot for date)]
    DB[DayBookingsService create booking] -->|classifyBooking product -> boarding/dayCare| AA[ChecklistsService.autoAssignForDate]
    AA -->|templates with autoAssign and same category, skip if one exists for template+date| A
    A -->|PATCH :id/items/:index| TI[toggle completed i, completedBy i = staff name]
    A -->|PATCH :id notes/signatureImage| SG[signedBy, signedAt server-side]
```

- `completeByTime` is display only; nothing checks it and nothing notifies.
- Auto-assign failures inside `DayBookingsService` are logged and never retried.

#### Risk assessments and review cron

- **Lifecycle:** `draft → review → live`.
- **Going live:** when `update` moves the status to `live` (from anything else) and a `reviewFrequency` is set, it sets `nextReviewDate = addReviewInterval(freq)` from today and resets `reviewDueNotified`.
- **Reviewing:** `POST /:id/review` advances `nextReviewDate` by one interval from **today**. If no frequency is set, it uses **monthly**.
- **Audit trail:** every change appends to the embedded `auditLog`, with `actor` = JWT `user.name`.
- **Cron:** `RiskAssessmentsService.notifyDueReviews` runs `@Cron(EVERY_HOUR)`:
  - finds `status: 'live'`, `nextReviewDate ≤ today()` (UTC `YYYY-MM-DD`), `reviewDueNotified ≠ true`;
  - calls `NotificationService.dispatch('Risk assessment review due', '<name> (<raId>) is due for review.', 'riskAssessmentReviewDue')` (admin feed + push to all staff);
  - sets `reviewDueNotified = true`.
- Per-item `reviewPeriod` is not scheduled.

#### Policies: acknowledgement and review cron

```mermaid
flowchart TD
    C[POST /policies content, signOffStaffIds?] --> V1[v1 + signOffs for chosen or all active staff, all unsigned]
    V1 --> P{status published + reviewFrequency?}
    P -->|yes| NR[nextReviewDate = today + interval]
    PV[POST /:id/versions] --> VN[append vN, fresh unsigned signOffs, nextReviewDate recomputed, reviewDueNotified=false]
    SG[Staff: POST /:id/sign signedName] --> L{listed on latest version?}
    L -->|no| E404[404]
    L -->|yes| ST[signedAt, signedName; audit 'Policy Reviewed']
    RM[POST /:id/remind] --> RS[reminderSentAt on outstanding + broadcast feed/push to ALL staff]
    AU[PATCH /:id/assign-users] --> MG[merge reviewer list on latest version]
    CR[Hourly cron] -->|published, nextReviewDate<=today, not notified| NT[dispatch 'Policy review due' + reviewDueNotified=true]
```

- Only the **latest** version can be signed. Older signatures do not carry forward.
- `resetToV1` deletes later versions but keeps v1's original sign-offs.
- There is no "mark reviewed without a new version" action for policies. The review date only advances through publish, first publish or reset.

#### Staff training: modules, assignments, attempts, compliance and cron

**Content:**

- Ordered blocks: `video` (URL), `reading` (HTML) and `pdf` (base64, streamed by `GET .../content/:blockId/file`).
- A question bank of multiple-choice questions.

**Going live** (`validateLiveReadiness`) requires ≥ 1 question and `questionsPerAttempt ≤ bank size`.

**Assigning:**

- `assignUsers` merges the new list with the existing rows. New rows get `dueDate = today + dueWithinDays`.
- `assignAllStaff` adds every active (non-locked) staff member: once when switched on, then hourly through the cron.

**Attempts:**

1. **Start:** a Fisher–Yates shuffle picks `questionsPerAttempt` questions. They are snapshotted, `correctIndex` included, onto the attempt. The response leaves out `correctIndex`.
2. **Submit:**
   - checks that the attempt belongs to the caller and is still `in-progress`, and that the number of answers matches;
   - `score = round(100 × correct / asked)`; `passed = score ≥ snapshot passMark`;
   - `recordAttemptResult` updates the cached assignment fields: `lastAttemptAt`, `lastScorePercent`, `lastPassed`, `lastCompletedAt`. **Only on a pass** does it set `nextDueDate = addReviewInterval(reviewFrequency)` (monthly when unset) and reset `reviewDueNotified`;
   - an audit entry "Quiz Completed" is added.
- There is no limit on attempts, and no time limit.

**Compliance** (`computeComplianceStatus`, `DUE_SOON_DAYS = 7`):

```mermaid
flowchart TD
    A[assignment] --> B{lastCompletedAt set?}
    B -->|yes| C[effectiveDue = nextDueDate]
    B -->|no| D[effectiveDue = dueDate]
    C & D --> E{effectiveDue set?}
    E -->|no| P1[pending]
    E -->|yes| F{days until due < 0?}
    F -->|yes| OV[overdue]
    F -->|no| G{lastPassed?}
    G -->|no| H{days <= 7?} -->|yes| DU[due]
    H -->|no| P2[pending]
    G -->|yes| I{days <= 7?} -->|yes| DU2[due]
    I -->|no| CO[compliant]
```

A failed attempt sets `lastCompletedAt` but not `nextDueDate`. If the person has never passed, `effectiveDue` is then `undefined` and the status shows as **`pending`**, not overdue. In other words, failing the first attempt hides the original deadline.

**Cron:** `TrainingModulesService.reconcileAndNotify` runs `@Cron(EVERY_HOUR)` over live modules:

- `assignAllStaff` reconcile: adds rows for new active staff;
- for assignments that are `overdue` and not yet notified, sends **one** `dispatch('Training review due', '<n> staff member(s) have training due for "<module>"', 'trainingReviewDue')` per module and marks them notified.

---

### Scheduled jobs and boot-time tasks

| Job | File : method | Schedule | What it does | Side effects |
|---|---|---|---|---|
| Risk review due | `risk-assessments/risk-assessments.service.ts : notifyDueReviews` | `CronExpression.EVERY_HOUR` | Finds live assessments where `nextReviewDate ≤ today (UTC)` and not yet notified | Admin feed + push to all staff; `reviewDueNotified = true` |
| Policy review due | `policies/policies.service.ts : notifyDueReviews` | `EVERY_HOUR` | Same, for published policies | Feed + push; flag set |
| Training reconcile & overdue | `staff-training/training-modules.service.ts : reconcileAndNotify` | `EVERY_HOUR` | Auto-assign-all reconcile, then overdue notification per module | Feed + push; assignment rows added or flagged |
| Pre-check-in sender (out of scope but it creates `FormSubmission`s and sends `form` emails) | `boarding-bookings/boarding-bookings.service.ts : sendDuePreCheckIns` | `EVERY_HOUR` | Bookings with an invoice, no `preCheckInSentAt`, no `checkInAt`, `startDate ≤ today + preCheckInDaysBefore` | Creates a pre-filled `FormSubmission`; email via `sendTriggeredEmail`; Activity entry |
| Seed forms | `forms/forms.service.ts : onModuleInit` | Boot | Upserts the 3 default forms; runs the 2 migrations | – |
| Seed `pre_boarding` template | `pre-boarding/pre-boarding.service.ts : onModuleInit` | Boot | `$setOnInsert` template; upgrades an untouched old template | Errors ignored |
| CRM attachment recompression | `crm/crm.service.ts : compressLegacyAttachments` (from `onModuleInit`) | Boot (not awaited) | Recompresses legacy images over 250 KB | Logs |

Other crons in the backend, outside this scope: `InvoicesService.markOverdue` (hourly), `NotificationService.dailyDigest` (every 5 minutes) and `AppointmentsService.sendDueReminders` (every 5 minutes, push only). None of them sends email.

All crons are in-process (`ScheduleModule.forRoot()`) and have **no distributed lock**. With more than one backend instance, each instance runs every job.

---

### Suggested improvements (communications & compliance)

**Email transport and reliability**

1. **Cache the Graph access token.**
   - Problem: `SettingsService.sendTemplatedEmail`, `sendDirectEmail` and `sendTestEmail` (`backend/src/settings/settings.service.ts`) call `getAccessToken()` on every send. `EmailMessagesService.send` (`backend/src/email-messages/email-messages.service.ts`) also re-reads the template, `BusinessInfo` and `EmailSettings` for every recipient.
   - Fix: cache the token until shortly before its `expires_in`. Load the template and settings once per bulk send.
2. **Add an outbox and retry queue.**
   - Problem: every send runs synchronously in the request, with no retry. A bulk send loops through recipients one by one inside a single HTTP request, which risks timeouts with large groups.
   - Fix: add an `OutgoingEmail` collection (status, attempts, `lastError`, `nextAttemptAt`) and an `@Cron(EVERY_MINUTE)` worker with exponential backoff. Treat Graph `429` and `5xx` as retryable.
3. **Use `fromName`.**
   - Problem: `EmailSettings.fromName` is saved but never sent.
   - Fix: add `name: fromName` to `from.emailAddress` in `graphSendMail` (`settings.service.ts`).
4. **Record "sent" only after a successful send.**
   - Problem: `sendTriggeredEmail`, `InvoicesService.requestDeposit` and `requestFullPayment` write the "sent" Activity entry before calling Graph.
   - Fix: on failure, delete the entry or mark it failed, for example with a `deliveryStatus` field on `AuditLogEntry`.
5. **Stop the pre-check-in cron from duplicating records.**
   - Problem: `BoardingBookingsService.sendPreCheckIn` saves a new pending `FormSubmission` before emailing. When the email fails, the hourly cron (`sendDuePreCheckIns`) creates another submission (and another "sent" Activity entry) every hour.
   - Fix: reuse an existing pending `preCheckInSubmission`, or record the attempt time and back off.
6. **Seed or warn about missing templates.**
   - Problem: only `pre_boarding` is seeded (`pre-boarding.service.ts`). Every other trigger 400s until configured, and `PaymentsService.create` silently skips its email.
   - Fix: seed starter templates for every `EmailTrigger`, as `PreBoardingService.onModuleInit` does. Add a Settings health check that lists triggers with no template.
7. **Support attachments other than PDF.**
   - Problem: `graphSendMail` hard-codes `contentType: 'application/pdf'`.
   - Fix: take the MIME type from the data URI prefix.
8. **Restrict which triggers the generic endpoint accepts.**
   - Problem: `POST /settings/email/send` (`settings.controller.ts`) is ungated, and `SendTriggeredEmailDto` accepts any `EmailTrigger`, including `portal_login_code`, `generic` and `invoice`, with an arbitrary `to` and `link`. Any staff JWT can therefore send branded email to any address.
   - Fix: add `@IsIn([...])` limiting it to `registration`, `update_info`, `add_pet` and `form`.
9. **Sanitize bulk email HTML.**
   - Problem: `dto.bodyHtml` in `EmailMessagesService.send` and `current.content` in `PoliciesService.sendPolicyEmail` are inserted as raw HTML through `rawVars.emailBodyText`.
   - Fix: run them through an HTML sanitizer allow-list before sending.

**Tracking and analytics**

10. **Make pixel URLs unguessable.**
    - Problem: pixel URLs use bare ObjectIds (`email-messages.controller.ts`, `audit-log.controller.ts`, invoices/quotes). Anyone who learns an id can mark an email as read.
    - Fix: use a signed token (HMAC of the id) and verify it in the pixel handler.
11. **Track clicks and opens consistently.**
    - Problem: some important sends have no pixel at all (booking confirmation, pre-boarding, form copy, policy and risk-assessment emails). Gmail's image proxy and Apple Mail Privacy Protection make opens unreliable anyway.
    - Fix: add link rewriting (`/r/:token` redirect that records `clickedAt`) and add pixels to those sends.
12. **Show bounces and failures.**
    - Problem: `EmailMessageRecipient.status` only covers synchronous Graph rejections.
    - Fix: add a "Retry failed recipients" endpoint, e.g. `POST /email-messages/:id/retry`.

**Messaging and CRM**

13. **Email fallback for staff messages.**
    - Problem: `MessagesService.staffSend` (`backend/src/messages/messages.service.ts`) only pushes and writes the bell feed. Customers without the app never see the message.
    - Fix: add an optional `message_received` email trigger.
14. **Scope message deletion.**
    - Problem: `DELETE /messages/:customerId/:messageId` ignores `customerId` (`messages.controller.ts`).
    - Fix: check `message.customer === customerId`, and soft-delete with a `deletedBy` audit field.
15. **Take CRM authorship from the JWT.**
    - Problem: `CrmActivity.createdBy` comes from the request body (`crm/dto/create-crm-activity.dto.ts`).
    - Fix: set it from `@CurrentUser()` in `CrmController.create`.
16. **Task reminders for CRM.**
    - Problem: `CrmActivity.dueDate`/`completed` exist but nothing reads them.
    - Fix: add an hourly cron (`crm.service.ts`) that dispatches "CRM task due" notifications, and a `GET /crm/activities?type=task&due=overdue` filter.
17. **Make "Log email" send email.**
    - Problem: `ActivityType.EMAIL` is only a log entry.
    - Fix: offer a "send and log" option that calls `sendDirectEmail` and stores the Graph result.

**Enquiries**

18. **A real enquiry pipeline.**
    - Problem: `Enquiry` (`backend/src/enquiries/schemas/enquiry.schema.ts`) has no status, PATCH or conversion.
    - Fix:
      - add `status` (`new → contacted → quoted → converted/lost`), `assignedTo`, `followUpDate` and `convertedCustomer`;
      - add `PATCH /enquiries/:id` and `POST /enquiries/:id/convert` (which calls `CustomersService.createLead`);
      - add a public, throttled `POST /enquiries/public` for a website contact form;
      - add a follow-up reminder cron.

**Forms**

19. **Enforce required fields on the server.**
    - Problem: `FormSubmissionsService.submit` (`form-submissions.service.ts`) never checks `field.required` or `visibleWhen`. Only mapped fields are checked through the DTOs. `PreBoardingService.submit` already does this check.
    - Fix: port the `isFieldVisible` logic to the backend and reject missing required visible answers.
20. **Protect public form links.**
    - Problem: `GET /form-submissions/:id/public` returns `answers`. For pre-check-in submissions these are **pre-filled from the customer and animal records** (`BoardingBookingsService.sendPreCheckIn` → `buildPreCheckInAnswers`), so the ObjectId is the only credential for that personal data.
    - Fix: add a random `accessToken` to `FormSubmission`, put it in the emailed link, and add a link expiry. Do the same for `PreBoardingForm`.
21. **Throttle the public submit endpoints.**
    - Problem: `POST /form-submissions/:id/submit` and `POST /pre-boarding/:id/submit` rely only on the global 300/min limit.
    - Fix: add `@Throttle` as `customers.controller.ts` does for `send-registration-copy`.
22. **Send forms in one step.**
    - Problem: `POST /form-submissions` creates the link but sends nothing. The email depends on a second call from the client.
    - Fix: add `sendEmail?: boolean` to `CreateFormSubmissionDto` and send the email on the server, as `CustomersService.createLead` does.
23. **Automatic reminders for forms.**
    - Problem: pending `FormSubmission` and `PreBoardingForm` records can sit forever.
    - Fix: add an `@Cron` that re-sends after N days, with `reminderCount` and `lastRemindedAt` fields. Notify staff when a pre-boarding questionnaire is submitted, especially when `suitable === false`. `PreBoardingService.submit` currently only saves.

**Checklists**

24. **Overdue alerts and an audit trail for checklists.**
    - Problem: `ChecklistTemplate.completeByTime` is display only (`checklists/schemas/checklist-template.schema.ts`).
    - Fix: add a cron that notifies staff when an assignment for today is incomplete after `completeByTime`. Record `completedAt[]` timestamps alongside `completedBy[]`. Stop manual assignment duplicating a day's checklist; `ChecklistsService.assign` has no exists-check, unlike `autoAssignForDate`.

**Risk assessments, policies, training**

25. **Fix the date handling.**
    - Problem: `today()` in `risk-assessments.service.ts`, `policies.service.ts` and `training-modules.service.ts` uses `toISOString()` (UTC). It is a day behind between 00:00 and 01:00 during UK summer time. `addReviewInterval` silently defaults to monthly when no frequency is set.
    - Fix: compute dates in the `Europe/London` zone. Leave `nextReviewDate` unset when there is no frequency.
26. **Schedule per-hazard reviews.**
    - Problem: `RiskItem.reviewPeriod` is stored but never scheduled.
    - Fix: add `nextReviewDate` per item and extend `notifyDueReviews`. Also add an advance "review due soon" notification, e.g. 7 days ahead, like training's `DUE_SOON_DAYS`.
27. **Targeted reminders by staff email.**
    - Problem: `PoliciesService.sendReminder` and training's `reconcileAndNotify` broadcast to all staff, as the comment notes ("no per-staff-targeted push channel").
    - Fix: since Graph email already works, email each outstanding person through a new `staff_policy_reminder` or `staff_training_due` trigger, using the staff email address. Add an automatic weekly reminder cron for unsigned policies and overdue training.
28. **Fix compliance after a first failed attempt.**
    - Problem: in `computeComplianceStatus` (`training-modules.service.ts`), a failed attempt before any pass makes `effectiveDue = nextDueDate = undefined`, so the status shows `pending` instead of `due` or `overdue`.
    - Fix: use `a.nextDueDate ?? a.dueDate`.
29. **Hide other people's training results from `/training/my`.**
    - Problem: `listAssignedTo` and `findOneAssignedTo` select `assignments`, so every staff member receives everyone's names, scores and pass/fail for the modules they are assigned.
    - Fix: project the module to the caller's assignment only.
30. **Keep training history when a module is deleted.**
    - Problem: `TrainingModulesService.remove` deletes all `TrainingAttempt` records, losing compliance history.
    - Fix: use archiving (`status: 'archived'`) instead of a hard delete. The same applies to `PoliciesService.remove` and `RiskAssessmentsService.remove`, which destroy the embedded audit logs.
31. **Bring policies into training.**
    - Possible features: optional policy quizzes, an "acknowledge by email link" for staff who do not use the admin, and a compliance dashboard joining policy sign-offs (`policy.schema.ts`) with training assignments, exportable as PDF or CSV for licensing inspections (the policy `reference` and `regulationReference` fields already capture licence clauses).
32. **Run each cron on only one instance.**
    - Problem: all `@Cron` jobs (risk, policy, training, pre-check-in) run on every instance.
    - Fix: add a Mongo lease or lock document, or a leader-election flag, before scaling out horizontally. Otherwise duplicate notifications and pre-check-in emails are possible.

## Admin dashboard

The staff dashboard lives in `admin/`. It is a React 19 + TypeScript single-page app built with Vite 8. There is no state library, no UI kit, no chart library and no HTTP library: data goes through one hand-written `fetch` wrapper (`admin/src/api/client.ts`), charts are hand-drawn SVG, and PDFs are generated in the browser with `jspdf` (plus `html2canvas` for some documents). Source size is about 45k lines under `admin/src` (fonts and the logo included). The largest files are `pages/SettingsPage.tsx` (5,256 lines), `pages/BoardingDayCarePage.tsx` (2,655), `pages/CustomerDetailPage.tsx` (2,482), `pages/BookingsPage.tsx` (1,469), `pages/CommunicationsPage.tsx` (1,440), `api/client.ts` (1,443), `types.ts` (1,331), `components/DocumentFormModal.tsx` (1,242) and `components/FormBuilder.tsx` (1,025).

### Package, build and runtime

#### `admin/package.json`

| Item | Value |
|---|---|
| name / version | `admin` / `1.0.158`. `vite.config.ts` injects the version as `__APP_VERSION__`, and the top bar shows it as `v1.0.158`. The comment says to bump it on every pushed commit. |
| `type` | `module` |
| `npm run dev` | `vite` |
| `npm run build` | `tsc -b && vite build` (type-check, then bundle) |
| `npm run lint` | `oxlint` (config `admin/.oxlintrc.json`: plugins `react`, `typescript`, `oxc`; rules `react/rules-of-hooks: error`, `react/only-export-components: warn`) |
| `npm run preview` | `vite preview` |
| Tests | None. There is no test script and no test files under `admin/`. |

| Runtime dependency | Version | Used in |
|---|---|---|
| `react`, `react-dom` | ^19.2.8 | everywhere |
| `react-router-dom` | ^7.18.2 | `main.tsx` (`BrowserRouter`), `App.tsx`, `Layout.tsx`, pages |
| `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` | ^6.3.1 / ^10.0.0 / ^3.2.2 | only `components/FormBuilder.tsx` (drag-to-reorder fields) |
| `jspdf` | ^4.2.1 | all of `src/pdf/*`, plus `components/BookingConfirmationModal.tsx` |
| `html2canvas` | ^1.4.1 | only `src/pdf/htmlToPdf.ts` (HTML-to-image PDFs) |
| `qrcode` | ^1.5.4 | `components/QrLoginModal.tsx`, `components/InvoiceHtmlView.tsx`, `components/QuoteHtmlView.tsx`, `pdf/invoicePdf.ts` |

Dev dependencies: `typescript ~6.0.2`, `vite ^8.2.0`, `@vitejs/plugin-react ^6.0.4`, `oxlint ^1.75.0`, `@types/node`, `@types/react`, `@types/react-dom`, `@types/qrcode`.

TypeScript (`tsconfig.app.json`): target/lib ES2023 + DOM, `moduleResolution: bundler`, `jsx: react-jsx`, `noEmit`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `noUnusedLocals`, `noUnusedParameters` and `noFallthroughCasesInSwitch`. `strict` is not set in `tsconfig.app.json`. `src/global.d.ts` declares `__APP_VERSION__: string`.

#### `admin/vite.config.ts`

- Plugins: `@vitejs/plugin-react` only.
- `define: { __APP_VERSION__: JSON.stringify(pkg.version) }`, where `package.json` is read with `readFileSync`.
- No `server.proxy`, no aliases and no manual chunking. Code-splitting comes from `React.lazy` routes in `App.tsx`.

#### Environment variables (Vite inlines them at build time)

| Variable | Default when unset | Read in | Purpose |
|---|---|---|---|
| `VITE_API_URL` | `http://localhost:3000` | `api/client.ts` (exported as `API_URL`) | Base URL for every backend call. Also the fallback QR code payload (`QrLoginModal`) and the placeholder text in Settings > Business Info > QR Code URL. |
| `VITE_INTAKE_URL` | `http://localhost:5173` | 7 files, each with its own `const INTAKE_URL`: `CustomersPage`, `CustomerDetailPage`, `EnquiriesPage`, `PreBoardingPage`, `SettingsPage`, `AddPetChoiceModal`, `SendFormModal` | Builds the customer-facing intake links: `/intake/:customerId`, `/intake/:customerId/add-pet`, `/forms/:submissionId`, `/pre-boarding/:formId`, plus sample `/invoices/…` and `/quotes/…` links in template previews. |

`admin/.env.example` holds exactly these two variables.

#### `admin/Dockerfile` (two stages)

1. **build** (`node:22-alpine`): takes `ARG VITE_API_URL` and `ARG VITE_INTAKE_URL` and sets them as `ENV`. The comment notes they must be build args because Vite inlines them. Then `npm ci`, copy the source, `npm run build`.
2. **production** (`node:22-alpine`): `npm install -g serve@14`, copies `dist`, `EXPOSE 80`. The `HEALTHCHECK` (every 30s, 5s timeout, 10s start period, 3 retries) does a Node `http.get` to `localhost:80/` and expects a 200. `CMD serve -s dist -l tcp://0.0.0.0:80`. The `-s` flag (SPA mode) rewrites unknown paths to `index.html`, so client routes such as `/customers/:id` resolve.

`.dockerignore` excludes `node_modules`, `dist`, `.env`, `.env.*` (but keeps `.env.example`), `.git`, `*.md`, `Dockerfile` and `.dockerignore`.

#### `admin/index.html`

`lang="en-GB"`, favicon `/favicon.png`, title "PawfectPets Sherborne — Admin". It preconnects to Google Fonts and loads **Work Sans** (400–700), **Archivo Black**, **DM Sans** (400/500/700, italic 400) and **Fraunces** (600/700/800, italic 500). The page mounts `#root` from `/src/main.tsx`.

### Application shell

#### `src/main.tsx`

`createRoot(#root)` renders this tree: `<StrictMode><BrowserRouter><AuthProvider><App/></AuthProvider></BrowserRouter></StrictMode>`. `main.tsx` also imports `index.css`.

#### `src/App.tsx` (routing)

- Every page except `LoginPage` is loaded with `React.lazy` (one chunk per page), and everything sits inside one `<Suspense fallback="Loading…">`.
- `ProtectedLayout` shows "Loading…" while `useAuth().loading` is true, sends you to `<Navigate to="/login">` when there is no `staff`, and otherwise renders `<Layout/>`, which holds an `<Outlet>`.
- There is **no per-route permission check**. All authenticated routes render for any signed-in staff member. Enforcement happens on the backend, and the only client-side gating is that `Layout.tsx` hides one nav link (see below).

#### URL route table

"Permission" means what the **client** checks. The server-side keys come from the hints in `utils/permissionCatalog.ts`, which lists the backend's `@RequirePermission()` keys. The client never checks them, except `training.manage` for one nav link.

| Path | Page (file) | Permission | Purpose |
|---|---|---|---|
| `/login` | `LoginPage` (eager import) | Public | Username/password sign-in with a "Keep me signed in" box (checked by default). On success it navigates to `/customers`. |
| `/` | — | Signed in | `<Navigate to="/customers">` |
| `/boarding-daycare` | `BoardingDayCarePage` | Signed in. Server side, deleting a booking uses `bookings.manage`. | Boarding & Day Care operations hub with 7 tabs: Dashboard, Pre-Boarding, Bookings, Occupancy, Risk Assessments, Policies, Checklists |
| `/pre-boarding` | — | Signed in | Legacy path, `<Navigate to="/boarding-daycare">`. Pre-Boarding is now a tab there. |
| `/enquiries` | `EnquiriesPage` | Signed in | Log enquiries, convert them to customers, quote them |
| `/customers` | `CustomersPage` | Signed in | Searchable customer list with Active/Inactive tabs; "New customer" creates a lead and an intake link |
| `/customers/:id` | `CustomerDetailPage` | Signed in. Server side: `customers.manage` for deletes, `customers.viewSecurity` to reveal the alarm/keysafe code. | Customer record with 8 tabs |
| `/bookings` | `BookingsPage` (sidebar label **Calendar**) | Signed in. Server side: `bookings.manage` (delete). | Month/week calendar of day bookings (walks, visits, day care, boarding) and appointments, a day panel, and monthly invoice generation |
| `/invoices` | `InvoicesPage` (sidebar label **Invoices & Quotes**) | Signed in. Server side: `invoicing.manage` (delete). | Invoices and Quotes tabs: list, HTML preview, PDF download, send, payments, deposits. Accepts `?view=<invoiceId>`. |
| `/financial` | `FinancialPage` | Signed in. Server side: `financial.manage` (delete). | Snapshot dashboard, Payments, Expenses, Credit Notes, Bank Transfers, Bank Accounts, Uploads (expense receipts: view and email) |
| `/communications` | `CommunicationsPage` | Signed in | Two-way customer chat, push messages, bulk email |
| `/reports` | `ReportsPage` | Signed in | P/L (income vs expenses) and Expenses by Category, each for the last 6 or 12 months |
| `/staff-training` | `StaffTrainingPage` (sidebar "Training Admin") | The nav link is shown only when `isBreakGlass`, the staff member has no role, or the role includes `training.manage`. **The route itself is not gated.** Server side: `training.manage`, which also gates *viewing* the module list. | Training modules and the compliance audit |
| `/my-training` | `MyTrainingPage` | Signed in | The signed-in staff member's assigned modules and quizzes |
| `/settings` | `SettingsPage` | Signed in. Server side: `settings.manage`; `staff.manage` for staff and roles. | 11 settings tabs |
| `*` | — | — | `<Navigate to="/">` |

#### Authentication (`src/auth/AuthContext.tsx`)

- **Token storage:** `localStorage` key `pawfectpets_admin_token`, written on every login whatever "Keep me signed in" says. The flag goes to the backend as `rememberMe`, so any effect on session length is decided there. The token is also kept in memory in `client.ts` via `setAuthToken`.
- **Bootstrap:** on mount it registers `api.setUnauthorizedHandler(...)`, which clears the stored token, the in-memory token and `staff`. If a stored token exists it calls `api.me()` (`GET /auth/me`) and sets `staff`. On failure it clears the token. `loading` becomes false either way.
- **`login(username, password, rememberMe)`** calls `POST /auth/login`, gets back `{ accessToken, staff }`, then stores the token and sets `staff`.
- **`logout()`** clears the stored and in-memory token and `staff`. It makes no backend call. `Layout` then navigates to `/login`.
- **Context value:** `{ staff, loading, login, logout }`. `useAuth()` throws when used outside the provider.
- **Permission model (as the client sees it):** `Staff` has `isBreakGlass`, `locked` and `role: Role | null`, where `Role = { id, name, permissions: string[] }`. Having no role, or `isBreakGlass`, means full access. `Layout.tsx` says this mirrors the backend `PermissionsGuard` rule. The only client-side check is `Layout.tsx`'s `canManageTraining`.
- **"QR login":** clicking the avatar initials in the top bar opens `QrLoginModal`. This is **not** a login token. The modal calls `getBusinessInfo()` and encodes `info.qrCodeUrl || API_URL` as a 240px QR code (`qrcode.toDataURL`, margin 1). The mobile app's first-launch "Scan QR code" screen reads this server address to pair itself with the backend.

#### `src/layout/Layout.tsx` and `layoutContext.ts`

- **Sidebar:** the brand (logo plus "Pawfect Pets") and these nav items, in order:

| # | Label | Route | Icon | Visibility |
|---|---|---|---|---|
| 1 | Boarding & DayCare | `/boarding-daycare` | `BoardingIcon` (kennel) | always |
| 2 | Enquiries | `/enquiries` | `EnquiriesIcon` | always |
| 3 | Communications | `/communications` | inline `MessagesIcon` (chat bubble), plus a green unread-count badge | always |
| 4 | Customers | `/customers` | `CustomersIcon` | always |
| 5 | Calendar | `/bookings` | `BookingsIcon` | always |
| 6 | Invoices & Quotes | `/invoices` | `InvoicesIcon` | always |
| 7 | Financial | `/financial` | `FinancialIcon` | always |
| 8 | Reports | `/reports` | `ReportsIcon` | always |
| 9 | Staff Training (collapsible group toggle; starts expanded when the current path is a training path) | — | `TrainingIcon` + chevron | always |
| 9a | → Training Admin | `/staff-training` | — | `canManageTraining` only |
| 9b | → My Training | `/my-training` | — | always (when the group is expanded) |
| 10 | Settings | `/settings` | `SettingsIcon` | always |

- **Top bar:** `v{__APP_VERSION__}`, `NotificationBell`, an avatar button with the staff member's initials (opens `QrLoginModal`), the staff name, and a "Log out" button.
- **Polling:** `api.messagesUnreadCount()` runs immediately and then every **15s**. The effect depends on `location.pathname`, so every navigation clears and restarts the timer and fires an extra request. `NotificationBell` polls `notificationsUnreadCount` every **60s**.
- **Wide layout:** `content-wide` (no reading-width cap) applies on `/invoices*`, `/bookings*` and `/boarding-daycare*`, or whenever a mounted page calls `useWideLayout()`. That hook comes from `layoutContext.ts`, passes `setWideRequested` through the `Outlet` context, and releases the request on unmount. Only `FormBuilder` uses it. A `useEffect` also resets `wideRequested` whenever the path changes.

#### Navigation map

```mermaid
flowchart LR
  Login["/login<br/>LoginPage"] -->|login OK| Customers
  Root["/"] --> Customers
  PB["/pre-boarding"] --> Boarding

  subgraph Shell["Layout (sidebar + topbar)"]
    direction TB
    TopBar["Topbar: version · NotificationBell · avatar · Log out"]
  end
  TopBar -->|avatar| QR["QrLoginModal<br/>(server-address QR)"]
  TopBar -->|bell| Notif["Notifications modal"]
  TopBar -->|Log out| Login

  Shell --> Boarding["/boarding-daycare<br/>Boarding & DayCare"]
  Shell --> Enq["/enquiries"]
  Shell --> Comms["/communications"]
  Shell --> Customers["/customers"]
  Shell --> Cal["/bookings (Calendar)"]
  Shell --> Inv["/invoices (Invoices & Quotes)"]
  Shell --> Fin["/financial"]
  Shell --> Rep["/reports"]
  Shell --> TrainGrp{"Staff Training"}
  TrainGrp -->|training.manage / no role / break-glass| TA["/staff-training<br/>Training Admin"]
  TrainGrp --> MT["/my-training"]
  Shell --> Set["/settings"]

  Boarding --> BTabs["Dashboard · Pre-Boarding · Bookings · Occupancy ·<br/>Risk Assessments · Policies · Checklists"]
  BTabs -->|Arriving/Departing row or Check In/Out| BDetail["Booking detail (Bookings tab)"]
  BDetail -->|invoice link| InvView["/invoices?view=:id"]
  BDetail -->|customer name| VCust["ViewCustomerModal"] -->|Open| CustDetail
  Customers -->|row click| CustDetail["/customers/:id"]
  CustDetail --> CTabs["Customer Defaults · Overview · Pets · Bookings ·<br/>Invoices · Notes · Activity · Forms"]
  CustDetail -->|delete| Customers
  Enq -->|Convert to Customer| RegLink["RegistrationLinkModal"]
  Enq -->|Create Quote| DocForm["DocumentFormModal (quote)"]
  Inv --> ITabs["Invoices · Quotes"]
  Fin --> FTabs["Snapshot · Payments · Expenses · Credit Notes · Bank Transfers"]
  Comms --> CmTabs["Conversations · Push Messages · Email"]
  Rep --> RTabs["P/L · Expenses by Category"]
  TA --> TATabs["Modules · Audit & Compliance"]
  Set --> STabs["Business Info · Staff · Email · Email Templates ·<br/>Invoice/Quotes · Bookings · Boarding · Pre-Boarding ·<br/>Forms · Finance · Notifications"]
```

### API client (`src/api/client.ts`)

#### Mechanics

- `API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'`. It is exported, and `QrLoginModal` and `SettingsPage` import it.
- The module holds `authToken` and `onUnauthorized` as module-level variables, with setters `setAuthToken(token)` and `setUnauthorizedHandler(fn)`.
- `request<T>(path, options)` wraps `fetch(`${API_URL}${path}`)`:
  - Default headers are `Content-Type: application/json`, **`X-Client-App: admin`** (so the backend can apply the Business Info > Trusted IPs restriction to admin logins only), and `Authorization: Bearer <token>` when a token exists. Caller headers are merged in last.
  - On **401**, for any path except `/auth/login`, it calls `onUnauthorized()` and throws `Error('Session expired. Please log in again.')`. `/auth/login` is exempt so the backend's own message (wrong password, or an IP not on the list) reaches the user.
  - On any other non-2xx it parses the JSON body. `body.message` is joined with `; ` when it is an array (Nest validation errors). Otherwise it throws `message || "Request failed (<status>)"`.
  - On success it reads the body as text and returns `JSON.parse` of it, or `undefined` when the body is empty. The comment explains that DELETE handlers return 200 with an empty body.
- There are no retries, no timeouts, no `AbortController`, no request de-duplication and no caching. Each caller handles errors itself (`.catch(setError)` or a silent `.catch(() => {})`).
- Two binary downloads bypass `request` and repeat the 401 handling: `downloadTermsFile()` (returns `{ blob, filename }`, filename from `Content-Disposition`, default `terms.docx`) and `getTrainingContentFile()` (returns a `Blob`). Neither sends `X-Client-App`.
- In total there are **252 exported functions**, and nine of them have no caller anywhere in `admin/src` (marked **unused** below): the legacy `/bookings` entity (5 functions; the comment says mobile still uses it), `updateAppointment`, `getForm`, `getTrainingModule` and `getTrainingAttemptHistory`.

#### Endpoint map (every exported function)

Generated from `client.ts`, then checked by hand. "Used by" lists the files that call `api.<fn>` or import it by name. `[?x=…]` marks an optional query parameter.

##### Auth

| Function | Method | Endpoint | Used by |
|---|---|---|---|
| `setAuthToken` | (helper) | `— (in-memory)` | AuthContext |
| `setUnauthorizedHandler` | (helper) | `— (in-memory)` | AuthContext |
| `login` | POST | `/auth/login` | AuthContext |
| `me` | GET | `/auth/me` | AuthContext |
| `registerStaff` | POST | `/auth/register` | SettingsPage |
| `listStaff` | GET | `/auth/staff` | SettingsPage |
| `updateStaff` | PATCH | `/auth/staff/:id` | SettingsPage |
| `changeStaffPassword` | POST | `/auth/staff/:id/password` | SettingsPage |
| `deleteStaff` | DELETE | `/auth/staff/:id` | SettingsPage |

##### Roles (Settings > Staff > Access Permissions)

| Function | Method | Endpoint | Used by |
|---|---|---|---|
| `listRoles` | GET | `/roles` | SettingsPage |
| `createRole` | POST | `/roles` | SettingsPage |
| `updateRole` | PATCH | `/roles/:id` | SettingsPage |
| `deleteRole` | DELETE | `/roles/:id` | SettingsPage |

##### Customers

| Function | Method | Endpoint | Used by |
|---|---|---|---|
| `listCustomers` | GET | `/customers` | BoardingDayCarePage, BookingsPage, CommunicationsPage, CopyMoveAnimalModal, CreditNoteModal, CustomersPage, DocumentFormModal, FinancialSnapshotTab, SendFormModal, SettingsPage |
| `getCustomer` | GET | `/customers/:id` | BoardingDayCarePage, CustomerDetailPage |
| `createLead` | POST | `/customers/leads` | CustomersPage, EnquiriesPage |
| `deleteCustomer` | DELETE | `/customers/:id[?force=…]` | CustomerDetailPage |
| `getAlarmInstructions` | GET | `/customers/:id/alarm-instructions` | CustomerDetailPage |
| `updateCustomer` | PATCH | `/customers/:id` | CustomerDetailPage, EditCustomerModal, EnquiriesPage |
| `updateCustomerStatus` | PATCH | `/customers/:id/status` | CustomerDetailPage |

##### Customer portal (Customer Defaults > Customer Portal card)

| Function | Method | Endpoint | Used by |
|---|---|---|---|
| `setCustomerPortalActive` | PATCH | `/customers/:id/portal` | CustomerDetailPage |
| `sendCustomerPortalReset` | POST | `/customers/:id/portal/reset` | CustomerDetailPage |
| `getCustomerPortalStatus` | GET | `/customers/:id/portal/status` | CustomerDetailPage |
| `sendCustomerPortalTestPush` | POST | `/customers/:id/portal/test-push` | CustomerDetailPage |

##### Messages (staff <-> customer)

| Function | Method | Endpoint | Used by |
|---|---|---|---|
| `listConversations` | GET | `/messages/conversations` | CommunicationsPage |
| `getMessageThread` | GET | `/messages/:customerId` | CommunicationsPage |
| `sendMessageToCustomer` | POST | `/messages/:customerId` | CommunicationsPage |
| `messagesUnreadCount` | GET | `/messages/unread-count` | Layout |
| `deleteMessage` | DELETE | `/messages/:customerId/:messageId` | CommunicationsPage |

##### Push messages (Communications > Push Messages, bulk/individual customer pushes)

| Function | Method | Endpoint | Used by |
|---|---|---|---|
| `listPushMessages` | GET | `/push-messages` | CommunicationsPage |
| `sendPushMessage` | POST | `/push-messages` | CommunicationsPage |
| `deletePushMessage` | DELETE | `/push-messages/:id` | CommunicationsPage |

##### Email groups (Settings > Email > Email Groups)

| Function | Method | Endpoint | Used by |
|---|---|---|---|
| `listEmailGroups` | GET | `/email-groups` | CommunicationsPage, SettingsPage |
| `createEmailGroup` | POST | `/email-groups` | SettingsPage |
| `updateEmailGroup` | PATCH | `/email-groups/:id` | SettingsPage |
| `deleteEmailGroup` | DELETE | `/email-groups/:id` | SettingsPage |

##### Email messages (Communications > Email, bulk emails to customers/groups)

| Function | Method | Endpoint | Used by |
|---|---|---|---|
| `listEmailMessages` | GET | `/email-messages` | CommunicationsPage |
| `sendEmailMessage` | POST | `/email-messages` | CommunicationsPage |
| `deleteEmailMessage` | DELETE | `/email-messages/:id` | CommunicationsPage |
| `logFormSnapshot` | POST | `/customers/:id/form-snapshot` | CustomerDetailPage |

##### Animals

| Function | Method | Endpoint | Used by |
|---|---|---|---|
| `listAnimals` | GET | `/animals[?customer=:customerId]` | BoardingDayCarePage, BookingsPage, CustomerDetailPage, CustomersPage, DocumentFormModal, SendFormModal |
| `createAnimal` | POST | `/animals` | NewAnimalModal |
| `updateAnimal` | PATCH | `/animals/:id` | EditAnimalModal |
| `deleteAnimal` | DELETE | `/animals/:id` | CustomerDetailPage |
| `copyAnimal` | POST | `/animals/:id/copy` | CopyMoveAnimalModal |
| `moveAnimal` | POST | `/animals/:id/move` | CopyMoveAnimalModal |
| `unlinkAnimal` | POST | `/animals/:id/unlink` | CustomerDetailPage |

##### Bookings (legacy `Booking` entity; no admin callers)

| Function | Method | Endpoint | Used by |
|---|---|---|---|
| `listBookings` | GET | `/bookings[?customer=:customerId]` | **unused** |
| `createBooking` | POST | `/bookings` | **unused** |
| `updateBookingStatus` | PATCH | `/bookings/:id` | **unused** |
| `updateBooking` | PATCH | `/bookings/:id` | **unused** |
| `deleteBooking` | DELETE | `/bookings/:id` | **unused** |

##### Day bookings (the Bookings page calendar: one dog, one day, one product)

| Function | Method | Endpoint | Used by |
|---|---|---|---|
| `listDayBookings` | GET | `/day-bookings?from=:from&to=:to` | BoardingDayCarePage, BookingsPage, FinancialSnapshotTab, GenerateInvoicesModal, NewBookingModal |
| `listDayBookingsForCustomer` | GET | `/day-bookings/by-customer/:customerId` | CustomerDetailPage |
| `getBoardingPlan` | GET | `/day-bookings/boarding-plan?start=:start&end=:end&dogCount=:dogCount` | DocumentFormModal, NewBookingModal |
| `createDayBooking` | POST | `/day-bookings` | BookingsPage, NewBookingModal |
| `getBoardingStay` | GET | `/day-bookings/stay/:stayId` | BoardingDayCarePage, BookingsPage, CustomerDetailPage |
| `deleteStay` | DELETE | `/day-bookings/stay/:stayId` | BoardingDayCarePage, BookingsPage, CustomerDetailPage, NewBookingModal |
| `updateDayBooking` | PATCH | `/day-bookings/:id` | BookingInvoicePrompt, BookingsPage, GenerateInvoicesModal, NewBookingModal |
| `deleteDayBooking` | DELETE | `/day-bookings/:id` | BookingsPage, CustomerDetailPage, NewBookingModal |

##### Appointments (Bookings page: standalone, non-animal calendar entries)

| Function | Method | Endpoint | Used by |
|---|---|---|---|
| `listAppointments` | GET | `/appointments?from=:from&to=:to` | BookingsPage |
| `createAppointment` | POST | `/appointments` | AddAppointmentModal |
| `updateAppointment` | PATCH | `/appointments/:id` | **unused** |
| `deleteAppointment` | DELETE | `/appointments/:id` | BookingsPage |

##### Invoices

| Function | Method | Endpoint | Used by |
|---|---|---|---|
| `listInvoices` | GET | `/invoices[?customer=:customerId]` | AddPaymentModal, CreditNoteModal, CustomerDetailPage, FinancialSnapshotTab, GenerateInvoicesModal, InvoicesPage |
| `getInvoice` | GET | `/invoices/:id` | BoardingDayCarePage, FinancialPage |
| `createInvoice` | POST | `/invoices` | BookingInvoicePrompt, DocumentFormModal, GenerateInvoicesModal |
| `updateInvoice` | PATCH | `/invoices/:id` | DocumentFormModal |
| `updateInvoiceStatus` | PATCH | `/invoices/:id` | InvoicesPage |
| `deleteInvoice` | DELETE | `/invoices/:id` | InvoicesPage |
| `sendInvoiceEmail` | POST | `/invoices/:id/send` | DocumentFormModal, InvoicesPage |
| `requestDeposit` | POST | `/invoices/:id/request-deposit` | RequestDepositModal |

##### Quotes

| Function | Method | Endpoint | Used by |
|---|---|---|---|
| `listQuotes` | GET | `/quotes[?customer=:customerId]` | InvoicesPage |
| `createQuote` | POST | `/quotes` | DocumentFormModal |
| `updateQuote` | PATCH | `/quotes/:id` | DocumentFormModal |
| `updateQuoteStatus` | PATCH | `/quotes/:id` | InvoicesPage |
| `deleteQuote` | DELETE | `/quotes/:id` | InvoicesPage |
| `sendQuoteEmail` | POST | `/quotes/:id/send` | DocumentFormModal, InvoicesPage |

##### Boarding bookings (reference-numbered Boarding & Day Care workflow)

| Function | Method | Endpoint | Used by |
|---|---|---|---|
| `listBoardingBookings` | GET | `/boarding-bookings` | BoardingDayCarePage |
| `getBoardingBooking` | GET | `/boarding-bookings/:id` | BoardingDayCarePage |
| `getBoardingBookingByStay` | GET | `/boarding-bookings/by-stay/:stayId` | BoardingDayCarePage |
| `createBoardingBooking` | POST | `/boarding-bookings` | NewBoardingBookingModal |
| `amendBoardingBookingDates` | PATCH | `/boarding-bookings/:id/amend-dates` | AmendBoardingBookingDatesModal |
| `requestBoardingBookingPayment` | POST | `/boarding-bookings/:id/request-payment` | BoardingDayCarePage |
| `sendBoardingBookingPreCheckIn` | POST | `/boarding-bookings/:id/send-pre-check-in` | BoardingDayCarePage |
| `sendBoardingBookingConfirmation` | POST | `/boarding-bookings/:id/send-confirmation` | BookingConfirmationModal |
| `recordBoardingBookingCheckIn` | POST | `/boarding-bookings/:id/check-in` | BoardingDayCarePage |
| `recordBoardingBookingCheckOut` | POST | `/boarding-bookings/:id/check-out` | BoardingDayCarePage |
| `setBoardingBookingStatus` | PATCH | `/boarding-bookings/:id/status` | BoardingDayCarePage |
| `archiveBoardingBooking` | PATCH | `/boarding-bookings/:id/archive` | BoardingDayCarePage |
| `deleteBoardingBooking` | DELETE | `/boarding-bookings/:id[?deleteAll=…]` | BoardingDayCarePage |

##### Booking observations (care notes on a boarding/day care booking)

| Function | Method | Endpoint | Used by |
|---|---|---|---|
| `listBookingObservations` | GET | `/boarding-bookings/:bookingId/observations` | ObservationsCard |
| `createBookingObservation` | POST | `/boarding-bookings/:bookingId/observations` | ObservationsCard |
| `updateBookingObservation` | PATCH | `/boarding-bookings/:bookingId/observations/:id` | ObservationsCard |
| `deleteBookingObservation` | DELETE | `/boarding-bookings/:bookingId/observations/:id` | ObservationsCard |

##### Invoice terms

| Function | Method | Endpoint | Used by |
|---|---|---|---|
| `listInvoiceTerms` | GET | `/invoice-terms` | BookingInvoicePrompt, DocumentFormModal, GenerateInvoicesModal, SettingsPage |
| `createInvoiceTerm` | POST | `/invoice-terms` | SettingsPage |
| `updateInvoiceTerm` | PATCH | `/invoice-terms/:id` | SettingsPage |
| `deleteInvoiceTerm` | DELETE | `/invoice-terms/:id` | SettingsPage |

##### Payment methods

| Function | Method | Endpoint | Used by |
|---|---|---|---|
| `listPaymentMethods` | GET | `/payment-methods` | AddPaymentModal, ExpenseModal, RecordPaymentModal, SettingsPage |
| `createPaymentMethod` | POST | `/payment-methods` | SettingsPage |
| `updatePaymentMethod` | PATCH | `/payment-methods/:id` | SettingsPage |
| `deletePaymentMethod` | DELETE | `/payment-methods/:id` | SettingsPage |

##### Bank accounts

| Function | Method | Endpoint | Used by |
|---|---|---|---|
| `listBankAccounts` | GET | `/bank-accounts` | AddPaymentModal, BankTransferModal, CreditNoteModal, ExpenseModal, FinancialSnapshotTab, RecordPaymentModal, SettingsPage |
| `createBankAccount` | POST | `/bank-accounts` | BankAccountModal |
| `updateBankAccount` | PATCH | `/bank-accounts/:id` | BankAccountModal, SettingsPage |
| `deleteBankAccount` | DELETE | `/bank-accounts/:id` | SettingsPage |
| `getBankAccountTransactions` | GET | `/bank-accounts/:id/transactions?month=:month&year=:year` | ViewBankAccountModal |

##### Bank transfers

| Function | Method | Endpoint | Used by |
|---|---|---|---|
| `listBankTransfers` | GET | `/bank-transfers` | FinancialPage |
| `createBankTransfer` | POST | `/bank-transfers` | BankTransferModal |
| `deleteBankTransfer` | DELETE | `/bank-transfers/:id` | FinancialPage |
| `setBankAccountOpeningBalance` | PATCH | `/bank-accounts/:id/opening-balance` | BankAccountModal, SetOpeningBalanceModal |

##### Payments

| Function | Method | Endpoint | Used by |
|---|---|---|---|
| `listPayments` | GET | `/payments` | BoardingDayCarePage, FinancialPage |
| `createPayment` | POST | `/payments` | AddPaymentModal, RecordPaymentModal |
| `deletePayment` | DELETE | `/payments/:id` | FinancialPage |
| `sendPaymentReceivedEmail` | POST | `/payments/:id/send-email` | FinancialPage |
| `sendPaymentReceipt` | POST | `/payments/:id/send-receipt` | FinancialPage |

##### Expenses

| Function | Method | Endpoint | Used by |
|---|---|---|---|
| `listExpenses` | GET | `/expenses[?from=…&to=…]` | FinancialPage |
| `createExpense` | POST | `/expenses` | ExpenseModal |
| `updateExpense` | PATCH | `/expenses/:id` | ExpenseModal |
| `deleteExpense` | DELETE | `/expenses/:id` | FinancialPage |

##### Expense categories

| Function | Method | Endpoint | Used by |
|---|---|---|---|
| `listExpenseCategories` | GET | `/expense-categories` | ExpenseModal, SettingsPage |
| `createExpenseCategory` | POST | `/expense-categories` | SettingsPage |
| `updateExpenseCategory` | PATCH | `/expense-categories/:id` | SettingsPage |
| `deleteExpenseCategory` | DELETE | `/expense-categories/:id` | SettingsPage |

##### Vendors

| Function | Method | Endpoint | Used by |
|---|---|---|---|
| `listVendors` | GET | `/vendors` | ExpenseModal, SettingsPage |
| `createVendor` | POST | `/vendors` | ExpenseModal, SettingsPage |
| `updateVendor` | PATCH | `/vendors/:id` | SettingsPage |
| `deleteVendor` | DELETE | `/vendors/:id` | SettingsPage |

##### Vet practices

| Function | Method | Endpoint | Used by |
|---|---|---|---|
| `listVetPractices` | GET | `/vet-practices` | SettingsPage |
| `createVetPractice` | POST | `/vet-practices` | SettingsPage |
| `updateVetPractice` | PATCH | `/vet-practices/:id` | SettingsPage |
| `deleteVetPractice` | DELETE | `/vet-practices/:id` | SettingsPage |

##### Credit notes

| Function | Method | Endpoint | Used by |
|---|---|---|---|
| `listCreditNotes` | GET | `/credit-notes[?customer=:customerId]` | FinancialPage |
| `createCreditNote` | POST | `/credit-notes` | CreditNoteModal |
| `deleteCreditNote` | DELETE | `/credit-notes/:id` | FinancialPage |

##### Reports

| Function | Method | Endpoint | Used by |
|---|---|---|---|
| `getIncomeExpenseReport` | GET | `/reports/income-vs-expenses?months=:months` | FinancialSnapshotTab, ReportsPage |
| `getExpensesByCategoryReport` | GET | `/reports/expenses-by-category?months=:months` | FinancialSnapshotTab, ReportsPage |

##### Products

| Function | Method | Endpoint | Used by |
|---|---|---|---|
| `listProducts` | GET | `/products` | BookingInvoicePrompt, BookingsPage, CustomerDetailPage, DocumentFormModal, FinancialSnapshotTab, SettingsPage |
| `createProduct` | POST | `/products` | SettingsPage |
| `updateProduct` | PATCH | `/products/:id` | SettingsPage |
| `deleteProduct` | DELETE | `/products/:id` | SettingsPage |

##### Bank holidays

| Function | Method | Endpoint | Used by |
|---|---|---|---|
| `listBankHolidays` | GET | `/bank-holidays` | BookingsPage, DocumentFormModal, NewBookingModal, SettingsPage |
| `createBankHoliday` | POST | `/bank-holidays` | SettingsPage |
| `updateBankHoliday` | PATCH | `/bank-holidays/:id` | SettingsPage |
| `deleteBankHoliday` | DELETE | `/bank-holidays/:id` | SettingsPage |

##### Annual leave

| Function | Method | Endpoint | Used by |
|---|---|---|---|
| `listAnnualLeave` | GET | `/annual-leave` | BoardingDayCarePage, BookingsPage, CustomerDetailPage, SettingsPage |
| `createAnnualLeave` | POST | `/annual-leave` | SettingsPage |
| `updateAnnualLeave` | PATCH | `/annual-leave/:id` | SettingsPage |
| `deleteAnnualLeave` | DELETE | `/annual-leave/:id` | SettingsPage |

##### CRM

| Function | Method | Endpoint | Used by |
|---|---|---|---|
| `listActivities` | GET | `/crm/activities[?customer=:customerId]` | CustomerDetailPage |
| `getActivity` | GET | `/crm/activities/:id` | CustomerDetailPage |
| `createActivity` | POST | `/crm/activities` | CustomerDetailPage |
| `updateActivity` | PATCH | `/crm/activities/:id` | CustomerDetailPage |
| `deleteActivity` | DELETE | `/crm/activities/:id` | CustomerDetailPage |

##### Audit log (customer "Activity" tab, invoice activity panel)

| Function | Method | Endpoint | Used by |
|---|---|---|---|
| `listAuditLog` | GET | `/audit-log?customer=:customerId` | CustomerDetailPage |
| `listAuditLogForInvoice` | GET | `/audit-log?invoice=:invoiceId` | InvoiceActivityPanel |
| `getIncomeChart` | GET | `/audit-log/income?customer=:customerId&months=:months` | CustomerDetailPage |

##### Settings

| Function | Method | Endpoint | Used by |
|---|---|---|---|
| `getBusinessInfo` | GET | `/settings/business` | AddPaymentModal, BookingConfirmationModal, CommunicationsPage, CustomerDetailPage, InvoicesPage, PdfTemplateDesigner, QrLoginModal, RecordPaymentModal, RequestDepositModal, SendPreviewModal, SettingsPage, ViewAnimalModal, brandPdf |
| `getMyIp` | GET | `/settings/my-ip` | SettingsPage |
| `updateBusinessInfo` | PATCH | `/settings/business` | PdfTemplateDesigner, SettingsPage |
| `getVisitMapping` | GET | `/settings/visits` | BoardingDayCarePage, BookingsPage, CustomerDetailPage, DocumentFormModal, FinancialSnapshotTab, NewBookingModal, SettingsPage |
| `updateVisitMapping` | PATCH | `/settings/visits` | SettingsPage |
| `getBoardingWorkflowSettings` | GET | `/settings/boarding` | BoardingDayCarePage, FormsListCard, SettingsPage |
| `updateBoardingWorkflowSettings` | PATCH | `/settings/boarding` | FormAssignmentModal, SettingsPage |
| `previewTerms` | POST | `/settings/terms/preview` | SettingsPage |
| `downloadTermsFile` | GET | `/settings/terms/download` | SettingsPage |
| `getEmailSettings` | GET | `/settings/email` | SettingsPage |
| `updateEmailSettings` | PATCH | `/settings/email` | SettingsPage |
| `sendTestEmail` | POST | `/settings/email/test` | SettingsPage |
| `sendTriggeredEmail` | POST | `/settings/email/send` | AddPetChoiceModal, CustomerDetailPage, RegistrationLinkModal, SendFormModal |
| `listEmailTemplates` | GET | `/settings/email-templates` | CommunicationsPage, SendPreviewModal, SettingsPage |
| `saveEmailTemplate` | PUT | `/settings/email-templates/:trigger` | SettingsPage |
| `deleteEmailTemplate` | DELETE | `/settings/email-templates/:trigger` | SettingsPage |

##### Forms

| Function | Method | Endpoint | Used by |
|---|---|---|---|
| `listForms` | GET | `/forms` | CustomerDetailPage, FormsListCard, SettingsPage |
| `getForm` | GET | `/forms/:id` | **unused** |
| `createForm` | POST | `/forms` | FormBuilder |
| `updateForm` | PATCH | `/forms/:id` | FormBuilder |
| `setFormVisible` | PATCH | `/forms/:id` | FormsListCard |
| `deleteForm` | DELETE | `/forms/:id` | FormsListCard |

##### Form submissions

| Function | Method | Endpoint | Used by |
|---|---|---|---|
| `createFormSubmission` | POST | `/form-submissions` | BoardingDayCarePage, SendFormModal |
| `listFormSubmissions` | GET | `/form-submissions[?customer=:customerId]` | CustomerDetailPage |
| `getFormSubmission` | GET | `/form-submissions/:id` | BoardingDayCarePage, FormFillModal, ViewFormSubmissionModal |
| `updateFormSubmission` | PATCH | `/form-submissions/:id` | CustomerDetailPage |
| `deleteFormSubmission` | DELETE | `/form-submissions/:id` | CustomerDetailPage |
| `sendFormSubmissionCopy` | POST | `/form-submissions/:id/send-copy` | FormFillModal |
| `fetchFormSubmissionPublic` | GET | `/form-submissions/:id/public` | FormFillModal |
| `submitFormSubmission` | POST | `/form-submissions/:id/submit` | FormFillModal |

##### Enquiries

| Function | Method | Endpoint | Used by |
|---|---|---|---|
| `listEnquiries` | GET | `/enquiries` | EnquiriesPage |
| `createEnquiry` | POST | `/enquiries` | EnquiriesPage |
| `deleteEnquiry` | DELETE | `/enquiries/:id` | EnquiriesPage |

##### Notifications: feed (admin bell) + global settings

| Function | Method | Endpoint | Used by |
|---|---|---|---|
| `listNotifications` | GET | `/notifications` | NotificationBell |
| `notificationsUnreadCount` | GET | `/notifications/unread-count` | NotificationBell |
| `markNotificationsRead` | POST | `/notifications/mark-read` | NotificationBell |
| `clearNotifications` | DELETE | `/notifications` | NotificationBell |
| `getNotificationSettings` | GET | `/settings/notifications` | SettingsPage |
| `updateNotificationSettings` | PATCH | `/settings/notifications` | SettingsPage |

##### Checklists (Settings > Boarding, and Boarding & DayCare > Checklists)

| Function | Method | Endpoint | Used by |
|---|---|---|---|
| `listChecklistTemplates` | GET | `/checklist-templates` | BoardingDayCarePage, ChecklistsCard |
| `createChecklistTemplate` | POST | `/checklist-templates` | ChecklistsCard |
| `updateChecklistTemplate` | PATCH | `/checklist-templates/:id` | ChecklistsCard |
| `deleteChecklistTemplate` | DELETE | `/checklist-templates/:id` | ChecklistsCard |
| `listChecklistAssignments` | GET | `/checklist-assignments?from=:from&to=:to` | BoardingDayCarePage |
| `assignChecklist` | POST | `/checklist-assignments` | BoardingDayCarePage |
| `toggleChecklistItem` | PATCH | `/checklist-assignments/:id/items/:index` | BoardingDayCarePage |
| `updateChecklistAssignment` | PATCH | `/checklist-assignments/:id` | BoardingDayCarePage |
| `deleteChecklistAssignment` | DELETE | `/checklist-assignments/:id` | BoardingDayCarePage |

##### Risk assessments

| Function | Method | Endpoint | Used by |
|---|---|---|---|
| `listRiskAssessments` | GET | `/risk-assessments` | RiskAssessmentsTab |
| `getRiskAssessment` | GET | `/risk-assessments/:id` | RiskAssessmentDetailModal |
| `createRiskAssessment` | POST | `/risk-assessments` | RiskAssessmentsTab |
| `updateRiskAssessment` | PATCH | `/risk-assessments/:id` | RiskAssessmentsTab |
| `deleteRiskAssessment` | DELETE | `/risk-assessments/:id` | RiskAssessmentsTab |
| `reviewRiskAssessmentPolicy` | POST | `/risk-assessments/:id/review` | RiskAssessmentDetailModal |
| `addRiskItem` | POST | `/risk-assessments/:assessmentId/risks` | RiskAssessmentDetailModal |
| `updateRiskItem` | PATCH | `/risk-assessments/:assessmentId/risks/:riskId` | RiskAssessmentDetailModal |
| `deleteRiskItem` | DELETE | `/risk-assessments/:assessmentId/risks/:riskId` | RiskAssessmentDetailModal |
| `sendRiskAssessmentEmail` | POST | `/risk-assessments/:id/send-email` | RiskAssessmentsTab |

##### Policies

| Function | Method | Endpoint | Used by |
|---|---|---|---|
| `listPolicies` | GET | `/policies` | PoliciesTab |
| `getPolicy` | GET | `/policies/:id` | PolicyDetailModal |
| `listPolicyStaffOptions` | GET | `/policies/staff` | PoliciesTab, PolicyDetailModal |
| `createPolicy` | POST | `/policies` | PoliciesTab |
| `updatePolicy` | PATCH | `/policies/:id` | PolicyDetailModal |
| `deletePolicy` | DELETE | `/policies/:id` | PoliciesTab |
| `publishPolicyVersion` | POST | `/policies/:id/versions` | PolicyDetailModal |
| `signOffPolicy` | POST | `/policies/:id/sign` | PolicyDetailModal |
| `sendPolicyReminder` | POST | `/policies/:id/remind` | PolicyDetailModal |
| `resetPolicyToV1` | POST | `/policies/:id/reset-to-v1` | PolicyDetailModal |
| `sendPolicyEmail` | POST | `/policies/:id/send-email` | PoliciesTab |
| `assignPolicyUsers` | PATCH | `/policies/:id/assign-users` | PoliciesTab |

##### Staff Training (Training Admin)

| Function | Method | Endpoint | Used by |
|---|---|---|---|
| `listTrainingModules` | GET | `/training/modules` | TrainingModulesTab |
| `getTrainingModule` | GET | `/training/modules/:id` | **unused** |
| `createTrainingModule` | POST | `/training/modules` | TrainingModuleEditor |
| `updateTrainingModule` | PATCH | `/training/modules/:id` | TrainingModuleEditor |
| `deleteTrainingModule` | DELETE | `/training/modules/:id` | TrainingModulesTab |
| `listTrainingStaffOptions` | GET | `/training/modules/staff` | TrainingAssignUsersModal |
| `assignTrainingModuleUsers` | PATCH | `/training/modules/:id/assign-users` | TrainingAssignUsersModal |
| `setTrainingModuleAssignAll` | PATCH | `/training/modules/:id/assign-all` | TrainingAssignUsersModal |
| `getTrainingCompliance` | GET | `/training/modules/compliance` | TrainingComplianceTab |
| `getTrainingAttemptHistory` | GET | `/training/modules/:moduleId/attempts[?staffId=…]` | **unused** |
| `trainingContentFileUrl` | (URL builder) | `/training/modules/:moduleId/content/:blockId/file` | internal (used by `getTrainingContentFile`) |
| `getTrainingContentFile` | GET | `/training/modules/:moduleId/content/:blockId/file` | TrainingModuleEditor, TrainingPdfViewer |
| `listMyTraining` | GET | `/training/my` | MyTrainingPage |
| `getMyTrainingModule` | GET | `/training/my/:id` | MyTrainingPage |
| `startTrainingAttempt` | POST | `/training/my/:moduleId/start` | MyTrainingPage |
| `submitTrainingAttempt` | POST | `/training/my/attempts/:attemptId/submit` | MyTrainingPage |

##### Pre-boarding

| Function | Method | Endpoint | Used by |
|---|---|---|---|
| `getPreBoardingSettings` | GET | `/pre-boarding/settings` | PreBoardingSettingsTab |
| `updatePreBoardingSettings` | PUT | `/pre-boarding/settings` | PreBoardingSettingsTab |
| `resetPreBoardingQuestions` | POST | `/pre-boarding/settings/reset-questions` | PreBoardingSettingsTab |
| `listPreBoardingForms` | GET | `/pre-boarding` | PreBoardingPage |
| `getPreBoardingForm` | GET | `/pre-boarding/:id` | PreBoardingPage |
| `createPreBoardingForm` | POST | `/pre-boarding` | PreBoardingPage |
| `sendPreBoardingForm` | POST | `/pre-boarding/:id/send` | PreBoardingPage |
| `deletePreBoardingForm` | DELETE | `/pre-boarding/:id` | PreBoardingPage |

### Pages (`src/pages`)

Every page uses the same pattern: local `useState`, a `useEffect` fetch through `api.*`, an `error-banner` div for failures, "Loading…" or `empty-state` placeholders, and `Modal` dialogs that the page mounts conditionally. Tabs are local state; none are reflected in the URL.

#### `LoginPage.tsx` (`/login`)

- A centred card with the logo, "Pawfect Pets Sherborne" and "Staff sign in".
- Fields: Username (autofocus) and Password, plus a "Keep me signed in" checkbox (checked by default).
- Submits `useAuth().login`, which calls `POST /auth/login`, then navigates to `/customers`. Backend error text appears in an `error-banner`.

#### `CustomersPage.tsx` (`/customers`)

- **Data:** `listCustomers()`. It also calls `listAnimals()` purely so the search box can match pet names; pets are never shown on this page.
- **Controls:** a search box ("Search by name, email, or pet…"). On the Active tab only, a status filter offers All / Active / Pending / Update info.
- **Tabs:** **Active** (any status except `inactive`) and **Inactive**.
- **Table** (sortable with `SortableTh`): Name · Email · Phone number · Status (`Badge`) · Created (`en-GB` date). Clicking a row navigates to `/customers/:id`.
- **"New customer"** opens a local `NewCustomerModal` with First name, Last name, Email and a "Send email" toggle (on by default). It calls `createLead(firstName, surname, email, sendEmail)` (`POST /customers/leads`), then swaps to `RegistrationLinkModal`, which shows the link `${INTAKE_URL}/intake/:id` with `autoSent` set to the toggle value.

#### `CustomerDetailPage.tsx` (`/customers/:id`, 2,482 lines)

- **Loads on mount (all at once):** `getCustomer`, `listAnimals(id)`, `listInvoices(id)`, `listActivities(id)`, `listAuditLog(id)` and `getIncomeChart(id, months)`. The Forms tab loads lazily.
- **Header:** the customer name and a status badge that doubles as a `<select>` (pending / active / inactive / update_info), which calls `updateCustomerStatus` (`PATCH /customers/:id/status`). There is also an **Actions** menu (`ActionsMenu`):
  - **Send email.** Only for pending or update_info customers. It calls `sendTriggeredEmail('registration' | 'update_info', …)`, then saves a PDF snapshot of the registration form to the returned activity entry with `logFormSnapshot` (`POST /customers/:id/form-snapshot`, best-effort).
  - **View.** Builds `buildCustomerFormPdf` (it calls `getAlarmInstructions` and `getBusinessInfo` first) and shows it in an `xl` modal iframe. `toPdfIframeSrc` strips jsPDF's `;filename=` segment from the data URI so Chrome's viewer can display it.
  - **Edit.** Opens `EditCustomerModal`.
  - **Request Update.** Only for active or inactive customers. It sets the status to `update_info`, then opens `RegistrationLinkModal` with the update wording.
  - **Delete.** Opens the "Delete customer?" modal, which calls `deleteCustomer(id)`. If that is blocked, a **Force delete** button appears behind a random-sum arithmetic challenge and calls `deleteCustomer(id, true)` (`?force=true`). After deleting, the page navigates to `/customers`.
- **Tabs** (button order): **Customer Defaults · Overview · Pets (n) · Bookings · Invoices · Notes · Activity · Forms**. The initial tab is `overview`, even though Customer Defaults is listed first.
  - **Overview.** Read-only `<dl>` sections:
    - Client details: name, address, phone, email.
    - Emergency contact: "same as client", or name / address / phone / email.
    - Emergency vet: practice, address, telephone, alternative care authorisation.
    - Security: keys provided, **Alarm/KeySafe Code** behind a **Reveal** link (`GET /customers/:id/alarm-instructions`; the backend gates it with `customers.viewSecurity`), further info.
    - Agreement: signed by, signed at, version, document date.
  - **Pets.** Table: (photo) · Name · Species · Breed · Sex · Age · Vaccinated · Actions. The Actions menu offers View (`ViewAnimalModal`), Edit (`EditAnimalModal`), "Copy to another customer…" and "Move to another customer…" (`CopyMoveAnimalModal`), "Unlink from copy" (`unlinkAnimal`, only for linked copies) and Delete (`deleteAnimal`). "Add pet" opens `AddPetChoiceModal`, which offers either a registration link via the `add_pet` trigger or adding the pet manually with `NewAnimalModal`.
  - **Bookings.** This customer's `DayBooking` rows (`listDayBookingsForCustomer`). Rows that share a `stayId` (a multi-day boarding stay, or day care plus travel) are collapsed into one card per stay, with the product breakdown and night count; placeholder pick-up rows are excluded from the counts. Other rows are grouped per date into Walks and Visits. Visit cards show inferred AM/PM labels. Removing a row that belongs to a stay asks `window.confirm` and calls `deleteStay`; otherwise it calls `deleteDayBooking`. A boarding stay opens `NewBookingModal` in edit mode after `getBoardingStay`. **New booking** opens `NewBookingModal` and is disabled while the customer has no pets. The tab also uses `getVisitMapping`, `listAnnualLeave` and `listProducts`.
  - **Invoices.** Table: Invoice · Total · Status (plus a derived "partially paid" badge) · Due. **New invoice** opens `DocumentFormModal` (`kind="invoice"`, `presetCustomerId`).
  - **Notes** (CRM, manually written). An "Add note" form with Type (note / call / email / task), Subject, Description and image Attachments (compressed with `compressImageToDataUrl`), saved via `createActivity`. Each `ActivityItem` can be edited (`updateActivity`) and deleted (`deleteActivity`, with a confirm modal). Opening a note calls `getActivity` to fetch attachments, which the list endpoint omits.
  - **Activity** (automatic audit log). A read-only feed from `listAuditLog`, plus an **Income** chart (`IncomeChart`) with a 6/12-month selector (`getIncomeChart`). An entry with an attached registration snapshot opens that PDF in a modal.
  - **Forms** (lazy). `listFormSubmissions(customerId)` and `listForms()`. Table: Form · Status · Sent · Submitted · Actions:
    - **Resend.** A choice modal offering "Resend the existing link" (`SendFormModal` with `existing`) or a fresh link. The fresh option is disabled when the source form has been deleted.
    - **Edit.** `EditFormSubmissionModal` changes the recipient name and email (`updateFormSubmission`).
    - **Delete.** `deleteFormSubmission`.
    - Clicking a row opens `ViewFormSubmissionModal`.
    - **Send form** opens `SendFormModal`.
  - **Customer Defaults.** Four cards:
    - **Mobile App Access** (`CustomerPortalCard`). Shows `getCustomerPortalStatus` (set up, last login, device count). An enable/disable toggle calls `setCustomerPortalActive`; enabling asks for confirmation first because it emails the customer, and the toggle updates optimistically and reverts on failure. A password reset sends `sendCustomerPortalReset`, and **Send test push** sends `sendCustomerPortalTestPush`.
    - **Default Product** (`updateCustomer({ defaultProduct })`).
    - **Travel**: a chargeable toggle plus a travel product (`updateCustomer`).
    - **Regular Days**: weekday checkboxes saved to `regularDays` (`updateCustomer`). The Bookings page's "Recommended" list and the Financial projections use these.

#### `EnquiriesPage.tsx` (`/enquiries`)

- **Data:** `listEnquiries()`.
- **Table:** Name · Contact · Services interested in · Received · delete icon.
- **New Enquiry** (wide modal): Customer Name, Customer Email, Address, Phone Number, "Where did you hear about us?", "Services interested in?" (checkboxes for Dog Walking, Pet Visits, Boarding, Day Care) and Notes. Saved via `createEnquiry`.
- **View** (clicking a row opens a modal with the enquiry name as its title) has three actions:
  - **Create Quote** opens `DocumentFormModal kind="quote"` with `presetManualCustomer { name, email }`.
  - **Convert to Customer** splits the name on its first space, calls `createLead(first, rest, email, false)`, then `updateCustomer` with any phone and address, then `deleteEnquiry`, then shows `RegistrationLinkModal`.
  - **Delete enquiry**, with a confirmation modal.

#### `BookingsPage.tsx` (`/bookings`, sidebar "Calendar")

- **Loads:** `listAnimals`, `listCustomers`, `listBankHolidays`, `listAnnualLeave`, `listProducts` and `getVisitMapping`. Then `listDayBookings(from, to)` and `listAppointments(from, to)` for the visible grid, padded by one day on each side so it can work out AM/PM at the start and end of a run.
- **Toolbar:**
  - ← / **Today** / → navigation and a range label.
  - Five pill filters: **Walks · Visits · Day Care · Boarding · Appointments**. All are on by default, and they filter both the grid badges and the day panel.
  - A "This Week / This Month" select (default month).
  - **New Booking** (`NewBookingModal`), **Add Appointment** (`AddAppointmentModal`) and **Generate Invoice** (`GenerateInvoicesModal` for the anchor month).
- **Grid:** Mon–Sun weeks. Each day cell shows up to `MAX_BADGES = 3` badges plus "+N more". Badges are ordered AM visits, then walks, then PM visits; a 2-visit day shows both "Name - AM" and "Name - PM". Invoiced badges get "✓ ". An annual-leave day gets a red diagonal cross overlay and an "Annual Leave: <name>" tooltip.
- **Day panel** (`DayDetailPanel`, opened by clicking a day). Sections: **Walks**, **Visits**, **Day Care**, **Boarding**, **Appointments** (delete calls `deleteAppointment`), **Recommended** (customers whose regular days include this weekday, each with a quick-add + button) and **Add Dog** (dog select, product select, Qty, then **Add to this day**, which calls `createDayBooking`).
  - Rows can be edited inline (`updateDayBooking`) and removed (`deleteDayBooking`, or `deleteStay` after a `window.confirm` when the row is part of a stay).
  - A product whose availability does not match the day type (weekday / weekend / bank holiday) shows `ProductAvailabilityWarningModal` first.
  - When the owner has travel enabled, a travel line is added automatically.
  - Clicking a visit animal walks outward through consecutive visit days and reopens `NewBookingModal` pre-filled for the whole range. Clicking a boarding card loads the stay (`getBoardingStay`) into boarding-edit mode.
  - Days inside annual leave hide Recommended and Add Dog.

#### `BoardingDayCarePage.tsx` (`/boarding-daycare`, 2,655 lines)

- `CAPACITY_PER_SECTION = 4`, a hard-coded per-section capacity. The sections are `AM`, `PM` and `overnight`; Full Day occupies both AM and PM, and a boarding night occupies AM, PM and overnight.
- **On mount** it calls `listAnimals`, `listCustomers` and `getVisitMapping`. Dashboard edits reuse `NewBookingModal`; editing a stay is implemented as delete plus recreate.
- **Tabs:** **Dashboard · Pre-Boarding · Bookings · Occupancy · Risk Assessments · Policies · Checklists**.
  - **Dashboard.** `listDayBookings` for ±30 days. Clicking a row resolves its stay with `getBoardingBookingByStay(stayId)`; if no reference-numbered booking matches, it falls back to the legacy edit.
    - Three tiles show today's AM, PM and overnight counts as `n/4`, with a red border at capacity.
    - Two tiles show **This Month's Projected Income** for Boarding and for Day Care, computed as product price × quantity with placeholders excluded.
    - Three lists, **Arriving Today**, **Departing Today** and **Day Care Today**, each with Edit and Remove actions and a Check In or Check Out button that jumps to the booking detail with `autoStage`.
    - An **Upcoming bookings** table from `listBoardingBookings` (not archived, not checked in, starting today or later), sortable: reference · name · from · to · amount · days to go. The amount is the invoice total, or an italic estimate from `listDayBookings` rows (price × quantity).
  - **Pre-Boarding.** Renders `PreBoardingPage embedded` (see below).
  - **Bookings.** `listBoardingBookings()`.
    - Sub-tabs **Current / Complete / Archive**, with archive and unarchive via `archiveBoardingBooking`.
    - Sortable table: Reference · Customer · Dog(s) · Type · Dates · Drop off · Pick up · Invoiced (✓) · Total · Status pill (12 status labels, each with its own colour, sorted in lifecycle order).
    - **+ New booking** opens `NewBoardingBookingModal`.
    - Clicking a row opens **BookingDetail**, which loads `getBoardingBooking` and the invoice:
      - **Header.** "← Back to bookings", the reference, the status pill and a status-override `<select>` ("Automatic" plus every label; `setBoardingBookingStatus`, where `null` clears the override). Buttons: **Booking Confirmation** (`BookingConfirmationModal`), **Amend dates** (only once there is an invoice; `AmendBoardingBookingDatesModal`) and **Delete booking**.
      - **Delete booking** calls `deleteBoardingBooking`. If the error text contains "recorded against it", a **Delete all** button appears, which sends `?deleteAll=true` to reverse the payments first.
      - **Progress card.** The 9-stage timeline from the API (quote → confirmed → invoiceRaised → paymentReceived → preCheckIn → checkedIn → inProgress → checkedOut → invoicePaid) drawn with `StageDot`.
      - **Booking details.** Customer (opens `ViewCustomerModal` via `getCustomer`), Dog (opens `ViewAnimalModal` via `listAnimals(customerId)`), Type, Drop off, Pick up, Notes, Booking Confirmation Sent.
      - **Invoice card.** Invoice number (links to `/invoices?view=:id`), totals, paid so far, balance, and **Add payment** (`AddPaymentModal` with the invoice preselected). While no payment has been requested it also shows **Request deposit** and **Request full payment** (`requestBoardingBookingPayment`) and **Deposit not required** (sets the status override).
      - **Forms card** (`FormRow` ×3):
        - Pre-check-in: **Send now** or resend via `sendBoardingBookingPreCheckIn`, then view.
        - Check-in: **Fill in**, which calls `getBoardingWorkflowSettings`, creates a submission with `createFormSubmission`, opens `FormFillModal` with pet names prefilled, and on submit calls `recordBoardingBookingCheckIn`.
        - Check-out: the same flow, with the check-in submission shown read-only above it, finishing with `recordBoardingBookingCheckOut`.
        - Completed forms open `ViewFormSubmissionModal`.
      - **Observations.** `ObservationsCard`.
      - **Read-only rule.** Once a booking is checked out and paid, everything except Delete is read-only.
  - **Occupancy.** A week or month grid from `listDayBookings` and `listAnnualLeave`.
    - Each day shows a named box per dog per section, with a red border at capacity.
    - A day modal shows a 24h `TimelineRow` per booking, with AM (8am–1pm) and PM (1pm–6pm) background bands. Rounded bar ends mark exact times; square ends mean the stay continues past that edge.
    - Clicking a dog opens `BookingDetailModal`, which shows every row of the stay plus the invoice (`getInvoice`) and its payments (`listPayments`).
  - **Risk Assessments.** `RiskAssessmentsTab`.
  - **Policies.** `PoliciesTab`.
  - **Checklists** (`ChecklistsTab`). A week or month calendar from `listChecklistAssignments(from, to)`, with templates from `listChecklistTemplates()`.
    - The day panel assigns a template with `assignChecklist({ template, date })`.
    - Each `AssignmentCard` lets staff tick items (`toggleChecklistItem`, which records who ticked them), keep notes and a sign-off `SignaturePad` (`updateChecklistAssignment`), export a single PDF (`buildChecklistPdf`) and remove the assignment (`deleteChecklistAssignment`, after a confirm).
    - Two more buttons export a whole day or the whole visible range (`buildChecklistsPdf`).

#### `PreBoardingPage.tsx` (Pre-Boarding tab; `embedded` hides its `<h1>`)

- **Data:** `listPreBoardingForms()`.
- **Table:** Owner · Dogs (the names once the owner replies, otherwise "n dogs") · Result (`Awaiting reply` / `Suitable` / `Not suitable`) · Score · Created · delete.
- **New Form** modal: Name, Surname, Email, "How many dogs?". It calls `createPreBoardingForm`.
- **View** modal: `getPreBoardingForm`. If the form has not been answered yet, it offers **Copy link** (`${INTAKE_URL}/pre-boarding/:id`) and **Send email** / **Resend email** (`sendPreBoardingForm`). Once answered, it shows the answers per dog and per section, substituting `{{dogName}}`.
- **Delete:** `deletePreBoardingForm`.

#### `InvoicesPage.tsx` (`/invoices`)

- **Tabs:** **Invoices** and **Quotes**.
- **Shared FilterBar:** a search box (number or customer), a status select and a From/To date range.
  - Invoice status options: Outstanding (balance due), draft, sent, paid, overdue, cancelled, Partially paid.
  - Quote status options: draft, sent, accepted, declined, expired.
- **Invoices tab.** `listInvoices()`.
  - Sortable columns: Invoice Number · Customer · Invoice Date · Due Date · Invoice Total · Amount Paid · Remaining Balance · Status. The status is an editable select (`updateInvoiceStatus`).
  - Row checkboxes feed a bulk **Actions** menu with **Send (n)** and **Delete (n)**. Both run *sequentially* in a `for … await` loop and only touch rows the current filters show.
  - **New invoice** opens `DocumentFormModal`.
  - Each row's Actions menu: **View**, **Edit** (`DocumentFormModal existing`), **Send** (`SendPreviewModal`, then `sendInvoiceEmail`), **Payments** (`RecordPaymentModal`), **Request Deposit** (`RequestDepositModal`) and **Delete**.
  - **View** switches to a three-column layout: a compact list, then `InvoiceHtmlView` (shown immediately), then `InvoiceActivityPanel` (`listAuditLogForInvoice`). The **Download** link waits until `buildInvoicePdf(inv, 'invoice', businessInfo)` has finished in the background.
  - `?view=<id>` opens that invoice directly, then the param is dropped from the URL.
- **Quotes tab.** `listQuotes()`. Columns: Quote · Customer (with a "manual" badge for placeholder customers) · Total · Status (select, `updateQuoteStatus`) · Valid until. Row actions are View (`QuoteHtmlView` plus a PDF via `buildInvoicePdf(q, 'quote')`), Edit, Send (`SendPreviewModal kind="quote"`, then `sendQuoteEmail`) and Delete.

#### `FinancialPage.tsx` (`/financial`) and `FinancialSnapshotTab.tsx`

- **Tabs:** **Snapshot · Payments · Expenses · Credit Notes · Bank Transfers**.
- **Payments** (`listPayments` + `listOtherIncome`, merged newest first). Columns: Date · Invoice · Payment ID · Amount · Charges · Payment Method · Account. **Other Income** opens `OtherIncomeModal` (Date, Received from, Description, Amount, Account → `createOtherIncome`); those rows show an "Other income" badge and Received from / Description in the Invoice column, with only Delete (`deleteOtherIncome`). **Add payment** opens `AddPaymentModal`. Payment row actions:
  - "Send payment received email" (`sendPaymentReceivedEmail`).
  - "Send receipt": calls `getInvoice`, builds `buildReceiptPdf(payment, invoice)`, then `sendPaymentReceipt(id, dataUri, "Receipt <paymentId>.pdf")`.
  - Delete (`deletePayment`).
- **Expenses** (`listExpenses`). Columns: Date · Payee · Category · Paid From · Description · Amount · Attachment. Rows open `ViewExpenseModal`, which offers Edit. New and Edit open `ExpenseModal`. Delete calls `deleteExpense`.
- **Credit Notes** (`listCreditNotes`). Columns: Number · Date · Customer · Invoice · Amount · Reason. New opens `CreditNoteModal`; delete calls `deleteCreditNote`.
- **Bank Transfers** (`listBankTransfers`). Columns: Date · Reference · Source Account · Destination Account · Amount. New opens `BankTransferModal`; delete calls `deleteBankTransfer`.
- **Snapshot.** Eight cards you can drag to reorder with native HTML5 drag-and-drop. The order is saved to `localStorage['pawfectpets_admin_snapshot_order']` (inside try/catch, with unknown or missing card IDs reconciled). `cashFlow` and `projectedFlow` span both grid columns. Every card fetches its own data:
  1. **Total Receivables.** Calls `listInvoices`. Takes non-draft, non-cancelled invoices that still have a balance and splits them into Current and Overdue by due date, drawn as a split bar.
  2. **Total Payables.** A static note: "This app doesn't track vendor bills".
  3. **Cash Flow.** Calls `listBankAccounts` and `getIncomeExpenseReport(6|12)`. The chart's starting cash is the sum of `currentBalance` across accounts minus the net change over the period, and it plots a `CashFlowChart` from there. The card also shows incoming and outgoing totals.
  4. **Projected Flow.** Calls `listCustomers`, `listProducts`, `getVisitMapping`, `listBankAccounts`, `getIncomeExpenseReport(6)` and `listDayBookings`, with periods This Month / 3 / 6 / 12 months and a Cumulative or per-period toggle.
     - Income: active customers' regular days × the default product price, plus booked Boarding, Day Care and Visits.
     - Outgoings: the average of the last 6 months' expenses.
  5. **Income vs Expenses.** `IncomeExpenseChart`, 6/12 months.
  6. **Top Expenses.** Calls `getExpensesByCategoryReport` and shows the top 5 categories in `ExpensesByCategoryChart`.
  7. **Bank Accounts.** A list of balances from `listBankAccounts`, with each type labelled by `bankAccountTypeLabel`.
  8. **Expected Revenue.** A month picker covering 3 months back to 11 months ahead. Revenue is split into Walks, Boarding, Day Care and Visits: regular-day walks × product price, plus calendar bookings in those three product groups.

#### `ReportsPage.tsx` (`/reports`)

- **Tabs:** **P/L** and **Expenses by Category**.
- **P/L:** `getIncomeExpenseReport(6|12)` drawn as an `IncomeExpenseChart`, with totals and a Month · Income · Expenses · Net table. The note under it says: "Income is payments received net of any charges, minus credit notes issued."
- **Expenses by Category:** `getExpensesByCategoryReport(6|12)` drawn as an `ExpensesByCategoryChart`, with a Category · Amount · % of Total table.

#### `CommunicationsPage.tsx` (`/communications`)

- **Tabs:** **Conversations · Push Messages · Email**.
- **Conversations.** A polling chat with no websockets:
  - `listConversations` refreshes every **10s**, and the open `Thread` (`getMessageThread`) every **5s**.
  - Send calls `sendMessageToCustomer`. Delete calls `deleteMessage` after `window.confirm` ("removes it for everyone").
  - "New message" opens a page-local `CustomerPicker` modal. This is a different component from `components/CustomerPicker.tsx`.
- **Push Messages.** `listPushMessages`. Each sent push expands to show its recipients (Customer · Status Received/Not received · Acknowledged, when acknowledgement was required). Delete calls `deletePushMessage`.
  - **Send push** modal: a customer multi-select with search, Title, Body, an emoji picker (`PUSH_EMOJIS`) that inserts into whichever field was focused last, and "Acknowledgement required". It calls `sendPushMessage`, and a result modal reports the outcome.
- **Email.** `listEmailMessages`. Each email expands to show its recipients (Customer · Status · Read). Delete calls `deleteEmailMessage`.
  - **New Email** (wide modal): recipient type (Customers or Groups via `listEmailGroups`) with a de-duplicated live count, Subject, and a `RichTextEditor` body.
  - **Preview Email** renders the body through the `generic` template from `listEmailTemplates`, with `getBusinessInfo` supplying the logo.
  - Send calls `sendEmailMessage`.

#### `StaffTrainingPage.tsx` (`/staff-training`)

`<h1>Training Admin</h1>` with two tabs: **Modules** (`TrainingModulesTab`) and **Audit & Compliance** (`TrainingComplianceTab`).

#### `MyTrainingPage.tsx` (`/my-training`)

- **List view** (`listMyTraining`). Columns: Module · Last Score · Due · Status · **Open**. Double-clicking a row also opens it.
- **Detail view** (`getMyTrainingModule`). Content blocks in order:
  - video: a YouTube embed, with the URL parsed by `youtubeEmbedUrl`;
  - reading: rich HTML injected with `dangerouslySetInnerHTML`;
  - pdf: `TrainingPdfViewer`.
  - Then **Start Quiz** (`startTrainingAttempt`).
- **Quiz view.** Shows the pass mark and the questions; **Submit Quiz** calls `submitTrainingAttempt(attemptId, answers)`.
- **Results view.** A Pass or Fail badge, the score and the pass mark, then back to the list.

#### `SettingsPage.tsx` (`/settings`, 5,256 lines, 11 tabs)

The tab bar reads: **Business Info · Staff · Email · Email Templates · Invoice/Quotes · Bookings · Boarding · Pre-Boarding · Forms · Finance · Notifications**.

1. **Business Info.** One card per topic, and each card has its own save button and its own saving / error / saved state. Most write through `updateBusinessInfo` (`PATCH /settings/business`).
   - *Business details:* Name, Address, Town, Postcode, Telephone, Email, Website, and a Logo upload (image under 2MB, read as a data URL; Remove).
   - *Trusted IPs:* a list with Remove, "Add an IP address", and "Add my current IP (x)" via `getMyIp`. This restricts admin logins only; break-glass accounts are exempt.
   - *Terms and Conditions:* a `.docx` upload under 5MB. **Preview** calls `previewTerms` (or shows the stored `termsHtml`) in `TermsPreviewModal`; **Download** calls `downloadTermsFile`; **Remove** clears it. Also Version and Document date fields.
   - *Alternative Vet Care Authorisation*, *Off-Lead Consent* (supports `{{petName}}`) and *Declaration*: one textarea each.
   - **Vet Practices** card: a CRUD table of practices (name, address 1/2, town, county, postcode, telephone, email) via `list/create/update/deleteVetPractice`.
   - *Deposit:* a percentage from 0 to 100.
   - *QR Code URL:* overrides what `QrLoginModal` encodes.
   - **Document Numbering:** templates and next numbers for invoices (`INV-{year}-{seq}`), quotes (`QUO-…`), payment IDs (`PAY-…`) and credit notes (`CN-…`).
2. **Staff.**
   - Staff table: Name (with "(you)", **Break-glass** and **Locked** chips) · Username · Email · Role (or "Full access") · delete (disabled for yourself).
   - **New staff account** (`registerStaff`): name, username, email, password, break-glass, role.
   - **Edit staff account** (`updateStaff`): adds Locked. A separate `ChangePasswordModal` opens from inside the edit modal (`changeStaffPassword`).
   - **Access Permissions** card (roles): Name · Permissions ("All permissions" or "n of 8"). `RoleFormModal` has a checkbox, label and hint for each `PERMISSION_CATALOG` entry, plus Select all / Clear all.
3. **Email.**
   - *Microsoft 365 connection:* Tenant ID, Client ID, Client secret (write-only; the placeholder shows "Configured — leave blank to keep unchanged"), From address, From name. Uses `getEmailSettings` and `updateEmailSettings`.
   - *Send a test email* (`sendTestEmail`).
   - **Email Groups** card: a CRUD table; the edit modal has a group name and a searchable customer checklist (`list/create/update/deleteEmailGroup`, `listCustomers`).
4. **Email Templates.** One row per `EMAIL_TRIGGERS` entry (16): registration, update_info, add_pet, invoice, quote, payment_received, form, deposit_request, portal_login_code, portal_password_reset, portal_enabled, post_registration, form_copy, booking_confirmation, generic, pre_boarding.
   - Columns: Used for · Name · Subject. "Used for" and Name are sortable.
   - `EditTemplateModal` has a "Used for" title, template name, subject, an "Insert variable" select (from the trigger's `TRIGGER_PLACEHOLDERS`) and a `RichTextEditor` body. Legacy plain-text bodies are converted to HTML. Saves with `saveEmailTemplate` (`PUT`).
   - **Preview** (`TemplatePreviewModal`) fills in sample variables, including a sample line-item table from `buildItemsTableHtml`. Delete calls `deleteEmailTemplate`.
5. **Invoice/Quotes.**
   - **Products:** Code, Name, Description, Price, Availability (weekday / weekend / bank_holiday / none) and a "Display in Price List" toggle that PATCHes just that field.
   - **Bank Holidays** and **Annual Leave:** name plus date or date range.
   - **`PdfTemplateDesigner`.**
   - **Invoice Terms:** text, Plus Days, End of month, Default.
   - **Bank Details:** bank name, sort code, account number.
   - **Invoice Message** and **Quote Message** (notes text).
6. **Bookings.**
   - **Visits:** 6 product slots, 1 or 2 visits × weekday / weekend / bank holiday.
   - **Day Care:** Half Day, 2nd Dog Half Day, Full Day, 2nd Dog Full Day.
   - **Boarding:** Per Day, 2nd Dog Per Day, Half Day, 2nd Dog Half Day.
   - All three save with `updateVisitMapping` (`PATCH /settings/visits`).
7. **Boarding.**
   - **Booking reference:** format (`BK-{year}-{seq}`) and next number.
   - **Booking Information** and **Booking Terms:** rich text with "Insert variable" (`BOOKING_PLACEHOLDERS`), shown in the Booking Confirmation PDF.
   - **Pre-check-in:** days before drop-off, plus separate Boarding and Day Care forms.
   - **Check-in form:** Boarding and Day Care forms, "Require a photo", "Require a signature".
   - **Check-out form:** Boarding and Day Care forms, "Require a signature".
   - The three form cards save with `updateBoardingWorkflowSettings`.
   - **`ChecklistsCard`.**
8. **Pre-Boarding.** `PreBoardingSettingsTab`.
9. **Forms.** `FormsListCard`; editing a form switches the whole tab to `FormBuilder`.
10. **Finance.** **Bank Accounts** (`BankAccountModal`, `ViewBankAccountModal`; default star; delete), **Payment Methods** (name plus default), and `NamedListCard` instances for **Expense Categories** and **Vendors**.
11. **Notifications.** Toggles that save immediately via `updateNotificationSettings`:
    - Customer activated.
    - Appointment reminders, with a lead time of 15m / 30m / 45m / 1h / 2h / 3h.
    - Daily digest, with a time.
    - Invoice overdue.
    - Invoice read.

### Components catalogue (`src/components`)

#### Big components

**`FormBuilder.tsx`** (1,025 lines): the Settings > Forms editor.
- Uses `useWideLayout()` and has a two-column layout: the field list on the left and a **Live preview** on the right (`FormPreviewBody`).
- **Field types** (`SIMPLE_TYPES`): Text, Long text, Number, Date, Time, Yes / No (toggle), Choice, Multiple choice, File / photo (`maxFiles`, default 2), Signature, Medication list, Free text (display), Today's date, Date & time. Two more buttons add "Repeatable group (e.g. pets)" (`group`, with `repeatable`, `minRepeats: 1`, an optional maximum and `createsAnimal`) and a "New section" (a display field with `startsNewPage: true`).
- **Reordering:** fields drag to reorder with `@dnd-kit`. The top level (`TopLevelFieldList`) and each group's children (`GroupFieldList`) are separate drag contexts, so fields cannot move between them.
- **Per-field editor:**
  - Label, or Text for display fields, with **Bold** and **Underline** buttons that wrap the selection in `**…**` or `__…__` (`utils/richLabel.tsx`).
  - "Insert variable" from `FORM_PLACEHOLDERS`.
  - Required, and an optional Default answer.
  - Options (`OptionsEditor`).
  - Max files, minimum and maximum repeats.
  - **Only show if** (`ConditionEditor`): conditions on earlier toggle or choice siblings, combined with all or any.
  - **Map to customer/pet field** (`MappingPicker`), limited to the targets that `formFieldCatalog.compatibleKinds` allows for the field type.
- Deleting a field also removes any conditions that referenced it.
- A warning appears when the form maps some customer fields but leaves out a required one (`email, firstName, address1, town, postcode, phoneNumber`).
- Saving calls `createForm` or `updateForm`; "Back to list" leaves without saving.

**`PdfTemplateDesigner.tsx`** (778 lines): the Settings > Invoice/Quotes "Invoice Template" designer.
- **Canvas:** A4 at `SCALE = 1.15` px per pt.
- **Elements:** add `text`, `image`, `line`, `rect`, `qrcode` and `itemTable` (`ADD_TYPES`). `visitTable` exists only at render time.
- **Interaction:**
  - Drag to move; Shift+click to multi-select.
  - **Group** selected elements so they move together.
  - Arrow keys nudge the selection, but not while focus is in an input.
  - **Undo/Redo** keeps past and future stacks in a ref.
- **Toolbar:**
  - **Reset to Default** loads `DEFAULT_INVOICE_TEMPLATE`.
  - **Preview** renders `buildInvoicePdf(sampleInvoice(), 'invoice', { …info, invoicePdfTemplate: elements })` into an object-URL iframe.
  - **Save** calls `updateBusinessInfo({ invoicePdfTemplate })`.
- **`PropertyPanel` per element:**
  - X, Y, Width, Height.
  - **Show** (visibility): always, paid only, unpaid only, invoice-only or quote-only.
  - Text elements: Content with "Insert placeholder" from `PDF_PLACEHOLDERS`, font size, weight, align, colour, rotation.
  - QR elements: encoded content with placeholders.
  - Lines: colour and thickness.
  - Rectangles: fill and border.
- One template serves both invoices and quotes. `prepareForKind` rewords "Invoice" as "Quote" and hides money elements that only make sense on invoices.

**`DocumentFormModal.tsx`** (1,242 lines): the invoice and quote create/edit form (`xl` modal).
- **Loads:** `listCustomers`, `listProducts`, `listBankHolidays`, `getVisitMapping` and `listInvoiceTerms`, plus `listAnimals(customer)` once a customer is chosen.
- **Customer section:** a `CustomerPicker`. Quotes also have a **Manual Customer** button (`ManualCustomerModal` stores the name and email on the quote) and three toggles: **Visits**, **Day Care** and **Boarding**.
- **Details section:** number, issue date, Terms (a select; the due date comes from `plusDays` or `endOfMonth`, using the last working day), Due date (or "Valid until", issue date + 7 days for quotes), and Subject.
- **Plan sections (quotes only):**
  - Visits (animals, visits per day, start and end dates with first-day and last-day counts) uses `buildVisitPlan`.
  - Day Care (animals, date, drop-off and collection periods and times) uses `dayCareProductFor`.
  - Boarding (animals, start date and drop-off time, end date and pick-up time) uses `getBoardingPlan`.
  - Each section's **Save** merges product quantities into the item table and stores `visitPlan`, `dayCarePlan` or `boardingPlan`.
- **Item Table:** Item Details (type-ahead plus `ProductPickerModal`) · Quantity · Rate (£) · Discount % · Amount.
- **Buttons:** **Save as Draft** / **Save changes**, and **Create and Send** / **Save and Send**. The send buttons open `SendPreviewModal`, then call `sendInvoiceEmail` or `sendQuoteEmail`.

**`NewBookingModal.tsx`** (824 lines): the calendar booking form (title "New Booking" or "Update Booking").
- **Common fields:** Customer (`CustomerPicker`), Service (Visits / Day Care / Boarding), Animals.
- **Visits** (`submitVisits`, `buildVisitPlan`):
  - Visits per day, plus first-day and last-day counts with AM/PM.
  - Diffs against existing rows (create, update, delete, skip).
  - Blocks ranges that overlap annual leave (`rangeOverlapsAnnualLeave`).
  - Adds travel lines automatically.
- **Day Care:** Date, Drop Off AM/PM and time, Collection AM/PM and time. On edit it deletes the old `stayId` first, then creates the new rows.
- **Boarding:** Start date and drop-off time, end date and pick-up time. It calls `getBoardingPlan(startIso, endIso, dogCount)`, deletes the old stay when editing, then creates one row per plan line (`boardingStay`, `stayId`, `placeholder` for the pick-up day).
- **After a create** it shows `BookingInvoicePrompt`. There is also a Delete-booking confirm modal.

**`GenerateInvoicesModal.tsx`** (352 lines): the month-end bulk invoicing run on the Calendar page.
- **Loads:** `listDayBookings(monthStart, nextMonthStart)` and `listInvoices()` in parallel.
- **Billable rows** are those with no `invoice` that are not placeholders. They are grouped by customer, and within a customer by product into line items (quantity summed, `unitPrice` = product price, `discountPercent` 0).
- **Per customer it records:**
  - `lastDate`, which becomes the due date.
  - The customer's non-cancelled invoices, offered in a "match to existing invoice" select.
  - `paidInvoice`: a fully paid invoice whose subject is `Bookings for <Month YYYY>`, or one already linked from this month's bookings. Customers with one are **unticked by default**.
- **Each customer card** shows a checkbox, the name, the line-item count and the total, and expands to show its lines.
- **Confirm:**
  1. Calls `listInvoiceTerms()` to find the default term.
  2. For each ticked customer without a match, calls `createInvoice` with subject `Bookings for <Month>`, `issueDate` today, `dueDate` = `lastDate` (falling back to the term), and `paymentTerms` from the term.
  3. Calls `updateDayBooking(id, { invoice })` **once per booking, sequentially**.
  4. Matched customers get only the `updateDayBooking` links.
- **Result banner:** "Created N invoices and matched M customers…".
- The intro text says it covers "every not-yet-invoiced Walk and Visit", but the code includes every billable day booking in the month, whatever its product.

**`RichTextEditor.tsx`** (592 lines): a `forwardRef` WYSIWYG editor built on `contentEditable` and `document.execCommand`, with no editor library.
- **Handle:** `insertText(text)` inserts at the caret, or at the end when the editor is not focused.
- **Toolbar:**
  - Block format: Paragraph or H1–H3.
  - Font: Arial, Georgia, Times New Roman, Courier New, Verdana or Tahoma (web-safe only).
  - Size: 12–40px, applied by setting the legacy `fontSize 7` and then swapping it for `<span style="font-size">`.
  - Text colour, Bold, Italic, Underline.
  - Align left, centre or right; bullet and numbered lists.
  - Link, **Button** (a styled link), **Image** (`compressImageToDataUrl`, embedded as a data URI).
  - **Table** menu: insert; add a row above or below; delete a row; add a column left or right; delete a column; merge right or down; split.
  - **Box** (a bordered div), **Line** (`<hr>`), and a **source-view** toggle for editing raw HTML.
- **Paste handling:** pasted HTML is sanitised. Only P, BR, H1–H3, UL, OL, LI, B, STRONG, I, EM, U, A, TABLE, THEAD, TBODY, TR, TD, TH and DIV survive, and they lose every attribute. Other tags are unwrapped.
- **Used by:** SettingsPage (email templates, booking information and terms), CommunicationsPage (bulk email), TrainingModuleEditor (reading blocks), PoliciesTab (New Policy content) and PolicyDetailModal (Publish New Version content).

**`ScheduleTable.tsx`** (77 lines): the on-screen schedule shown in a document's Notes section, and the HTML counterpart of `invoicePdf.ts`'s `scheduleText` and `drawVisitTable`. A document has at most one of the three plans:
- **Visit Schedule:** Dates, "Visits n per day (first day x, last day y)", Pets.
- **Day Care Schedule:** Date, Drop off "AM (08:00)", Collection, Pets.
- **Boarding Schedule:** Dates, Drop off, Pick up, Pets.

Dates are shown as DD/MM/YYYY. `InvoiceHtmlView` and `QuoteHtmlView` render it.

#### All components (one line each)

| Component | What it does |
|---|---|
| `ActionsMenu` | A dropdown button labelled "Actions" (configurable). Items can be disabled, styled as danger, or preceded by a divider. Closes on an outside mousedown. |
| `AddAppointmentModal` | Creates a non-animal appointment (customer, reason, date, time) with `createAppointment`. Aware of annual leave. Shows a `TimeReadout`. |
| `AddPaymentModal` | "Add payment": Invoice\*, Date\*, Amount\*, Charges, Payment Method, Account\*. Can preselect an invoice and its balance, has an "is deposit" toggle that fills in the deposit amount (percentage × total), and calls `createPayment`. |
| `AddPetChoiceModal` | "Add a pet": add the pet manually, or email or copy the `${INTAKE_URL}/intake/:id/add-pet` link (`sendTriggeredEmail('add_pet')`). |
| `AmendBoardingBookingDatesModal` | Changes a confirmed booking's dates and times (`amendBoardingBookingDates`). The backend recalculates the invoice and keeps payments already made. |
| `Badge` | `<span class="badge badge-{value}">`. Replaces only the **first** `_` in the value with a space. |
| `BankAccountModal` | New or edit an account: Type (bank / savings / pot), Name, Sort Code, Account Number, and a one-time Opening Balance plus date (`create/updateBankAccount`, `setBankAccountOpeningBalance`). |
| `BankTransferModal` | "New Transfer": Date, Reference, Source and Destination accounts, Amount (`createBankTransfer`). |
| `BookingConfirmationModal` | Builds `buildBookingConfirmationPdf` and previews it in an iframe, with **Download** and **Send by Email to <email>** (`sendBoardingBookingConfirmation` sends the data URI). |
| `BookingInvoicePrompt` | After a booking is created, asks "Generate an invoice?". Yes creates a draft invoice with one line per product (`createInvoice`, `listInvoiceTerms`, `listProducts`) and links the rows to it (`updateDayBooking`). |
| `CashFlowChart` | Hand-drawn SVG chart of cumulative or per-period cash, with optional projected styling and gridlines rounded to tidy values. |
| `ChecklistsCard` | Settings > Boarding > Checklists: templates with a category, name, complete-by time, ordered items and auto-assign (`list/create/update/deleteChecklistTemplate`). |
| `CopyMoveAnimalModal` | Copies a pet to another customer (a linked, synced copy) or moves it (`copyAnimal` / `moveAnimal`), using `CustomerPicker`. |
| `CreditNoteModal` | Customer\*, Invoice (filtered to that customer), Date\*, Amount\*, Reason\*, Account (`createCreditNote`). |
| `CustomerPicker` | A searchable customer combobox sorted A–Z. Matches name or email, and pet names when `animals` is passed. |
| `DateInput` | A dd/mm/yyyy text field with automatic slashes and a hidden native date input for the calendar picker. Value in and out is `YYYY-MM-DD`. |
| `DateTimeReadout` (`TimeReadout`) | Shows a 24h time label next to a `<input type=time>` value, because Safari and Firefox ignore `lang`. |
| `DocumentFormModal` | Invoice and quote form (see above). |
| `EditAnimalModal` | Full pet edit form (`updateAnimal`), 492 lines. |
| `EditCustomerModal` | Client details, emergency contact (with "same as client") and emergency vet fields (`updateCustomer`). |
| `ExpenseModal` | New or edit expense: Date\*, Category\*, Payee (with an inline "Add new payee" button that calls `createVendor`), Payment Method, Description, Amount\*, Account, Receipt (JPG/PNG/PDF up to 4MB, renamed `Date-Payee-Amount.ext` on save, e.g. `08-10-2026-Amazon-9.99.pdf`). Pre-selects the default account and method on new expenses. |
| `ExpensesByCategoryChart` | Horizontal SVG bar chart, 700 units wide, bars in `--error` red, with `<title>` tooltips. |
| `FormAssignmentModal` | "Use <form> for…": assigns a form to any of the 6 workflow slots (pre-check-in, check-in, check-out × Boarding / Day Care) via `updateBoardingWorkflowSettings`. Also exports `slotsUsingForm`. |
| `FormBuilder` | See above. |
| `FormFillModal` | Staff fill in check-in and check-out forms. Fetches the public submission, substitutes `{{staffMemberSignedIn}}` on the client, carries multichoice answers over from the check-in submission, validates required fields (including inside groups), calls `submitFormSubmission`, then offers "Email a copy" (`buildFormSubmissionPdf`, then `sendFormSubmissionCopy`). |
| `FormPreviewBody` | Interactive preview of a form's fields, with visibility conditions evaluated (logic duplicated from the frontend). Labels go through `withPetName`, so `{{petName}}` reads "your dog" rather than the raw token; other placeholders stay literal. File and signature fields are inert. |
| `FormPreviewModal` | Wraps `FormPreviewBody` in a modal with an optional Send action. |
| `FormsListCard` | Settings > Forms list (`listForms`, `getBoardingWorkflowSettings`): Name · Description · Fields · Used For (`slotsUsingForm`) · Visible (an optimistic `setFormVisible` toggle) · icon buttons for "Use for…" (`FormAssignmentModal`), Send (`SendFormModal`), Edit and Delete (`deleteForm`). |
| `GenerateInvoicesModal` | See above. |
| `IncomeChart` | SVG monthly income bars on the customer Activity tab. |
| `IncomeExpenseChart` | SVG grouped income vs expense bars per month. |
| `InvoiceActivityPanel` | The invoice's audit log (`listAuditLogForInvoice`). Badge colours depend on the event type. Refetches when `refreshToken` changes. |
| `InvoiceHtmlView` | Flowing HTML invoice: a PAID stamp, Balance Due, the item table, Sub Total / Total / Payment Made / Balance Due, Notes with `ScheduleTable`, and "BANK Transfer Details" with a bank QR code. It deliberately ignores the PDF template. |
| `ManualCustomerModal` | Takes a name and email for a placeholder quote customer. The real customer record is created when the quote is accepted. |
| `MedicationEntriesField` | Repeating medication rows (name, illness, dosage, frequency, flags, additional info). |
| `Modal` | Backdrop plus panel in sizes `wide`, `xl` and `full`, with optional `headerActions`. Clicking the backdrop closes it. There is no Escape handler and no dialog role. |
| `NamedListCard` | Generic CRUD card for `{ name }` lists, driven by the `list`, `create`, `update` and `remove` props. |
| `NewAnimalModal` | Full create-pet form (`createAnimal`), 474 lines. |
| `NewBoardingBookingModal` | Creates a reference-numbered Boarding or Day Care booking directly (`createBoardingBooking`); the backend raises the invoice straight away. |
| `NewBookingModal` | See above. |
| `NotificationBell` | A bell with a red dot when there are unread items. Opening it lists the feed (`listNotifications`), marks everything read (`markNotificationsRead`) and offers Clear (`clearNotifications`). Polls every 60s. |
| `ObservationsCard` | Booking care notes. Category is one of Toilet, Play, Medication, Feed, Groom or General (each with its own colour). Each note has a date/time, a description and up to 5 compressed photos (with an `xl` photo viewer), plus "Observed by". CRUD via `*BookingObservation`. |
| `PdfTemplateDesigner` | See above. |
| `PhotoUpload` | A photo grid input, ported from the frontend intake app (used inside `FieldRenderer`). |
| `PoliciesTab` | Policies list with tiles for "Published policies" and "Awaiting review" (with names). Sortable columns: Policy ID, Policy, Category, Version, Last reviewed, Next review, Reviewed, Status. Double-clicking a row opens `PolicyDetailModal`. Actions: Assign Users, Export to PDF (`buildPolicyPdf`), Send via Email, Delete. A New Policy modal includes `StaffSignOffPicker`. |
| `PolicyDetailModal` | `xl` modal for one policy. Actions: Send Reminder (when sign-offs are outstanding), Publish New Version ("What changed?", content, sign-off staff), Edit Details, Audit (a log table), and Reset to v1 (danger). A "Policy Review" sign-off asks for a typed name (`signOffPolicy`). |
| `PreBoardingSettingsTab` | Scoring pass mark (`maxScore`). Questions table: Question · Type · Max points · Active. The question editor covers section, answer type, and per-answer score, "ask for details" and auto-fail. Also "Reset questions to defaults" (`resetPreBoardingQuestions`). Saves via `PUT /pre-boarding/settings`. |
| `ProductAvailabilityWarningModal` | Confirms before using a product on a day type it is not configured for. |
| `QrLoginModal` | QR code of the server URL for mobile pairing (see Auth). |
| `QuoteHtmlView` | Flowing HTML quote, the counterpart of `InvoiceHtmlView`. |
| `RecordPaymentModal` | "Record Payment" against a known invoice: Date\*, Amount\*, Charges, Method, Account\* (`createPayment`). |
| `RegistrationLinkModal` | Shows the intake link with copy and send (or resend) actions via `sendTriggeredEmail` (`registration` or `update_info`). Can report the activity `entryId` back to the caller. |
| `RequestDepositModal` | Previews the deposit (percentage × total, rounded in cents) and sends it with `requestDeposit`. |
| `RichTextEditor` | See above. |
| `RiskAssessmentDetailModal` | `full`-size modal with a risks table: # · Hazard / Risk · Who At Risk · Existing Controls · Further Actions · L · S · Score · Residual Risk · Review · Actions. Supports adding, editing and deleting risks (Likelihood and Severity 1–5), an audit log, and **Review Policy**. Also exports `ReviewRiskAssessmentModal`, a read-only version. |
| `RiskAssessmentsTab` | Risk assessment list: RA ID · Assessment Name · Regulation Reference · Review Frequency · Next Review Date · Status · Risks. Double-clicking a row opens the detail modal. Actions: Review, Edit, Export to PDF (`buildRiskAssessmentPdf`), Send by Email, Delete. |
| `ScheduleTable` | See above. |
| `SendFormModal` | Sends a form. Fields: existing customer (optional), "Which pet(s) is this for?", recipient name and email. Calls `createFormSubmission`, shows the `${INTAKE_URL}/forms/:id` link, and can email it (`sendTriggeredEmail('form')`). Warns when the form uses placeholders but no customer has been chosen. Can preview the form via `FormPreviewModal`. |
| `SendPreviewModal` | Previews the invoice or quote email exactly as the template (`listEmailTemplates`, `getBusinessInfo`) will render it, before sending. Also exports `customerLabel`. |
| `SetOpeningBalanceModal` | Re-anchors an account's opening balance and date (`setBankAccountOpeningBalance`). |
| `SignaturePad` | Canvas signature capture that outputs a data URL, with a read-only mode. |
| `SortableTh` | A `<th>` that sorts on click and shows a caret. |
| `TrainingAssignUsersModal` | Assigns a module to specific staff, or switches on "assign all" (`listTrainingStaffOptions`, `assignTrainingModuleUsers`, `setTrainingModuleAssignAll`). |
| `TrainingComplianceTab` | `getTrainingCompliance` table: Staff · Module · Last Score · Result · Completed · Next Due · Status. |
| `TrainingModuleEditor` | Module name, description, status, review frequency, "due within" days, pass mark %, and questions per attempt (default 5). Content blocks are Video (URL), Reading (`RichTextEditor`) or PDF (a file read as a data URL; existing files fetched with `getTrainingContentFile`). The question bank has 4 options each with a correct-answer radio button. Saves with `create` or `updateTrainingModule`. |
| `TrainingModulesTab` | Modules table: Module · Content · Test · Pass Mark · Assigned · Status · Review. Actions: Edit, Assign Users, Delete. |
| `TrainingPdfViewer` | Fetches a PDF block as an authenticated blob and shows it in an iframe through an object URL. |
| `ViewAnimalModal` | Read-only pet profile. Loads the off-lead wording via `getBusinessInfo`, with a fallback. |
| `ViewBankAccountModal` | One account's monthly statement (`getBankAccountTransactions(id, month, year)`): Date · Description · Amount · Balance. Has a month/year picker and a gear button that opens `SetOpeningBalanceModal`. |
| `ViewCustomerModal` | Condensed client details with an "Open" button that goes to `/customers/:id`. |
| `ViewExpenseModal` | Read-only expense with the receipt (image, or PDF inline), its Date-Payee-Amount name with a Download link, and Edit. |
| `ViewFormSubmissionModal` | Renders a submission as a PDF (`buildFormSubmissionPdf`) in an iframe. |
| `icons.tsx` | Inline SVG icons: nav icons (Customers, Enquiries, Bookings, Boarding, Invoices, Financial, Reports, Activity, Settings, Training, Logout) and UI glyphs (Trash, Pencil, Plus, PlusCircle, ChevronDown, Video/Reading/Pdf content, …). |

### `src/forms/` (staff-side form engine)

| File | Purpose |
|---|---|
| `FieldRenderer.tsx` | Renders one `FormField` for the given type: display, today, datetime, text, textarea, number, date, time, toggle, choice, multichoice, file (`PhotoUpload`), medications (`MedicationEntriesField`) or signature (`SignaturePad`). Labels go through `RichLabel`. It reimplements the frontend's renderer using admin's `.field` CSS classes. |
| `RepeatableGroup.tsx` | Renders the repetitions of a group, with add and remove. Ported from the frontend. |
| `ReadOnlyAnswers.tsx` | Read-only answer list, used to show the check-in answers above a check-out form. Formats medications with `formatMedications`. |
| `formDefaults.ts` | `defaultAnswersFor(fields)`, `isFieldVisible(field, scopeAnswers)` (all/any conditions), and `withPetName(fields, name)`, which substitutes `{{petName}}` for each repetition ("your dog" when there's no name). A straight copy of the frontend file. |

### PDF documents (`src/pdf`, generated client-side)

Every PDF is made in the browser with **jsPDF** as A4 in points (595.28 × 841.89). The risk assessment is the one landscape document. There are three rendering styles:

| Style | Engine | Fonts | Files |
|---|---|---|---|
| **Brand vector** (`brandPdf.ts`, `BrandPdfWriter`) | Real jsPDF text and shapes; selectable and small | **Archivo Black** (display) and **DM Sans** Regular/Bold/Italic, bundled TTFs in `src/assets/fonts/` (SIL OFL 1.1). Loaded once with `fetch`, then `addFileToVFS`/`addFont`, with a module-level `fontCache`. Falls back to Helvetica if loading fails. | `customerFormPdf.ts`, `formSubmissionPdf.ts`, `checklistPdf.ts` |
| **HTML → canvas → image** (`htmlToPdf.ts`, `renderHtmlToPdf`) | `html2canvas` captures an off-screen fixed `div` (40pt margins, ~800px render width per 515pt). One image if it fits; otherwise it slices at blank pixel rows and avoids breaking straight after headings (`findHeadingBoxes`). Text is **not** selectable. | Whatever web fonts are loaded. `bookingConfirmationPdf.ts` waits for Archivo Black and DM Sans from Google Fonts (`loadBrandFonts`). Policy and risk PDFs use Georgia headings and Helvetica/Arial body text. | `bookingConfirmationPdf.ts`, `policyPdf.ts`, `riskAssessmentPdf.ts` |
| **Template / hand-drawn vector** | jsPDF primitives | Helvetica (plus Times bold in the receipt header) | `invoicePdf.ts` (invoices and quotes), `receiptPdf.ts` |

The shared brand palette is blue `#0072b5`, yellow `#fdf101`, pink `#d7385e`, cream `#fbf7ee`, ink `#1d2a33` and muted `#5f6f7a`. It is defined separately in `brandPdf.ts` and `bookingConfirmationPdf.ts`. The HTML header in `htmlToPdf.ts` and `receiptPdf.ts` use the green/orange admin palette instead (`#1f3b2c`, `#e8963c`). Every PDF logo comes from the bundled `src/assets/logo.png`; none uses the logo uploaded in Business Info (`logoImage`).

#### `BrandPdfWriter` (in `brandPdf.ts`)

- `init()` registers the fonts and loads the logo.
- `drawHeader({ title, subtitle, badge })` draws an 80pt rounded **blue band** with the logo. The **last word of the title** is yellow with an underline bar. The subtitle is italic, and an optional right-hand badge shows a small-caps label with a yellow pill.
- `section(title, blocks, { card })` draws a cream rounded card with an Archivo Black heading over a short yellow bar. It keeps the section together or starts a fresh page, and splits it across pages when it is taller than one page.
- `startNewPage()`.
- `finish(contactLine)` adds a pink sign-off band with the contact details (when there is a contact line) and a footer reading "Page i of n" on every page.
- Block helpers: `fieldRowBlock`, `stackedFieldBlock`, `paragraphBlock`, `subheadingBlock`, `listBlock`, `mutedNoteBlock`, `signatureBlock` (embeds the signature PNG), `checklistBlock` (with a drawn tick), `spacerBlock`, and `richText`. `richText` word-wraps the `**bold**` / `__underline__` markup, drawing bold runs in blue and underlined runs as bold pink.

#### Document catalogue

| Document | Builder | Triggered from | Contents |
|---|---|---|---|
| **Registration form** (the customer's intake record) | `buildCustomerFormPdf(customer, animals, alarmInstructions, termsHtml?, vetAuthText?, offLeadText?, declarationText?)`, brand vector | CustomerDetailPage > Actions > **View** (an `xl` iframe), and attached automatically as a snapshot to the activity entry after "Send email" or "Request Update" (`logFormSnapshot`) | Header "Registration form / for <name>" with a "Signed <date>" badge. Sections: **Client details** (name, email, phone, address) · **Emergency contact** (or "Same as client") · **Emergency vet** (practice, address, telephone, email, alternative care authorisation wording, signature) · **Security arrangements** (keys provided, **Alarm/KeySafe Code** decrypted via the API, further info) · **Pet — <name>** for each animal (species, breed, sex, age, colour/markings, microchip, insured/insurer, spayed/neutered with last season for intact females, temperament, medication summary, lead mode and off-lead consent signature for dogs, …) · **Terms & conditions** (the uploaded `.docx` HTML converted to blocks, else a hard-coded numbered fallback list) · **Client agreement** (declaration text, signed by, client signature). Pink contact band at the end. |
| **Form submission**: check-in, check-out, pre-check-in and any FormBuilder form | `buildFormSubmissionPdf(submission)`, brand vector | `ViewFormSubmissionModal` (iframe; Boarding booking detail and the customer Forms tab), and `FormFillModal` > "Email a copy" (`sendFormSubmissionCopy`) | Header: the form name, "for <recipient>", and a "Submitted <date>" badge. The content is built generically from `formFieldsSnapshot` and `answers`. A top-level *display* field starts a new section titled with its label, and `startsNewPage` forces a page break. A repeatable group becomes one section per repetition ("<group> — <pet name>"), or "None provided.". Sections named after the form itself are retitled **Details**, or **Sign-off** when last. Answers are formatted per field type: toggle as Yes/No, medications one per line, photos as a count only ("images stay in the app"), and signatures embedded. The description goes at the top. |
| **Pre-check-in** | No separate builder. It is a form submission (above) of the Settings > Boarding pre-check-in form. | — | — |
| **Check-in / Check-out** | The same form-submission PDF, using the forms chosen in Settings > Boarding | — | — |
| **Daily checklist(s)** | `buildChecklistPdf(assignment)` and `buildChecklistsPdf(assignments, subtitle)`, brand vector | Boarding & Day Care > Checklists: a single card's export, or the whole day or range | Header "Daily checklist" (or "Daily checklists") with the full date or range. One section per assignment: "Complete by", each item with a drawn checkbox (ticked in blue) and "who completed it" in muted text, Notes, and the sign-off signature. No contact band (`finish('')`). |
| **Booking confirmation** | `buildBookingConfirmationPdf(booking, invoice, businessInfo)`, HTML → canvas | Booking detail > **Booking Confirmation** (`BookingConfirmationModal`: preview, Download, and email via `sendBoardingBookingConfirmation`) | A blue header band with a round white logo badge, "PAWFECT PETS · SHERBORNE", "Booking **confirmed**" (yellow underline), "for <customer>", and a yellow pill with the **reference**. Two cream cards: **Your booking** (Pet/Pets, Type Boarding or Day Care, Drop off and Pick up date+time, Notes) and **Payment** (Invoice, Total, Payments received, Balance due or "Paid in full", or "Not yet invoiced"). Then the Settings > Boarding **Booking Information** rich text, a **Booking terms** heading with the **Booking Terms** rich text (falling back to a default closing message), both with `{{tokens}}` filled by `interpolateBookingPlaceholders`. A pink band "Questions? Just get in touch" with phone and email, and "Generated <date>". |
| **Invoice** and **Quote** | `buildInvoicePdf(record, 'invoice' \| 'quote', businessInfo)`, template-driven vector | InvoicesPage View/Download (both tabs), and the PdfTemplateDesigner Preview (sample invoice) | Draws `businessInfo.invoicePdfTemplate` (or `DEFAULT_INVOICE_TEMPLATE`): absolutely positioned elements of types `text`, `image` (the logo), `line`, `rect`, `qrcode` (default content `{{bankName}} {{sortCode}} {{accountNumber}}`) and `itemTable` (columns `#` · Item & Description · Qty · Unit Price · Line Total; paginates its own rows). Default element ids: logo, business-name/address, doc-title, doc-number, balance-due-top, paid-stamp, header-divider, invoice-to label/body, date/terms/due-date rows, item-table, summary subtotal/total/paid/box/balance, notes label/body, bank label/body, qr-code and caption, visit-schedule. Text placeholders (`PDF_PLACEHOLDERS`, 30 of them): invoiceNumber, invoiceDate, dueDate, terms, docTypeLabel, docNumberLabel, docToLabel, docDateLabel, dueDateLabel, customerName/Address/Email/Phone, subtotal, total, amountPaid, balanceDue, subject, notes, business Name/Address/Town/Postcode/Telephone/Email/Website, bankName, sortCode, accountNumber, status. Visibility rules: always, paid, unpaid, invoice-only, quote-only. For quotes, `prepareForKind` rewrites "Invoice" wording and drops money elements that only apply to invoices. A Visits/Day Care/Boarding schedule is appended to `{{notes}}`, or injected as a `visitTable`. `resolveLayout` reflows elements below text that grows, and anything that still overflows moves to a second page. |
| **Payment receipt** | `buildReceiptPdf(payment, invoice)`, own small writer | Financial > Payments > "Send receipt" (emailed with `sendPaymentReceipt` as `Receipt <paymentId>.pdf`) | A green header with the logo badge and "PawfectPets Sherborne" in Times bold. One **Payment receipt** section: Receipt (payment ID), Date, Invoice, Amount received, Payment method, Invoice total, Balance remaining or "Paid in full". |
| **Policy** | `buildPolicyPdf(policy, version)`, HTML → canvas | PoliciesTab > Export to PDF | `pdfBrandHeader()` (logo plus "PawfectPets Sherborne" over an orange rule), "Policy <policyId>", the name, a meta line (category · reference · vN · Published <date>), the version's HTML content, and `pdfFooter()` ("Generated <date>"). |
| **Risk assessment** | `buildRiskAssessmentPdf(assessment)`, HTML → canvas, **landscape** | RiskAssessmentsTab > Export to PDF | Brand header, the name, a key/value table (RA ID, Assessment Date, Review Frequency, Next Review Date, Status, Regulation Reference, Scope), then a **Risks** table: # · Hazard / Risk · Who At Risk · Existing Controls · Further Actions · L · S · Score (colour-banded low/medium/high) · Residual · Review. Footer. |

### Utilities (`src/utils`)

| File | Exports and purpose |
|---|---|
| `annualLeave.ts` | `annualLeaveOn(date, ranges)` and `rangeOverlapsAnnualLeave(start, end, ranges)`. Converts UTC ISO dates back to local `YYYY-MM-DD` before comparing. |
| `bankAccountType.ts` | `bankAccountTypeLabel(type)`: bank, savings or pot to a display label. |
| `bookingPlaceholders.ts` | `BOOKING_PLACEHOLDERS` (customerName, firstName, petName, bookingReference, bookingType, dropOffDate, dropOffTime, pickUpDate, pickUpTime, invoiceNumber, total, balanceDue, businessName, businessPhone, businessEmail, businessAddress, businessWebsite) and `interpolateBookingPlaceholders(html, booking, invoice, businessInfo)`, which HTML-escapes values. |
| `compressImage.ts` | `compressImageToDataUrl(file, maxWidth = 1200, quality = 0.72)`: canvas downscale and JPEG re-encode to a data URL. Used for note attachments, observation photos and editor images. |
| `emailTemplate.ts` | A hand-kept copy of the backend's `interpolateSubject`, `interpolateBody`, `stripConditionals` and `buildItemsTableHtml`, plus `escapeHtml`, so that previews match what is actually sent. |
| `formFieldCatalog.ts` | `CUSTOMER_MAPPING_TARGETS` (34 customer paths), `ANIMAL_MAPPING_TARGETS` (37 animal paths, some limited to dogs or to non-cats), `compatibleKinds(fieldType)` and `mappingTargetsFor(target, fieldType)` for FormBuilder's "Map to". |
| `formPlaceholders.ts` | `FORM_PLACEHOLDERS`: customerName, firstName, surname, email, phone, address, postcode, petNames, petName, staffMemberSignedIn. |
| `formatMedications.ts` | `formatMedications(value)`: one line per medication, joined with " -- ". |
| `permissionCatalog.ts` | `PERMISSION_CATALOG` (8 keys: `customers.manage`, `customers.viewSecurity`, `bookings.manage`, `invoicing.manage`, `financial.manage`, `settings.manage`, `staff.manage`, `training.manage`), each with a label and hint. Kept in sync by hand with `backend/src/auth/permissions.catalog.ts`. |
| `productAvailability.ts` | `AVAILABILITY_LABELS`, `dayTypeFor(date, bankHolidays)` (a bank holiday outranks weekday/weekend), and `availabilityMismatch(product, date, bankHolidays)`, which returns a warning string or null. |
| `richLabel.tsx` | `parseRichLabelRuns(raw)` for the non-nesting `**bold**` and `__underline__` markup, and the default `<RichLabel text>` component that renders it. |
| `visitMapping.ts` | `oneVisitProductIds`, `twoVisitProductIds`, `isVisitProduct`, `visitCountForProduct`, `isDayCareProduct`, `isBoardingProduct` (Per Day only), and `dayCareProductFor(mapping, drop, collect)`, where only AM→PM counts as a Full Day. |
| `visitPlan.ts` | `parseYmd`, `dateKey`, `addDays`, and `buildVisitPlan(start, end, mapping, bankHolidays, counts…)`, which works out each day's visit product from the 1/2 visits × weekday/weekend/bank-holiday mapping and returns `{ plan, missing }`. |

`src/types.ts` (1,331 lines) holds every DTO and interface shape, hand-written to mirror the backend schemas, plus constants such as `OBSERVATION_CATEGORIES`, `MAX_OBSERVATION_PHOTOS = 5` and `BOOKING_STATUS_LABELS`.

### Styling, theme and fonts

- **One global stylesheet:** `src/index.css` (1,179 lines). There are no CSS modules, no Tailwind and no CSS-in-JS library. Pages also use a lot of inline `style={{…}}` objects: about 168 in `SettingsPage`, 149 in `BoardingDayCarePage` and 113 each in `CustomerDetailPage` and `CommunicationsPage`.
- **Design tokens** on `:root`:
  - brand: `--brand-green #1f3b2c`, `--brand-green-soft`, `--accent #e8963c`, `--accent-dark`, `--accent-light`;
  - surfaces and text: `--sage`, `--sage-badge`, `--ink #232c26`, `--muted #6f7d72`, `--border #e3e8de`, `--bg #f6f7f2`, `--card #fff`;
  - status: `--error`, `--warn` and `--info` (each with a `-light` variant);
  - shadows (`sm`, `md`, `lg`) and radii (8, 12, 18px);
  - `--font: 'Work Sans'` and `--font-display: 'Fraunces'`, both from Google Fonts in `index.html`.
- **Class vocabulary:** `.app-shell`, `.sidebar`, `.topbar`, `.content` / `.content-wide`, `.page-header`, `.tabs`, `.card`, `.section-title`, `.field` / `.field-row`, `.btn` (`-primary`, `-secondary`, `-success`, `-danger`, `-sm`, `-link`), `.icon-btn`, `.badge-*` (one per status), `.modal*`, `.error-banner`, `.empty-state`, `.actions-menu*`, `.rte*` (RichTextEditor), `.item-table` / `.item-picker*`, `.date-input*`, `.signature-*` and `.login-*`.
- **No `@media` queries at all**, so there are no responsive breakpoints, and **no dark mode**.
- **Fonts in the PDFs:** the bundled `src/assets/fonts/ArchivoBlack-Regular.ttf` and `DMSans-{Regular,Bold,Italic}.ttf` are used by `brandPdf.ts`. The HTML-capture PDFs rely on whatever web fonts are loaded at the time.

### Suggested improvements (admin)

Each point cites the code it comes from. Items marked *(feature)* are new capabilities; the rest are UX, performance or code-quality changes.

**Security and auth**
1. **Gate routes client-side.** `App.tsx` gives every route to any signed-in user, and `Layout.tsx` only hides the Training Admin link, so `/staff-training` still loads by URL and then fails with 403s. Add a `RequirePermission` wrapper that reads `staff.role.permissions`, using the same "no role or break-glass means full access" rule as `Layout.tsx`. Also hide destructive menu items (Delete under `customers.manage`, `invoicing.manage` and `financial.manage`) for roles that lack them, instead of letting staff click and get a server error.
2. **Token handling.** `AuthContext.tsx` puts the bearer token in `localStorage` even when "Keep me signed in" is unchecked. Use `sessionStorage` when `rememberMe` is false. Also call a backend logout or revoke endpoint from `logout()` if the backend has one; today the client only forgets the token.
3. **Sanitise injected HTML.** Seven places use `dangerouslySetInnerHTML`, including `MyTrainingPage.tsx` (reading blocks), `PolicyDetailModal.tsx`, `SettingsPage.tsx` (terms preview and template preview) and `CommunicationsPage.tsx` (email preview). Pasted HTML is cleaned (`RichTextEditor.sanitizePastedHtml`), but source-view edits and stored content are rendered as-is. A small allow-list sanitiser such as DOMPurify would close that gap.

**API layer and performance**
4. **Add a query cache.** `api/client.ts` has no caching, and pages refetch the same reference data independently. `BoardingDayCarePage`, `BookingsPage`, `DocumentFormModal` and `FinancialSnapshotTab` each load `listCustomers`, `listAnimals`, `listProducts` and `getVisitMapping`. On the Snapshot tab alone, four cards each call `listBankAccounts` or `getIncomeExpenseReport`. A shared cache (TanStack Query, or a small context) would remove the duplicate requests and the `refreshSignal` counters in `BoardingDayCarePage.tsx`.
5. **Batch the N+1 writes.**
   - `GenerateInvoicesModal.handleConfirm` calls `updateDayBooking` once per booking, sequentially.
   - `InvoicesPage.handleBulkSend` and `handleBulkDelete` loop with `await`.
   - `NewBookingModal` creates boarding and visit rows one call at a time.

   Bulk endpoints (for example `PATCH /day-bookings/bulk { ids, invoice }`), or at least `Promise.all` with limited concurrency, would make these faster. A failure part-way through currently leaves the work half-applied, and only one error message is shown.
6. **Fix the polling.**
   - `Layout.tsx` restarts its 15s unread-messages timer on every `location.pathname` change, which fires an extra request on every navigation. Make the effect depend on nothing.
   - `CommunicationsPage` polls every 5s and 10s even while the browser tab is hidden. Pause on `document.visibilityState === 'hidden'`.
   - Consider a server-sent events or websocket channel for messages and notifications.
7. **Make requests cancellable.** `request()` takes no `AbortSignal`, so rapid week/month navigation in `BookingsPage` and the Occupancy and Checklists tabs can let an older response overwrite a newer one. Only a few components guard against this with a `cancelled` flag.
8. **Load heavy libraries on demand.** `jspdf`, `html2canvas` and `qrcode` are imported statically by `pdf/*` and some components, so they ship in every page chunk that imports a PDF builder. A dynamic `import()` at the moment of export would shrink `InvoicesPage`, `CustomerDetailPage` and `BoardingDayCarePage`.
9. **Stop storing images as data URIs.** Logos, receipts, training PDFs, observation photos and editor images are all saved inline as base64 (see the comment in `RichTextEditor.tsx` about "base64-data-URI-in-Mongo"). Moving them to object storage would shrink payloads, as seen with `listActivities` stripping attachments and needing a separate `getActivity`.

**UX**
10. **Modal accessibility.** `components/Modal.tsx` closes on any backdrop click, which can discard a long form such as `DocumentFormModal` or `NewBookingModal`. It has no Escape key handling, no `role="dialog"`/`aria-modal`, and no focus trap. Add these, and ask before closing a form with unsaved changes.
11. **Replace double-click rows.** Rows that open only on double-click (`PoliciesTab.tsx:277`, `RiskAssessmentsTab.tsx:106`, `MyTrainingPage.tsx:114`) are hard to discover and do not work on touch devices. Use a single click, as `CustomersPage` and the Boarding Bookings table do.
12. **Replace native dialogs.** `window.confirm` is used for stay deletion (`BookingsPage`, `CustomerDetailPage`, `BoardingDayCarePage`), checklist removal and message deletion, and `RichTextEditor` uses `window.alert`. Use the app's `Modal` so these confirmations look and behave like the rest of the app.
13. **Make the layout responsive.** `index.css` has no `@media` rules, and several pages use fixed grids (`gridTemplateColumns: 'repeat(3, 1fr)'` on the Boarding dashboard, `'1fr 1fr'` on the Snapshot). Staff using tablets in the kennels would benefit from breakpoints and a collapsible sidebar.
14. **Put tabs in the URL.** All tabs are local `useState` (Settings' 11 tabs, Customer detail's 8, Boarding's 7), so refreshing or sharing a link always lands on the default tab. A `?tab=` query parameter would fix this, following the `?view=` pattern `InvoicesPage` already uses. Also, `CustomerDetailPage` lists "Customer Defaults" first in its tab bar while defaulting to `overview`.
15. **Consolidate Settings saves.** `BusinessInfoTab` keeps 8 separate saving/error/saved state triples for 8 sub-forms on one tab (`SettingsPage.tsx` lines 128–445). A single form with dirty tracking, or a reusable `useSaveState` hook, would cut the code and avoid confusing per-card "Saved." labels.
16. **Use the uploaded logo in PDFs.** Business Info's logo is described as branding "invoices, email templates, and other customer-facing documents", but every PDF builder loads the bundled `assets/logo.png` (`invoicePdf.ts`, `receiptPdf.ts` and `brandPdf.ts`, each with its own `loadLogoDataUrl`), and `htmlToPdf.pdfBrandHeader` hard-codes "PawfectPets Sherborne". Use `businessInfo.logoImage` and `businessInfo.name` when they are set.
17. **Fix the Generate Invoices wording.** The `GenerateInvoicesModal` intro says it bills "every not-yet-invoiced Walk and Visit", but it includes every billable day booking, boarding and day care included. Either filter by product type or reword the text.

**Code quality**
18. **De-duplicate helpers.**
    - `dateKey`, `addDays`, `stayEndDate`, `animalLabel` and `customerLabel` are reimplemented in `BookingsPage.tsx`, `BoardingDayCarePage.tsx`, `CustomerDetailPage.tsx`, `GenerateInvoicesModal.tsx`, `DocumentFormModal.tsx` and `BookingInvoicePrompt.tsx`, although `utils/visitPlan.ts` already exports `dateKey`, `addDays` and `parseYmd`.
    - `REVIEW_FREQUENCY_OPTIONS` and `reviewFrequencyLabel` exist in both `PoliciesTab.tsx` and `RiskAssessmentsTab.tsx`, and as a label map in `riskAssessmentPdf.ts`.
    - `INTAKE_URL` is declared in 7 files.
    - The iOS-style toggle is copied in `CustomersPage`, `CustomerDetailPage` and `DocumentFormModal`.

    Move each of these to one shared module.
19. **Split the very large files.** `SettingsPage.tsx` (5,256 lines, 49 top-level functions and components), `BoardingDayCarePage.tsx` and `CustomerDetailPage.tsx` each hold many tab components in one file. One file per tab would make the code easier to navigate and give smaller lazy chunks.
20. **Share code with the backend and frontend.** The admin keeps hand-synced copies of backend and frontend logic: `emailTemplate.ts`, `formDefaults.ts`, `FormPreviewBody`'s `isFieldVisible`, `SendFormModal`'s `wrapFieldsForPets`, `permissionCatalog.ts`, `formFieldCatalog.ts`, `types.ts`, and PDF fallback texts in `customerFormPdf.ts`. A shared workspace package (or types generated from the backend's OpenAPI spec) would remove the risk of them drifting apart.
21. **Make the lint rules real.** There are 33 `// eslint-disable-next-line react-hooks/exhaustive-deps` comments, but the project runs **oxlint** and `.oxlintrc.json` does not enable `exhaustive-deps`, so the comments do nothing and missing-dependency bugs go undetected. Enable the rule in oxlint. Also turn on TypeScript `strict`, which `tsconfig.app.json` does not set.
22. **Detect errors by code, not text.** `BoardingDayCarePage` decides whether to offer "Delete all" with `deleteError.includes('recorded against it')`. Have the backend return an error code and expose `status`/`code` on the thrown error in `request()`.
23. **Remove dead client functions.** The legacy `/bookings` functions (`listBookings`, `createBooking`, `updateBookingStatus`, `updateBooking`, `deleteBooking`) plus `updateAppointment`, `getForm`, `getTrainingModule` and `getTrainingAttemptHistory` have no admin callers. Delete them, or wire up the useful ones: `updateAppointment` for editing an appointment, and `getTrainingAttemptHistory` for drilling into a staff member's attempts from the compliance tab.
24. **Fix `Badge`.** `Badge.tsx` uses `value.replace('_', ' ')`, which only replaces the first underscore. Use `replaceAll`.
25. **Add tests.** There are no tests in `admin/`. Pure modules such as `utils/visitPlan.ts`, `productAvailability.ts`, `annualLeave.ts`, `emailTemplate.ts`, `invoicePdf.resolveLayout` and `GenerateInvoicesModal`'s grouping are easy to unit-test with Vitest, which fits the existing Vite setup.

**New feature ideas**
26. *(feature)* **Editable capacity.** `CAPACITY_PER_SECTION = 4` is hard-coded in `BoardingDayCarePage.tsx`, and its comment says to "ask if this ever needs to … be staff-editable". Move it to Settings > Boarding, per section, and warn about capacity inside `NewBookingModal` and `NewBoardingBookingModal` before a booking is saved, not only on the dashboard and occupancy grid.
27. *(feature)* **Global search.** Customer search exists only on `CustomersPage`. A top-bar search across customers, pets, invoice and quote numbers and booking references (all already loaded by various pages) would help front-of-house staff.
28. *(feature)* **CSV export** for the Financial tables (payments, expenses, credit notes, transfers) and Reports. Today only charts and on-screen tables exist, which an accountant cannot easily use.
29. *(feature)* **Payables / bills.** `FinancialSnapshotTab.PayablesCard` says outright that vendor bills are not tracked. A bills entity (vendor, due date, paid flag) would make that card and the projected-flow outgoings real figures instead of a 6-month average.
30. *(feature)* **Training attempt history drill-down**, using the existing unused `getTrainingAttemptHistory`, from `TrainingComplianceTab` rows.
31. *(feature)* **Appointment editing** on the Calendar day panel (`updateAppointment` exists, but the panel only offers delete).

## Public intake site (frontend/)

The public, no-login React site that customers reach from links sent by staff (or by the backend's emails). It handles first-time registration, re-checking existing details, adding pets, filling staff-built forms, the pre-boarding questionnaire, and viewing invoices and quotes. No route has authentication. **The 24-hex MongoDB ObjectId in the URL is the only access token.**

### Stack and dependencies

Source: `frontend/package.json`

| Kind | Package | Version | Used for |
|---|---|---|---|
| runtime | `react`, `react-dom` | ^19.2.8 | UI (`src/main.tsx` renders `<App/>` inside `<StrictMode>`) |
| runtime | `jspdf` | ^4.2.1 | Client-side PDFs: the registration form (`src/pdf/customerFormPdf.ts`) and invoice/quote downloads (`src/pdf/invoicePdf.ts`) |
| runtime | `qrcode` | ^1.5.4 | The bank-details QR code on the invoice/quote page and in the PDF |
| dev | `vite` ^8.2.0, `@vitejs/plugin-react` ^6.0.4 | | Build and dev server (`vite.config.ts` is just `plugins: [react()]`) |
| dev | `typescript` ~6.0.2, `@types/*` | | `npm run build` runs `tsc -b && vite build` |
| dev | `oxlint` ^1.75.0 | | `npm run lint`. `.oxlintrc.json` turns on the react/typescript/oxc plugins, with `react/rules-of-hooks` set to error and `react/only-export-components` set to warn |

Scripts: `dev` (vite), `build`, `lint`, `preview`.

There is **no router library**: `src/App.tsx` matches `window.location.pathname` with regexes. There is **no state library** either; each page keeps its own `useState`.

Static assets:
- `src/assets/logo.png`: used on the document page and embedded in the PDFs.
- `src/assets/fonts/`: ArchivoBlack-Regular, DMSans-Regular/Bold/Italic `.ttf` (SIL OFL, per `fonts/README.md`). They are embedded into the registration PDF by `brandPdf.ts`.
- `public/favicon.png`, `public/icons.svg`.
- `index.html`: the title is "PawfectPets Sherborne — Registration".

### Configuration and environment

| Variable | Where it's read | Default | Notes |
|---|---|---|---|
| `VITE_API_URL` | `src/api/client.ts` (`import.meta.env.VITE_API_URL ?? 'http://localhost:3000'`) | `http://localhost:3000` (also in `.env.example`) | **Fixed at build time.** Vite copies the value into the JS bundle. |

That is the only environment variable.

### Build and deployment

**Dockerfile** (`frontend/Dockerfile`), two stages:
1. `node:22-alpine AS build`: `ARG VITE_API_URL` → `ENV`, then `npm ci`, then `npm run build`.
2. `node:22-alpine AS production`: `npm install -g serve@14`, copies `dist`, `EXPOSE 80`.
   - Runs `serve -s dist -l tcp://0.0.0.0:80`. The `-s` (SPA) flag rewrites unknown paths to `index.html`, so deep links work on a hard refresh.
   - The `HEALTHCHECK` uses `node -e` to GET `http://localhost:80/` every 30s (5s timeout, 10s start period, 3 retries).

`.dockerignore` excludes `node_modules`, `dist`, `.env*` (except `.env.example`), `.git`, `*.md`, `Dockerfile` and `.dockerignore`.

**docker-compose.yml**:
- The `frontend` service builds `./frontend` with build arg `VITE_API_URL: ${PUBLIC_API_URL}` and maps `8081:80` on the `pawfectpets` network.
- The comments say a Cloudflare tunnel routes the public hostname to `http://frontend:80`.
- The backend's `PUBLIC_INTAKE_URL` points at this app, so emails can carry `{{invoice_link}}`/`{{quote_link}}`.
- `ALLOWED_ORIGINS` must include its origin (CORS).

**render.yaml**:
- Service `pawfectpets-frontend`, `env: static`, `rootDir: frontend`.
- Build: `npm install && npm run build`; publishes `dist`.
- `VITE_API_URL` has `sync: false`.
- A rewrite sends `/*` to `/index.html`.

### URL routes

Routes are resolved in `src/App.tsx`. The checks run in the order shown. Every id must match `[a-fA-F0-9]{24}`, with an optional trailing slash. Every page is wrapped in `<div className="page">` with a "PawfectPets Sherborne" brand header.

| # | Path | Component | Purpose |
|---|---|---|---|
| 1 | `/pre-boarding/:id` | `pre-boarding/PreBoardingFillPage` | Per-dog pre-boarding questionnaire |
| 2 | `/invoices/:id` | `documents/DocumentView kind="invoice"` | Public invoice view and PDF download |
| 3 | `/quotes/:id` | `documents/DocumentView kind="quote"` | Public quote view, PDF download, accept/reject |
| 4 | `/forms/:id` | `forms/FormFillPage` | Fill one staff-built form submission (`:id` is the FormSubmission id) |
| 5 | `/intake/:customerId/add-pet` | `intake/AddPetFlow` | Existing customer adds new pet(s) only |
| 6 | `/intake/:customerId` | `intake/IntakeForm customerId=…` | Pre-filled registration or "update info" review for an existing customer or lead |
| 7 | anything else (e.g. `/`) | `intake/IntakeForm customerId=null` | Fresh registration (creates a new Customer) |

The code checks `/forms` before `/invoices` and `/quotes`, but the paths can't collide. Pre-boarding is parsed separately (`parsePreBoardingId`) and wins first.

### Backend API client (`src/api/client.ts`)

`request<T>(path, options)`:
- Always sends `Content-Type: application/json`.
- On a non-2xx response it throws `Error(body.message)`. An array message is joined with `"; "`; with no message it throws `Request failed (status)`.
- It parses the body only if the text is non-empty, because NestJS DELETE returns 200 with an empty body.
- No auth header is ever sent.

Every backend endpoint the site calls:

| Function | Method and path | Caller | Backend guard (verified in controllers) |
|---|---|---|---|
| `fetchCustomer(id)` | GET `/customers/:id` | IntakeForm, AddPetFlow | `@Public()` (`customers.controller.ts`) |
| `submitCustomer(state)` (new) | POST `/customers` | IntakeForm submit (no `customerId`) | `@Public()` |
| `submitCustomer(state)` (existing) | PATCH `/customers/:id` | IntakeForm submit (with `customerId`) | `@Public()` |
| `logCompletionSnapshot` | POST `/customers/:id/completion-snapshot` `{title, attachmentData, attachmentName}` | IntakeForm, best-effort after submit | `@Public()` |
| `sendRegistrationCopy` | POST `/customers/:id/send-registration-copy` `{attachmentData, attachmentName}` | ThankYouStep "Send a copy by Email" | `@Public()` + `@Throttle(5/min)` |
| `fetchAnimalsForCustomer` | GET `/animals/for-customer/:customerId` | IntakeForm (review existing pets) | `@Public()` |
| `submitAnimal` | POST `/animals` `{customer, ...animalPayload}` | IntakeForm, AddPetFlow | `@Public()` |
| `updateAnimal` | PATCH `/animals/:id/for-customer/:customerId` | IntakeForm (existing pets) | `@Public()`, ownership asserted server-side |
| `fetchTerms` | GET `/settings/terms` → `{html}` | AgreementStep, SettingsContent, PDF build | `@Public()` |
| `fetchVetAuthorisationText` | GET `/settings/vet-authorisation` → `{text}` | EmergencyVetStep, PDF | `@Public()` |
| `fetchOffLeadConsentText` | GET `/settings/off-lead-consent` → `{text}` | PetDetailsStep, PDF | `@Public()` |
| `fetchDeclarationText` | GET `/settings/declaration` → `{text}` | AgreementStep, SettingsContent, PDF | `@Public()` |
| `fetchVetPractices` | GET `/vet-practices` | EmergencyVetStep dropdown | `@Public()` |
| `fetchFormSubmission` | GET `/form-submissions/:id/public` | FormFillPage | public route |
| `submitFormSubmission` | POST `/form-submissions/:id/submit` `{answers}` | FormFillPage | public route |
| `fetchPreBoardingForm` | GET `/pre-boarding/:id/public` | PreBoardingFillPage | public route |
| `submitPreBoardingForm` | POST `/pre-boarding/:id/submit` `{dogNames, answers}` | PreBoardingFillPage | public route |
| `fetchBusinessInfoPublic` | GET `/settings/business/public` | DocumentView, `brandPdf.loadContactLine()` | `@Public()` |
| `fetchInvoicePublic` | GET `/invoices/:id/public` | DocumentView | public route |
| `fetchQuotePublic` | GET `/quotes/:id/public` | DocumentView | public route |
| `acceptQuote` | POST `/quotes/:id/accept` → `{invoice}` | DocumentView | public route |
| `rejectQuote` | POST `/quotes/:id/reject` → updated quote | DocumentView | public route |

#### What `submitCustomer` sends

**Client fields**: `firstName`, `surname?`, `address1`, `address2?`, `town`, `county?`, `postcode`, `phoneNumber`, `email`. Blank optional strings become `undefined`. This matters because `@IsOptional()` only skips null/undefined, not `''`.

**`emergencyContact`**:
- `sameAsClient` is always `false`.
- Then `firstName`, `surname`, `address1`, `address2`, `town`, `county`, `postcode`, `phoneNumber`, `email`, each set to `undefined` if blank.

**`emergencyVet`**:
- `practiceName`, `address1`, `address2?`, `town`, `county?`, `postcode`, `telephone`, `email?`.
- `authorisation: {signedName, signatureImage}`.
- The client sends only DTO-whitelisted keys, because the global `forbidNonWhitelisted` would return 400 on server-computed fields echoed back.

**`security`**: sent as-is: `keysProvided`, `alarmInstructions`, `furtherInformation`.

**`agreement`**: only `{signedName, signatureImage}`. `termsAccepted` stays client-side.

#### What `animalPayload` sends

**Basics**:
- `species`, `breed`, `name`, `sex`, `age: Number(age)`, `dateOfBirth?`.
- `vaccinated`; `vaccineExpiryDate` only if vaccinated.

**Photos**: `vaccineRecordPhoto` (always sent, `''` when removed) and `photos` (always sent, `[]` allowed). Both are sent even when empty so that a removed photo is actually cleared on update.

**Optional details**:
- `colourMarkings?`, `microchipNumber?`.
- `insured`, and `insurer` only if insured.
- `neuteredStatus?`; `lastSeasonEndDate` only when neutered is `no` and sex is female.
- `temperamentNotes?`.

**Behaviour answers**:
- `aggressionToPeople`, plus `…Details` only if true.
- `aggressionToOtherAnimals` and its details for non-cats only.
- `travelsWellInCar` (non-cat) and `travelsWellInCarDetails` (only when `no`).
- `chasesLivestock` (dog only) and its details (only when `yes`).

**Health and consent**: `allergies`, `medication`, and `offLeadConsent` (dog only).

### Intake wizard (`src/intake/IntakeForm.tsx`)

#### Loading and pre-fill

- **No `customerId`**: the page starts `ready`, with an empty state and one empty pet (species `dog`).
- **With `customerId`**: it calls `Promise.all([fetchCustomer, fetchAnimalsForCustomer])`.
  - **Client fields** are copied from the customer.
  - **Emergency contact** is spread from the record, but `sameAsClient` is forced to `false`.
  - **Emergency vet** is copied.
  - **Security**: `keysProvided` and `furtherInformation` are copied. `alarmInstructions` is **always blank**, because the public endpoint never returns the ciphertext. A blank PATCH value leaves the stored value unchanged.
  - **Existing animals** become `pets` via `petFromRecord`. Dates are sliced to `YYYY-MM-DD`, and `offLeadConsent` is reduced to `{mode, signature}` so the update DTO does not reject `acknowledgedAt`/`date`. `existingCount = animals.length`, and `petCount` becomes 0 (meaning "additional pets") when pets exist.
  - **If the fetch fails**, the page shows "Link not found" with a "Start fresh registration" button. The button sets `ready`, but `customerId` is still set, so a submit would PATCH the unknown id.

#### Step indexing

The step numbers depend on how many pets are on file and how many are being added:

| Step index | Step | Component |
|---|---|---|
| 0 | Welcome | `WelcomeStep` |
| 1 | Your details | `ClientDetailsStep` |
| 2 | Emergency contact | `EmergencyContactStep` |
| 3 | Emergency vet | `EmergencyVetStep` |
| 4 … 4+existingCount−1 | Existing pet *n* (review/edit) | `PetDetailsStep` |
| `countStepIndex` = 4+existingCount | "How many pets?", or "Any other pets to add?" (`allowZero` when existing > 0) | `PetCountStep` |
| countStepIndex+1 … securityStepIndex−1 | New pet *n* | `PetDetailsStep` |
| `securityStepIndex` = countStepIndex+petCount+1 | Security | `SecurityStep` |
| securityStepIndex+1 | Additional information | `FurtherInfoStep` |
| securityStepIndex+2 (`agreementStepIndex`) | Agreement, then Submit | `AgreementStep` |
| after submit | Thank you | `ThankYouStep` |

- `ProgressBar` shows "Step {current} of {total} — {label}" with a percentage fill.
- The primary button reads "Let's go" on step 0, "Submit" on the agreement step, and "Next" otherwise. "Back" appears on every step after the first.
- A `useEffect` grows or shrinks only the *new-pet tail* of `pets` to `existingCount + petCount`.

```mermaid
flowchart TD
    A([Open link]) --> B{Path?}
    B -->|/intake/:id| L[Fetch customer + animals]
    B -->|/ or other| W
    L -->|ok| W[0 Welcome]
    L -->|error| NF[Link not found] -->|Start fresh| W
    W --> C[1 Your details]
    C -->|validate| EC[2 Emergency contact]
    EC -->|validate| EV[3 Emergency vet + alt-vet authorisation signature]
    EV -->|validate| HasPets{existing pets?}
    HasPets -->|yes| EP[Review existing pet 1..N]
    EP --> PC2[Any other pets to add? 0-6]
    HasPets -->|no| PC1[How many pets? 1-6]
    PC1 --> NP[New pet 1..petCount]
    PC2 -->|0 = None| S
    PC2 -->|1-6| NP
    NP -->|validate each| S[Security]
    S --> FI[Additional information]
    FI --> AG[Agreement: T&Cs, declaration, typed + drawn signature]
    AG -->|terms box unticked| TW[Modal: please read the T&Cs] --> AG
    AG -->|validate + Submit| SUB[[handleSubmit]]
    SUB -->|error| AG
    SUB -->|ok| TY[Thank you + Send a copy by Email]
```

#### The steps (`src/intake/steps/`)

**WelcomeStep** (`WelcomeStep.tsx`): no inputs.
- Shows "Welcome, {firstName}".
- With a `customerId` it says details are pre-filled.
- Without one it says "Takes about 5 minutes". It also always shows "We couldn't find an existing record for this link…", **even on the bare `/` URL**.
- If pets are on file, it says "You have N pet(s) on file…".

**ClientDetailsStep** (`ClientDetailsStep.tsx`):

| Field | Input | Required (UI `*`) | Validated in `validateStep` |
|---|---|---|---|
| First name | text | yes | yes |
| Surname | text | no | no |
| First line of address | text | yes | yes |
| Second line of address | text | no | no |
| Town | text | yes | yes |
| County | text | no | no |
| Postcode | text | yes | yes |
| Phone number | tel | yes | yes |
| Email | email | yes | yes, as present only; no format check client-side |

The error message is "Please fill in all required fields."

**EmergencyContactStep**: First name\*, Surname, Address 1\*, Address 2, Town\*, County, Postcode\*, Phone\* (tel), Email (email).
- Validation: firstName, address1, town and postcode give "Emergency contact name and address are required.". A missing phone gives "Emergency contact phone number is required.".
- There is no "same as client" shortcut any more.

**EmergencyVetStep**:
- An optional **"Vet practice" `<select>`**, shown only when `GET /vet-practices` returns entries. "Add details manually" is the default. Picking a practice copies its fields in, and they stay editable.
- Fields: Vet practice name\*, Address 1\*, Address 2, Town\*, County, Postcode\*, Telephone\*, Email.
- **"Alternative vet care authorisation"**:
  - Shows the staff-editable text from `/settings/vet-authorisation`, falling back to `DEFAULT_AUTHORISATION_TEXT`.
  - Typed signature (full name)\* and a drawn `SignaturePad`\*.
  - The date is today in en-GB long format and is disabled.
- Validation: the five required fields; `authorisation.signedName` ("Please sign to authorise…"); `authorisation.signatureImage` ("Please draw your signature…").

**PetCountStep**:
- Choice buttons 1–6, plus "None" (0) when `allowZero`.
- Hint: "More than 6 pets? Get in touch…".
- Default title "How many pets?". It is overridden to "Any other pets to add?" when pets exist.

**PetDetailsStep** (`PetDetailsStep.tsx`), shown once per pet, tagged "Pet i of N":

| Field | Control | Shown when | Required in UI | Enforced by `validateStep` |
|---|---|---|---|---|
| Type (`species`) | ChoiceGroup Dog/Cat/Other | always | \* | (always has a value) |
| Name | text | always | \* | yes |
| Breed / "Type of animal" (for Other) | text | always | \* | yes |
| Sex | select Male/Female | always | \* | yes |
| Age | number | always | \* | yes (non-empty) |
| Date of birth | `DateInput` (dd/mm/yyyy) | always | – | – |
| Vaccinated | toggle | always | – | – |
| Vaccine expiry date | DateInput | vaccinated | \* | yes |
| Vaccination record | `VaccineRecordUpload` (single image, `capture="environment"`, ≤4 MB, data URL) | vaccinated | – | – |
| Photos | `PhotoUpload` (max 2 images, ≤4 MB each, data URLs) | always | – | – |
| Colour / markings | text | always | – | – |
| Microchip number | text | always | – | – |
| Is your pet insured? | select Yes/No (starts `null`) | always | – | – |
| Insurer | text | insured | \* | **not enforced** |
| Spayed/Neutered | select Neutered (Boy)/Spayed (Girl)/No | always | – | – |
| End date of last season? | DateInput | neutered `no` and female | – | – |
| Temperament notes | textarea | always | – | – |
| Aggression to people | Yes/No | always | \* | yes, plus details if Yes |
| Aggression to other animals | Yes/No, plus details | species ≠ cat | \* | yes, plus details if Yes |
| Travels well in car | Yes/No/Unsure, plus details if No | species ≠ cat | \* | yes, plus details if No |
| Chases livestock | Yes/No/Unsure, plus details if Yes | dog | \* | yes, plus details if Yes |
| Allergies / intolerances | Yes/No/Unsure (default `no`), plus details | always | \* | details **not enforced** |
| On medication | Yes/No, then `MedicationEntriesField` | always | \* | at least one entry if Yes; each entry needs a name |
| Off-lead consent: Lead | On lead / Off lead | dog | \* | mode required |
| Off-lead consent signature | `SignaturePad` + text from `/settings/off-lead-consent` (`{{petName}}` replaced) | dog + off_lead | – | **not enforced** |

`MedicationEntriesField` (`src/intake/MedicationEntriesField.tsx`) collects these fields for each entry:
- Medication Name\*
- Illness treating
- Dosage
- Frequency
- Vet Prescribed (Yes/No select)
- Pawfect Pets To administer (Yes/No select)
- Additional Info

It has "+ Add Medication" and per-entry "Remove" controls.

**SecurityStep**: "Keys provided" toggle and "Alarm/KeySafe Code" textarea.
- The hint says it is stored encrypted.
- When resuming it adds "Leave blank to keep what you already gave us unchanged."

**FurtherInfoStep**: "Any further information" textarea, stored in `security.furtherInformation`.

**AgreementStep**:
- **Terms**: shows the HTML from `/settings/terms` via `dangerouslySetInnerHTML` in a tall scroll box. It falls back to 8 hard-coded clauses.
- **"I have read the terms and conditions" checkbox** (`termsAccepted`): if it is unticked, Submit opens a `Modal` ("You have not read the terms and conditions, please scroll to the bottom.").
- **Declaration**: text from `/settings/declaration`, with a default fallback.
- Typed signature\* and a drawn signature\*. The date is today and disabled.
- Validation messages: "Please type your name to sign." / "Please draw your signature to sign.".

**ThankYouStep**: "Thank you, {name}!" and a "Send a copy by Email" button with states `idle`, `sending`, `sent` and `error`.

#### Shared intake widgets

- **`fields.tsx`**:
  - `TextField` supports text/tel/email/number/date/time and multiline; `type="date"` renders `DateInput`.
  - `ToggleField`: the whole row is the label, for a bigger tap target.
  - `ChoiceGroup`: button group.
  - `SelectField`: has a disabled "Select…" placeholder.
- **`components/DateInput.tsx`**: a dd/mm/yyyy text input (`inputMode="numeric"`).
  - It auto-inserts slashes and moves overflow digits into the next part.
  - It emits ISO `YYYY-MM-DD`, or `''` if the text is invalid. An invalid entry calls `setCustomValidity('Enter the date as dd/mm/yyyy')`.
  - It normalises the text on blur.
  - An invisible native `<input type="date">` sits over the calendar icon. On iOS the tap itself opens the picker; other browsers call `showPicker()`, wrapped in try/catch.
- **`SignaturePad.tsx`**: canvas pointer drawing.
  - It sizes the canvas buffer to the rendered size × `devicePixelRatio` and redraws the stored image on resize.
  - It emits a PNG data URL on pointer-up/leave. "Clear" emits `undefined`.
- **`components/Modal.tsx`**: a backdrop that closes on click, with a single OK button.
- **`ProgressBar.tsx`**: the step progress bar.

#### Submission sequence

```mermaid
sequenceDiagram
    autonumber
    actor C as Customer
    participant UI as IntakeForm
    participant API as Backend
    participant PDF as customerFormPdf (jsPDF)
    C->>UI: Submit on Agreement step
    UI->>UI: termsAccepted? (else Modal) / validateStep()
    alt fresh registration (no customerId)
        UI->>API: POST /customers (payload)
    else lead / update_info link
        UI->>API: PATCH /customers/:id (payload)
    end
    API-->>UI: CustomerRecord {_id}
    loop each pet in state.pets
        alt pet._id exists
            UI->>API: PATCH /animals/:petId/for-customer/:customerId
        else new pet
            UI->>API: POST /animals {customer: _id, ...}
        end
    end
    UI-->>C: ThankYouStep
    par best-effort snapshot (errors swallowed)
        UI->>API: GET /settings/terms, /vet-authorisation, /off-lead-consent, /declaration
        UI->>PDF: buildCustomerFormPdf(state, ...)
        UI->>API: POST /customers/:id/completion-snapshot {title:"Registration form submitted", attachmentData, attachmentName}
    end
    opt Customer clicks "Send a copy by Email"
        UI->>PDF: rebuild same PDF
        UI->>API: POST /customers/:id/send-registration-copy
        API-->>UI: 200 -> "A copy has been emailed to you."
    end
```

The pets are submitted **one after another**, and the calls are not wrapped in a transaction. If animal *k* fails, the customer and the earlier animals are already saved. The error banner then shows, and pressing Submit again re-sends everything. On a fresh registration it POSTs **a new customer again**, because `state.customerId` is still `null`.

### Add-pet flow (`/intake/:customerId/add-pet`, `src/intake/AddPetFlow.tsx`)

- It loads the customer with `fetchCustomer` and shows "Link not found" on error.
- Steps: `PetCountStep` (1–6, titled "Add a pet for {name}"), then one `PetDetailsStep` per pet. There is no Welcome step and no Agreement step.
- It uses the same per-pet validation as the intake wizard (duplicated code).
- Submit loops `POST /animals` for each pet. It **never** touches customer, emergency, security or agreement data.
- On success it shows "Thanks, {customer.name}!".

### Staff-built forms (`/forms/:id`, `src/forms/`)

`FormFillPage.tsx`:

**Loading**:
- It calls `GET /form-submissions/:id/public` and resets all state whenever `submissionId` changes.
- `status === 'completed'` shows a read-only `ReadOnlyAnswers` view titled "This form has already been submitted."

**Initial answers** combine three sources:
- `defaultAnswersFor(fields)` (`formDefaults.ts`): toggles start as `false`. `today` is stamped as `YYYY-MM-DD` and `datetime` as an ISO timestamp, both at open time. text/textarea/number/date take `defaultValue`, which is already token-resolved server-side.
- These are overlaid with any server pre-filled `answers` (e.g. pre-check-in).
- Each `group` is seeded with `minRepeats` repetitions.

**Field types** (`FieldRenderer.tsx`):

| Type | Renders as |
|---|---|
| `display` | Paragraph, or an `<h3>` divider when `startsNewPage`. With `content: 'terms' \| 'declaration'` it uses `SettingsContent`, which fetches the live terms/declaration |
| `today`, `datetime` | Disabled, auto-filled |
| `text`, `textarea`, `number`, `date`, `time` | `TextField` |
| `toggle` | `ToggleField` |
| `choice` | `ChoiceGroup`, using `optionLabels` |
| `multichoice` | `MultiChoiceField` (toggle buttons) |
| `file` | `PhotoUpload`; `maxFiles` is ignored and the limit stays at 2 |
| `medications` | `MedicationEntriesField` |
| `signature` | `SignaturePad` |

**Labels**: `richLabel.tsx` parses `**bold**` and `__underline__` (it mirrors `admin/src/utils/richLabel.tsx`).

**Conditional visibility**: `isFieldVisible` compares `String(answer) === condition.equals` for every `visibleWhen.conditions` entry. `mode: 'all'` combines them with AND, `'any'` with OR. A condition can only reference a field at the same level (the top-level form, or one repetition of a group).

**Repeatable groups**:
- Single-page forms render them inline with `RepeatableGroup.tsx`, including "+ Add another {label}" and "Remove" within the `minRepeats`/`maxRepeats` limits.
- `repetitionLabels` (per-pet names) hides the generic heading.
- `withPetName` swaps `{{petName}}` in child labels, or "your dog" when the repetition has no pet name. The backend also labels an unresolved top-level `{{petName}}` (a multi-pet or lead send) as "your dog".

**Pagination**:
- A form becomes a wizard only if a top-level `display` field has `startsNewPage`.
- `buildPages` splits the form at those markers. Each group repetition gets its own page.
- The page label is the first display field's label.
- **Next** validates the current page. **Submit** runs the full `validate()`. Pressing Enter on a page other than the last does nothing.
- The Next and Submit buttons have different React keys, so the Next click can't turn into a submit.

**Validation (`isEmpty`)**:
- `medications`: needs at least one entry, and every entry needs a name.
- `file`/`multichoice`: the array must not be empty.
- A `toggle` is never empty.
- Anything else is empty if it is `''`, `null` or `undefined`.

**Submit**: `POST /form-submissions/:id/submit {answers}`, then a "Thank you, {recipientName}!" screen.

### Pre-boarding questionnaire (`/pre-boarding/:id`, `src/pre-boarding/PreBoardingFillPage.tsx`)

**Loading**: `GET /pre-boarding/:id/public` returns `{firstName, dogCount, dogNames[], status, questions[]}`. Scores and auto-fail flags are never sent to the browser (`types.ts` comment).

**Layout**:
- One page per dog. A `ProgressBar` appears when `dogCount > 1`.
- Each page starts with a required "dog name" input.
- Questions are grouped by `section`.
- `{{dogName}}` in the text is replaced with the typed name, falling back to "your dog" or "Dog N".

**Question types**:
- `text` renders a textarea.
- `yesno` and `choice` render a `ChoiceGroup`.
- An option with `askDetails` reveals a details textarea (`detailsPrompt`, or "Please give details").
- `showWhen` (an AND of `{questionId, value}`) hides or shows follow-up questions.

**Validation**: the dog name, plus every visible `required` question.

**Submit**:
- On the last dog the page POSTs `/pre-boarding/:id/submit {dogNames, answers[]}`.
- Hidden questions and details not asked for are left out of the payload.
- The visibility check runs against the *already-cleaned* answers built so far, so `showWhen` must reference earlier questions.

**Final states**: "Already submitted" or "Thank you, {firstName}!".

### Invoice/quote view (`/invoices/:id`, `/quotes/:id`, `src/documents/DocumentView.tsx`)

**Loading**: in parallel, `GET /invoices/:id/public` (or `/quotes/:id/public`) and `GET /settings/business/public`.

**Page content**:
- **Header**: logo, business name, address, town and postcode, telephone, email, website.
- **"PAID" corner ribbon** when `invoice.status === 'paid'`.
- **Document meta**: number, date, terms, and due date (invoice) or valid-until date (quote).
- **Customer**: the populated `customer` name and address, or the quote's `manualCustomerName`/`manualCustomerEmail`.
- **Line items**: a table on desktop and stacked cards under 640px (CSS). Line total = `qty × unitPrice × (1 − discount%)`.
- **Totals**: Sub Total, Total, Payment Made (invoice) and Balance Due.
- **Notes**: `invoiceNotesMessage`/`quoteNotesMessage` (default "Thanks for your business."), plus a schedule table from `visitPlan`, `dayCarePlan` or `boardingPlan`.
- **Bank Transfer Details**. "Account Name" shows the **business name**; `bankName` appears only in the QR content.
- **QR code** of `"{bankName} {sortCode} {accountNumber}"`.

**Download PDF**:
- `buildInvoicePdf(record, kind, businessInfo)` (`src/pdf/invoicePdf.ts`) draws the staff-designed `businessInfo.invoicePdfTemplate`, or `DEFAULT_INVOICE_TEMPLATE` if there is none.
- The template elements are text, line, rect, image (logo), qrcode, itemTable and visitTable.
- `{{var}}` tokens are replaced from `buildPdfVars`, which covers invoice and customer fields, totals, business info, bank details, status and labels.
- For quotes it removes `balanceDue`/`amountPaid` elements and rewrites "Invoice" wording to "Quote".
- `visibleWhen` can be `always`, `paid`, `unpaid`, `invoice-only` or `quote-only`.
- The item table paginates. Elements that overflow move to a second page.
- The file is saved as `{number}.pdf`.

**Quote actions**: shown when the status is `draft` or `sent`.
- **Accept Quote**: a confirmation explains that it will raise an invoice and email a deposit request. Then `POST /quotes/:id/accept`, a message "Invoice {n} has been raised…", and a refetch.
- **Reject Quote**: after confirmation, `POST /quotes/:id/reject`.
- For any other status it shows "This quote has already been {status}."

### PDF generation (`src/pdf/`)

- **`brandPdf.ts`**: a copy of `admin/src/pdf/brandPdf.ts`, kept in step by hand.
  - A4 at 40pt margins.
  - Brand palette: BLUE `#0072b5`, YELLOW `#fdf101`, PINK `#d7385e`, CREAM, INK, MUTED, RULE.
  - It embeds the Archivo Black and DM Sans fonts, falling back to Helvetica.
  - `BrandPdfWriter` draws a blue header band with the logo badge, cream section cards with headings, and a pink sign-off band. The band's contact line comes from `/settings/business/public`.
  - Block helpers: field rows, stacked fields, paragraphs, subheadings, lists, muted notes, signatures, checklists and spacers.
- **`customerFormPdf.ts`**: `buildCustomerFormPdf(state, termsHtml, vetText, offLeadText, declarationText)` creates the "Registration form for {name}" document with these sections:
  - Client details
  - Emergency contact
  - Emergency vet (with the authorisation text and signature)
  - Security arrangements (Keys provided, **Alarm/KeySafe Code in plaintext**, Further information)
  - One "Pet — {name}" section per pet (all fields, medications, off-lead consent text and signature)
  - Terms & conditions (the HTML converted to blocks, or the default clauses)
  - Client agreement (declaration, Signed by, Signed at, signature)
- **`invoicePdf.ts`**: the template-driven invoice/quote renderer described above.

### Types (`src/types.ts`)

All the shared types live in this one file, hand-mirrored from the admin and backend shapes:
- Customer, animal and intake: `CustomerRecord`, `AnimalRecord`, `PetDetails`, `IntakeState`.
- Forms: the `FormField` union, `VisibilityRule`, `FormSubmissionPublic`.
- Documents: `InvoiceRecord`, `QuoteRecord`, the `Doc*Plan` types, `PublicBusinessInfo`, the `PdfTemplateElement` union.
- Pre-boarding: `PreBoardingPublic`, `PreBoardingPublicQuestion`, `PreBoardingAnswer`.

### Suggested improvements

**Bugs and gaps in the code**
1. **Alarm codes leak into PDFs.** `src/pdf/customerFormPdf.ts` writes `state.security.alarmInstructions` in plaintext into the registration PDF. That PDF is then stored by `/customers/:id/completion-snapshot` and emailed by `/send-registration-copy`, which undermines the field's "stored encrypted" promise in `SecurityStep.tsx`. Mask it, e.g. "(provided – stored encrypted)".
2. **Retrying a fresh registration creates duplicates.** In `IntakeForm.handleSubmit`, a retry after a partial failure re-POSTs `/customers`, because `state.customerId` is never updated. Store the returned `_id` in `state.customerId` and write each new pet's `_id` back into `state.pets` as it succeeds, so a retry PATCHes instead.
3. **Validation doesn't match the required markers.** In `PetDetailsStep.tsx`, Insurer is marked required, and the off-lead signature is captured but optional. Neither is checked in `validateStep` (`IntakeForm.tsx`, `AddPetFlow.tsx`). Add both checks, plus an allergy-details check when the status is not `no`, to match the Flutter app's `_validationIssues`.
4. **Pet validation is duplicated.** The same rules exist in `IntakeForm.tsx` and `AddPetFlow.tsx`, and `emptyPet()` is also copied. Extract a `validatePet(pet)` and `emptyPet()` into `src/intake/pet.ts`.
5. **The welcome text is wrong on the root URL.** `WelcomeStep.tsx` says "We couldn't find an existing record for this link" whenever `!isLead`, including on a plain `/` visit. Show that sentence only when an id was present but failed to load.
6. **"Start fresh registration" keeps the bad id.** In `IntakeForm.tsx` the button sets `ready` but keeps the unresolvable `customerId`, so Submit PATCHes a non-existent record. Reset `state.customerId` to `null` in that handler.
7. **`maxFiles` is ignored.** `FileFormField.maxFiles` (`types.ts`) is never used: `FieldRenderer` renders `PhotoUpload` with its hard-coded `MAX_PHOTOS = 2`. Pass `maxFiles` through as a prop.
8. **Photos are uploaded at full size.** `PhotoUpload` and `VaccineRecordUpload` send up to 4 MB base64 data URLs inline in JSON. Downscale them client-side, for example with canvas to 1600px as the Flutter app does via `maxWidth: 1600, imageQuality: 80`, to cut payload size and Mongo document growth.
9. **Terms HTML is injected unsanitised.** `AgreementStep.tsx` and `SettingsContent.tsx` inject server HTML with `dangerouslySetInnerHTML`. It is staff-authored, but sanitising it (e.g. DOMPurify) would protect against a compromised admin account.
10. **Bank details are labelled oddly.** In `DocumentView.tsx`, "Account Name" shows `businessInfo.name` and the QR code encodes free text with the bank name. Consider showing `bankName` explicitly, and encoding a structured payment string or the page URL.

**Security and robustness**
11. **The id is the only key.** Public routes treat the ObjectId as a bearer token, and ObjectIds are partly predictable (timestamp + counter). A signed, expiring token in the link would close enumeration of `/customers/:id`, `/animals/for-customer/:id`, `/invoices/:id/public` and the rest. This is a backend change, consumed here in `api/client.ts`.
12. **Code is copied between apps.** `richLabel.tsx`, `brandPdf.ts`, `invoicePdf.ts` and `types.ts` are hand-copied from admin. A shared workspace package would stop them drifting.

**Feature ideas**
13. **Save progress.** Autosave the intake draft to `localStorage`, keyed by `customerId`, so a closed tab doesn't lose a 5-minute form. Signatures and photos are already data URLs.
14. **Client-side format checks.** Add email and UK postcode validation in `ClientDetailsStep` and `EmergencyContactStep`; today only presence is checked.
15. **Online payments.** Add a "Pay now" option on `DocumentView` for invoices with `balanceDue > 0`, via a payment-provider checkout link.
16. **Routing.** Adopt a small router or a route table in `App.tsx`. This would give a real 404 page instead of falling through to a blank registration form.
17. **Tests.** There are no tests in `frontend/`. Add Vitest unit tests for `DateInput.autoFormat`/`toIso`, `isFieldVisible`, `buildPages` and `animalPayload`.

---

## Customer app (mobile-portal/)

A Flutter app for signed-in customers, configured for iOS only (there is no `android/` directory, and `flutter_launcher_icons` has `android: false`).

- **Package**: `pawfectpets_portal`, `version: 1.0.0+18`, `publish_to: none`, SDK `^3.13.1`.
- **Name**: `MaterialApp(title: 'Pawfect Pets Customer')`; the iOS display name is "Pawfect Pets Customer".
- **What customers can do**: view and edit their details and pets, view invoices (PDF), accept or decline quotes, see bookings, message staff, and receive APNs push notifications.
- **Backend**: it talks only to the backend's `/portal/*` routes (`backend/src/portal/portal.controller.ts`).

### Dependencies (`pubspec.yaml`)

| Package | Version | Used in |
|---|---|---|
| `http` | ^1.6.0 | `lib/api/api_client.dart` |
| `flutter_secure_storage` | ^11.0.0 | `state/auth_provider.dart` (token, saved credentials, app version), `services/notification_store.dart` (local notifications, last-read marker) |
| `provider` | ^6.1.5+1 | DI and state (`main.dart`) |
| `intl` | ^0.20.3 | `NumberFormat.currency(en_GB, £)`, `DateFormat` (`widgets/common.dart`, screens) |
| `printing` | ^5.15.0 | `Printing.sharePdf` and `PdfPreview` (invoices) |
| `url_launcher` | ^6.3.2 | declared; **no import in `lib/`** |
| `package_info_plus` | ^10.2.1 | the force-re-login version check |
| `flutter_widget_from_html_core` | ^0.16.0 | `HtmlWidget` for terms (`agreement_screen.dart`) |
| `signature` | ^5.5.0 | off-lead consent signature (`animal_form_screen.dart`) |
| `local_auth` | ^3.0.2 | Face ID / Touch ID (`auth_provider.dart`) |
| `image_picker` | ^1.2.3 | vaccination-card photo (camera or library) |
| `cupertino_icons` | ^1.0.8 | – |
| dev: `flutter_lints` ^6.0.0, `flutter_launcher_icons` ^0.14.4, `flutter_test` | | `analysis_options.yaml` includes `flutter_lints` and excludes platform dirs |

Launcher icons: `assets/icon/app_icon.png` with `remove_alpha_ios: true` and a white background. A pubspec comment says it reuses the staff app's icon for now.

### Configuration

`lib/config.dart`:
```dart
const String apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'https://api.pawfectpetssherborne.co.uk',
);
```
Override it with `flutter run --dart-define=API_BASE_URL=http://localhost:3000`. This is the only dart-define.

### iOS project configuration (`ios/`)

| Setting | Value | Source |
|---|---|---|
| Bundle id | `com.pawfectpetssherborne.pawfectpetsPortal` (tests: `….RunnerTests`) | `Runner.xcodeproj/project.pbxproj` |
| Development team | `N5BLHW2ZJY` | pbxproj, `ExportOptions.plist` |
| Signing | Automatic | pbxproj, `ExportOptions.plist` (`signingStyle: automatic`) |
| Deployment target | iOS 15.0 | pbxproj |
| Device family | `1,2` (iPhone + iPad) | pbxproj |
| Entitlements | `aps-environment = development` | `Runner/Runner.entitlements` |
| Export | `method: app-store-connect`, `destination: export`, `uploadSymbols`, `stripSwiftSymbols`, `manageAppVersionAndBuildNumber: true` | `ios/ExportOptions.plist` |
| Display name | Pawfect Pets Customer | `Info.plist` `CFBundleDisplayName` |
| Privacy strings | `NSFaceIDUsageDescription` ("Use Face ID to sign in with your saved login."), `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription` (vaccination card) | `Info.plist` |
| Export compliance | `ITSAppUsesNonExemptEncryption = false` | `Info.plist` |
| Scenes | `UIApplicationSceneManifest` with `SceneDelegate`, single scene | `Info.plist`, `SceneDelegate.swift` |
| Orientations | iPhone: portrait, landscape L/R; iPad: all four | `Info.plist` |

**`AppDelegate.swift`** (native push bridge):
- It uses `FlutterImplicitEngineDelegate.didInitializeImplicitFlutterEngine` to register plugins and create `FlutterMethodChannel("pawfectpets/push")`. The setup is guarded, so a nil registrar can't crash launch.
- **Dart → native**: `start` calls `requestAuthorization([.alert,.sound,.badge])`, then `registerForRemoteNotifications()`.
- **Native → Dart**:
  - `onToken`: the hex APNs token. It is buffered in `pendingToken` if the channel isn't ready yet.
  - `onNotificationReceived`: a foreground push. The app also shows a `.banner` and plays a sound.
  - `onNotificationTap`: buffered in `pendingTap` on a cold start.
- `tapPayload` copies the custom `userInfo` keys (excluding `aps`) and falls back to `aps.alert.title`/`body`.

### Architecture and state management

`lib/main.dart`:
- Calls `WidgetsFlutterBinding.ensureInitialized()`, then builds the services in order: `ApiClient` → `Repository` → `NotificationStore` → `PushService`.
- Wraps the app in a `MultiProvider`:
  - `Provider.value`: client, repository, notificationStore, pushService.
  - `ChangeNotifierProvider(AuthProvider)`.
- The `MaterialApp.home` is a `Consumer<AuthProvider>` that shows a spinner while `loading`, then `HomeShell` if `loggedIn`, else `LoginScreen`.
- `AuthProvider` is the **only `ChangeNotifier`**. Screens otherwise use local `StatefulWidget` state with `FutureBuilder`, and get services via `context.read<Repository>()`.

`lib/theme.dart` (a copy of the staff app's `mobile/lib/theme.dart`, so both apps and the booking-confirmation PDFs share one look):
- Brand palette: blue `#0072B5` (dark `#005A8F`), yellow `#FDF101`, pink `#C72F56`, cream `#FBF7EE`, ink `#1D2A33`, muted `#5F6F7A`, rule `#D9E6EF`, plus blue/yellow/pink tints.
- Fonts: `ArchivoBlack` for display headings (`displayFont`) and `DMSans` for body text (`bodyFont`), bundled under `assets/fonts/`.
- Material 3: a blue app bar with rounded lower corners and white display-font title, flat cream cards (radius 16), a white navigation bar with a yellow selected indicator, blue elevated/filled buttons, blue outlined buttons, cream chips, rounded (12) outlined inputs, pink FAB.
- `OnBrandBar` restyles controls placed on the blue header band (white labels/borders).
- `statusColor`/`statusBg` map statuses: active/completed/paid/confirmed/accepted are blue on blue tint, pending/requested/sent/partially_paid ink on yellow tint, cancelled/declined dark pink on pink tint, anything else muted grey.

`lib/widgets/brand.dart` (copied from the staff app): `BrandTitle` (round logo, "PAWFECT PETS · SHERBORNE" eyebrow, display-font title with the yellow-underlined word; `brandTitleHeight` 76), `RefPill` (yellow document-number pill), `BrandSectionLabel` (small-caps blue label) and `BrandHeading` (display-font heading over a short yellow bar).

`lib/widgets/common.dart`:
- Formatters: `money` (en_GB £) and `dateFmt` (`d MMM yyyy`).
- `StatusChip` (underscores shown as spaces).
- `ErrorListView` (Retry, scrollable so pull-to-refresh works) and `EmptyListView`.

### Networking (`lib/api/api_client.dart`)

**Requests**:
- The base URL is `apiBaseUrl`.
- Headers are `Content-Type: application/json` and `Authorization: Bearer <token>` when a token is set.

**Timeouts**:
- GET: 20s.
- POST/PATCH: 60s.
- `getBytes` (PDF): 30s.

**Errors**:
- Any network or timeout error throws `ApiException('Could not reach the server…')`.
- **401** calls the registered `_onUnauthorized` handler and throws "Session expired. Please log in again.".
- Any other non-2xx throws with the server's `message` (arrays joined with "; ").

**Parsing**: an empty body is passed as `null` to the parser. The methods are `get`, `getList`, `post`, `patch`, `delete` and `getBytes`.

### `/portal` endpoints (`lib/api/repository.dart`)

| Repository method | HTTP | Body / result | Called from |
|---|---|---|---|
| `requestCode(email)` | POST `/portal/request-code` | `{email}` | LoginScreen, first-time login |
| `requestReset(email)` | POST `/portal/request-reset` | `{email}` | LoginScreen, "Forgot password?" |
| `setPassword(email, code, password)` | POST `/portal/set-password` | `{email, code, password}` → `{token}` | `AuthProvider.completeWithCode` |
| `login(email, password)` | POST `/portal/login` | → `{token}` | `AuthProvider.login` |
| `me()` | GET `/portal/me` | → `Profile` | AuthProvider init, after login, `refreshProfile` |
| `updateMe(patch)` | PATCH `/portal/me` | partial profile → `Profile` | Customer details, emergency contact, emergency vet, security screens |
| `listInvoices()` | GET `/portal/invoices` | → `List<Invoice>` | InvoicesScreen |
| `invoicePdf(id)` | GET `/portal/invoices/:id/pdf` | bytes | Invoice sheet "Download PDF", `InvoicePdfScreen` |
| `sendInvoice(id)` | POST `/portal/invoices/:id/send` | – | Invoice sheet "Send by email" |
| `listQuotes()` | GET `/portal/quotes` | → `List<Quote>` | QuotesScreen |
| `acceptQuote(id)` | POST `/portal/quotes/:id/accept` | – | Quote sheet |
| `declineQuote(id)` | POST `/portal/quotes/:id/decline` | – | Quote sheet (after confirmation) |
| `listBookings()` | GET `/portal/bookings` | → `List<Booking>` | BookingsScreen |
| `listAnimals()` | GET `/portal/animals` | → `List<Animal>` | AnimalsScreen |
| `createAnimal(body)` | POST `/portal/animals` | animal body | AnimalFormScreen (add) |
| `updateAnimal(id, body)` | PATCH `/portal/animals/:id` | animal body | AnimalFormScreen (edit) |
| `listMessages()` | GET `/portal/messages` | → `List<PortalMessage>` | MessagesScreen (polled) |
| `sendMessage(body)` | POST `/portal/messages` | `{body}` | MessagesScreen |
| `deleteMessage(id)` | DELETE `/portal/messages/:id` | – | MessagesScreen (long-press on own message) |
| `messagesUnread()` | GET `/portal/messages/unread-count` | → `count` | **defined but never called** |
| `listNotifications()` | GET `/portal/notifications` | → `List<PortalNotification>` | `NotificationsCenter.load` |
| `notificationsUnread()` | GET `/portal/notifications/unread-count` | → `count` | **defined but never called** |
| `markNotificationsRead()` | POST `/portal/notifications/read` | – | **defined but never called** |
| `acknowledgePushMessage(id)` | POST `/portal/push-messages/:id/acknowledge` | – | HomeShell notification modal "Acknowledge" |
| `registerPushToken(token)` | POST `/portal/push/register` | `{token, platform: 'ios'}` | PushService `onToken` |

The backend also exposes `POST /portal/verify-code` (throttled 10/min), which the app does not call. Every route after `login` has `@UseGuards(PortalJwtGuard)` on the backend. The auth routes are throttled: `request-code` and `request-reset` at 5/min, `login` at 10/min.

### Authentication (`lib/state/auth_provider.dart`, `lib/screens/login_screen.dart`)

**Secure-storage keys**:

| Key | Holds |
|---|---|
| `pawfectpets_portal_token` | The session JWT |
| `pawfectpets_portal_version` | The `version+buildNumber` the session was created under |
| `pawfectpets_portal_saved_email` | Saved login for biometrics (opt-in) |
| `pawfectpets_portal_saved_password` | Saved login for biometrics (opt-in) |

**Startup (`_init`)**:
1. Read `savedEmail`.
2. If there is no token, show Login.
3. **Force re-login after an update**: if the stored version differs from `PackageInfo` `version+buildNumber`, delete the token and show Login. A comment notes that "remember-me is always on" otherwise.
4. Otherwise call `setToken` and `GET /portal/me`. On failure, delete the token.

**Password login**:
- Requires a non-empty email and password.
- `login(email.trim(), password)`.
- With "Remember me (Face ID / Touch ID)" ticked, the email and password are saved to the keychain. Unticked, `forgetSavedLogin()` runs.
- `_persistSession` writes the token and version, sets the token, and fetches `me`.

**First-time login (code)**:
1. The "First time login" toggle hides the password field and shows "Email me a code".
2. That calls `POST /portal/request-code` and switches to the code step.
3. Code step: a 6-digit code (exactly 6 characters, numeric keyboard), a new password (at least 8 characters) and a confirmation (must match).
4. `completeWithCode` calls `POST /portal/set-password`, which returns a token, so the user is logged in straight away. **The credentials are always saved for biometrics on this path.**

**Forgot password**: the same code step via `POST /portal/request-reset`, with "reset" wording.

**Biometrics**: shown when `hasSavedLogin`, as "Sign in as {savedEmail}". It reads the saved email and password, calls `LocalAuthentication().authenticate(localizedReason: 'Sign in to Pawfect Pets')`, then performs a normal password `login` again.

**Logout** (app-bar icon): deletes only the token. The saved biometric login stays on the device.

**Global 401 handler**: clears the profile and token and deletes the stored token. `notifyListeners()` then sends the user back to `LoginScreen`.

### Screens and navigation

```mermaid
flowchart TD
    Start([App launch]) --> Init{AuthProvider._init}
    Init -->|"no token, version changed or me fails"| Login[LoginScreen]
    Init -->|token valid| Shell[HomeShell]
    Login -->|password / Face ID / code + set-password| Shell
    Login --> Code[Code step: 6-digit code + new password]
    Code -->|Back| Login
    Code -->|set-password ok| Shell
    Shell -->|401 anywhere / Log out| Login

    subgraph Tabs [HomeShell bottom NavigationBar, IndexedStack]
        D[0 Details]
        I[1 Invoices]
        Q[2 Quotes]
        B[3 Bookings]
        M[4 Messages]
    end
    Shell --> Tabs
    Shell --> Bell[NotificationsSheet bottom sheet]
    Bell -->|tap message| M
    Bell -->|tap other| Modal[AlertDialog + optional Acknowledge]
    Push((APNs tap)) -->|type=message| M
    Push -->|other| Modal

    D --> CD[CustomerDetailsScreen]
    D --> ECS[EmergencyContactScreen]
    D --> EVS[EmergencyVetScreen]
    D --> AS[AnimalsScreen]
    AS --> AF[AnimalFormScreen add/edit]
    D --> SS[SecurityScreen]
    D --> AG[AgreementScreen read-only]

    I --> IS[Invoice bottom sheet]
    IS --> IPDF[InvoicePdfScreen PdfPreview]
    IS --> Share[Printing.sharePdf]
    Q --> QS[Quote bottom sheet: Accept / Decline]
```

#### `HomeShell` (`lib/screens/home_shell.dart`)

**Layout**:
- An `AppBar` titled after the current tab: My Details, Invoices, Quotes, Bookings or Messages.
- App-bar actions: a **bell** with an unread `Badge` (shows "99+" above 99) and **Log out**.
- The body is an `IndexedStack` of the five tab pages (all five stay alive). Navigation is a `NavigationBar` with five destinations.

**On init**:
- `push.start()` runs post-frame, after login.
- It subscribes to `push.tappedNotification` (routing) and `push.inbound` (badge refresh).
- It refreshes the badge immediately and then **polls every 20s**.
- It handles any tap queued by a cold start.

**Routing a push tap**:
- `type == 'message'` switches to the Messages tab.
- Anything else opens an `AlertDialog` with Close and, if `ackRequired` and a `pushMessageId` are present and it hasn't been acknowledged yet, an **Acknowledge** button. That button calls `POST /portal/push-messages/:id/acknowledge`, then `store.markAcknowledged`, then shows a snackbar.

#### Details tab (`details_screen.dart`) and sections (`screens/sections/`)

The tab shows a profile card (name and email) and a menu of six tiles, each pushed with `MaterialPageRoute`. Editable sections use `SectionScaffold`: an app bar, a red error banner, a scrollable `ListView` and a sticky Save button. On a successful save each one calls `updateMe`, then `refreshProfile`, shows a snackbar and pops.

| Screen | Fields | Validation | PATCH `/portal/me` body |
|---|---|---|---|
| `CustomerDetailsScreen` | Email (read-only, "used to sign in"), first name, surname, phone, address 1/2, town, county, postcode | none | flat `{firstName, surname, phoneNumber, address1, address2, town, county, postcode}` (all trimmed, blanks sent as `''`) |
| `EmergencyContactScreen` | **"Same as me"** switch; otherwise first name, surname, phone, email, address 1/2, town, county, postcode | when not same: firstName, address1, town, postcode and phoneNumber are required | `{emergencyContact: {sameAsClient, ...fields when not same}}` |
| `EmergencyVetScreen` | practice name, telephone, email, address 1/2, town, county, postcode | practiceName, address1, town, postcode and telephone required | `{emergencyVet: {...}}`. No vet-practice picker and no authorisation signature |
| `SecurityScreen` | Keys provided switch; Alarm / key-safe code (hint "On file — leave blank to keep…" when `hasAlarmInstructions`); further information | none | `{security: {keysProvided, furtherInformation, alarmInstructions?}}`, where `alarmInstructions` is sent only when typed |
| `AgreementScreen` | read-only: terms title, version and documentDate, `HtmlWidget(terms.html)`, then the signature image (base64 decoded), signed name and "Signed d MMM yyyy" | – | – (shows "You haven't signed the agreement yet." if unsigned) |
| `AnimalsScreen` | `FutureBuilder(listAnimals)`. Each pet is a card (name, breed · Species, Age · sex) that opens the edit form; "Add a pet" opens the add form. It reloads when the form pops `true` | – | – |

**`AnimalFormScreen`** (`animal_form_screen.dart`):

| Field | Control | Notes |
|---|---|---|
| Name | text | Rebuilds the screen on change so the off-lead text shows the name |
| Species | dropdown dog/cat/other (default dog) | |
| Breed | text | |
| Sex | dropdown male/female (default male) | |
| Age (years) | digits only | |
| Vaccinated | switch | |
| Vaccine expiry | `showDatePicker` (from last year to +10 years) | When vaccinated; stored `yyyy-MM-dd` |
| Vaccination card | `image_picker` from camera or gallery, `maxWidth 1600`, `imageQuality 80` | When vaccinated; sent as a `data:image/jpeg;base64,…` URI |
| Neutered / spayed | dropdown ''/neutered/spayed/no | |
| Microchip number, Colour & markings | text | |
| Insured, then Insurer | switch, then text | |
| Temperament notes | multi-line text | |
| Aggression to people | switch, then details | |
| Aggression to other animals | switch, then details | **dog only** |
| Travels well in car | dropdown ''/yes/no/unsure | **dog only** |
| Chases livestock | dropdown ''/yes/no/unsure | **dog only**; details shown for yes or unsure |
| Allergies | dropdown no/yes/unsure, then details | |
| On medication | switch, then a list of medication cards | Each card: name, dosage, frequency, Vet prescribed, Administered by Pawfect Pets. Turning the switch on auto-adds the first card |
| Walking | dropdown on_lead/off_lead (default on_lead) | **dog only** |
| Off-lead consent | `profile.offLeadConsentText` (with `{{petName}}`) and a `Signature` pad (160px) with Clear | When off_lead. Editing a dog that was already off-lead keeps the old signature unless the customer re-signs |

**Validation** (`_validationIssues`) lists every problem in one dialog ("Some details are missing"). It checks:
- name and breed;
- a valid non-negative integer age;
- an expiry date when vaccinated;
- allergy details when the status is not `no`;
- at least one named medication when on medication;
- an off-lead signature when one is needed.

**Request body**:
- Dog-only fields are sent only for dogs (a comment says the backend rejects them for cats).
- `vaccineRecordPhoto: ''` is sent on edit to clear a removed photo.
- `offLeadConsent` is `{mode: 'on_lead'}`, or `{mode: 'off_lead', signature: data:image/png;base64}` when freshly signed.

The save calls `POST /portal/animals` or `PATCH /portal/animals/:id`, then pops `true`.

#### Invoices tab (`invoices_screen.dart`)

- `FutureBuilder` with pull-to-refresh.
- Each card shows the number, issue date, subject, total and a `StatusChip`.
- Tapping a card opens a `DraggableScrollableSheet` (0.7–0.95) with the number, status, Issued/Due dates, subject, line items (`description ×qty`, line total), Subtotal/Total/Paid/Balance due, and three actions:
  - **View Invoice**: `InvoicePdfScreen`, which fetches `/portal/invoices/:id/pdf` once and shows `PdfPreview` with printing and sharing, no page-format or orientation changes.
  - **Download PDF**: `Printing.sharePdf(filename: '{number}.pdf')`.
  - **Send by email**: `POST /portal/invoices/:id/send`, then the snackbar "Invoice emailed to you.".

#### Quotes tab (`quotes_screen.dart`)

- The same list and sheet layout as invoices, showing "Valid until".
- Accept and Decline appear **only when `status == 'sent'`**. Decline asks for confirmation first.
- After either action the sheet pops `true` and the list refreshes.
- For other statuses it shows "This quote has been {status}." There is no PDF option for quotes.

#### Bookings tab (`bookings_screen.dart`)

- A read-only list from `GET /portal/bookings`.
- Each card shows `productName ×qty`, the pet names (primary plus `additionalAnimals`, joined), the date (converted from UTC to local), and `visitTime` (AM/PM) when present.

#### Messages tab (`messages_screen.dart`)

- A chat thread that loads on init and **polls every 5s**. It keeps the view at the bottom if the user was already within 40px of it.
- Staff bubbles are cream and on the left; the customer's are brand blue and on the right (the mirror of the staff app's thread). Each shows "{senderName ∣ Pawfect Pets ∣ You} · d MMM HH:mm".
- The composer allows 1–4 lines and has a send button.
- **Long-press on your own message** offers "Delete message? This removes it for everyone." and then calls `DELETE /portal/messages/:id`.

#### Notifications (`notifications_sheet.dart`, `services/notification_store.dart`)

**`NotificationsSheet`** (opened from the bell):
- It calls `center.load()` and `center.markRead()` on open.
- It lists the notifications with type icons (message, invoiceReceived/Updated, quoteReceived/Updated, default).
- Tapping one pops it back to the shell for routing.

**`NotificationStore`** (in secure storage):
- `portal_local_notifications` holds a JSON list, capped at 100, newest first, deduped by id.
- `portal_notifications_read_at` is the last-read timestamp.
- `markAcknowledged(id)` persists the acknowledgement.

**`NotificationsCenter`**:
- Merges the local captures with `GET /portal/notifications`, falling back to local-only when offline. It dedupes by id and sorts newest first.
- **Unread** is the number of items newer than the device-local `readAt`, or all of them if `readAt` is not set.

### Push service (`lib/services/push_service.dart`)

- **Channel**: `MethodChannel('pawfectpets/push')`.
- **`start()`**: idempotent (`_started`). It invokes the native `start` and swallows errors when no handler exists (non-iOS).
- **`onToken`**: calls `POST /portal/push/register {token, platform:'ios'}`. Errors are swallowed; a comment says it is "re-sent on the next start()/token".
- **`onNotificationReceived` and `onNotificationTap`**: `_capture` normalises the payload.
  - The id is `notificationId`, falling back to `pushMessageId`, then a microsecond timestamp.
  - It reads `ackRequired` as either a bool or a string.
  - It stores the result as a `LocalNotification` with the timestamp "now".
  - It bumps the `inbound` `ValueNotifier`.
  - For a tap it also sets `tappedNotification`, which `HomeShell` consumes.

### Models (`lib/models/portal_models.dart`)

| Model | Fields (JSON source) |
|---|---|
| `Profile` | `id`/`_id`, firstName, surname, name, email, phoneNumber, address1/2, town, county, postcode, address, `emergencyContact`, `emergencyVet`, `security`, `agreement`, `terms`, `offLeadConsentText` |
| `EmergencyContact` | sameAsClient, firstName, surname, address1/2, town, county, postcode, phoneNumber, email |
| `EmergencyVet` | practiceName, address1/2, town, county, postcode, telephone, email |
| `Security` | keysProvided, furtherInformation, `hasAlarmInstructions` (the plaintext never comes back) |
| `Agreement` | signedName, signatureImage (data URI), signedAt, termsVersion, termsDocumentDate; `isSigned` |
| `Terms` | html, version, documentDate |
| `Animal` | `_id`, species, breed, name, sex, age, vaccinated, vaccineExpiryDate (date part only), vaccineRecordPhoto, colourMarkings, microchipNumber, insured, insurer, neuteredStatus, temperamentNotes, aggression fields, travelsWellInCar, chasesLivestock(+details), allergies.status/details, medication.onMedication/medications, offLeadConsent.mode |
| `AnimalMedication` | name, dosage, frequency, vetPrescribed, administeredByPawfectPets |
| `PortalNotification` | `_id`, title, body, type, reference, read, createdAt (local) |
| `PortalMessage` | `_id`, sender (`staff`/`customer`), senderName, body, createdAt |
| `LineItem` | description, quantity, unitPrice, discountPercent; `lineTotal` |
| `Invoice` | `_id`, invoiceNumber, lineItems, subtotal, total, amountPaid, status, subject, issueDate, dueDate; `balanceDue` (clamped ≥ 0) |
| `Quote` | `_id`, quoteNumber, lineItems, subtotal, total, status, subject, issueDate, validUntil |
| `Booking` | `_id`, date (local), animalName (animal + additionalAnimals names), productName, quantity, visitTime |
| `LocalNotification` (`notification_store.dart`) | id, title, body, type, reference, timestamp, pushMessageId, ackRequired, acknowledged; `isMessage`, `needsAck` |

### Tests

`test/widget_test.dart` has a single smoke test. It pumps `const PawfectPetsPortalApp()` and expects the text "Customer App". It does **not** wrap the app in the `MultiProvider` from `main()`, and `PawfectPetsPortalApp.build` uses `Consumer<AuthProvider>`. As written, the test would throw `ProviderNotFoundException` instead of finding the login screen.

### Suggested improvements

**Bugs and gaps in the code**
1. **Messages poll even when hidden.** `MessagesScreen` sits in `HomeShell`'s `IndexedStack`, so its `Timer.periodic(5s)` (`messages_screen.dart`) runs on every tab for as long as the user is logged in. That means a `GET /portal/messages` every 5s in the background of the whole app. Pause the timer when the tab isn't selected, e.g. pass `isActive` from `HomeShell._index` or use `TickerMode`/`VisibilityDetector`, and also on `AppLifecycleState.paused`.
2. **The unread badge downloads the whole feed.** `HomeShell` polls `NotificationsCenter.unreadCount()` every 20s, and that calls `load()`, which downloads the **full** `/portal/notifications` list. `Repository.notificationsUnread()` (`/portal/notifications/unread-count`) and `markNotificationsRead()` already exist but are never called. Use them, so read state syncs to the server and across devices instead of the device-local `portal_notifications_read_at` marker.
3. **Messages have no unread badge.** `messagesUnread()` (`/portal/messages/unread-count`) is unused. Show a badge on the Messages `NavigationDestination`.
4. **Medication edits can drop fields.** `AnimalMedication` (`portal_models.dart`) has no `illnessTreating`/`additionalInfo`, but the web intake (`frontend/src/intake/MedicationEntriesField.tsx`) collects both. Editing a pet in the app re-sends `medications` built from `_MedEntry.toJson()`, so those fields would be lost unless the backend merges each entry. Add the two fields to the model and form.
5. **"Other" animals miss questions.** In `animal_form_screen.dart`, aggression-to-other-animals and travels-well-in-car are dog-only, while the web wizard asks them for any non-cat (`PetDetailsStep.tsx` `!isCat`). Align the rule with the backend DTO: either show them for `other`, or change the web.
6. **Model fields the app never shows.** `dateOfBirth`, `photos`, `lastSeasonEndDate` and `travelsWellInCarDetails` exist on the web/backend animal but not in `Animal`/`AnimalFormScreen`. Customers can't see or update them in the app.
7. **"Same as me" is inconsistent.** `EmergencyContactScreen` still offers "Same as me", but the web wizard removed that shortcut and always sends `sameAsClient: false` (`frontend/src/api/client.ts`). Decide on one rule.
8. **Quote accept/decline rules differ.** Quotes can be accepted only when `status == 'sent'` (`quotes_screen.dart`), but the web allows `draft` or `sent` (`DocumentView.tsx`). There is also no quote PDF view, unlike invoices.
9. **The smoke test can't pass.** `test/widget_test.dart` pumps the app without providers. Wrap it in the same `MultiProvider` as `main()`, with fakes for `ApiClient`/`Repository`.
10. **Unused dependency.** `url_launcher` is declared but never imported. Remove it, or use it for tap-to-call on the emergency vet and business numbers.
11. **Push entitlement is set to development.** `ios/Runner/Runner.entitlements` has `aps-environment = development`. Confirm that the App Store export rewrites it to production, and that the backend's APNs host (`APNS_*` env in `docker-compose.yml`) matches the build type.

**Security**
12. **The password is stored on the device.** Biometric sign-in keeps the **plaintext password** in the keychain (`auth_provider.dart` `_passwordKey`), and the Face ID check is only an app-level `LocalAuthentication` prompt. Prefer a server-issued long-lived refresh token stored with keychain access control requiring biometrics. Also, credentials are saved automatically after `completeWithCode`, even though the user never opted in; ask first.
13. **Token registration is never retried.** A failed `registerPushToken` is swallowed (`push_service.dart`), and `start()` is idempotent per process, so a token is never retried until a relaunch or a new token. Cache the last token, and re-register after login or on resume.
14. **No client-side email check.** Login and code requests send `_email.text` untrimmed to `requestCode`/`requestReset` (`login_screen.dart`; `login` trims it, those don't). Trim it and add a basic email format check.

**Feature ideas**
15. **Pull-to-refresh in Details.** Add pull-to-refresh on the Details tab, which calls `refreshProfile`. Today the profile only refreshes after a save.
16. **Bookings improvements.** Group bookings into Upcoming and Past, with date headers. Add a "Request a booking" flow, which needs a new `/portal` endpoint; the screen is read-only today.
17. **Pre-boarding and forms in the app.** Surface pending form submissions and pre-boarding questionnaires (currently web-only at `/forms/:id` and `/pre-boarding/:id`), either in-app or as deep links opened with `url_launcher`.
18. **Deep links from push.** Use the `reference` field already captured in `LocalNotification` to open the specific invoice or quote sheet, not just the Messages tab or a modal.
19. **Android.** The project is iOS-only (no `android/`, `android: false` for icons, `platform: 'ios'` hard-coded in `registerPushToken`). An Android target with FCM would need a platform parameter there.
20. **Pay online.** Add "Pay now" in the invoice sheet when `balanceDue > 0`.

## Staff app (mobile/)

`mobile/` is the Flutter **staff field app** (`pubspec.yaml` name `pawfectpets_staff`, version `1.0.105`, Dart SDK `^3.13.1`). It has about 19.8k lines of Dart across `lib/` and `test/`. Staff use it to run the bookings calendar, look up customers and pets, handle Boarding & Day Care check-in and check-out, do invoicing and quotes, take payments (including SumUp card payments), record expenses and bank transfers, and message customers. All data comes from the NestJS backend over REST with a staff JWT.

> `mobile/README.md` is out of date. It says invoices are "deliberately not in this app" and describes a "Bookings tab — every booking … change its status". The code now ships full invoicing, quotes, payments and finance screens. The bookings tab is a day-booking calendar, and the old date-range `Booking` status screen (`lib/screens/booking_detail_screen.dart`) is no longer reachable from any navigation (see [Dead / unreachable code](#dead--unreachable-code)).

### Directory layout

| Path | Contents |
|---|---|
| `lib/main.dart` | Entry point: builds `ApiClient`, `Repository` and `PushService`, wraps the app in a `MultiProvider`, and chooses the root screen from `AuthProvider` state |
| `lib/config.dart` | Compile-time `--dart-define` constants |
| `lib/theme.dart` | Material 3 brand theme shared with the staff app (blue `#0072B5`, yellow `#FDF101`, pink, cream cards, Archivo Black + DM Sans), `OnBrandBar`, plus `statusColor()` / `statusBg()` for status pills |
| `lib/widgets/brand.dart` | `BrandTitle` header-band title, `RefPill`, `BrandSectionLabel`, `BrandHeading` (copied from the staff app) |
| `lib/api/api_client.dart` | Thin HTTP wrapper (`package:http`) |
| `lib/api/repository.dart` | One method per backend call (868 lines), plus a session cache for reference data |
| `lib/state/auth_provider.dart` | The only global state (`ChangeNotifier`) |
| `lib/models/` | 25 plain Dart model files with `fromJson` factories |
| `lib/screens/` | 48 screen and bottom-sheet files |
| `lib/services/` | `push_service.dart` (APNs bridge) and `sumup_service.dart` (card reader) |
| `lib/utils/` | `pet_name_placeholder.dart`, `price_list_pdf.dart`, `product_availability.dart`, `visit_plan.dart` |
| `lib/widgets/` | `hold_to_delete_dialog.dart`, `signature_pad.dart`, `status_badge.dart`, `zoomable_pdf.dart` |
| `test/` | 5 widget-test files |
| `android/`, `ios/`, `web/` | Platform runners |
| `assets/icon/` | Drop `app_icon.png` (1024×1024) here for `flutter_launcher_icons` (only `README.txt` is present) |

### Dependencies (pubspec.yaml)

| Package | Constraint | Used for (in code) |
|---|---|---|
| `flutter` (sdk) | — | UI |
| `cupertino_icons` | ^1.0.8 | Icons |
| `http` | ^1.6.0 | `ApiClient` REST calls |
| `flutter_secure_storage` | ^11.0.0 | Token, provisioned base URL, remembered username/password (`AuthProvider`) |
| `provider` | ^6.1.5+1 | DI (`Provider.value`) and `ChangeNotifierProvider<AuthProvider>` |
| `intl` | ^0.20.3 | `NumberFormat.currency(locale: 'en_GB', symbol: '£')`, `DateFormat` |
| `printing` | ^5.15.0 | `Printing.sharePdf` / `Printing.layoutPdf` (invoice and quote share/print), PDF rasterising in `ZoomablePdf`, `PdfGoogleFonts` |
| `pdf` | ^3.11.1 | Client-side price-list PDF (`utils/price_list_pdf.dart`) |
| `url_launcher` | ^6.3.2 | `tel:` links on customer detail |
| `image_picker` | ^1.2.3 | Camera or library photos (pets, notes, expenses, observations, form `file` fields) |
| `image` | ^4.9.2 | Downscale and JPEG re-encode of attachments in `compute` isolates |
| `cunning_document_scanner` | ^3.0.1 | "Scan" option for note attachments and expense receipts |
| `mobile_scanner` | ^7.4.0 | First-launch QR provisioning |
| `local_auth` | ^3.0.2 | Face ID / Touch ID "remembered" sign-in |
| `sumup` | ^0.14.3 | SumUp card reader checkout (iOS 16+) |
| dev: `flutter_test`, `flutter_lints ^6.0.0`, `flutter_launcher_icons ^0.14.4` | | Tests, lints (`analysis_options.yaml` includes `package:flutter_lints/flutter.yaml` and excludes the platform folders), iOS icon generation (`android: false`) |

There is **no** routing package, Firebase/FCM, local-notifications plugin, or offline database.

### Configuration (`lib/config.dart` dart-defines)

| Define | Dart const | Default | Where used |
|---|---|---|---|
| `API_BASE_URL` | `apiBaseUrl` | `https://api.pawfectpetssherborne.co.uk` | Starting value of `ApiClient._baseUrl` only. At runtime `AuthProvider._init()` overwrites it with the QR-provisioned URL from secure storage. If no URL is stored, the app shows `ScanQrScreen` and makes no API calls, so in practice **the dart-define never decides which server is used**. |
| `INTAKE_URL` | `intakeBaseUrl` | `https://pawfectpetssherborne.co.uk` | Builds customer links in `customer_detail_screen.dart`: `$intakeBaseUrl/intake/<customerId>/add-pet` (Add-pet email) and `$intakeBaseUrl/forms/<submissionId>` (Send form). The repository comment notes that the backend rebuilds the link host from `PUBLIC_INTAKE_URL`, so only the path matters. |
| `SUMUP_AFFILIATE_KEY` | `sumupAffiliateKey` | A literal `sup_afk_…` key is **committed as the default** | `SumupService.configured` is true when the key is non-empty. Setting it to empty disables card charging. |

### App bootstrap and root routing

`main()` (`lib/main.dart`) does the following:

1. Calls `WidgetsFlutterBinding.ensureInitialized()`. This is required because `PushService` installs a MethodChannel handler in its constructor; the comment notes that without it the app renders a white screen.
2. Creates one `ApiClient` → `Repository(client)` → `PushService(repository)`.
3. Registers `Provider.value` for the client, repository and pushService, and `ChangeNotifierProvider(AuthProvider(client, repository))`.
4. `MaterialApp(title: 'PawfectPets Staff', theme: appTheme)` with a `Consumer<AuthProvider>` home:
   - `auth.loading` → full-screen spinner
   - `auth.needsProvisioning` → `ScanQrScreen`
   - `auth.staff != null` → `HomeShell`, else `LoginScreen`

### Authentication

#### State: `AuthProvider` (`lib/state/auth_provider.dart`)

Fields: `Staff? staff`, `bool loading` (initially true), `bool needsProvisioning`, `String? rememberedUsername`, and the getter `hasRemembered`.

Secure-storage keys (`FlutterSecureStorage`, which uses the iOS Keychain or Android EncryptedSharedPreferences/Keystore):

| Key | Value |
|---|---|
| `pawfectpets_staff_token` | JWT access token |
| `pawfectpets_api_base_url` | Backend URL provisioned by QR or manual entry |
| `pawfectpets_remember_username` | Username, saved when "Remember me" is ticked |
| `pawfectpets_remember_password` | **Plain-text password**, saved when "Remember me" is ticked; read back for biometric login |

Lifecycle:

| Method | Behaviour |
|---|---|
| constructor | Registers `client.setUnauthorizedHandler`. On any 401 it sets `staff = null`, clears the token in the client and storage, and calls `notifyListeners()`, which bounces the app to `LoginScreen`. Then runs `_init()`. |
| `_init()` | Reads the base URL. If missing → `needsProvisioning = true`. Otherwise `client.setBaseUrl(url)`, loads the remembered username, and calls `_restoreSession()`. |
| `provision(url)` | Trims the URL, strips trailing `/`, stores it, sets the client base URL, then `_restoreSession()` |
| `_restoreSession()` | If a token is stored: `client.setToken` → `repository.me()` (`GET /auth/me`). On failure it deletes the token. |
| `login(u, p, {remember})` | `POST /auth/login {username, password}` → stores `accessToken`, sets `staff`. With `remember` it saves the username and password; without it, it clears both. |
| `loginWithBiometrics()` | Reads the saved credentials → `LocalAuthentication().authenticate(localizedReason: 'Sign in to PawfectPets Staff')` → `login(..., remember: true)`. Throws `ApiException('No saved login found.')` or `ApiException('Authentication cancelled.')`. |
| `logout()` | Deletes the token **and the remembered credentials**, so Face ID login is lost after an explicit logout |
| `resetProvisioning()` | Deletes the base URL, token and remembered credentials → back to `ScanQrScreen` |

Notes grounded in the code:

- The app never sends `rememberMe` on login. The backend (`backend/src/auth/auth.service.ts`) only grants a 30-day token when `dto.rememberMe` is set; otherwise the JWT module default of `expiresIn: '12h'` applies (`auth.module.ts`). Mobile sessions therefore expire after 12 h, and the next call returns 401 and drops to login.
- `Staff` (`models/staff.dart`) keeps only `id`, `name` and `email` (the cast is non-nullable `as String`). The backend's `shapeStaff` also returns `username`, `isBreakGlass`, `locked` and `role{permissions}`, but the app ignores them, so **the mobile UI does no permission gating**.

#### Screens

- **`LoginScreen`** (`screens/login_screen.dart`) has Username and Password fields (with autofill hints), a "Remember me (Face ID / Touch ID)" checkbox, and a **Sign in** button. When credentials are remembered it also shows an outlined "Sign in as \<username\>" button that triggers `loginWithBiometrics`. A **Scan QR code** text button pushes `ScanQrScreen` so the server URL can be changed. The AppBar "Disconnect device" action confirms, then calls `resetProvisioning()`. Errors appear in a red box using `ApiException.message`.
- **`ScanQrScreen`** (`screens/scan_qr_screen.dart`) is first-launch provisioning. The intro shows a "Login with QR code" button, and the camera (`MobileScanner`) only starts when that is tapped. A white 240×240 frame overlays the camera view. `_isValidUrl` accepts only `http`/`https` URLs with a host. On a valid scan it stops the scanner, calls `provision(url)`, and pops if it was pushed from login. The **Enter URL manually** dialog is a fallback for the simulator or devices without a camera. The QR itself comes from the admin's `admin/src/components/QrLoginModal.tsx`, which encodes `BusinessInfo.qrCodeUrl || API_URL`. The QR carries **only the server URL, not credentials**; "QR login" means provisioning followed by a normal username/password login.

### HTTP client (`lib/api/api_client.dart`)

- `ApiException(message, {statusCode})`; `toString()` returns the message.
- Headers: `Content-Type: application/json`, plus `Authorization: Bearer <token>` when a token is set.
- Timeouts: reads (`get`, `getList`, `delete`) 20 s; writes (`post`, `postVoid`, `patch`) 60 s, because bodies can carry base64 images; `getBytes` 30 s.
- Any exception during send or timeout → `ApiException('Could not reach the server. Check your connection and try again.')`.
- A 401 calls the unauthorized handler and throws `'Session expired. Please log in again.'`.
- Any other non-2xx status: uses the JSON `message` from the body (a NestJS validation array is joined with `; `), falling back to `Request failed (<code>)`.
- Methods: `get` (Map), `getList` (List), `post` (Map), `postVoid` (empty body), `patch`, `delete`, `getBytes` (PDF/logo bytes). The base URL comes from `setBaseUrl`.

### Repository: every function and its endpoint (`lib/api/repository.dart`)

The session cache, cleared by `refreshReferenceData()` (called on pull-to-refresh in `BookingsScreen`), holds `listProducts`, `listBankHolidays`, `listAnnualLeave` and `getVisitMapping`.

| Area | Function | Method + endpoint | Body / query / notes |
|---|---|---|---|
| Auth | `login(username, password)` | `POST /auth/login` | `{username, password}` → `accessToken`, `staff` |
| | `me()` | `GET /auth/me` | |
| Customers | `listCustomers()` | `GET /customers` | |
| | `getCustomer(id)` | `GET /customers/:id` | |
| | `createLead({firstName, surname?, email})` | `POST /customers/leads` | Minimal pending lead |
| | `deleteCustomer(id)` | `DELETE /customers/:id` | Server returns 409 if the customer has linked records |
| | `updateCustomer(id, patch)` | `PATCH /customers/:id` | Full edit payload |
| | `updateCustomerStatus(id, status)` | `PATCH /customers/:id/status` | `{status}` |
| | `updateCustomerDefaults(id, …)` | `PATCH /customers/:id` | `{defaultProduct, travelChargeable, travelProduct, regularDays}` |
| | `setCustomerPortalActive(id, active)` | `PATCH /customers/:id/portal` | `{active}`; enabling emails a welcome / set-password link |
| | `sendCustomerPortalReset(id)` | `POST /customers/:id/portal/reset` | |
| | `listCustomerActivity(customerId)` | `GET /audit-log?customer=` | |
| | `getAlarmInstructions(id)` | `GET /customers/:id/alarm-instructions` | Decrypts on demand |
| | `sendAddPetEmail({to,name,link,customerId})` | `POST /settings/email/send` | `trigger: 'add_pet'` |
| Messages | `listConversations()` | `GET /messages/conversations` | |
| | `messageThread(customerId)` | `GET /messages/:customerId` | |
| | `sendMessage(customerId, body)` | `POST /messages/:customerId` | `{body}` |
| | `deleteMessage(customerId, messageId)` | `DELETE /messages/:customerId/:messageId` | |
| | `messagesUnreadCount()` | `GET /messages/unread-count` | **Not called anywhere** |
| Forms | `listForms()` | `GET /forms` | |
| | `listFormSubmissions(customerId)` | `GET /form-submissions?customer=` | |
| | `getFormSubmission(id)` | `GET /form-submissions/:id` | |
| | `createFormSubmission({formId, customerId, recipientEmail, recipientName?, animalIds?})` | `POST /form-submissions` | Returns `_id` |
| | `getFormSubmissionPublic(id)` | `GET /form-submissions/:id/public` | Recipient-resolved fields |
| | `submitFormSubmission(id, answers)` | `POST /form-submissions/:id/submit` | `{answers}` |
| | `sendFormEmail({…, formName})` | `POST /settings/email/send` | `trigger: 'form'` |
| Animals | `listAnimals(customerId)` | `GET /animals?customer=` | |
| | `petNamesByCustomer()` | `GET /animals` | Built client-side into a map of customer → pet names |
| | `listAllAnimals()` | `GET /animals` | As `AnimalRef` |
| | `updateAnimal(id, patch)` | `PATCH /animals/:id` | |
| | `deleteAnimal(id)` | `DELETE /animals/:id` | 409 if the pet is on a booking |
| Legacy bookings | `listBookings({customerId})` | `GET /bookings[?customer=]` | **Not called anywhere** |
| | `updateBookingStatus(id, status)` | `PATCH /bookings/:id` | Only used by the unreachable `BookingDetailScreen` |
| Day bookings | `listDayBookings({from, to})` | `GET /day-bookings?from=YYYY-MM-DD&to=` | `to` is exclusive |
| | `createDayBooking({animalId, additionalAnimalIds, date, productId, quantity, visitTime?})` | `POST /day-bookings` | |
| | `updateDayBooking(id, {date, productId, quantity, invoiceId})` | `PATCH /day-bookings/:id` | |
| | `deleteDayBooking(id)` | `DELETE /day-bookings/:id` | |
| | `deleteStay(stayId)` | `DELETE /day-bookings/stay/:stayId` | Deletes the whole boarding stay |
| | `getBoardingPlan(startIso, endIso, dogCount)` | `GET /day-bookings/boarding-plan?start=&end=&dogCount=` | Used by the quote Boarding section |
| Settings | `getVisitMapping()` *(cached)* | `GET /settings/visits` | |
| | `getDepositPercentage()` | `GET /settings/business` | `depositPercentage` |
| | `getBusinessContact()` | `GET /settings/business` | `name`, plus `telephone · email` |
| | `getBusinessLogo()` | `GET /settings/business/logo` (bytes) | Returns null on error |
| | `getNotificationSettings()` | `GET /settings/notifications` | |
| | `updateNotificationSettings(patch)` | `PATCH /settings/notifications` | |
| | `getBoardingWorkflowSettings()` | `GET /settings/boarding` | Check-in / check-out form ids |
| Appointments | `listAppointments({from,to})` | `GET /appointments?from=&to=` | |
| | `createAppointment({customerId, reason, date, time})` | `POST /appointments` | |
| | `deleteAppointment(id)` | `DELETE /appointments/:id` | |
| Push | `registerPushToken(token)` | `POST /push/register` | `{token, platform: 'ios'}` (always `ios`) |
| Products | `listProducts()` *(cached)* | `GET /products` | |
| | `sendPriceListEmail({recipientName, recipientEmail, attachmentData, attachmentName})` | `POST /products/price-list/email` | Base64 PDF |
| Reference | `listBankHolidays()` *(cached)* | `GET /bank-holidays` | |
| | `listAnnualLeave()` *(cached)* | `GET /annual-leave` | |
| CRM | `listActivities({customerId})` | `GET /crm/activities[?customer=]` | Attachments stripped |
| | `getActivity(id)` | `GET /crm/activities/:id` | With attachments |
| | `createActivity({customerId,type,subject,description?,createdBy,attachments?})` | `POST /crm/activities` | `createdBy` is the staff name |
| | `updateActivity({id,type,subject,description?,attachments?})` | `PATCH /crm/activities/:id` | |
| | `deleteActivity(id)` | `DELETE /crm/activities/:id` | |
| Invoices | `listInvoices({customerId})` | `GET /invoices[?customer=]` | |
| | `getInvoice(id)` | `GET /invoices/:id` | |
| | `createInvoice({customerId, lineItems, issueDate, dueDate, subject?, paymentTerms?, bookingId?})` | `POST /invoices` | Server assigns the number and totals |
| | `updateInvoice(id, patch)` | `PATCH /invoices/:id` | |
| | `deleteInvoice(id)` | `DELETE /invoices/:id` | 409 if payments or credit notes exist |
| | `getInvoicePdf(id)` | `GET /invoices/:id/pdf` (bytes) | |
| | `sendInvoiceEmail(id)` | `POST /invoices/:id/send` | Draft → sent |
| | `requestDeposit(id)` | `POST /invoices/:id/request-deposit` | Returns `depositAmount`, `depositPercentage` |
| | `listInvoiceTerms()` | `GET /invoice-terms` | |
| Quotes | `listQuotes({customerId})` | `GET /quotes[?customer=]` | |
| | `getQuote(id)` | `GET /quotes/:id` | |
| | `getQuotePdf(id)` | `GET /quotes/:id/pdf` (bytes) | |
| | `createQuote({customerId? \| manualCustomerName+Email, lineItems, issueDate, validUntil, subject?, paymentTerms?, visitPlan?, dayCarePlan?, boardingPlan?})` | `POST /quotes` | |
| | `updateQuote(id, patch)` | `PATCH /quotes/:id` | |
| | `deleteQuote(id)` | `DELETE /quotes/:id` | |
| | `sendQuoteEmail(id)` | `POST /quotes/:id/send` | |
| | `acceptQuote(id)` | `POST /quotes/:id/accept` | Returns `invoice.invoiceNumber` |
| Boarding & Day Care | `listBoardingBookings()` | `GET /boarding-bookings` | With derived `status` and `stages` |
| | `createBoardingBooking({customerId, animalIds, type, startDate, dropOffTime, endDate?, pickUpTime, dropOffPeriod?, collectionPeriod?, notes?})` | `POST /boarding-bookings` | |
| | `requestBoardingPayment(id, type)` | `POST /boarding-bookings/:id/request-payment` | `{type: 'deposit'\|'full'}` |
| | `recordBoardingCheckIn(id, submissionId)` | `POST /boarding-bookings/:id/check-in` | `{submission}` |
| | `recordBoardingCheckOut(id, submissionId)` | `POST /boarding-bookings/:id/check-out` | `{submission}` |
| | `sendBoardingPreCheckIn(id)` | `POST /boarding-bookings/:id/send-pre-check-in` | |
| | `listBookingObservations(bookingId)` | `GET /boarding-bookings/:id/observations` | |
| | `createBookingObservation(bookingId, {observedAt, category, description?, photos})` | `POST /boarding-bookings/:id/observations` | `observedAt` sent as UTC ISO |
| | `updateBookingObservation(bookingId, id, …)` | `PATCH /boarding-bookings/:id/observations/:obsId` | Always sends `description` and `photos` so they can be cleared |
| | `deleteBookingObservation(bookingId, id)` | `DELETE /boarding-bookings/:id/observations/:obsId` | |
| Payments | `listPaymentMethods()` | `GET /payment-methods` | |
| | `recordPayment({invoiceId, date, amount, accountId, paymentMethod?, charges?})` | `POST /payments` | Always sends `skipThankYouEmail: true` |
| | `sendPaymentThankYou(paymentId)` | `POST /payments/:id/send-email` | |
| | `updatePayment(id, …)` | `PATCH /payments/:id` | |
| | `deletePayment(id)` | `DELETE /payments/:id` | |
| | `listPayments()` | `GET /payments` | |
| Expenses | `listExpenses()` | `GET /expenses` | |
| | `getExpense(id)` | `GET /expenses/:id` | Includes receipt |
| | `createExpense({date, category, description, amount, payee?, accountId?, receipt?})` | `POST /expenses` | Receipt is a base64 data URI |
| | `updateExpense(id, patch)` | `PATCH /expenses/:id` | |
| | `deleteExpense(id)` | `DELETE /expenses/:id` | |
| | `listExpenseCategories()` | `GET /expense-categories` | |
| | `listVendors()` | `GET /vendors` | |
| Banking | `listBankAccounts()` | `GET /bank-accounts` | As `BankAccountRef` |
| | `listBankAccountsDetailed()` | `GET /bank-accounts` | As `BankAccount` with balance |
| | `getBankTransactions(accountId, month, year)` | `GET /bank-accounts/:id/transactions?month=&year=` | |
| | `listBankTransfers()` | `GET /bank-transfers` | |
| | `createBankTransfer({date, reference?, fromAccountId, toAccountId, amount})` | `POST /bank-transfers` | |
| | `updateBankTransfer(id, …)` | `PATCH /bank-transfers/:id` | |
| | `deleteBankTransfer(id)` | `DELETE /bank-transfers/:id` | |
| Reports | `incomeVsExpenses({months=6})` | `GET /reports/income-vs-expenses?months=` | |
| | `expensesByCategory({months=6})` | `GET /reports/expenses-by-category?months=` | |

### Models (`lib/models/`)

| File | Class(es): fields |
|---|---|
| `animal.dart` | **Animal**: `id, species, breed, name, sex, age(int), dateOfBirth?, vaccinated, vaccineExpiryDate?, vaccineRecordPhoto?, photos[], colourMarkings?, microchipNumber?, insured?, insurer?, neuteredStatus?, lastSeasonEndDate?, temperamentNotes?, aggressionToPeople, aggressionToPeopleDetails?, aggressionToOtherAnimals?, aggressionToOtherAnimalsDetails?, travelsWellInCar?, chasesLivestock?, chasesLivestockDetails?, allergies?, medication?, offLeadConsent?`. **AllergyInfo**: `status (yes\|no\|unsure), details?`. **MedicationEntry**: `name, illnessTreating?, dosage?, frequency?, vetPrescribed, administeredByPawfectPets, additionalInfo?`. **MedicationInfo**: `onMedication, medications[], details?` (legacy). **OffLeadConsent**: `mode (on_lead\|off_lead), date?` |
| `annual_leave.dart` | **AnnualLeave**: `id, name, startDate, endDate` |
| `appointment.dart` | **Appointment**: `id, customerId, customerName, reason, date, time ('HH:mm')` |
| `audit_log_entry.dart` | **AuditLogEntry**: `id, type, title, description?, amount?, actor, createdAt` |
| `bank_account.dart` | **BankAccount**: `id, name, type, sortCode, accountNumber, currentBalance`. **BankTransaction**: `date, description, type (payment\|expense\|credit_note), amount (signed), balance` |
| `bank_holiday.dart` | **BankHoliday**: `id, name, date` |
| `bank_transfer.dart` | **BankTransfer**: `id, date, reference?, fromAccountId, fromAccountName, toAccountId, toAccountName, amount` |
| `boarding_booking.dart` | **BoardingBooking**: `id, reference, customerId, customerName, customerEmail, animalIds[], animalNames[], type ('boarding'\|'dayCare'), startDate, dropOffTime, endDate, pickUpTime, notes?, invoiced, invoiceId?, invoiceNumber?, paymentRequestType? ('deposit'\|'full'), preCheckInSentAt?, preCheckInSubmission?, checkInSubmission?, checkOutSubmission?`, getter `isBoarding`. **BoardingStage**: `key, label, done, current, sub?`. **BoardingBookingWithStatus**: `booking, status (label), stages[]` |
| `booking.dart` | `bookingStatuses = [requested, confirmed, in_progress, completed, cancelled]`. **Booking** (legacy date-range): `id, customer (CustomerRef), animalNames[], serviceType, startDate, endDate, status, notes?, price?` |
| `booking_observation.dart` | **BookingObservation**: `categories = [Toilet, Play, Medication, Feed, Groom, General]`, `maxPhotos = 5`; `id, observedAt, category, description?, photos[], observedBy` |
| `crm_activity.dart` | **CrmActivity**: `id, customer (CustomerRef), type, subject, description?, createdBy, createdAt, attachments? (null in list responses), attachmentCount` |
| `customer.dart` | `customerStatuses = [pending, active, inactive, update_info]`. **EmergencyContact**: `sameAsClient, name?, address?, phoneNumber?, email?`. **EmergencyVet**: `practiceName, address, telephone, email?, alternativeVetAuthorised`. **Security**: `keysProvided, furtherInformation?`. **Customer**: `id, name, email, address?, phoneNumber?, status, emergencyContact?, emergencyVet?, security?, defaultProductId?, travelChargeable, travelProductId?, regularDays[], portalActive, raw (original JSON for the edit form)`. **CustomerRef**: `id, name, email, address?, phoneNumber?` |
| `day_booking.dart` | **DayBooking**: `id, animalId, animalName (joined e.g. "Harry, Archie & Benji"), additionalAnimalIds[], species, customerId, customerName, date, productId, productName, productPrice, quantity, invoiceId?, visitTime? (AM\|PM), boardingStay, stayId?, placeholder, dropOffTime?, pickUpTime?`, getter `lineTotal` (0 for a placeholder). **AnimalRef**: `id, name, species, customerId` |
| `expense.dart` | **Expense**: `id, date, category, payee?, description, amount, accountId?, accountName?, receipt? (data URI, image or PDF), receiptName?`, `hasReceipt`. **ExpenseCategory**: `id, name`. **Vendor**: `id, name`. **BankAccountRef**: `id, name, isDefault`. **PaymentMethod**: `id, name, isDefault` |
| `finance_report.dart` | **IncomeExpenseMonth**: `month ('YYYY-MM'), income, expenses, net`. **ExpenseCategoryTotal**: `category, total` |
| `form_submission.dart` | **FormSubmission**: `id, formName, formDescription?, fields (raw snapshot maps), status ('pending'\|'completed'), recipientEmail, recipientName?, answers (by field id; groups are lists of maps; signature/file are data URLs), submittedAt?, createdAt?`, `completed` |
| `form_summary.dart` | **FormSummary**: `id, name, description?, customerVisible` |
| `invoice.dart` | `invoiceStatuses = [draft, sent, paid, overdue, cancelled]`. **InvoiceTerm**: `id, text, plusDays?, endOfMonth, isDefault`. **InvoiceLineItem**: `description, quantity, unitPrice, discountPercent`, `lineTotal`, `toJson()`. **Invoice**: `id, customer, invoiceNumber, lineItems, subtotal, total, amountPaid, status, subject?, paymentTerms?, issueDate, dueDate`, `balanceDue`, `isPartiallyPaid` (sent and 0 < paid < total) |
| `message.dart` | **Message**: `id, sender ('staff'\|'customer'), senderName?, body, createdAt`, `fromStaff`. **Conversation**: `customerId, name, email, lastBody, lastAt, lastSender, unread` |
| `notification_settings.dart` | **NotificationSettings**: `customerActivated, appointmentReminders, appointmentLeadMinutes, dailyDigest, dailyDigestTime ('HH:mm'), invoicesOverdue, invoicesRead` |
| `payment.dart` | **Payment**: `id, paymentId, invoiceId?, invoiceNumber?, date, amount, charges, paymentMethod?, accountId?, accountName?` |
| `product.dart` | **Product**: `id, productCode, name, description?, price, availability? ('weekday'\|'weekend'\|'bank_holiday'), displayInPriceList` |
| `quote.dart` | `quoteStatuses = [draft, sent, accepted, declined, expired]`. **Quote**: `id, customer?, manualCustomerName?, manualCustomerEmail?, quoteNumber, lineItems, subtotal, total, status, subject?, paymentTerms?, issueDate, validUntil`, `customerName` |
| `staff.dart` | **Staff**: `id, name, email` |
| `visit_mapping.dart` | **VisitMapping**: product ids `oneVisitWeekday/Weekend/BankHoliday, twoVisitWeekday/Weekend/BankHoliday, dayCareHalfDay, dayCareFullDay, dayCareSecondDogHalfDay/FullDay, boardingPerDay, boardingSecondDogPerDay, boardingHalfDay, boardingSecondDogHalfDay` (from `…Product` keys), plus `visitSlots` -- every visit slot by backend field name for the 20/30/40 minute lengths (`visitSlotKey(visits, duration, dayType)`, e.g. `twoVisit30MinBankHolidayProduct`; `visitDurations = ['20','30','40']`). Helpers: `isVisitProduct`, `isDayCareProduct`, `isBoardingProduct`, `visitCountForProduct` (1, 2 or null = Walk), `visitDurationForProduct` (default '20'), `productFor(visits, dayType, duration:)` |

### Navigation shell (`screens/home_shell.dart`)

- A `NavigationBar` with 5 tabs: **Customers** (`CustomersScreen`), **Business** (`BusinessScreen`), **Bookings** (`BookingsScreen`), **Boarding** (`BoardingScreen`) and **Messages** (`MessagesScreen`).
- Each tab has its own nested `Navigator` (a `GlobalKey<NavigatorState>` per tab), so the bottom bar stays visible when screens are pushed.
- An `IndexedStack` holds the tabs, but a tab is only built once it has been visited (`_visited` set). This avoids firing every tab's data fetch at login.
- Re-tapping the active tab pops it back to its root. `PopScope(canPop: false)` sends the Android back button to the active tab's stack.
- `initState` → `addPostFrameCallback` → `context.read<PushService>().start()` (push registration starts only after login).
- `LogoutAction` is a shared AppBar icon that calls `AuthProvider.logout()`. It appears on Customers, Bookings and Boarding.

```mermaid
flowchart TD
  Start([App launch]) --> Auth{AuthProvider}
  Auth -- loading --> Spinner[Spinner]
  Auth -- needsProvisioning --> QR[ScanQrScreen]
  QR -- provision(url) --> Login
  Auth -- staff == null --> Login[LoginScreen]
  Login -- Scan QR code --> QR
  Login -- login / Face ID --> Shell[HomeShell]
  Auth -- staff != null --> Shell

  Shell --> T1[Customers tab]
  Shell --> T2[Business tab]
  Shell --> T3[Bookings tab]
  Shell --> T4[Boarding tab]
  Shell --> T5[Messages tab]

  T1 --> CustList[CustomersScreen]
  CustList -- gear --> Settings[SettingsScreen] --> NotifSet[NotificationSettingsScreen]
  CustList -- FAB --> NewCust[_NewCustomerSheet]
  CustList -- swipe --> HoldDel[HoldToDeleteDialog]
  CustList -- tap --> CustDet[CustomerDetailScreen]
  CustDet --> EditCust[EditCustomerScreen]
  CustDet --> AddPet[_AddPetSheet]
  CustDet --> AnimalDet[AnimalDetailScreen]
  AnimalDet --> EditAnimal[EditAnimalScreen]
  AnimalDet --> Gallery[_PhotoGalleryScreen / _SingleImageScreen]
  CustDet --> Activity[CustomerActivityScreen]
  CustDet --> Notes[CustomerNotesScreen] --> NoteSheets[_NoteViewSheet / _NoteSheet]
  CustDet --> SendForm[_SendFormSheet]
  CustDet --> FormsSent[CustomerFormsScreen] --> FormResp[FormResponseScreen]
  CustDet --> Defaults[CustomerDefaultsScreen]

  T2 --> Biz[BusinessScreen]
  Biz --> Invoicing[InvoicingScreen]
  Biz --> Financial[FinancialScreen]
  Biz --> PriceList[PriceListScreen]
  Invoicing --> Invoices[InvoicesScreen]
  Invoicing --> Quotes[QuotesScreen]
  Invoices -- Add --> SelCust[SelectCustomerScreen] --> CreateInv[CreateInvoiceScreen]
  Invoices -- tap --> InvDet[InvoiceDetailScreen]
  Invoices -- swipe: Edit --> CreateInv
  Invoices -- swipe: Record Payment --> RecPay[RecordPaymentSheet]
  InvDet --> RecPay
  RecPay -. card .-> SumUp[(SumUp SDK UI)]
  Quotes -- Add --> SelCustM[SelectCustomerScreen allowManual] --> CreateQuote[CreateQuoteScreen]
  Quotes -- tap --> QuoteDet[QuoteDetailScreen]
  Financial --> Snapshot[SnapshotScreen]
  Financial --> Payments[PaymentsScreen] --> PayForm[PaymentFormSheet]
  Financial --> Expenses[ExpensesScreen] --> ExpForm[ExpenseFormSheet]
  Expenses --> ExpDet[ExpenseDetailScreen] --> ExpForm
  Financial --> Transfers[BankTransfersScreen] --> TransForm[BankTransferFormSheet]
  Transfers --> AcctTx[BankAccountTransactionsScreen]

  T3 --> Cal[BookingsScreen day/week]
  Cal -- Schedule: Dog Walk --> AddDog[_AddDogSheet]
  Cal -- Schedule: Visits --> Visits[VisitsBookingSheet]
  Cal -- Schedule: Appointment --> AddAppt[AddAppointmentSheet]
  Cal -- tap entry --> EditEntry[_EditEntrySheet]
  Cal -- Generate invoices --> GenInv[GenerateInvoicesSheet]

  T4 --> BoardHub[BoardingScreen]
  BoardHub --> BBList[BoardingBookingsScreen]
  BoardHub --> NextB[NextBookingScreen]
  BoardHub --> InProg[InProgressScreen]
  BoardHub --> Done[CompletedBookingsScreen]
  BBList -- + --> NewBB[NewBoardingBookingScreen] --> SelCust
  BBList & NextB & InProg & Done --> BBDet[BoardingBookingDetailScreen]
  BBDet --> InvDet
  BBDet --> Obs[ObservationsScreen] --> ObsForm[_ObservationFormSheet]
  BBDet -- Arrive / Depart --> FormFill[FormFillScreen]
  BBDet -- View form --> FormResp
  FormFill --> SigPad[SignaturePad]

  T5 --> Msgs[MessagesScreen]
  Msgs --> Thread[MessageThreadScreen]
  Msgs -- new --> SelCust
```

### Screens (all 48 files in `lib/screens/`)

#### Shell, auth, settings

| File | What it shows | Actions → endpoints |
|---|---|---|
| `home_shell.dart` | 5-tab shell; `LogoutAction` | `PushService.start()` → (iOS) `POST /push/register` |
| `login_screen.dart` | Staff sign-in | `POST /auth/login`; biometric re-login; Disconnect device |
| `scan_qr_screen.dart` | QR provisioning, manual URL entry | Stores base URL → `GET /auth/me` if a token exists |
| `settings_screen.dart` | Settings hub with one tile, "Notifications — Choose which push notifications are sent" | Pushes `NotificationSettingsScreen` |
| `notification_settings_screen.dart` | Switches: **Customer activated** (Pending → Active), **Appointment reminders** with a **Reminder time** picker (15/30/45 min, 1/2/3 h before), **Daily digest** with a **Digest time** picker, **Invoice overdue**, **Invoice read**. Toggles auto-save. | `GET` / `PATCH /settings/notifications`. These are **global, business-wide** settings, not per-device. |

#### Customers tab

| File | What it shows | Actions → endpoints |
|---|---|---|
| `customers_screen.dart` | Search ("name, email or pet…", with pet names from `petNamesByCustomer`) and a Status dropdown (Active default / Pending / Update info / Inactive). Rows show a `StatusBadge`. | Load `GET /customers` + `GET /animals`. **Swipe end-to-start** → `HoldToDeleteDialog` (tick the box, then hold Delete for 5 s) → `DELETE /customers/:id`. FAB **New customer** → `_NewCustomerSheet` (first/last name + email, validated) → `POST /customers/leads`. Gear → Settings. |
| `customer_detail_screen.dart` | Header with a tappable status badge (bottom sheet of `customerStatuses`). Sections: **Client details** (name, email, address, phone as a `tel:` link), **Emergency contact**, **Emergency vet**, **Security** (Keys provided, Alarm code with a **Reveal** button, Further information), **Pets (n)** list. Buttons: Activity, Notes, Send form, Forms sent, Customer defaults. | `GET /customers/:id`, `GET /animals?customer=`; `PATCH /customers/:id/status`; `GET /customers/:id/alarm-instructions`; `_AddPetSheet` → `POST /settings/email/send` (`add_pet`); `_SendFormSheet` → `GET /forms` (customer-visible), then `POST /form-submissions` + `POST /settings/email/send` (`form`) |
| `edit_customer_screen.dart` | Full edit form prefilled from `customer.raw`: client (first name, surname, email, address1/2, town, county, postcode, phone); emergency contact (Same as client toggle and the same fields); vet (practice, address, telephone, email); security (Keys provided, alarm instructions blank = keep, further info) | `PATCH /customers/:id`. Empty optionals are omitted; a blank alarm field is left out. |
| `customer_defaults_screen.dart` | Default product, "Travel is chargeable" plus travel product, regular-day chips, **App access enabled** toggle (confirm "Enable app access?"), **Send password reset email** | `GET /products`; `PATCH /customers/:id`; `PATCH /customers/:id/portal`; `POST /customers/:id/portal/reset` |
| `customer_activity_screen.dart` | Read-only audit timeline | `GET /audit-log?customer=` |
| `customer_notes_screen.dart` | CRM notes list; `_NoteViewSheet` (opens immediately, then lazy-loads attachments); `_NoteSheet` add/edit with Type (Note/Call/Email/Task), Subject, Description, and Attachments from **Scan** (document scanner), **Camera** or **Library**. Images are downscaled to ≤1200 px JPEG q60 in `compute`. Delete confirm. | `GET /crm/activities?customer=`, `GET /crm/activities/:id`, `POST` / `PATCH` / `DELETE /crm/activities[/:id]`; `createdBy` = `AuthProvider.staff.name` |
| `customer_forms_screen.dart` | Every form submission (pending or completed chip). **`FormResponseScreen`** (also used elsewhere) renders answers in the authored order from the field snapshot: display text, repeatable groups (headed by each pet's name, with `{{petName}}` filled in), signature and photo images, Yes/No toggles, dates formatted. | `GET /form-submissions?customer=` |
| `animal_detail_screen.dart` | Photos (tap → `_PhotoGalleryScreen`), vaccination card (→ `_SingleImageScreen`, pinch-zoom). Sections: **Basics**, **Health**, **Medication**, **Temperament & handling** (aggression, livestock, car travel, walk mode / off-lead consent). Overflow menu: Edit / Delete. | `DELETE /animals/:id` |
| `edit_animal_screen.dart` | Name, species (Dog/Cat/Other), breed, sex, age, vaccinated plus expiry (required if vaccinated), colour/markings, microchip, insured plus insurer, neutered status, temperament notes, **Pet photos (up to 2)**, **Vaccination card**. Images are taken with `ImagePicker(imageQuality: 70, maxWidth: 1600)` and stored as `data:image/jpeg;base64,…`. | `PATCH /animals/:id` (partial; intake-only fields untouched) |
| `select_customer_screen.dart` | Searchable customer picker that returns `SelectCustomerResult`. With `allowManual` it offers **Manual customer** (name + email, "not saved as a customer"). | `GET /customers`, `GET /animals` |

#### Bookings tab (day-booking calendar)

| File | What it shows | Actions → endpoints |
|---|---|---|
| `bookings_screen.dart` | **Day / Week** segmented view; prev/next arrows; date picker; **Today** button. Filter chips: Walks / Visits / Day Care / Boarding / Appointments. **Day revenue** / **Week revenue** banner (`lineTotal` sum). Annual-leave banner; on a leave day the FAB and Recommended list are hidden. Day view sections, grouped per dog: **Walks**, **Visits** (AM / PM / "AM & PM" inferred from consecutive runs unless `visitTime` is set), **Day Care**, **Boarding**, appointments (blue). **Recommended**: dogs whose owner's `regularDays` include this weekday, with one-tap add. Week view: per-day cards that tap through to day view. Classification: a boarding-stay row is always Boarding; Visit / Day Care products come from the `VisitMapping`; everything else is a Walk. | First load fetches 6 lists in parallel (`/customers`, `/animals`, `/products`, `/bank-holidays`, `/settings/visits`, `/annual-leave`). Each range then fetches `GET /day-bookings` + `GET /appointments` padded ±1 day. **Schedule** FAB → bottom sheet: *Dog Walk* (`_AddDogSheet`: animal, product, qty → `POST /day-bookings`), *Visits* (`VisitsBookingSheet`), *Appointment* (`AddAppointmentSheet`). Every add runs `confirmProductAvailability` ("Check product type", Use anyway) and **auto-adds a travel line** when the owner is `travelChargeable` and has a travel product. Tap an entry → `_EditEntrySheet` (product, qty → `PATCH /day-bookings/:id`; Remove → `DELETE /day-bookings/:id`, or for a `stayId` row confirm "Delete whole booking?" → `DELETE /day-bookings/stay/:stayId`). Delete appointment → `DELETE /appointments/:id`. AppBar *Generate invoices* → `GenerateInvoicesSheet`. Pull-to-refresh clears the reference cache. |
| `visits_booking_sheet.dart` | "New booking" for Visits: customer, that customer's animals, date range, visits per day / first day / last day, **Visit length** (20 / 30 / 40 minutes, picking that length's Settings > Bookings > Visits products), AM/PM for single-visit end days | `buildVisitPlan(duration:)`. Fetches existing `GET /day-bookings` in range to **skip already-booked days**, then one `POST /day-bookings` per day (first pet as `animal`, the rest as `additionalAnimals`), plus a travel row when configured. Reports missing mappings. Once created, asks **"Generate an invoice?"** (one draft from just the rows created, one line per product, subject "Booking for \<date\>" or the date range, due on the last date; `GET /invoice-terms`, `POST /invoices`, `PATCH /day-bookings/:id {invoice}` per row) and then **"Send invoice"** (`POST /invoices/:id/send`), mirroring the admin's `BookingInvoicePrompt`. |
| `add_appointment_sheet.dart` | Customer, Reason, Date, Time | `POST /appointments` |
| `generate_invoices_sheet.dart` | "Generate invoices — \<Month\>". One invoice per customer from **uninvoiced, non-placeholder** day bookings in the anchor month, with products aggregated into line items. Every customer starts ticked; a checkbox per row (plus **Select all / none**) chooses which invoices to create, and the footer shows "N of M invoices will be created" with the **total** of the ticked ones | `GET /day-bookings` (month); on confirm `GET /invoice-terms` (default term), then per ticked customer `POST /invoices` (subject "Bookings for \<Month\>", due date = last booking date) and `PATCH /day-bookings/:id {invoice}` for each row, one call at a time |
| `booking_detail_screen.dart` | Legacy `Booking` detail with a status changer | `PATCH /bookings/:id`. **No screen navigates to it.** |

#### Boarding tab

| File | What it shows | Actions → endpoints |
|---|---|---|
| `boarding_screen.dart` | Hub tiles: Bookings, Next Booking, In Progress, Completed Bookings | — |
| `boarding_bookings_screen.dart` | **BoardingBookingsScreen**: search (reference / customer / dog), status filter, rows with dates ("12 Oct – 15 Oct"), invoiced tick and `BoardingStatusChip`. Bookings with status `Check Out Complete` / `Booking Complete` are excluded (they appear under Completed). **BoardingBookingDetailScreen**: stage tracker (from server `stages`), rows Reference / Type / Dates / Drop off / Pick up / Invoiced (link) / Notes; tapping a dog or customer name opens a bottom sheet via `_showDetailSheet` (customer and emergency-contact details, or pet info). Action buttons: **Request payment** (Deposit / Full amount; one-shot while `paymentRequestType == null`), **View invoice**, **Send / Re-send pre-check-in form** (while invoiced and not completed; shows "Sent \<date\>"), **View pre-check-in form**, **Observations**, **Arrive / Depart** (Check in / Check out), **View check-in form**, **View check-out form** | `GET /boarding-bookings`; `POST …/request-payment`; `POST …/send-pre-check-in`; `GET /form-submissions/:id`. Check in/out: `GET /settings/boarding` (`checkInFormBoarding` / `checkInFormDayCare` / `checkOutFormBoarding` / `checkOutFormDayCare`) → `POST /form-submissions` → `FormFillScreen` → `POST …/check-in` or `…/check-out {submission}`; `GET /customers/:id`, `GET /animals?customer=` for the detail sheets |
| `next_booking_screen.dart` | Not-yet-checked-out bookings in buckets: **Arriving Today**, **Departing Today**, **Upcoming** (next two after today) | `GET /boarding-bookings` |
| `in_progress_screen.dart` | Checked-in but not checked-out, soonest departure first | `GET /boarding-bookings` |
| `completed_bookings_screen.dart` | Check-out complete, most recent first | `GET /boarding-bookings` |
| `new_boarding_booking_screen.dart` | Customer (via `SelectCustomerScreen`), pets, type (boarding / dayCare), start date and drop-off time, end date (boarding) and pick-up time, drop-off / collection period AM/PM (day care), notes | `GET /animals?customer=`; `POST /boarding-bookings` (server books the calendar and raises the invoice) |
| `observations_screen.dart` | "Observations · \<ref\>" list (category, time, description, photos, "Observed by …"); `_ObservationFormSheet` with date/time, category chips, description, up to 5 photos (Camera / Library) | `GET` / `POST` / `PATCH` / `DELETE /boarding-bookings/:id/observations[/:obsId]` |
| `form_fill_screen.dart` | Staff port of the admin FormFillModal. Field types: `display`, `today`, `datetime`, `text`, `textarea`, `number`, `date`, `toggle`, `choice`, `multichoice`, `signature` (`SignaturePad`), `file` (Camera / Library), `group` (repeatable, per pet, with `customerPets` choice prefilled from `presetPetNames`). Supports `visibleWhen` conditional rules (`mode: any\|all`, `equals`), required validation (`*`), defaults (toggle false, today's date, now). Check-out can carry check-in belongings forward. Extras: "View check-in" reference, vaccination-card thumbnails (inside a pet's section, only that pet's card -- picked from the section's "Dog's name" answer), feeding instructions from the pre-check-in form, emergency-contact modal. A completed form shows "This form has already been completed." | `GET /form-submissions/:id/public`, `GET /form-submissions/:id` (reference / pre-check-in), `GET /animals?customer=`, `GET /customers/:id`; submit `POST /form-submissions/:id/submit` |

#### Business tab (invoicing, quotes, finance, price list)

| File | What it shows | Actions → endpoints |
|---|---|---|
| `business_screen.dart` | Hub: Invoicing, Financial, Price List | — |
| `invoicing_screen.dart` | Hub: Invoices, Quotes | — |
| `invoices_screen.dart` | Search (number / customer), filter chips Paid / Partially Paid (derived) / Draft / Overdue, `StatusBadge`. **Swipe** → action sheet: Edit / Record Payment / Delete (HoldToDelete) | `GET /invoices`; `DELETE /invoices/:id`; Add → `SelectCustomerScreen` → `CreateInvoiceScreen` |
| `create_invoice_screen.dart` | Create or edit: Subject, Dates (issue / due), **Line items** chosen from products (Qty, Unit, Disc %), product-availability check against the issue date, Payment terms (library), Pets list, Total. Save, or **Save & send**. | `GET /products`, `/invoice-terms`, `/customers/:id`, `/animals?customer=`, `/bank-holidays`, `GET /invoices/:id` (edit); `POST /invoices` or `PATCH /invoices/:id`; optional `POST /invoices/:id/send` |
| `invoice_detail_screen.dart` | Server PDF in `ZoomablePdf`; AppBar Share (`Printing.sharePdf`) and Print (`Printing.layoutPdf`). **`InvoiceActionBar`**: Record Payment (full row) plus Send Email and Request Deposit | `GET /invoices/:id`, `GET /invoices/:id/pdf`, `POST /invoices/:id/send`, `POST /invoices/:id/request-deposit` |
| `record_payment_sheet.dart` | Amount (prefilled with balance due; Deposit pill using `depositPercentage`, rounded in cents like the backend), Charges, Date, Method (default method preselected), "Paid into" account (default preselected) | `GET /bank-accounts`, `/payment-methods`, `/settings/business`. If `SumupService.configured` **and the method name contains "card"**, it first runs `SumupService.charge(title: 'Invoice <no>', amount, foreignTransactionId: '<invoiceId>-<ms>')` and records the payment only when `success == true`. Then `POST /payments` (`skipThankYouEmail: true`) → dialog "Send a thank you…?" → `POST /payments/:id/send-email` |
| `quotes_screen.dart` | Search, status badges. **Swipe** → Edit / Send Email / Convert to invoice / Delete (HoldToDelete) | `GET /quotes`; `POST /quotes/:id/send`; `POST /quotes/:id/accept`; `DELETE /quotes/:id`; Add → `SelectCustomerScreen(allowManual)` → `CreateQuoteScreen` |
| `create_quote_screen.dart` | Like the invoice form with **Valid until**, plus three mutually exclusive auto-populate sections. **Visits** (animals, range, per-day / first / last counts, **Visit length** 20 / 30 / 40 minutes, AM/PM → `buildVisitPlan(duration:)`; the length is saved as `visitPlan.visitDuration` so accepting books that length's products). **Day Care** (date, drop-off / collection AM/PM + time → Full Day if AM→PM else Half Day, 2nd-dog rates). **Boarding** (start/end + times → server boarding plan; placeholder lines skipped). "Add to line items" merges quantities by product. Saved plans go in `visitPlan` / `dayCarePlan` / `boardingPlan`. | `GET /products`, `/invoice-terms`, `/customers/:id`, `/animals`, `/bank-holidays`, `/settings/visits`, `GET /quotes/:id`; `GET /day-bookings/boarding-plan`; `POST /quotes` or `PATCH /quotes/:id`; optional `POST /quotes/:id/send` |
| `quote_detail_screen.dart` | Quote PDF (zoomable), Share / Print, Send Email | `GET /quotes/:id`, `/quotes/:id/pdf`, `POST /quotes/:id/send` |
| `financial_screen.dart` | Hub: Snapshot, Payments, Expenses, Bank Transfers | — |
| `snapshot_screen.dart` | **Last 6 months** income vs expenses, **Top Expenses** by category, **Bank Accounts** total, invoice figures, and projected income for this month: Boarding / Day Care from day-booking `lineTotal`s, plus Walks = each active customer's `regularDays` in the month × the default product price | `GET /reports/income-vs-expenses?months=6`, `/reports/expenses-by-category?months=6`, `/bank-accounts`, `/invoices`, `/settings/visits`, `/day-bookings` (month), `/customers`, `/products`. The 8 requests run **one after another**. |
| `payments_screen.dart` | Payment list (paymentId, invoice · method · account, amount); tap → Edit / Delete | `GET /payments`; `DELETE /payments/:id` |
| `payment_form_sheet.dart` | Add or edit: Invoice (read-only when editing), Date, Amount, Charges, Payment Method, Account | `GET /invoices`, `/bank-accounts`, `/payment-methods`; `POST /payments` or `PATCH /payments/:id` |
| `expenses_screen.dart` | Search plus Category and Vendor filters; FAB **Create Expense** | `GET /expenses`, `/expense-categories`, `/vendors` |
| `expense_form_sheet.dart` | Date, Category, Vendor, Description, Amount, "Paid from" account, **Receipt** (Scan / Camera / Library; downscaled to ≤1600 px JPEG q70 in `compute`) | `GET /expense-categories`, `/vendors`, `/bank-accounts`; `POST /expenses` or `PATCH /expenses/:id` |
| `expense_detail_screen.dart` | Expense fields plus attachment; `_AttachmentViewer` full-screen (images pinch-zoom, PDFs via `ZoomablePdf` with Share under the Date-Payee-Amount name) with delete-attachment; Edit / Delete | `GET /expenses/:id`; `PATCH /expenses/:id {receipt}`; `DELETE /expenses/:id` |
| `bank_transfers_screen.dart` | **Accounts** (balance; tap → `BankAccountTransactionsScreen`) and **Transfers** (tap → Edit / Delete). `BankAccountTransactionsScreen` shows one month: opening balance, then rows with a running balance | `GET /bank-accounts`, `/bank-transfers`, `DELETE /bank-transfers/:id`, `GET /bank-accounts/:id/transactions?month=&year=` |
| `bank_transfer_form_sheet.dart` | Date, Reference, Source Account, Destination Account, Amount | `GET /bank-accounts`; `POST /bank-transfers` or `PATCH /bank-transfers/:id` |
| `price_list_screen.dart` | Products with `displayInPriceList`, A–Z / Z–A toggle; mail icon → dialog (Name, Email) | `GET /products`; `GET /settings/business` + `/settings/business/logo`; builds the PDF client-side (`buildPriceListPdf`) → `POST /products/price-list/email` (base64 attachment) |

#### Messages tab

| File | What it shows | Actions → endpoints |
|---|---|---|
| `messages_screen.dart` | **MessagesScreen**: conversations with unread badges, **polling every 10 s**; new-conversation button → `SelectCustomerScreen`. **MessageThreadScreen**: bubbles (`_Bubble`), composer, **polling every 5 s**, long-press delete ("This removes it for everyone.") | `GET /messages/conversations`; `GET /messages/:customerId`; `POST /messages/:customerId`; `DELETE /messages/:customerId/:messageId` |

### Widgets (`lib/widgets/`)

| Widget | Behaviour |
|---|---|
| `HoldToDeleteDialog(title, message)` | The user ticks a checkbox, then presses and holds Delete for 5 s (an animation controller). Releasing early cancels. Pops `true` once the hold completes. Used for customers, invoices and quotes. |
| `SignaturePad(onChanged)` | Finger-drawn strokes (`CustomPainter`). After each stroke it emits a PNG data URL, the same format as the web SignaturePad and PDF export; emits null when cleared. |
| `StatusBadge(status)` | Pill coloured by `statusColor` / `statusBg` from `theme.dart` |
| `ZoomablePdf(load)` | Rasterises PDF pages at high DPI (`printing`) into an `InteractiveViewer` for pinch-zoom |

### Utils (`lib/utils/`)

- **`product_availability.dart`**:
  - `availabilityLabels` maps weekday / weekend / bank_holiday to labels.
  - `dayTypeFor(date, bankHolidays)`: a bank holiday takes priority; Saturday and Sunday are weekend. Server UTC dates are converted to local first.
  - `availabilityMismatch()` returns the warning message.
  - `confirmProductAvailability()` shows the "Check product type" dialog with Cancel / Use anyway.
- **`visit_plan.dart`**: `buildVisitPlan({start, end, visitsPerDay, visitsFirstDay, visitsLastDay, mapping, bankHolidays, amPmFirstDay='PM', amPmLastDay='AM'})` → `VisitPlanResult(plan: [VisitPlanDay(date, productId, visitTime)], missing: ["N Visit (Day Type)"])`. It mirrors the admin `buildVisitPlan`.
- **`price_list_pdf.dart`**: `buildPriceListPdf({products, businessName, contactLine, logoBytes})` builds a branded A4 `MultiPage`:
  - Palette: blue `#0072B5`, yellow `#FDF101`, pink `#D7385E`, cream `#FBF7EE`.
  - Fonts: Archivo Black and DM Sans via `PdfGoogleFonts`, falling back to built-ins offline.
  - Products go in cream cards of 12 rows so long lists paginate, followed by a pink "Questions? Just get in touch" sign-off and a "Generated \<date\>" footer.

### Services

#### `PushService` (`lib/services/push_service.dart`) and native APNs (`ios/Runner/AppDelegate.swift`)

- MethodChannel `pawfectpets/push`.
  - Dart → native: `start`. Native calls `UNUserNotificationCenter.requestAuthorization([.alert, .sound, .badge])`, and if granted calls `registerForRemoteNotifications()`.
  - Native → Dart: `onToken(hexString)`. The token is hex-encoded from `deviceToken` bytes. If the Dart channel isn't ready yet it is buffered in `pendingToken` and delivered from `didInitializeImplicitFlutterEngine`.
- `start()` is guarded by `_started`, so it runs once per process. On non-iOS platforms (no native handler) the error is swallowed.
- `onToken` → `Repository.registerPushToken(token)` → `POST /push/register {token, platform:'ios'}`. Errors are swallowed. The comment says the token "is re-sent on the next start()/token callback", but `_started` stops a second `start()` in the same process.
- The foreground presentation delegate shows a `.banner` and `.sound`.
- `Runner.entitlements`: `aps-environment = development`.
- **Android has no push implementation**: no FCM and no channel handler in `MainActivity.kt`.
- The app schedules **no local notifications**. Appointment reminders come entirely from the server.

Server side (for context): `backend/src/push/push.controller.ts` handles `POST /push/register`, which upserts a `PushToken {token, platform, staff}` by token. `AppointmentsService.sendDueReminders()` (`backend/src/appointments/appointments.service.ts`) runs on `@Cron(EVERY_5_MINUTES)`. If APNs is configured and `appointmentReminders` is on, it finds appointments without `reminderSentAt` that start within `appointmentLeadMinutes` (default 60), then calls `NotificationService.dispatch("Appointment in <lead>", "<customer> at HH:mm — <reason>", 'appointment')`. That records a `NotificationItem` and calls `PushService.sendToAll()`, which sends to every staff token (`customer: null`) via `ApnsService` (HTTP/2 with an ES256 JWT, env `APNS_KEY`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `APNS_PRODUCTION`). Tokens Apple reports as unregistered are pruned. The same `dispatch` path carries the daily digest ("Today's schedule", a separate 5-minute cron in `notifications/notification.service.ts`), Customer activated, Invoice overdue and Invoice read pushes, all gated by the settings edited in `NotificationSettingsScreen`.

```mermaid
sequenceDiagram
  autonumber
  participant UI as HomeShell (Dart)
  participant PS as PushService (Dart)
  participant iOS as AppDelegate.swift
  participant APNs as Apple APNs
  participant API as Backend /push
  participant DB as MongoDB (PushToken, Appointment)
  participant Cron as AppointmentsService cron (5 min)
  participant NS as NotificationService

  UI->>PS: start() (post-frame, after login)
  PS->>iOS: invokeMethod('start') on pawfectpets/push
  iOS->>iOS: requestAuthorization(alert, sound, badge)
  iOS->>APNs: registerForRemoteNotifications()
  APNs-->>iOS: didRegister(deviceToken)
  iOS->>PS: invokeMethod('onToken', hex)
  PS->>API: POST /push/register {token, platform:'ios'} (Bearer JWT)
  API->>DB: upsert PushToken {token, platform, staff}
  Note over Cron: every 5 minutes
  Cron->>DB: find appointments with no reminderSentAt
  Cron->>Cron: filter start in (now, now + appointmentLeadMinutes]
  Cron->>NS: dispatch("Appointment in 1 hour", "<customer> at HH:mm — reason", 'appointment')
  NS->>DB: create NotificationItem
  NS->>APNs: sendToAll() over HTTP/2 (apns-topic = APNS_BUNDLE_ID) for each staff token
  APNs-->>iOS: alert push
  iOS-->>UI: banner + sound (also in foreground)
  Cron->>DB: set appointment.reminderSentAt
```

#### `SumupService` (`lib/services/sumup_service.dart`)

- Static and lazy. On first use it calls `Sumup.init(sumupAffiliateKey)`. If `Sumup.isLoggedIn` is false it calls `Sumup.login()` (the SDK's merchant login UI); still not logged in → `StateError('SumUp login was cancelled.')`.
- `charge({title, amount, foreignTransactionId})` → `Sumup.checkout(SumupPaymentRequest(SumupPayment(currency 'GBP', saleItemsCount 1, tipOnCardReader false, …)))` and returns `SumupPluginCheckoutResponse`.
- Only `RecordPaymentSheet` uses it.

### Platform configuration

| Item | Android | iOS |
|---|---|---|
| App id | `applicationId` / `namespace` `com.pawfectpetssherborne.pawfectpets_staff` (`android/app/build.gradle.kts`) | `PRODUCT_BUNDLE_IDENTIFIER = com.pawfectpetssherborne.pawfectpetsStaff` (tests: `.RunnerTests`) |
| Display name | `android:label="pawfectpets_staff"` | `CFBundleDisplayName = Pawfectpets Staff` |
| Min OS | `flutter.minSdkVersion` | `IPHONEOS_DEPLOYMENT_TARGET = 16.0` (SumUp needs 16+) |
| Signing | Release uses **debug signing** (`signingConfig = signingConfigs.getByName("debug")`, TODO left in) | `DEVELOPMENT_TEAM = N5BLHW2ZJY`; `ios/ExportOptions.plist`: `method app-store-connect`, automatic signing, `manageAppVersionAndBuildNumber` true, uploadSymbols |
| Activity / delegate | `MainActivity : FlutterActivity()` | `AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate`; `SceneDelegate: FlutterSceneDelegate` (scene manifest) |
| Permissions | Main manifest declares **no `<uses-permission>`**. Only `src/debug` and `src/profile` add `INTERNET`. A `<queries>` entry for `PROCESS_TEXT` is present. | `NSCameraUsageDescription` (QR setup and receipts), `NSPhotoLibraryUsageDescription`, `NSFaceIDUsageDescription`, `NSBluetoothAlwaysUsageDescription` / `NSBluetoothPeripheralUsageDescription` (SumUp reader), `NSLocationWhenInUseUsageDescription` (SumUp), `LSApplicationQueriesSchemes: [tel]`, `ITSAppUsesNonExemptEncryption = false` |
| Entitlements | — | `aps-environment = development` |
| Orientation | default | iPhone: portrait and landscape left/right; iPad: all four |

#### Web build

`web/index.html` and `web/manifest.json` are the default Flutter scaffold (name and short_name `pawfectpets_staff`, description "A new Flutter project.", theme `#0175C2`, standard icons). `PushService.start()` tolerates the missing channel on web. The code has no web-specific branches (`kIsWeb` is unused) for `local_auth`, `sumup`, `cunning_document_scanner` or `mobile_scanner`, and the repo shows no evidence of a recent web build being verified. The README says web was the original verification target.

### Tests (`mobile/test/`)

| File | Covers |
|---|---|
| `widget_test.dart` | Mocks the `flutter_secure_storage` channel (only `pawfectpets_api_base_url` returns a value) and asserts that `PawfectPetsStaffApp` shows "PawfectPets Sherborne" / "Staff sign in" |
| `animal_detail_screen_test.dart` | "shows the full pet record across its sections" |
| `create_invoice_screen_test.dart` | `_FakeRepository extends Repository`: submits the selected product as a line item; will not submit without a product; shows a message when no products are configured |
| `invoice_action_bar_test.dart` | `InvoiceActionBar` lays out 3 actions without overflow at phone width; disabling greys out all three |
| `new_customer_test.dart` | New customer button creates a lead from first/last name + email; rejects an invalid email |

The fake-repository pattern (subclass `Repository`, override methods) is how screens are tested without the network. There are no unit tests for `visit_plan.dart`, `product_availability.dart`, `AuthProvider` or model parsing. There is no CI workflow for `mobile/`: the repo has no `.github/workflows` and no `codemagic.yaml`.

### Build and run

```bash
cd mobile
flutter pub get
flutter run                       # first launch shows "Connect device": scan the admin QR or enter the URL
flutter run --dart-define=SUMUP_AFFILIATE_KEY=   # empty key disables SumUp card charging
flutter run --dart-define=INTAKE_URL=https://staging.example.com
flutter test                      # 5 widget-test files
dart run flutter_launcher_icons   # after adding assets/icon/app_icon.png (iOS only)

# Release
flutter build ipa --release --export-options-plist=ios/ExportOptions.plist   # Mac + Xcode; team N5BLHW2ZJY
flutter build apk --release       # signed with debug keys as configured
flutter build web --release       # output build/web
```

Version and build number come from `pubspec.yaml` `version: 1.0.105` (`FLUTTER_BUILD_NAME` / `FLUTTER_BUILD_NUMBER` in `Info.plist`). Staff accounts are created on the backend; there is no self-registration screen.

### Dead / unreachable code

- `screens/booking_detail_screen.dart` (`BookingDetailScreen`) is never constructed. Of the `Booking` model calls, `Repository.listBookings` has no callers and `updateBookingStatus` is only called from that screen.
- `Repository.messagesUnreadCount()` (`GET /messages/unread-count`) is never called, so the Messages tab has no badge.

### Suggested improvements (staff app)

**Bugs and risk**

1. **Android release builds cannot reach the network.** `android/app/src/main/AndroidManifest.xml` has no `<uses-permission android:name="android.permission.INTERNET"/>`; only the debug and profile manifests add it. Add it to the main manifest.
2. **Face ID login on Android.** `local_auth` requires `FlutterFragmentActivity`, but `MainActivity.kt` extends `FlutterActivity`. Switch the base class (and confirm `USE_BIOMETRIC` is merged in).
3. **The plain-text password is stored for biometric login** (`auth_provider.dart`, `_rememberPasswordKey`). Instead, send `rememberMe: true` on `POST /auth/login` (the backend already issues 30-day tokens, `auth.service.ts`), keep only the token, and gate *reading the token* behind `local_auth`. This also removes the 12 h forced re-login.
4. **SumUp charge with no recorded payment.** In `record_payment_sheet.dart`, if `SumupService.charge` succeeds but `repo.recordPayment` then fails (timeout or 4xx), the card is charged and nothing is recorded. Persist the `foreignTransactionId` and amount locally or in a pending-payment record before charging, show a retry banner, and send the SumUp transaction code to `POST /payments` so the backend can de-duplicate.
5. **A SumUp affiliate key is hard-coded** as the `defaultValue` in `lib/config.dart`. Make the default empty and supply it via CI `--dart-define`.
6. **Card detection by name substring** (`_paymentMethod?.name.toLowerCase().contains('card')`). Add an explicit `isCard` / `provider: 'sumup'` flag on `PaymentMethod` (`models/expense.dart`) and the backend schema.
7. **Push token re-registration.** `PushService._started` blocks any later `start()` in the same process. If the first `POST /push/register` fails (offline), it is not retried until the app restarts. Also nothing calls `DELETE /push/register/:token` on `logout()` / `resetProvisioning()`, so a logged-out device keeps receiving business-wide staff pushes. Store the last token, re-post it on login and app resume, and unregister on logout.
8. **`aps-environment = development`** in `ios/Runner/Runner.entitlements` while the backend defaults `APNS_PRODUCTION` to `true` (`apns.service.ts`). Check that the distribution signing rewrites this entitlement, or add a Release-specific entitlements file, so TestFlight tokens match the production host.
9. **Generate invoices is not atomic** (`generate_invoices_sheet.dart`): `POST /invoices`, then N×`PATCH /day-bookings`, one call at a time. A mid-loop failure leaves invoices whose bookings still show as uninvoiced, and a re-run would bill them twice. Move this to one backend endpoint (for example `POST /invoices/generate-from-day-bookings {month}`), matching what the admin modal does.
10. **`Staff.fromJson` casts `email` as non-null `String`** (`models/staff.dart`). Staff created with only a username would crash login. Use `as String? ?? ''` and also parse `username` and `role.permissions`.
11. **`VisitsBookingSheet` creates bookings one call at a time** with no rollback; a partial failure leaves a half-booked range. Consider a batch endpoint.

**Performance and UX**

12. `SnapshotScreen._load()` awaits 8 requests one after another; use `Future.wait`, as `BookingsScreen._load()` already does.
13. `petNamesByCustomer()` and `listAllAnimals()` both download the full `GET /animals` list. `CustomersScreen`, `SelectCustomerScreen` and `BookingsScreen` each fetch it again. Cache it in `Repository` like products, or add a lightweight `GET /animals?fields=name,customer`.
14. Messages poll every 5 s (thread) and 10 s (list) even when the tab is off-screen (`messages_screen.dart`; `IndexedStack` keeps state). Pause the timers on `AppLifecycleState.paused` and when the tab is hidden, or use a push for inbound customer messages (`PushService.sendToAll` already exists server-side).
15. Wire up the unused `messagesUnreadCount()` as a `Badge` on the Messages `NavigationDestination` in `home_shell.dart`.
16. Notification preferences are global (`/settings/notifications`) and pushes go to *every* staff device (`sendToAll`). Add per-staff opt-in, using the `staff` field already stored on `PushToken`.
17. No permission gating: parse `role.permissions` from `/auth/me` and hide the finance and delete actions (`FinancialScreen`, `HoldToDeleteDialog` callers) for roles without them.
18. Tapping a push does nothing. Add a `userNotificationCenter(_:didReceive:)` handler in `AppDelegate.swift` that forwards `data.type` over `pawfectpets/push`, so tapping an "appointment" reminder opens `BookingsScreen` on that date.
19. Remove `booking_detail_screen.dart`, `models/booking.dart`, `listBookings` and `updateBookingStatus`, and update `mobile/README.md`, which still says invoices are out of scope.
20. Set real names in `web/manifest.json` / `web/index.html` (currently "A new Flutter project.") and `pubspec.yaml` `description`.

**New feature ideas**

21. **Android push via FCM**: add `firebase_messaging`, send `platform: 'android'` (currently hard-coded `'ios'` in `registerPushToken`), and add an FCM sender beside `ApnsService`.
22. **Offline visit mode**: cache today's `listDayBookings`, customer security info and pet medication with a local store, and queue observations and notes written offline. Field staff lose signal, and every screen currently fails with "Could not reach the server".
23. **Maps / directions** from the customer address on `CustomerDetailScreen` (`url_launcher` is already a dependency, and only `tel` is in `LSApplicationQueriesSchemes`).
24. **Visit check-in/out for walks and visits** (timestamped, optional GPS), mirroring the boarding Arrive / Depart flow, to give customers proof of visit.
25. **Photo updates to customers** from `ObservationsScreen` via the existing messages endpoint, or a customer push (`PushService.sendToCustomer` exists on the backend).
26. **Tests**: unit tests for `buildVisitPlan`, `dayTypeFor`, `VisitMapping.productFor`, `Invoice.isPartiallyPaid` and the `BookingsScreen` AM/PM inference, plus a GitHub Actions job running `flutter analyze && flutter test` on `mobile/`.

## Security notes

- Alarm codes / key-safe instructions are encrypted at rest (AES-256-GCM, `ENCRYPTION_KEY`) and only
  decrypted on demand via a staff-only endpoint. The Microsoft Graph client secret is encrypted the
  same way.
- There is no self-registration for staff; the first account is created with `npm run seed:staff`,
  further accounts by a logged-in staff member with the right permission.
- Staff and customer JWTs are separate realms (the customer secret is derived from `JWT_SECRET`), so a
  token from one cannot be used against the other.
- The intake link (`/intake/<customerId>`) and the public invoice / quote / form links are effectively
  bearer tokens: anyone with the link can view (and for intake, complete) that record. Treat links as
  sensitive. See the roadmap below for hardening.
- A fuller prioritised review lives in [`docs/security-review.md`](docs/security-review.md).

## Roadmap: fixes, improvements and new features

Each app section above ends with its own detailed, file-referenced "Suggested improvements" list.
This section pulls the most important items together and ranks them. Items marked **(bug)** were
found by reading the code and describe current behaviour; everything else is a recommendation.

### P1: fix first (security and data correctness)

| # | Area | Item | Where |
| --- | --- | --- | --- |
| 1 | Security | Rate limits key on `req.ip` with no `trust proxy`, so behind Cloudflare every user likely shares one bucket. Use the real client IP (`CF-Connecting-IP`) as the throttler tracker. | `backend/src/app.module.ts`, `backend/src/main.ts`, `backend/src/common/client-ip.util.ts` |
| 2 | Security | `POST /portal/set-password` only has the global 300/min limit while 6-digit codes live 48 h with no attempt counter. Add a strict `@Throttle`, a per-customer failed-attempt counter and a shorter TTL. | `backend/src/portal/portal.controller.ts` |
| 3 | Security | Public customer/animal routes read and write whole records by MongoDB id, and public invoice/quote/form links use the id as the only token. Replace with signed, expiring link tokens and narrow public DTOs. | `backend/src/customers/`, `backend/src/animals/`, `backend/src/invoices/`, `backend/src/quotes/`, `backend/src/form-submissions/` |
| 4 | Security | `POST /settings/email/send` is open to any logged-in staff member with any trigger and any address; `POST /customers/:id/send-registration-copy` is public and emails an uploaded PDF from the business mailbox. Gate both. | `backend/src/settings/`, `backend/src/customers/` |
| 5 | Security | The registration PDF prints the alarm / key-safe code in plain text, and that PDF is stored and emailed. Redact it. | `frontend/src/pdf/customerFormPdf.ts` |
| 6 | Security | `GET /settings/business/public` returns the trusted-IP list and document-numbering counters. Return only what the public pages need. | `backend/src/settings/` |
| 7 | Security | Several money-moving routes have no permission gate (`PATCH /bank-accounts/:id/opening-balance`, `POST /payments`, `/credit-notes`, `/bank-transfers`, `/expenses`). Add `financial.manage`. | `backend/src/bank-accounts/`, `payments/`, `credit-notes/`, `bank-transfers/`, `expenses/` controllers |
| 8 | Data (bug) | Issuing then deleting a credit note on an unpaid invoice leaves `amountPaid` too high and can mark it paid. | `backend/src/credit-notes/credit-notes.service.ts` |
| 9 | Data (bug) | A rejected bank-transfer edit leaves both account balances wrong; money writes don't use MongoDB transactions. Wrap multi-document money writes in sessions/transactions. | `backend/src/bank-transfers/bank-transfers.service.ts`, `payments/`, `credit-notes/` |
| 10 | Data (bug) | A failed `amendDates` leaves a boarding booking pointing at deleted calendar rows. | `backend/src/boarding-bookings/boarding-bookings.service.ts` |
| 11 | Data (bug) | "Generate invoices" is not atomic, so a re-run after a partial failure can double-bill. Move it to one transactional `POST /invoices/generate` endpoint. | `admin/src/components/GenerateInvoicesModal.tsx`, `mobile/lib/screens/generate_invoices_sheet.dart` |
| 12 | Payments (bug) | A SumUp card charge can succeed while recording the payment then fails, leaving money taken with nothing recorded. Record a pending payment before charging and reconcile after. | `mobile/lib/screens/record_payment_sheet.dart` |
| 13 | Config (bug) | Empty env vars (`PUBLIC_API_URL`, `PUBLIC_INTAKE_URL`, `APNS_PRODUCTION`) count as set, so fallbacks never apply: email links become relative and APNs uses the sandbox. Treat empty as unset and validate env at boot. | `backend/src/common/tracking-pixel.util.ts`, `backend/src/push/`, `.env.example` |
| 14 | Portal (bug) | The customer portal lists draft invoices/quotes, and can "send" a draft (flipping it to `sent`). Filter out drafts. | `backend/src/portal/portal.service.ts` |
| 15 | Mobile (bug) | Release Android builds have no `INTERNET` permission, and the Android activity type doesn't support `local_auth`. | `mobile/android/app/src/main/AndroidManifest.xml`, `MainActivity.kt` |
| 16 | Secrets | A SumUp affiliate key is committed as the default in `mobile/lib/config.dart`; "remember me" and Face ID in both apps keep the plain-text password on the device. Move the key to a build-time define only and switch to refresh tokens. | `mobile/lib/config.dart`, `mobile/lib/state/`, `mobile-portal/lib/state/auth_provider.dart` |

### P2: reliability and correctness

- **Email delivery queue.** Every email is sent synchronously through Microsoft Graph with a fresh OAuth
  token each time and no retry. Cache the token until expiry, add a small persisted outbox with retry
  and a "failed sends" view in admin. Several call sites silently swallow errors (payment thank-you,
  new-lead registration, portal enabled).
- **Default email templates.** Only `pre_boarding` is seeded; every other trigger returns 400 until staff
  click "Set up". Seed sensible defaults for every trigger at boot. `{{#if …}}` conditionals for logo,
  items table and email body never evaluate; fix or drop them. `fromName` is saved but never sent.
- **Cron safety.** No cron has a lock, so running two backend instances would duplicate reminders,
  overdue flips and pre-check-in sends. Add a Mongo-based lease lock. The hourly pre-check-in retry
  leaves a new pending submission and activity entry behind on each failed attempt.
- **Timezones.** Several date helpers compute in UTC, so just after midnight in BST dates are a day
  behind. Centralise on `Europe/London` date maths.
- **Server-side validation.** Required form fields aren't enforced on submit; Insurer and the off-lead
  signature in intake are marked required but never checked. Retrying a failed fresh registration
  creates a duplicate customer (make it idempotent).
- **Quote expiry.** Quotes are never set to `expired`; add a cron. Day-care second-dog prices are
  defined but never used in pricing.
- **Capacity and leave.** The server has no capacity or annual-leave checks when booking. Add kennel
  capacity per night and staff availability validation.
- **Seed script.** `seed-staff.js` doesn't set a username, so the seeded account can't log in until
  restart.
- **Push hygiene.** Logging out doesn't unregister the device token; a failed registration isn't
  retried until restart; push is iOS-only.
- **Polling.** The customer app polls messages every 5 s even off-screen and downloads the full
  notification list every 20 s for the badge, although unread-count / mark-read endpoints exist.
- **Staff permissions in the mobile app.** The staff app ignores roles/permissions entirely; mirror the
  admin gating.
- **Admin auth and gating.** The admin token is kept in `localStorage` even when "Keep me signed in" is off, and routes aren't permission-gated client-side (only the Training Admin link checks `training.manage`). Use `sessionStorage` when not remembered and hide pages the role can't use.
- **Admin UX.** `Modal` closes on any backdrop click and has no Escape key or dialog role; the unread-messages poll in `admin/src/layout/Layout.tsx` restarts on every navigation; PDFs use the bundled logo instead of the uploaded Business Info logo; bulk actions send one request per item.
- **Training privacy.** `/training/my` returns other staff members' scores; compliance shows "pending"
  instead of overdue after a failed first attempt.

### P3: engineering quality

- **CI.** Add GitHub Actions: backend `npm run lint && npm test && npm run build`, admin/frontend
  `oxlint && vite build`, Flutter `flutter analyze && flutter test`, plus Docker image builds on PRs so
  Portainer only ever pulls green code.
- **Tests.** There are almost no tests: nothing covers auth, guards, the portal or settings. The one
  quotes spec constructs `QuotesService` with 12 arguments against a 13-argument constructor; the
  portal app's only widget test runs without its providers. Start with guard/permission tests,
  invoice maths and booking pricing.
- **API docs.** Add `@nestjs/swagger` so the route tables above are generated and always current.
- **Shared types.** Admin, frontend and both Flutter apps hand-write the API types. Generate a
  TypeScript client from OpenAPI and share it between admin and frontend.
- **Legacy booking model.** Two booking systems coexist (`Booking` and `BoardingBooking`/`DayBooking`).
  Migrate and remove the legacy one. Remove dead code (`mobile/lib/screens/booking_detail_screen.dart`,
  unused repository functions).
- **Observability.** Structured logging, a `/health` that checks Mongo, and an error tracker (e.g.
  Sentry) for backend and apps. Automated `mongodump` backups off the Docker host.
- **Docs drift.** `mobile/README.md` still says invoices are out of scope; refresh app READMEs.

### New features

| Feature | Value | Notes |
| --- | --- | --- |
| Online card payments | Customers pay invoices and deposits from the email link or portal | Stripe / SumUp online checkout, webhook marks invoice paid, auto thank-you email |
| Self-service booking requests | Customers request dates in the portal; staff approve | Uses capacity checks above; creates a draft quote |
| Customer-facing availability calendar | Fewer back-and-forth enquiries | Public read-only view of free kennel nights |
| Android support for both apps | Reach Android customers and staff | FCM push alongside APNs, manifest fixes |
| Deep links from push | Tapping a notification opens the invoice/quote/message | Universal links for both apps |
| Daily photo / report cards | Owners get photos and notes during a stay | Builds on observations; push + portal timeline |
| SMS / WhatsApp reminders | Better reach than email for check-in reminders | Twilio or similar, per-customer channel preference |
| Automated payment reminders | Chase overdue invoices | Cron on top of existing overdue status, escalating templates |
| Open banking reconciliation | Auto-match bank transfers to invoices | Import bank feeds/CSV, match on reference |
| Recurring visits & subscriptions | Regular day care / walks billed monthly | `regularDays` already exists on customers |
| Vaccination & document expiry tracking | Block bookings with expired vaccinations | Reminders to owners before expiry |
| Waitlist | Fill cancelled nights | Notify waitlisted customers on cancellation |
| Reviews & referrals | Growth | Post-stay review request email, referral codes on quotes |
| Staff rota & timesheets | Plan cover against bookings | Builds on annual leave and bank holidays |
| Multi-factor auth for staff | Stronger admin security | TOTP for admin login, required for finance permissions |
| Offline mode for the staff app | Visits in poor signal areas | Local cache and sync queue for checklists/observations |
| Accounting export | Less bookkeeping | Xero / QuickBooks export of invoices, payments, expenses |
| Save-and-resume intake | Fewer abandoned registrations | Persist wizard progress server-side against the link token |
| Audit log viewer & GDPR tools | Compliance | Export / erase a customer's data on request |

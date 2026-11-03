# Local development

Each app runs on its own; start the ones you need.

## Prerequisites

- Node.js 22 and npm
- MongoDB (local, Docker, or an Atlas connection string)
- Flutter SDK, plus Xcode on a Mac for the iPhone apps

## Backend first

Create `backend/.env` (copy `backend/.env.example`) with at least:

```bash
MONGODB_URI=mongodb://localhost:27017/pawfectpets
ENCRYPTION_KEY=any-long-random-string
JWT_SECRET=another-long-random-string
```

Then:

```bash
cd backend
npm install
npm run start:dev                     # http://localhost:3000
npm run seed:staff -- "Your Name" you@example.com "a-strong-password"
```

## The other apps

```bash
cd frontend && npm install && npm run dev               # http://localhost:5173
cd admin    && npm install && npm run dev               # http://localhost:5174
cd portal   && npm install && npm run dev -- --port 5175

cd mobile        && flutter pub get && flutter run --dart-define=API_BASE_URL=http://localhost:3000
cd mobile-portal && flutter pub get && flutter run --dart-define=API_BASE_URL=http://localhost:3000
```

The staff app ignores `API_BASE_URL` once it has been connected by QR code; use **Disconnect device** on its sign-in screen to change server.

## Useful commands

| App | Command | Does |
| --- | --- | --- |
| backend | `npm run start:dev` | Watch mode |
| backend | `npm run build` | Compile |
| backend | `npm test`, `npm run test:e2e` | Jest unit and e2e tests |
| backend | `npm run lint`, `npm run format` | ESLint (with fixes), Prettier |
| admin, frontend, portal | `npm run build` | Type-check and bundle |
| admin, frontend, portal | `npm run lint` | oxlint |
| mobile, mobile-portal | `flutter test`, `flutter analyze` | Tests and static analysis |

There's no CI, so run the relevant lint, tests and build before merging.

## Email and push locally

- Email needs the Microsoft 365 connection in Settings > Email. Without it, sending fails with "Email sending isn't set up yet".
- Push needs the `APNS_*` variables; without them it's skipped.

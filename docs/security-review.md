# Security Review — Admin & Mobile Apps

A prioritised review of the Pawfect Pets stack (NestJS backend, React admin,
Flutter staff + customer apps). Captured for later action — nothing here has
been implemented yet unless noted.

_Last updated: 2026-09-04._

---

## Already in good shape

- **Auth model:** global `JwtAuthGuard` + `PermissionsGuard`, `@Public()`
  opt-outs, bcrypt password hashing, and a **separate customer JWT realm**
  (secret derived from `JWT_SECRET` so staff and customer tokens can't
  cross-validate).
- **Encryption at rest** for alarm / key-safe codes (`EncryptionService`),
  never returned to clients.
- **Admin hardening hooks:** Trusted-IP allowlist + break-glass accounts +
  `staff.locked` flag; audit logging of sensitive actions.
- **Input validation:** global `ValidationPipe` with
  `whitelist + forbidNonWhitelisted + transform` (blocks mass-assignment).
- **Transport / exposure:** Cloudflare tunnel terminates TLS and needs no open
  host ports; MongoDB is authenticated and only on the internal Docker network.
- **Mobile:** tokens in the iOS Keychain (`flutter_secure_storage`), biometric
  unlock, force re-login on app update (portal).

---

## P1 — highest priority

### 1. Rate limiting / brute-force protection (biggest gap)
There is currently **no throttler** anywhere in the backend.
- The **6-digit portal codes** (1,000,000 space, 48h validity) and both login
  endpoints are brute-forceable.
- **Action:** add `@nestjs/throttler` globally, with tighter per-route limits on
  `/auth/login`, `/portal/login`, `/portal/request-code`,
  `/portal/verify-code`, `/portal/set-password`, and
  `/customers/:id/portal/reset`.
- **Auto-lock** a staff account after N failed logins (the `staff.locked` field
  exists but is only set manually today).
- **Invalidate a portal code** after ~5 wrong attempts.
- Consider shortening the **login** code expiry to ~15–30 min (keep 48h only for
  password reset if desired).

### 2. Lock down CORS
`app.enableCors({ exposedHeaders: [...] })` in `backend/src/main.ts` currently
allows **any origin**.
- **Action:** restrict `origin` to the real admin + public intake URLs. Native
  apps don't use CORS, so this won't affect the mobile apps.

### 3. Put the admin behind Cloudflare Access
Already on a Cloudflare tunnel — gate the **admin hostname** with Cloudflare
Access (email OTP / SSO) so attackers can't even reach the login page.
- Highest-leverage admin protection, **no code change**.

---

## P2

### 4. Admin token storage / XSS blast radius
Admin JWT lives in `localStorage`, and the new 30-day "remember me" widens the
window if there's ever an XSS.
- Prefer an **httpOnly, Secure, SameSite cookie** for the token over
  `localStorage`.
- Treat **any raw HTML rendered** as a live XSS vector — the admin
  email-template preview and the portal's T&C `HtmlWidget` render staff-authored
  HTML. Sanitize (e.g. DOMPurify on web) and keep authorship staff-only.

### 5. Security headers / CSP
- Add `helmet` on the API.
- Add a **Content-Security-Policy** on the nginx serving the admin/frontend
  SPAs (locks down script sources, defends XSS).

### 6. Two-factor auth for staff/admin
- TOTP on admin login — the biggest account-security upgrade after rate
  limiting.

### 7. Secrets hygiene
- Confirm `.env` is git-ignored (it is in the compose setup).
- `ENCRYPTION_KEY` must **never** rotate (would make existing encrypted alarm
  codes undecryptable).
- `JWT_SECRET` should be long/random and rotated on suspicion of compromise.
- Keep the APNs `.p8`, App Store Connect key, and Mongo creds only in Portainer
  env, never in git.

---

## P3 — hardening polish

### 8. Mobile app hardening
- Enable **screen-capture / background blur** for sensitive screens (alarm
  codes, agreements): iOS snapshot blur + Android `FLAG_SECURE`.
- Optional **TLS certificate pinning** to the API.
- Optional jailbreak / root detection.
- HTTPS is already enforced (API base URL is `https://`).

### 9. Password policy
- Staff + portal: minimum length/complexity; ideally check against breached
  password lists. (Portal already enforces min 8.)

### 10. Dependency / supply chain
- Enable Dependabot; run `npm audit` and `flutter pub outdated` regularly; pin
  versions.

### 11. Reduce network exposure
- Remove the `3000:3000` host port mapping in `docker-compose.yml` if direct
  LAN access isn't needed, so only the Cloudflare tunnel can reach the API.

---

## Suggested implementation order

1. **P1 #1** — throttler + staff login auto-lockout + portal code-attempt limits.
2. **P1 #2** — CORS origin allowlist.
3. **P1 #3** — Cloudflare Access on the admin hostname (config only).
4. **P2 #6** — 2FA for admin.
5. Everything else as capacity allows.

Items #1 and #2 are self-contained backend code changes that close the most
exploitable holes and can be done in one pass.

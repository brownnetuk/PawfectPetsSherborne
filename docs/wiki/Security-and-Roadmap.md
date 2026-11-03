# Security and roadmap

## How data is protected

- **Encrypted fields.** Alarm and key-safe codes, and the Microsoft 365 client secret, are encrypted at rest (AES-256-GCM, from `ENCRYPTION_KEY`). Codes are only decrypted on demand for staff with `customers.viewSecurity`.
- **Separate sign-ins.** Staff and customer tokens use different signing secrets, so one can't be used as the other.
- **Locked down network.** Only Cloudflare reaches the stack; nothing on the host is opened to the internet. The API only accepts browser calls from `ALLOWED_ORIGINS`.
- **Rate limits** on every route (300 a minute) and tighter ones on sign-in routes.
- **Trusted IPs** can restrict admin dashboard logins; keep a break-glass account as a way back in.
- **Recycle Bin** keeps deleted records until someone with `recycleBin.purge` empties it.
- **Audit log** on customers, invoices, policies and risk assessments.

## Things to be aware of

- The links in emails (registration, forms, invoices, quotes) work for anyone who has them. Treat them as private.
- "Remember me" with Face ID stores the password in the phone's secure keychain.

The full, prioritised review is in [`docs/security-review.md`](https://github.com/brownnetuk/PawfectPetsSherborne/blob/main/docs/security-review.md).

## Roadmap

The README's [Roadmap](https://github.com/brownnetuk/PawfectPetsSherborne/blob/main/README.md#roadmap-fixes-improvements-and-new-features) ranks everything found while documenting the code. In short:

**P1: fix first (security and data)**
- Signed, expiring tokens for public links instead of record ids.
- Permission gates on money-moving routes and the open email-sending routes.
- Database transactions for multi-step money writes (credit notes, bank transfers, invoice generation).
- Record a pending payment before a SumUp charge, so a failure can't lose a payment.
- Treat empty environment variables as unset, and validate them at boot.

**P2: reliability**
- An email outbox with retries and a "failed sends" view.
- Default templates for every email.
- A lock on scheduled jobs so two backend instances can't double-send.
- UK-time date maths everywhere.
- Server-side capacity and annual-leave checks when booking.

**P3: engineering**
- GitHub Actions CI for lint, tests and builds.
- More tests, starting with permissions, invoice maths and pricing.
- Generated API docs (Swagger) and shared types.
- Retire the legacy booking model.
- Structured logging, error tracking and automated off-host backups.

**Ideas for new features:** online card payments, self-service booking requests, daily photo report cards, SMS or WhatsApp reminders, bank feed reconciliation, recurring subscriptions, vaccination expiry tracking, a waitlist, accounting export (Xero or QuickBooks), staff rota, and MFA for staff.

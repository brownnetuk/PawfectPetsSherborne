# PawfectPets Sherborne — Public Intake Form

A no-login, multi-step client intake form (Vite + React + TypeScript). This is the highest-value
screen for the business: it's what a new customer fills in to register themselves and their
pets, wired directly to the [backend](../backend) — submission creates the `Customer` and
`Animal` records there.

## Getting started

```bash
npm install
cp .env.example .env   # VITE_API_URL defaults to http://localhost:3000
npm run dev
```

Requires the backend running (see `../backend/README.md`) — the form calls it directly via
`VITE_API_URL`.

## Build for production

```bash
npm run build    # tsc -b && vite build -> dist/
npm run preview  # serve that build locally to sanity-check it before deploying
```

`VITE_API_URL` is baked in at build time (Vite inlines `import.meta.env.VITE_*` values into the
bundle), so it must be set correctly in the environment the build runs in — not just at runtime.
Render (see [`render.yaml`](../render.yaml)) runs `npm install && npm run build` and serves
`dist/` as a static site with an SPA rewrite so `/intake/:id` resolves correctly.

## How a customer reaches the form

Staff pre-create a minimal lead record (`POST /customers/leads` with just `name` + `email`) and
send the customer a link in the shape:

```
https://<this-app>/intake/<customerId>
```

Visiting that link fetches the record and pre-fills the whole form — client details, emergency
contact, emergency vet, and security (see below) — the customer never re-enters what staff already
captured. If the link is missing or doesn't resolve, the form still works standalone: it falls
back to a fresh registration that `POST`s a brand new `Customer` on submit instead of `PATCH`ing
an existing one.

## Reviewing / updating an existing customer

The same `/intake/<customerId>` link also serves a second purpose: staff set a customer's status
to "Update info" (in the admin app) to prompt them to review and refresh their own details — the
form behaves the same way whether the customer is `pending` or `update_info`, since either way the
goal is "fill in/confirm everything below," and submitting always flips status to `active`
(existing backend behaviour, unrelated to this).

A few things only make sense once you know a customer can already have real data on file:

- **Alarm instructions are never pre-filled.** `GET /customers/:id` (this is a public,
  unauthenticated route) doesn't return the encrypted ciphertext at all, let alone the plaintext —
  decryption only ever happens through a separate staff-only endpoint. The field hint says "leave
  blank to keep what you already gave us unchanged," which is true: the backend's `PATCH` only
  touches `alarmInstructionsEncrypted` when the submitted value is non-empty.
- **Existing pets are shown for review, not re-collected from scratch.** `IntakeForm.tsx` fetches
  the customer's own animals in full via `GET /animals/for-customer/:customerId` (also public, but
  scoped to that one customer) and renders one editable `PetDetailsStep` per pet, prefilled —
  vaccination, behaviour, photos, everything. `PhotoUpload.tsx` (styled after `SignaturePad.tsx`'s
  card layout, though it reads uploaded files rather than a drawn canvas) lets the customer attach
  up to 2 optional photos per pet — each capped at 4MB client-side, read into a base64 data URI
  (same storage approach the signatures/logo already use), with a preview grid and a "Remove" link
  per photo. The file input itself is hidden once 2 are attached. After the last one, a "how many
  more pets?" step (with a
  "None" option) asks whether to add any new ones, which get their own blank steps appended after.
  On submit, a pet with an `_id` (one that was fetched, not newly added) is `PATCH`ed via
  `PATCH /animals/:id/for-customer/:customerId` — a public route scoped by comparing the animal's
  own `customer` field against the URL's `:customerId`, using a DTO with no `customer` field at
  all so there's nothing in the body to reassign — while a pet without an `_id` is `POST`ed as
  before. This distinction matters: submitting always creates a new record for anything sent to
  `POST /animals`, so re-running the old pet-count flow for a customer who already has pets would
  have duplicated them rather than updated them.

## Add a pet link

For an existing, already-registered customer adding another pet — and *only* that, nothing else on
their record — staff can send a second kind of link instead (from the admin app's "New pet" →
"Send a link to the customer"). The "Update info" flow above can also add pets (via its "how many
more?" step) alongside reviewing everything else, so reach for this link when a pet is genuinely
the only thing that needs adding and the rest of the wizard would just be unnecessary friction:

```
https://<this-app>/intake/<customerId>/add-pet
```

This routes to `src/intake/AddPetFlow.tsx` rather than the full `IntakeForm` — a trimmed-down
flow that starts straight at "how many pets" and only ever calls `POST /animals`. It deliberately
never calls `PATCH /customers/:id`: that endpoint's payload is the customer's *entire* record, so
resending it here (with the customer/emergency/security/agreement fields all back at their empty
defaults, since this flow never asks for them) would silently blank out whatever's already on
file. Adding a pet this way should never risk their other data.

## Screen flow

`src/intake/IntakeForm.tsx` drives a wizard over the screens from the intake-form spec:

1. Welcome (pre-filled name)
2. Client details
3. Emergency contact (`sameAsClient` toggle hides name/address; at least one phone required)
4. Emergency vet (+ alternative-care authorisation acknowledgment)
5. Pet count (1–6)
6. Pet details — **repeats once per animal**, and folds in off-lead consent (spec screen 7) as
   part of the same step for dogs only, since consent belongs to that specific animal
7. Security arrangements (alarm instructions are sent to the backend, which encrypts them at rest)
8. Client agreement — scrollable terms (see below), typed signature (required) + optional
   signature pad, auto-filled date, submit

The progress bar recomputes its total step count from the number of pets entered. Each step
validates client-side before advancing; the final submit calls `PATCH/POST /customers` followed
by one `POST /animals` per pet.

## Terms and conditions

`AgreementStep.tsx` fetches `GET /settings/terms` (public, unauthenticated) on mount and renders
whatever HTML comes back in place of its own hardcoded terms text. That HTML is whatever staff
last uploaded as a `.docx` in the admin app's Settings → Business Info — the backend parses it via
`mammoth` (see `backend/README.md`) and serves just the result, not the original file. If nothing
has been uploaded yet (or the fetch fails, e.g. backend unreachable), the component falls back to
its own hardcoded terms text baked into the component itself, so the agreement step is never
blank.

## Notes

- No authentication — anyone with a lead link (or the bare form URL) can submit. Access control
  is out of scope for this screen; it's meant to be a frictionless public entry point.

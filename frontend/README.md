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

Visiting that link fetches the record and pre-fills screen 1 (name/email) per the spec — the
customer never re-enters what staff already captured. If the link is missing or doesn't resolve,
the form still works standalone: it falls back to a fresh registration that `POST`s a brand new
`Customer` on submit instead of `PATCH`ing an existing one. That fallback exists because there's
no staff-facing UI yet to generate/send these links — a reasonable stopgap, not a hidden feature.

## Add a pet link

For an existing, already-registered customer adding another pet, staff can send a second kind
of link instead (from the admin app's "New pet" → "Send a link to the customer"):

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
8. Client agreement — scrollable terms, typed signature (required) + optional signature pad,
   auto-filled date, submit

The progress bar recomputes its total step count from the number of pets entered. Each step
validates client-side before advancing; the final submit calls `PATCH/POST /customers` followed
by one `POST /animals` per pet.

## Notes

- No authentication — anyone with a lead link (or the bare form URL) can submit. Access control
  is out of scope for this screen; it's meant to be a frictionless public entry point.
- The terms text in `AgreementStep.tsx` is placeholder copy standing in for the business's actual
  terms PDF — swap in the real clauses before going live.

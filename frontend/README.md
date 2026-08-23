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

## Forms

```
https://<this-app>/forms/<formSubmissionId>
```

A third, unrelated kind of link, generated from the admin app's Settings → Forms (or a customer's
own "Forms" tab) rather than from a Customer id — see `backend/README.md`'s "Forms" section for the
full builder/mapping design. This app has no routing library (`react-router-dom` is an `admin`-only
dependency); `App.tsx`'s `parseUrl()` just regex-matches `window.location.pathname` directly,
same as the other two link shapes, and renders `src/forms/FormFillPage.tsx` for this one.

`FormFillPage` fetches `GET /form-submissions/:id/public` (no auth) and renders every field in the
form's `fields` array top-to-bottom on one page — not a multi-step wizard like `IntakeForm`, since a
generic staff-built form has no reason to assume the same screen-per-topic structure the fixed
intake flow does. `src/forms/fields.tsx` re-exports `intake/fields.tsx`'s already-generic
`TextField`/`ToggleField`/`ChoiceGroup`/`SelectField` (nothing intake-specific about them) and adds
one new one, `MultiChoiceField` (a checkbox group) — no equivalent existed anywhere in this codebase
before, since neither the wizard nor this page previously needed a real multi-select. `SignaturePad`/
`PhotoUpload` are reused as-is for `signature`/`file` fields.

A `group` field (`repeatable: true`) renders via `src/forms/RepeatableGroup.tsx` as `minRepeats`+
inline blocks with "+ Add another"/"Remove" — closer in spirit to `MedicationEntriesField.tsx`'s
inline-repeatable-list pattern than to `IntakeForm.tsx`'s one-repetition-per-wizard-step approach,
since everything here lives on a single scrollable page. `FormFillPage` resolves every answer change
— including each repetition's own fields — through a `setAnswers` functional state update keyed off
the *previous* state, never off a value already sitting in a prop/closure: two fields in the same
repetition changing within one React batch would otherwise each compute "the next array" from the
same stale snapshot, and the second call would silently discard the first's change (found via this
feature's own end-to-end testing — rapid, scripted field changes reproduced it every time; a real
person clicking through the page at normal speed mostly wouldn't have hit it, but it was a genuine
correctness gap, not just a test artifact). A toggle field's answer starts as a real `false` rather
than `undefined` the moment its repetition/form initializes (`src/forms/formDefaults.ts`) — the same
bug shape already fixed once for the real wizard's own `Vaccinated` toggle (see "Screen flow" below):
a toggle always visually shows a definite on/off state, so an untouched one submitting as "missing"
would silently fail a backend validation the customer never saw any indication of.

Client-side validation only enforces `required`, field by field — no cross-field conditional logic
(a generic form has no wizard-author available to encode "only show X if Y" rules the way each
intake step's own component does by hand). Submitting posts to `POST /form-submissions/:id/submit`;
a `pending`→`completed` transition happens server-side, and reloading the same link afterward shows
an "already submitted" state rather than a re-fillable form (`GET .../public` reports `status`, and
`FormFillPage` renders that state instead of the form whenever it's `completed`).

## Screen flow

`src/intake/IntakeForm.tsx` drives a wizard over the screens from the intake-form spec:

1. Welcome (pre-filled name)
2. Client details
3. Emergency contact (`sameAsClient` toggle hides name/address; at least one phone required)
4. Emergency vet (+ alternative-care authorisation acknowledgment — typed name and drawn
   signature both required; see "Terms and conditions" below for the authorisation wording itself)
5. Pet count (1–6)
6. Pet details — **repeats once per animal**, and folds in off-lead consent (spec screen 7) as
   part of the same step for dogs only, since consent belongs to that specific animal — its
   sentence is staff-editable (Settings → Business Info → "Off-Lead Consent") the same way the
   Emergency Vet authorisation text is, fetched via `GET /settings/off-lead-consent` on mount with
   the original hardcoded sentence as a fallback; it carries a `{{petName}}` placeholder (a plain
   `.replace()`, not full `{{token}}` interpolation) substituted with the pet's own name, since
   this one sentence is reused per-dog rather than fixed like the vet authorisation text. Age
   (required, whole years) sits alongside an optional Date of birth field — kept as two separate
   fields rather than replacing one with the other, since not every customer knows an exact birth
   date (e.g. a rescue) but everyone can give an age. "On medication" → Yes reveals a repeatable
   list (`MedicationEntriesField.tsx`, shared with the admin app's own version of this UI) instead
   of the single free-text field it used to be — each entry needs a Medication Name, with Illness
   treating/Dosage/Frequency/Additional Info as free text and Vet Prescribed/Pawfect Pets To
   administer as Yes/No selects; "+ Add Medication" adds another, "Remove" drops one, and there
   must be at least one entry (with a name) before advancing. "Vaccinated" is a plain `boolean`
   (`PetDetails.vaccinated`), not tri-state like the aggression fields below it — it's rendered as
   a `ToggleField` switch, which always shows definitively on or off, so there's no way for it to
   display an "unanswered" state the way `ChoiceGroup`'s Yes/No button pairs can (neither button
   highlighted). A previous version kept `vaccinated: boolean | null` with a "please answer" check
   that only cleared once the switch was touched at least once — meaning a customer who correctly
   left it at its default off position (intending "no, not vaccinated") got blocked by a validation
   error that looked like nothing had been answered, when the toggle was already showing a real
   answer. `emptyPet()` now defaults it to `false` outright and the step has no null-check for it.
7. Security arrangements (alarm instructions are sent to the backend, which encrypts them at rest)
8. Client agreement — scrollable terms (see below), typed signature + drawn signature (both
   required), auto-filled date, submit

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

`EmergencyVetStep.tsx`'s "Alternative vet care authorisation" sentence follows the identical
pattern on a much smaller scale: it fetches `GET /settings/vet-authorisation` (public, plain text
this time rather than HTML) on mount, staff-editable as a plain textarea in Settings → Business
Info (below Terms and Conditions), same hardcoded-string fallback if unset or the fetch fails.

## Mobile

Most customers fill this in on a phone, so the layout is mobile-first rather than a desktop form
that happens to shrink: `index.html`'s viewport meta tag, `.card`/`.brand-header`/`.progress`
capping at `max-width: 640px` (so it's just 100% of the viewport on a phone rather than a fixed
desktop width), and `.grid-2` (the two-column field rows used throughout the step components)
collapsing to one column under 480px via a media query in `index.css`.

`SignaturePad.tsx`'s canvas is the one place this needed real work rather than just falling out of
the layout being relative-sized. A `<canvas>`'s `width`/`height` attributes set its own internal
drawing coordinate system, independent of whatever size it's actually rendered at — the canvas used
to have those fixed at `480x160` regardless of viewport, so on a narrower phone screen the CSS
(`width: 100%; height: 160px`) squashed that 480-wide coordinate system into a smaller box, and
`getPos()`'s `clientX/clientY` (already correctly in CSS-pixel terms) ended up drawing into the
wrong part of that squashed buffer — signatures came out visibly distorted and misaligned from
where the finger actually was. `resize()` now measures the canvas's actual rendered
`getBoundingClientRect()` on mount (and again on `window`'s `resize` event, e.g. an orientation
change) and sets `canvas.width`/`height` to that size times `devicePixelRatio` (for crisp lines on
high-DPI phone screens), then `ctx.scale(dpr, dpr)`s the context so drawing calls can keep using
plain CSS-pixel coordinates — which `getPos()` already produced, so it needed no changes itself.
Setting `canvas.width`/`height` clears the canvas and resets the context's transform as a
side-effect (per the Canvas spec), which is what keeps repeated `resize()` calls (e.g. two
orientation changes in a row) from compounding the scale instead of replacing it. A `valueRef`
(kept current via a separate effect) is what `resize()` redraws from on a resize, rather than the
`value` prop directly, so a `window.resize` listener attached once on mount doesn't redraw a stale
signature captured at that first render.

Two tap-target fixes alongside it: `.btn-link` (the "Clear"/"Remove" text links next to the
signature pad and photo upload) gained real padding with a matching negative margin, widening the
actual hit area well past the visible underlined text without shifting any surrounding layout.
`ToggleField` (`fields.tsx`) — the switch used for "Same as client"/"Vaccinated"/"Keys provided" —
now wraps its whole row (switch *and* label text) in one `<label>` instead of just the 44×24px
switch itself, so tapping the words toggles it too, standard behaviour for a labelled switch and a
much bigger target than the switch alone.

## Notes

- No authentication — anyone with a lead link (or the bare form URL) can submit. Access control
  is out of scope for this screen; it's meant to be a frictionless public entry point.

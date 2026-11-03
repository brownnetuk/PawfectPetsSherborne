# Public intake site

The no-login website customers reach from links in emails. It handles registration, details updates, adding pets, staff-built forms, the pre-boarding questionnaire, and viewing invoices and quotes.

- **URL:** `https://intake.pawfectpetssherborne.co.uk` (the backend's `PUBLIC_INTAKE_URL`)
- **Code:** `frontend/` (React 19, TypeScript, Vite; no router library, routes are matched in `src/App.tsx`)

## Links

| Link | What it opens |
| --- | --- |
| `/` | A fresh registration (creates a new customer) |
| `/intake/<customerId>` | Registration for a lead, or "update your details" for an existing customer, pre-filled |
| `/intake/<customerId>/add-pet` | Add one or more pets to an existing customer |
| `/forms/<submissionId>` | Fill in a form staff sent (pre-check-in, consent, any form built in Settings > Forms) |
| `/pre-boarding/<formId>` | The pre-boarding eligibility questionnaire, one page per dog |
| `/invoices/<id>` | View an invoice and download the PDF; shows a PAID ribbon once paid |
| `/quotes/<id>` | View a quote, download the PDF, accept or decline |

## The registration wizard

1. Welcome
2. Your details
3. Emergency contact
4. Emergency vet (with alternative vet care authorisation)
5. Existing pets to review (update links only)
6. How many pets, then one page per pet: species, breed, health, vaccinations, medication, behaviour, photos, walking and off-lead consent
7. Security (keys, alarm / key-safe code, which is stored encrypted)
8. Additional information
9. Agreement: terms and conditions and a signature

On submit the customer record and pets are saved, a PDF of the registration is generated and stored on the customer's Activity tab, and a copy is emailed to the customer (**Post Registration Email** template).

## Things to know

- The links are effectively keys: anyone with a link can open that record. Treat them as private. See [Security and roadmap](Security-and-Roadmap).
- The terms, declaration, off-lead consent text and vet authorisation text all come from Settings > Business Info, so changing them there changes what customers see straight away.
- `VITE_API_URL` is the only setting, and it's fixed at build time.

## Running locally

```bash
cd frontend
npm install
npm run dev     # http://localhost:5173
```

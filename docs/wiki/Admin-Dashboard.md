# Admin dashboard

The back-office web app for running the business. Staff use it at a desk in a browser.

- **URL:** `https://admin.pawfectpetssherborne.co.uk`
- **Code:** `admin/` (React 19, TypeScript, Vite). No UI kit or chart library: charts are hand-drawn SVG and PDFs are generated in the browser with jsPDF.
- **Sign-in:** username and password, with "Keep me signed in" (a 30-day session instead of 12 hours). Admin logins can be restricted to trusted IP addresses (Settings > Business Info).
- **Version:** shown top-right as `v1.0.x`; see [Versioning and releases](Versioning-and-Releases).

## Navigation

| Sidebar item | Route | What it's for |
| --- | --- | --- |
| Boarding & DayCare | `/boarding-daycare` | Dashboard, pre-boarding, bookings, occupancy, check in / out, incidents, risk assessments, policies, checklists. See [Boarding and day care](Boarding-and-Day-Care). |
| Enquiries | `/enquiries` | Log enquiries; create a quote or convert to a customer |
| Communications | `/communications` | Conversations with customers, push messages, bulk email. Shows an unread badge. See [Communications](Communications-and-Notifications). |
| Customers | `/customers` | Search customers and open the customer record. See [Customers and pets](Customers-and-Pets). |
| Calendar | `/bookings` | Walks, visits, day care, boarding and appointments by month or week; generate monthly invoices. See [Calendar and bookings](Calendar-and-Bookings). |
| Invoices & Quotes | `/invoices` | List, preview, send, record payments, request deposits. See [Invoicing and finance](Invoicing-and-Finance). |
| Financial | `/financial` | Snapshot, payments, expenses, credit notes, bank transfers, bank accounts, uploads |
| Reports | `/reports` | P/L, expense summary by category, income summary by customer, income (invoices due in a date range) |
| Staff Training | `/staff-training`, `/my-training` | Training Admin (needs `training.manage`) and My Training. See [Compliance and training](Compliance-and-Training). |
| Settings | `/settings` | Everything configurable. See [Settings reference](Settings-Reference). |

The top bar shows the version, the notification bell (the staff notification feed), your initials and **Log out**. Clicking your initials shows a **QR code of the server address**, which the [Staff app](Staff-App) scans on first launch to connect itself.

## Customer record (`/customers/:id`)

The header has the status badge (click to change it) and an **Actions** menu: Send email (registration or update request), View (registration PDF), Edit, Request Update and Delete (with a force-delete option behind a sum, if the customer still has records).

| Tab | Contents |
| --- | --- |
| Customer Defaults | Mobile app access (with additional people), default product, travel charging, regular days |
| Overview | Client details, emergency contact, emergency vet, security (alarm / key-safe code behind **Reveal**), agreement |
| Pets | Each pet, with view, edit, copy or move to another customer, delete |
| Bookings | This customer's bookings, grouped by stay |
| Invoices | This customer's invoices; New invoice |
| Notes | CRM notes, calls, emails and tasks, with image attachments |
| Activity | The automatic audit log, plus an income chart |
| Forms | Forms sent to the customer: resend, edit, delete, view answers |

## How it talks to the API

All calls go through one `fetch` wrapper in `admin/src/api/client.ts`, which adds the staff token and signs you out on a 401. The API base URL (`VITE_API_URL`) and the intake site URL (`VITE_INTAKE_URL`) are baked in at build time, so changing them needs a rebuild (a redeploy in Portainer does this).

Permissions are enforced by the backend. The dashboard shows every page to every signed-in staff member; an action you don't have permission for fails with an error.

## Running it locally

```bash
cd admin
npm install
npm run dev      # http://localhost:5174
npm run build    # type-check and bundle
npm run lint     # oxlint
```

The detailed component and API reference is in the README's [Admin dashboard](https://github.com/brownnetuk/PawfectPetsSherborne/blob/main/README.md#admin-dashboard) section.

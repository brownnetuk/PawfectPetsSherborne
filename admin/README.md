# PawfectPets Sherborne — Staff Admin Dashboard

The staff-facing app (Vite + React + TypeScript). Office staff use this on a desktop browser to
manage customers, send them registration links, and track bookings, invoices, and CRM activity.
Wired directly to the [backend](../backend); customer self-registration happens on the separate
[public intake form](../frontend).

## Getting started

```bash
npm install
cp .env.example .env   # VITE_API_URL and VITE_INTAKE_URL default to localhost
npm run dev
```

Requires the backend running, and at least one staff account seeded:

```bash
cd ../backend
npm run seed:staff -- "Your Name" you@example.com "a-strong-password"
```

There's no open self-registration — the first account comes from that script; every account
after that is added by an already-logged-in staff member via `POST /auth/register`.

## Build for production

```bash
npm run build    # tsc -b && vite build -> dist/
npm run preview  # serve that build locally to sanity-check it before deploying
```

Like `frontend`, `VITE_API_URL` (and here also `VITE_INTAKE_URL`) are baked in at build time, so
they must be correct in the environment the build runs in. Render (see
[`render.yaml`](../render.yaml)) runs `npm install && npm run build` and serves `dist/` as a
static site with an SPA rewrite so client-side routes (e.g. `/customers/:id`) resolve correctly.

## What's here

- **Login** — JWT-based; the token is kept in `localStorage` and attached to every API call.
  A 401 from any request clears the session and bounces to `/login`.
- **Enquiries** (`/enquiries`, above Customers in the nav) — a "New Enquiry" button opens a modal
  for informal, pre-customer contacts (name, email, address, phone, how they heard about us,
  services interested in, notes) that are logged to their own `Enquiry` collection
  (`/enquiries` on the backend) rather than forced into the Customer/Animal schema. Lists with the
  same view-detail / delete-with-confirmation pattern used elsewhere in the app. Opening one shows
  a "Convert to Customer" button that creates a pending customer from its name/email/address/phone
  (same lead-creation call as Customers' "New customer", with address and phone patched in
  afterwards) and deletes the enquiry once it succeeds — an enquiry without an email is refused,
  since a customer record needs one to send the registration link. The result reuses the same
  "copy link / send email" screen (`RegistrationLinkModal`, shared with the Customers page) as
  creating a customer from scratch. Was originally a section on the Customers page; split out into
  its own page and nav entry once it grew a create flow, a detail view, and a conversion flow of
  its own.
- **Customers** — list, search, and a "New customer" flow that creates a minimal lead
  (`POST /customers/leads`) and hands you a `VITE_INTAKE_URL/intake/<id>` link to copy and send.
  There's no full customer-creation form here on purpose — the intake form is where that detail
  belongs, and duplicating it would just be two sources of truth for the same data. The backend
  rejects an email already used by another customer (case-insensitively) on this and on the public
  intake form's own signup — the error banner just surfaces the backend's message as-is.
- **Customer detail** — tabs for overview (client/emergency/vet/security/agreement — alarm
  instructions are only decrypted on demand via "Reveal"; the Agreement card shows Signed
  by/Signed at plus the Version/Document date snapshotted from Business Info at signing time, and
  renders the customer's signature image alongside them), pets, bookings, invoices, Notes (the
  manually-authored `CrmActivity` log, see below), and Activity (an automatic audit trail, see
  below), plus per-customer booking/invoice/note creation. "Edit" on the overview covers
  client/emergency/vet/security fields; "Edit" on a pet row covers its full profile. A pet row also
  has a "Delete" action, matching the confirm-modal pattern the Bookings tab already uses —
  blocked with the backend's existing message if the pet is on any booking. New/Edit pet and
  "View" (`ViewAnimalModal`) all support up to 2 optional photos — a file upload (each capped at
  4MB client-side, same base64 data URI storage as the logo/signatures elsewhere, hidden once 2 are
  attached) in the New/Edit forms, and shown stacked to the right of the Details section in the
  View modal, matching where the intake form's own photo upload feeds it from. Clicking a photo
  there opens it full-size in a simple lightbox (a fixed-position dark overlay, no library) —
  click anywhere to close. There's no separate "main photo" field: whichever photo is first in the
  array is the main one, and Edit pet's "Main pic" checkbox on the second photo just reorders the
  array to swap them (the checkbox on the first is checked and disabled, since there's always
  exactly one main once any photos exist). That first photo is what the Pets tab table shows as a
  small thumbnail in its own leading column, before Name. `ViewAnimalModal` itself uses a
  `.modal-olive` background (`Modal`'s new optional `className` prop, added for exactly this —
  `admin/src/components/Modal.tsx`) — the same `--sage-badge` green as the "Active" status pill —
  with Details/Behaviour/Off-lead consent each in their own white `.card` on top, rather than one
  flat white modal like everywhere else. Off-lead
  consent is deliberately read-only in the pet edit form — it's a customer-signed acknowledgment
  from the intake form, not something staff overwrite from here. A status dropdown next to the
  overview badge moves a customer between pending/active/inactive/update_info via a staff-only
  `PATCH /customers/:id/status`, kept separate from the customer PATCH the public intake form
  itself uses. Setting a customer to "Update info" (rather than "Pending") is how staff prompt an
  already-registered customer to review and refresh their details — "Copy registration link" (it
  reads "Copy update link" for this status) hands you the same `VITE_INTAKE_URL/intake/<id>` link
  as a brand-new lead would get, but the intake form behaves differently once it sees the customer
  already has data on file: see [`frontend`](../frontend/README.md#reviewing--updating-an-existing-customer).
  "New pet" on the Pets tab first asks staff to choose between two paths: "Add
  manually" opens a form that registers the pet directly (`POST /animals`, the same endpoint the
  intake form uses) — it does collect off-lead consent for dogs, since the endpoint requires it,
  but is explicit that this should only be used when the customer has confirmed consent with
  staff directly. "Send a link to the customer" instead hands you a `VITE_INTAKE_URL/intake/<id>
  /add-pet` link (see [`frontend`](../frontend/README.md#add-a-pet-link)) so the customer can add
  the pet's details themselves. "View" (next to Edit) generates a PDF of the customer's full
  submitted record on the fly — client/emergency/vet/security details, every pet including
  off-lead consent and its signature, the terms & conditions text, and the client agreement's
  signature — and shows it in a modal. Built client-side with `jsPDF` (`src/pdf/customerFormPdf.ts`);
  alarm instructions are decrypted the same way "Reveal" does, via the existing staff-only
  endpoint, rather than adding a separate server-side PDF route. Branded with the same colours as
  this app's CSS (copied by hand — there's no shared token source between a PDF and CSS) and the
  real logo. Each section (a pet's whole profile, including its off-lead consent and signature, is
  one section) is measured before it's drawn, so a section that doesn't fit the rest of the current
  page moves to a fresh one entirely rather than splitting across the page break. The terms &
  conditions section pulls the same `termsHtml` uploaded in Settings → Business Info, converted
  into headings/paragraphs/lists by `htmlToBlocks()` — the same content the customer actually saw
  and signed against on the intake form, rather than a separately-maintained copy. Falls back to a
  short hardcoded list if nothing's been uploaded yet.
  The **Activity** tab (`AuditLogTab` in `CustomerDetailPage.tsx`) is read-only — staff never
  write to it directly, unlike **Notes** next to it. It's fed by `AuditLogEntry`
  (`backend/README.md`'s "Audit log" section), a system-generated record of things that happened
  on the account: field edits, invoices/quotes created/updated/emailed, payments
  received/removed, pets added/updated/removed, and bookings created/updated/removed. Laid out as
  two side-by-side cards (`display: flex`, 50/50), not stacked: an **Income** card
  (`IncomeChart.tsx`, a small inline-SVG bar chart — no charting library, just a fixed viewBox with
  bars/gridlines/axis labels sized off the data) summing payments received per calendar month, with
  a Last 6 Months/Last 12 Months selector and a "Total Income ( Last N Months ) - £X" line below it;
  next to it, a vertical timeline (a plain CSS rail + dot per entry, no library) listing every
  audit-log entry newest-first with its date/time, title, description, and "by {actor}". Fetched
  the same eager-on-mount way the other tabs' data is (`CustomerDetailPage`'s own `refresh()`),
  plus a separate effect re-fetching just the income data when the period selector changes.
- **Bookings** — a global list across all customers, inline status changes, edit and delete on
  each row, and its own "New" flow with a customer picker (the customer-detail version reuses the
  same create/edit/delete calls with the customer pre-selected).
- **Invoices & Quotes** (`/invoices`) — tabbed: **Invoices** and **Quotes**, each a global list
  across all customers with inline status changes, an `openedAt`-driven **Read** badge next to the
  status pill once the sent email's tracking pixel has fired (see `backend/README.md`'s "Open
  tracking" — it's a separate indicator, not a status value, since being opened doesn't change
  where a document sits in its own status lifecycle), and a per-row **Actions** dropdown
  (`ActionsMenu`, closes on an outside click or after picking an item): **View** renders the
  invoice/quote as a PDF (`buildInvoicePdf()`, `admin/src/pdf/invoicePdf.ts`). The rendered layout
  comes from the staff-designed template at Settings → Invoices → "PDF Template" (see below) if
  one's been saved, else a built-in default matching a standard invoice layout (logo/business
  details top-left, Invoice#/Balance Due top-right, a diagonal "Paid" stamp when an invoice's status
  is `paid`, an "Invoice To" block, an item table, Sub Total/Total/Payment Made/Balance Due, Notes,
  bank transfer details, and a QR code). Quotes render the same template with quote-appropriate
  substitutions and no payment/balance/paid-stamp elements (quotes have no `amountPaid`/paid status
  at all).

  On both tabs, clicking anywhere on a row (or its Actions → View) opens an inline split view rather
  than a modal: the table itself condenses to a narrow (420px) left-hand list (invoice/quote #
  and customer stacked in one cell, a status badge and total/remaining-balance in another, the
  Actions menu still available per row) and the document fills the remaining width on the right,
  with Download/Close controls above it. Clicking a different row swaps the preview in place
  (revoking the previous PDF's blob URL first) without leaving the split view, so staff can flip
  through several documents quickly; **Close** returns to the full table. The on-screen content is
  `InvoiceHtmlView`/`QuoteHtmlView` (`admin/src/components/InvoiceHtmlView.tsx`/`QuoteHtmlView.tsx`
  — near-identical, `QuoteHtmlView` just drops the invoice-only Payment Made/Balance Due/"Paid"
  ribbon since a `Quote` has no `amountPaid` or paid status at all) — a normal flowing HTML document
  (logo/business details, Invoice-or-Quote-To, item table, totals, bank details, QR code),
  deliberately *not* driven by the staff-designed PDF template: that template is a freeform,
  absolutely-positioned canvas meant for print output, whereas this renders instantly (no jsPDF
  round-trip) and never overlaps regardless of content length, since it's real document flow rather
  than fixed coordinates. It reads directly from the `Invoice`/`Quote`/`BusinessInfo` fields, not
  through the template's placeholder substitution. `buildInvoicePdf()` still runs in the background
  the moment a row is opened, purely to produce the file behind **Download** — the on-screen view
  doesn't wait on it, and does honour the staff template, so what's downloaded can differ from
  what's shown on screen if a customized template's been saved. This is each tab's own
  `viewing`/`businessInfo`/`pdfUrl` state in `admin/src/pages/InvoicesPage.tsx` — there's no shared
  modal component for it (the earlier `PdfViewModal` this replaced has been removed as unused).
  **Edit** opens the
  same form described below; **Send** opens `SendPreviewModal` rather than sending immediately —
  it fetches the configured "Invoice Template"/"Quote Template" and the real document's own data
  (actual line items, dates, totals, customer), renders them through the same
  `interpolateSubject`/`interpolateBody`/`buildItemsTableHtml` used by the Settings template
  Preview (`admin/src/utils/emailTemplate.ts` — shared by both, so there's only one copy of this
  logic on the frontend), and shows exactly what's about to be emailed with Cancel/Send buttons;
  if no template is configured yet, the modal says so and offers only Close. Confirming calls
  `POST /invoices/:id/send` (or `/quotes/:id/send`), which emails the customer and marks the
  document `sent` if it was still a `draft` — the underlying Actions button still shows
  "Sending…"/disables for that row while in flight, and a failure (most commonly: no template
  configured) surfaces in the tab's error banner rather than being silent. **Payments** (Invoices
  tab only, not Quotes — a quote hasn't been billed yet) opens `RecordPaymentModal` (see
  "Financial" below) against that invoice. **Delete** opens the
  same confirmation modal as before (names the invoice/quote number before it permanently
  deletes). Send only emails the current line items/total — it doesn't reference `amountPaid` or
  any payments recorded since. A `Quote` is
  its own backend model (`/quotes`), not an Invoice with a different status — mirrors `Invoice`
  field-for-field except `dueDate` becomes `validUntil` (a quote hasn't been billed, so nothing is
  "due" yet) and its status lifecycle is `draft → sent → accepted | declined | expired` rather
  than Invoice's `draft → sent → paid | overdue | cancelled`, since a quote and an invoice
  represent different stages of a sale. Invoice/quote numbers come from a staff-editable template
  and next-number counter, not a fixed pattern — see Settings → Business Info → "Document
  Numbering" below. `customerLabel()`/`customerId()` treat a populated `customer` of `null` as "(deleted
  customer)" rather than throwing — the backend's `Invoice`/`Quote` type says `customer` is always
  a `CustomerRef` or a string, but `populate()` genuinely returns `null` for a dangling reference
  once the customer a document pointed at is deleted, so the list/edit views degrade gracefully
  (an empty "Select a customer…" in Edit) instead of crashing the whole page.

  Create and Edit both use one `DocumentFormModal` (parameterized by `kind: 'invoice' | 'quote'`
  and an optional `existing` record — `null` means create), shown as a wide modal with three card
  sections mirroring a reference invoice-builder layout: **Customer** (a plain customer select —
  there's no "manual entry" option, since both `Invoice.customer` and `Quote.customer` are
  required references to a real `Customer` document — once one is picked, its Address/Phone
  number/Email are shown read-only below the select in the same
  `kv-grid` layout `CustomerDetailPage`'s Overview tab uses, sourced from the already-fetched
  `listCustomers()` result rather than a separate lookup); **Invoice/Quote Details** (Invoice #/Quote #
  shown read-only in edit mode only, Issue date, Terms, Due date/Valid until, and an optional
  free-text **Subject** — no tax field, since neither model has one); and **Item Table**, a real
  table (Item Details / Quantity / Rate (£) / Discount % / Amount) replacing the old div-grid
  `LineItemsField` for closer visual parity with the reference layout — `CustomerDetailPage`'s own
  separate per-customer invoice-creation flow still uses the old `LineItemsField`/`.line-item-row`
  styling and was left as-is (it also has no tax field, for the same reason). Each line item's
  **Item Details** cell is a free-text input (typing a description that exactly matches a
  `Product` name auto-fills that row's Rate from the product's price) plus a chevron button that
  opens `ProductPickerModal` — a searchable table of every `Product` (Name / Description / Price);
  clicking a row fills in the description and rate and closes the picker. This replaced an earlier
  HTML `<datalist>` version, whose dropdown rendered with plain OS/browser styling that didn't
  match the rest of the app. Table cell inputs generally aren't wrapped in a `.field` div (unlike
  the rest of the form), so `table input[type='text'|'number']` in `index.css` gives them the same
  border/radius/focus-ring look as `.field input` directly. The Discount % (0–100, default 0)
  feeds into the row's Amount as `quantity × unitPrice × (1 − discountPercent / 100)`, and the
  single Total (£) summary below the table sums those amounts the same way the backend does (see
  `backend/README.md`) — there's no separate Sub Total line since, with no tax, it would always
  equal Total.
  In edit mode, the Payment Terms dropdown is preselected via a best-effort text match against the
  document's already-stored `paymentTerms` string (consistent with terms being copied, not
  referenced, at creation time — see below); if the original term was since deleted from the
  library, edit mode falls back to "None" and staff need to re-pick a term before saving. Changing
  the Terms dropdown or the Issue date recalculates Due date/Valid until from that pairing (via
  explicit `onChange` handlers, not a reactive effect watching the loaded state) — this matters in
  edit mode specifically, since a document's Terms/Issue date are pre-filled from its saved values
  on open and must NOT trigger a recalculation before staff actually touch either field, or opening
  Edit would silently overwrite an already-correct (possibly manually-adjusted) date.
- **Financial** (`/financial`) — tabbed (array + label-map pattern, matching `SettingsPage.tsx`):
  **Bank Accounts**, **Payments**, **Expenses**, **Credit Notes**. **Bank Accounts** has real
  fields (`BankAccountsCard`/`BankAccountModal`, both in `FinancialPage.tsx`/
  `BankAccountModal.tsx`): **Type** (a select, Bank/Savings, defaulting to Bank), **Account Name**,
  **Sort Code**, **Account Number**, shown as table columns in that order, plus a `currentBalance`
  that now genuinely reflects reality — it's adjusted automatically by every recorded payment,
  expense, and credit note against that account (see `backend/README.md`'s
  `BankAccountsService.adjustBalance()`), not something staff type in directly. Clicking a row
  (not its Edit/Delete icons) opens `ViewBankAccountModal`, a read-only Account Details `kv-grid`
  plus a **Transactions** section (Month/Year selects, defaulting to the current month/year): an
  Opening Balance row followed by every Payment/Expense/Credit Note recorded against that account
  in the selected month (each row labelled by type, signed and colour-coded green/red, with a
  running Balance column), fetched from `GET /bank-accounts/:id/transactions` whenever the account
  or the selectors change — refetches fresh rather than trying to derive it from data the page
  already has. Falls back to "No transactions for this period." only when that period genuinely
  has none. The settings gear next to the selectors opens `SetOpeningBalanceModal` — Date and
  Balance (£), prefilled from the account's existing reconciliation point if it has one, for when
  staff need to correct the account against a real bank statement ("as of this date, the balance
  was this amount"); saving updates both the Current Balance shown above and refetches the
  Transactions list immediately, and refreshes the accounts table behind the modal too via an
  `onAccountUpdated` callback. Not to be confused with the existing Settings → Invoices →
  **Bank Details** card, which holds the one set of account details shown *on* invoices, a separate
  concern.

  **Payments** (`PaymentsCard` in `FinancialPage.tsx`) is a read-mostly table of every recorded
  `Payment` — Payment ID/Date/Invoice/Amount/Charges/Payment Method/Account, Delete only (no Edit —
  money movements get voided and redone, not silently edited). Deleting one shows a confirmation
  naming its Payment ID and explains that it restores the amount to the invoice's outstanding
  balance — see `InvoicesService.reversePayment()` in `backend/README.md`. A payment is recorded
  one of two ways: from a specific invoice row's **Payments** Actions-menu item (`RecordPaymentModal`,
  `admin/src/components/RecordPaymentModal.tsx`), or from this tab's **Add payment** button
  (`AddPaymentModal`, `admin/src/components/AddPaymentModal.tsx`) for when staff are working from
  the Financial page rather than a specific invoice. Both share the same Date/Amount/Charges/Payment
  Method/Account fields and submit through the same `POST /payments`; `AddPaymentModal` additionally
  has an **Invoice** dropdown as its first field, sourced from `GET /invoices` filtered client-side
  to non-cancelled invoices with `total - amountPaid > 0`, each option labelled
  `"{invoiceNumber} — {customerName} — £{balance} due"` — picking one fixes the rest of the form to
  that invoice exactly as if its row's Actions menu had been used, including pre-filling **Amount
  (£)** with the outstanding balance. In both modals: **Date** defaults to today, **Amount (£)**
  (required, pre-filled with the invoice's outstanding balance — `total - amountPaid` — since a
  payment covering the full remaining balance is the common case; staff can still overwrite it for a
  partial payment) and **Charges (£)** (optional) side by side, a **Payment Method** dropdown sourced
  from `GET /payment-methods` (Settings → Finance → Payment Methods below), and an **Account**
  dropdown sourced from `GET /bank-accounts` (this page's Bank Account tab), shown as
  "Name (Bank/Savings)". No invoice-number field or deposit-percentage option in the row-triggered
  modal — the invoice is already fixed by which row's Actions menu opened it, and a
  fractional-deposit shortcut wasn't requested. Submitting deducts the amount from the invoice's
  balance and, once fully covered, flips its status to `paid` server-side (see
  `InvoicesService.applyPayment()` in `backend/README.md`) — the Invoices page's own status
  pill/dropdown reflects this immediately on refresh, no separate polling needed. A non-zero
  **Charges** value also creates a real linked expense behind the scenes (category "Payment
  Charges") — nothing to configure here, but it's why a payment with charges shows up as an extra
  row on the Expenses tab below, and why deleting that payment removes it again.

  **Expenses** (`ExpensesCard`/`ExpenseModal`) has its own New/Edit/Delete — unlike Payments, an
  expense isn't tied to any other record, so it's created directly from this tab: **Date**,
  **Category** (a select sourced from `GET /expense-categories` — Settings → Finance → Expense
  Categories below — same "fetch on mount, default to the first entry" pattern as
  `RecordPaymentModal`'s Payment Method/Account pickers; an expense's own already-stored category
  stays selectable even if it's since been removed from that list), an optional **Payee** select
  (same pattern, sourced from `GET /vendors` — Settings → Finance → Vendors below, with a "No
  payee" option), **Description**, **Amount (£)**, an optional **Account** dropdown (same
  `GET /bank-accounts`
  source and "Name (Bank/Savings)" labelling as Payments' picker — debits that account's balance if
  chosen), and an optional **Receipt** photo upload (same single-file → base64 pattern as a pet's
  photo, capped at 4MB client-side). Deleting one restores its amount to the account balance, same
  compensating pattern as deleting a Payment.

  **Credit Notes** (`CreditNotesCard`/`CreditNoteModal`) has New/Delete (no Edit, matching
  Payments — money movements get voided and redone, not silently edited). The form: a **Customer**
  dropdown (`GET /customers`, matching `DocumentFormModal`'s own customer-select) whose choice
  drives a dependent **Invoice** dropdown (`GET /invoices?customer=`, refetched whenever the
  customer changes, defaulting to "No invoice (standalone credit)"), **Date**, **Amount (£)**,
  a required **Reason**, and the same optional Account picker as Expenses. Issuing one reduces the
  linked invoice's paid amount exactly like reversing a payment does (see
  `InvoicesService.reversePayment()`), and debits the chosen account; deleting one undoes both.
  The table shows Number/Date/Customer/Invoice/Amount/Reason.
- **Reports** (`/reports`, `ReportsPage.tsx`) — sits directly below Financial in the nav. One
  report so far: **Income vs Expenses**, a Last 6/12 Months selector (same convention as the
  customer Activity tab's income chart) driving `GET /reports/income-vs-expenses`. Rendered by
  `IncomeExpenseChart.tsx` — a new sibling to the existing per-customer `IncomeChart.tsx` rather
  than a generalization of it, specifically to avoid any risk to that already-working, still-used
  component; it draws two bars per month (income/expenses, with a small legend) instead of one.
  Below the chart, three running totals (Income/Expenses/Net, the last colour-coded green/red by
  sign) and a plain Month/Income/Expenses/Net table for exact figures the chart's bars can't give
  precisely.
- **Notes** (`/activity`, `ActivityPage.tsx`) — a read-only global feed of CRM activity entries,
  labeled "Notes" in the UI though the underlying model (`CrmActivity`, `/crm/activities`) still
  covers note/call/email/task entries, not just notes proper — entries are created from a customer's
  own "Notes" tab (`ActivityTab`/`ActivityItem` in `CustomerDetailPage.tsx`) so each is always tied
  to that customer; this page just lists them all in one place.
- **Settings** — tabbed (`/settings`): **Business Info** (shown first, and the default tab) holds
  the business's own name, address, town, postcode, telephone, email, and website, plus a logo — the
  letterhead details invoices and email templates draw from. All fields are plain strings saved
  as-is (no "leave blank to keep unchanged" special case, unlike Email's secret below), so clearing
  one to blank and saving genuinely clears it. The logo is uploaded as a file but stored as a
  base64 data URI on the settings document itself (same approach as a customer's signature image)
  rather than as a file on disk, since Render's filesystem doesn't persist across deploys.
  **Terms and Conditions** is its own card below Business details, with its own independent save
  (matching the two-card pattern Email uses below, for connection settings vs. the test-send
  action) — upload a `.docx` and the backend parses it (via `mammoth`) into HTML, which is what's
  actually rendered everywhere it's shown; the original file is also kept (as `termsDocx`) purely
  so staff can get it back via **Download**. A "Preview" button shows the parsed result before
  saving — for a newly chosen (unsaved) file this calls `POST /settings/terms/preview`, which
  parses without persisting anything, so previewing doesn't commit you to the upload. **Download**
  fetches the original file from `GET /settings/terms/download` and saves it under its original
  filename; terms uploaded before this button existed only ever had their parsed HTML stored, so
  downloading those specifically isn't possible until re-uploaded — the error message says so
  rather than a generic failure. The public intake form's agreement step reads the parsed content
  via `GET /settings/terms` — see `frontend/README.md`. Below the upload, **Version** and **Document
date** are plain free-text fields (e.g. `"v2.1"`, `"1 January 2026"`) describing whichever terms
are currently uploaded, saveable on their own without re-uploading the `.docx` (the submit handler
only includes `termsFile`/`termsFileName` in the PATCH when a new file was actually chosen). The
backend snapshots both onto a customer's `agreement` the moment they sign, so a customer's own
page always shows which revision they agreed to — see `backend/README.md`'s "Settings" section.
**Document Numbering**, below Terms and
  Conditions, is an independent-save form for
  `invoiceNumberTemplate`/`invoiceNextNumber`/`quoteNumberTemplate`/`quoteNextNumber`/
  `paymentNumberTemplate`/`paymentNextNumber`/`creditNoteNumberTemplate`/`creditNoteNextNumber`
  (see "Document numbering" in `backend/README.md`) —
  the template fields accept free text with `{year}`/`{seq}` placeholders (defaulting to
  `INV-{year}-{seq}`/`QUO-{year}-{seq}`/`PAY-{year}-{seq}`/`CN-{year}-{seq}`), and the next-number fields are plain
  integer inputs so staff can jump the sequence ahead (e.g. to clear past whatever numbers already
  existed before a counter was introduced) or realign it to match an external paper sequence.
  Surfaced here rather than under Invoices since it spans invoices, quotes, and payments alike, not
  just invoice-specific settings.
  **Staff** lists, creates, and deletes staff logins (still
  backed by `/auth/staff`, unchanged from before this was under Settings). Deleting is blocked
  server-side if it would remove the last remaining account; self-delete is blocked in the UI
  while signed in as that account. JWT is stateless, so a deleted account's existing token still
  works until it expires — there's no server-side session to revoke. **Email** holds the Microsoft
  365 connection used to send email from the app (see below) — tenant ID, client ID, client
  secret, and a from address/name, plus a "send a test email" button. The secret is encrypted at
  rest (`EncryptionService`, same as alarm instructions) and never sent back to the browser once
  saved; the field shows "Configured — leave blank to keep unchanged" instead. **Email Templates**
  lists all five fixed triggers (`registration` / `update_info` / `add_pet` / `invoice` / `quote` —
  `EMAIL_TRIGGERS`, kept in sync by hand with the backend's `EmailTrigger` enum) always, whether or
  not each has a template yet, so it's obvious what still needs setting up. Each is one document —
  editing "the registration template" is an upsert on that trigger, not a pick-from-a-list, so a
  "Send" click never has to guess which of several templates to use. `TRIGGER_PLACEHOLDERS` gives
  each trigger its own placeholder list, surfaced as an "Insert variable" `<select>` next to the
  Email Body label (not a flat hint list any more — picking one inserts `{{token}}` at the current
  cursor position, everywhere; see `RichTextEditor`/`handleInsertPlaceholder` below): the original
  three share `{{name}}`/`{{link}}` plus seven business placeholders (`{{businessName}}`,
  `{{businessAddress}}`, `{{businessTown}}`, `{{businessPostcode}}`, `{{businessTelephone}}`,
  `{{businessEmail}}`, `{{businessWebsite}}`) and `{{logo}}`; `invoice`/`quote` get
  `{{customer_name}}`, `{{subject}}`, `{{items_table}}` (an auto-generated line-items table),
  `{{subtotal}}`/`{{total}}`, their respective number/date placeholders
  (`{{invoice_number}}`/`{{invoice_date}}`/`{{due_date}}` or
  `{{quote_number}}`/`{{quote_date}}`/`{{valid_until}}`),
  `{{bank_name}}`/`{{sort_code}}`/`{{account_number}}` (from Settings → Invoices → Bank Details),
  plus the same business placeholders — `{{#if field}}...{{/if}}` wraps content that should only
  appear when `field` is set (e.g. the optional Subject line, a due date that isn't always present,
  or the whole Payment Details section if bank details were never configured).

  `isHtmlBodyTrigger(trigger)` (true for `invoice`/`quote` only) decides how the body field is
  edited and interpolated. For the original three, it's still a plain `<textarea>` — staff-authored
  text, HTML-escaped and newline-to-`<br>`'d at send time, unchanged from before; "Insert variable"
  splices directly into its own `selectionStart`/`selectionEnd` via a ref held in
  `EditTemplateModal` (this textarea lives outside `RichTextEditor`, so that component can't own
  its cursor). For `invoice`/`quote`, it's a `RichTextEditor` (`admin/src/components/RichTextEditor.tsx`)
  — a `contentEditable` div driven by `document.execCommand` (bold/italic/underline, heading/paragraph
  style, alignment, lists, a link, a table skeleton), plus a `<>` toggle to a raw-HTML `<textarea>`
  for hand-editing markup or typing a `{{placeholder}}`/`{{#if}}` block directly — no new
  dependency. It's a `forwardRef` exposing `insertText()` (used by "Insert variable" for this case),
  which inserts via `document.execCommand('insertText', ...)` when the contentEditable div is
  already focused, or focuses it and moves to the end first if focus was elsewhere (e.g. it just
  came from the toolbar dropdown, where there's no meaningful "current cursor" to speak of). Its
  DOM-sync effect (pushing the `value` prop into the contentEditable div) depends on `sourceMode` as
  well as `value`: the content div unmounts while the source `<textarea>` is showing, so a fresh
  (empty) one is mounted when switching back, and since `value` itself hasn't changed at that point,
  depending on it alone would leave that fresh div permanently blank. The same effect also appends a
  trailing empty `<p>` if the loaded content doesn't already end in one -- a block-level structure
  (e.g. a styled "card" `<div>`) can fill the entire editor with no actual node below it to click
  into, and clicking that empty space landing directly on the contentEditable container itself (not
  a child) previously did nothing; `RichTextEditor` now also explicitly moves the cursor to the end
  when that happens. `EditTemplateModal` guards contentEditable's lack of a native `required` on
  submit (stripped-tags check) since the browser can't enforce that itself the way it does for the
  textarea. Body here is used as raw HTML at send time (aside from placeholder substitution), not
  escaped — see `backend/README.md`'s `sendTemplatedEmail`/`interpolateBody`. Opening "Set up" on
  either for the first time prefills a starter body (`buildDocumentTemplateStarter()`, shared by
  `INVOICE_TEMPLATE_STARTER`/`QUOTE_TEMPLATE_STARTER`) whose sections (document details, items,
  totals, and a `{{#if bank_name}}`-wrapped Payment Details card) are each their own bordered/shaded
  card rather than bare tables directly on the page background — the latter is what an earlier,
  flatter version of this starter actually looked like in a real inbox, and reads as visibly
  unfinished, so every logical section gets a `card`-style container now.

  A "Preview" button next to "Save template" runs the same interpolation client-side, trigger-aware:
  the original three preview against a sample customer plus the real, currently saved Business
  Info, exactly as before; `invoice`/`quote` preview against `SAMPLE_LINE_ITEMS` (its computed
  subtotal is reused as both `{{subtotal}}` and `{{total}}`, so the two always agree) run through
  the shared `buildItemsTableHtml()` (`admin/src/utils/emailTemplate.ts` — also used by
  `SendPreviewModal` above, with a real document's line items instead of the sample ones) plus
  sample dates/numbers, with `{{#if subject}}` and friends actually resolving so staff see the real
  conditional behavior, not the raw `{{#if}}...{{/if}}` tags. `interpolateSubject`/`interpolateBody`/
  `stripConditionals`, also in that shared file, are a hand-kept copy of the backend's (see
  `backend/README.md`), so what's previewed matches what's actually sent.
  **Invoices** holds four
  cards, in this order: **Invoice Terms**, a small library of reusable free-text terms with add/edit/delete
  (`/invoice-terms`), each with a **Plus Days** column — how many days after the issue date the
  term's due date falls, or a fixed "End of the month" checkbox instead (always the last working
  day, Mon–Fri, of the issue date's month — a fixed day-count doesn't make sense when months have
  different lengths). Terms back the "Terms" dropdown on the invoice/quote `DocumentFormModal`
  (Invoices & Quotes page — see above): picking one copies the chosen term's text onto the
  invoice/quote as `paymentTerms` at creation time rather than referencing the `InvoiceTerm` (so an
  issued invoice/quote can't retroactively change if the library entry is edited later), and
  auto-fills Due Date/Valid Until from `calculateDueDate()` (issue date + Plus Days, or the
  end-of-month rule) — staff can still edit that date afterward; it only recalculates in response
  to staff actually changing the Terms dropdown or Issue date, not on initial load. **Bank Details** (Bank Name, Sort
  Code, Account Number) is its own independent-save form on the same three `BusinessInfo` fields
  Business Info's "Terms and Conditions" card also draws from, just surfaced here instead since
  it's invoice-specific, not general business branding — shown to customers on invoices so they
  know where to send payment; not encrypted, since it's meant to be disclosed. **Products**, a
  reusable catalog (`/products` — Product Code, Name, Description, Price) for invoice/quote line
  items, now also supports edit, not just add/delete. Its column headers are sortable — click one
  to sort ascending, click again for descending; the `SortIcon` on each header shows which column
  is active and in which direction. Sorting is client-side over the already-fetched list, and the
  small `SortableTh` component behind it isn't Product-specific, so another settings table can
  reuse it. Both `InvoiceTermsCard` and `ProductsCard` share one "New"/"Edit" modal component
  (taking an optional existing record) rather than separate Add and Edit components.

  **PDF Template** (`PdfTemplateDesigner`, `admin/src/components/PdfTemplateDesigner.tsx`) is a
  freeform drag-and-drop canvas editor for the invoice/quote PDF the Invoices & Quotes page's
  "View" action renders (see above) — an A4-proportioned canvas (595.28×841.89pt, scaled to fit)
  where every block (text, the logo, a line, a rectangle, a QR code, or the line-item table) is an
  absolutely-positioned, plain-`pointerdown`/`pointermove`/`pointerup`-driven draggable/resizable
  element (no drag-and-drop library — a single freeform canvas doesn't need one). Array order is
  z-order (later elements draw on top and are hit-tested first); **Bring to front**/**Send to
  back** reorder the array. **Undo**/**Redo** (also Ctrl+Z/Ctrl+Y) is an in-memory stack of whole-
  template snapshots pushed on every committed change — a drag or resize pushes one snapshot at
  pointer-up, not per pixel moved. Arrow keys nudge the selected element(s) (1pt, 10pt with Shift),
  ignored while focus is inside a form field so it doesn't hijack normal text-cursor navigation.

  Shift+click adds/removes a block from the selection; clicking a block that's already part of the
  current multi-selection drags all of them together without disturbing the selection. **Group**
  (shown once 2+ blocks are selected) assigns them a shared `groupId` — from then on, clicking any
  member selects and drags the whole group as one, until **Ungroup** clears it. This is genuinely
  persistent (saved with the template, not just a session-local multi-select), useful for e.g. a
  label + its value that should always move together. Resize handles only appear for a single
  selected block — resizing a group isn't supported, since scaling several unrelated block types
  together has no one sensible meaning.

  The property panel (right side) edits the selected element's position/size, a **Show** dropdown
  (Always / only when an invoice is paid / only when unpaid — e.g. the default template's "PAID"
  stamp is paid-only; meaningless for quotes, which have no paid state, so it's always treated as
  unpaid there), and type-specific fields — text/QR content is free text with an "Insert
  placeholder" dropdown that inserts a `{{token}}` (invoice/customer/business/bank fields — see
  `PDF_PLACEHOLDERS` in `admin/src/pdf/invoicePdf.ts`) at the end of the field. The one block that
  isn't freely editable internally is the **Item table** — its columns are fixed
  (#/Item & Description/Qty/Unit Price/Line Total) since its content is the invoice/quote's actual
  line items, not staff-authored text; only one is allowed per template. More generally, no block's
  rendered size is actually fixed — the box staff draw is just a starting size, and if the real
  content (an item table's rows, a long customer address wrapped over several lines) needs more
  room than that, the renderer pushes everything positioned below it *in the same horizontal lane*
  further down to make space (columns side by side, e.g. "Invoice To" and the date block, don't
  affect each other — only genuine stacking does), cascading through the rest of the page and
  spilling onto a fresh page if it still runs past the bottom margin. This is `resolveLayout()` in
  `admin/src/pdf/invoicePdf.ts`: every element's actual height is measured against its real,
  substituted content before drawing, sorted top-to-bottom, with growth tracked as horizontal
  "shift zones" so later elements in the same column inherit the push. The designer's own canvas
  only shows the *authored* layout (it doesn't simulate this cascading, or even wrap text within a
  box) — **Preview** is what actually shows this: it swaps the editable canvas for the real
  `buildInvoicePdf()` output (fed a hardcoded sample invoice) in an iframe, since the canvas is only
  an HTML/CSS approximation of the PDF's actual fonts/spacing — **Save Template** is what persists it
  (`invoicePdfTemplate` on `BusinessInfo`, see `backend/README.md`); **Reset to Default** restores
  `DEFAULT_INVOICE_TEMPLATE` (the same layout the renderer falls back to when nothing's been saved
  yet, so there's one source of truth for "default" rather than two).
  **Finance** has three `NamedListCard` (`admin/src/components/NamedListCard.tsx`)-built lists:
  **Payment Methods** (`/payment-methods` — e.g. "Bank Transfer", "Cash", "Card"), feeding the
  Payment Method dropdown in `RecordPaymentModal`/`AddPaymentModal`; **Expense Categories**
  (`/expense-categories` — e.g. "Insurance", "Supplies"), feeding `ExpenseModal`'s Category dropdown
  on the Financial page's Expenses tab; and **Vendors** (`/vendors` — e.g. "Acme Pet Supplies"),
  feeding that same `ExpenseModal`'s Payee dropdown (previously a free-text field — same reasoning
  as Category's earlier fixed-enum-to-managed-list switch: a small, staff-managed reference list
  beats retyping the same names). `NamedListCard` takes an optional `itemNounPlural` prop for cases
  where `itemNoun + 's'` isn't right (`"expense category"` → `"expense categories"`, not
  `"expense categorys"`) — Vendors doesn't need it (`"vendor"` → `"vendors"` is already correct).
  Deliberately named "Finance" rather than reusing "Financial" for this Settings tab despite the
  naming similarity, since they're two different things: this one is small reference lists staff
  rarely touch, not bank account details or the payments/expenses/credit-notes ledgers themselves.

## Sending email via Microsoft 365

Settings → Email stores Microsoft Graph application credentials and uses them for
application-only (client credentials) auth — no per-user sign-in, no delegated permissions, and
no SMTP AUTH (which Microsoft has been phasing out tenant-by-tenant). To set it up:

1. In the [Azure Portal](https://portal.azure.com), go to **Microsoft Entra ID → App
   registrations → New registration**. Any name/account type is fine for a single-tenant setup.
2. Under **API permissions**, add **Microsoft Graph → Application permissions → `Mail.Send`**,
   then **Grant admin consent** for the tenant (this step needs a Global/Application
   Administrator — application permissions don't work without it).
3. Under **Certificates & secrets → New client secret**, create one and copy the **value**
   immediately — Azure only shows it once.
4. From the app's **Overview** page, copy the **Application (client) ID** and **Directory
   (tenant) ID**.
5. In Settings → Email, paste the tenant ID, client ID, and client secret, set **From address** to
   a real mailbox in the tenant (a shared mailbox or a licensed user, e.g.
   `bookings@pawfectpetssherborne.co.uk`) — `Mail.Send` at the application level can send as any
   mailbox in the tenant, so this is just which one you want mail to come from — and save.
6. Use **Send a test email** to confirm. A failure here surfaces Microsoft's own error text (e.g.
   `AADSTS...` errors from a wrong tenant/client ID, or a Graph error if the from address isn't a
   real mailbox), which is usually specific enough to point at what's wrong.

"Send email" now appears next to every "Copy link" in the app — the new-customer flow
(`CustomersPage`), a customer's status-driven registration/update-info link (`CustomerDetailPage`'s
header), and the add-a-pet link (`AddPetChoiceModal`) — each backed by `POST /settings/email/send`
with `{trigger, to, name, link}`. All three call sites already have the customer's name/email/link
in scope, so the endpoint takes them as-is rather than looking the customer up itself; if the
matching template in Settings → Email Templates isn't configured yet, or the connection above
isn't fully set up, the button surfaces that as a plain error instead of failing silently.

## Auth model

The backend guards every route by default; only the specific endpoints the public intake form
itself calls (`POST /customers`, `GET/PATCH /customers/:id`, `POST /animals`) are marked public.
Everything in this app requires a valid staff JWT.

## Look and feel

The logo, colour palette (forest green `#1f3b2c` / warm orange `#e8963c` / sage-cream background),
and font pairing (Fraunces for headings, Work Sans for body) are pulled from the live marketing
site, [pawfectpetssherborne.co.uk](https://pawfectpetssherborne.co.uk), so the dashboard reads as
the same product rather than a generic admin theme. The logo file lives at
`src/assets/logo.png`; the palette and fonts are defined as CSS variables at the top of
`src/index.css`.

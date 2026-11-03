# Invoicing and finance

## Invoices and quotes

Admin dashboard: **Invoices & Quotes**. Staff app: **Business > Invoicing**.

- Numbers follow the templates in Settings > Business Info > Document Numbering, for example `INV-{year}-{seq}`, `QUO-{year}-{seq}`, `PAY-…`, `CN-…`.
- Line items come from **Products** (Settings > Invoice/Quotes), with quantity, unit price and discount.
- Payment terms (Settings > Invoice/Quotes > Invoice Terms) set the due date: a number of days, optionally to the end of the month.
- The invoice layout is designed in the PDF template designer (Settings > Invoice/Quotes); bank details and a payment QR code are printed on it.

| Invoice status | Meaning |
| --- | --- |
| draft | Not sent to the customer yet |
| scheduled | Set to send at a later time (**Schedule Send**) |
| sent | Emailed; the customer has a link |
| overdue | Still unpaid a full day after the due date (set hourly) |
| paid | Fully paid; the public page shows a PAID ribbon |
| cancelled | Cancelled |

"Partially paid" and "Outstanding" are filters worked out from the payments.

Actions on an invoice: View, Edit, Send (with a preview of the email), Payments, Request Deposit, **Overdue Payment** reminder, Delete. Every invoice has an **Activity** trail: created, sent, read (from a tracking pixel), payments, reminders, schedule changes.

Quotes can be **accepted** or **declined** by the customer from the emailed link or the customer app, and can be converted to an invoice.

## Payments

- Recorded against an invoice with date, amount, charges (for example card fees), payment method and the bank account it went into.
- The staff app can take a card payment with a SumUp reader.
- If the invoice is already paid, you're asked before recording another payment.
- After a payment you're offered the **Thank You for Payment** email; you can also email a PDF receipt.
- **Other Income** records money that isn't against an invoice.

## Financial page

| Tab | Contents |
| --- | --- |
| Snapshot | Drag-to-reorder cards: receivables, cash flow, projected flow, income vs expenses, top expenses, bank accounts, expected revenue |
| Payments | Payments and other income, newest first |
| Expenses | Date, payee, category, account, description, amount and receipt. Refunded expenses are watermarked and marked `[R]` |
| Credit Notes | Credit against an invoice, with a reason |
| Bank Transfers | Moves between your own accounts |
| Bank Accounts | Balances and a monthly statement per account, exportable |
| Uploads | Expense receipts: view and email them |

Expense categories, vendors, payment methods and bank accounts are set up in **Settings > Finance**.

## Reports

| Report | Shows |
| --- | --- |
| P/L | Income (payments net of charges, minus credit notes) against expenses, per month |
| Expense Summary by Category | Totals per category, with drill-down |
| Income Summary by Customer | Income per customer, with drill-down |
| Income | Invoices due in a Date From / Date To range, with a drafts toggle |

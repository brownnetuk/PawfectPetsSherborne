# Settings reference

Everything configurable lives in **Settings** in the admin dashboard. Changing settings needs the `settings.manage` permission; staff and roles need `staff.manage`. Cards can be collapsed.

| Tab | What's in it |
| --- | --- |
| **Business Info** | Business name, address, contact details and logo · **Trusted IPs** (restricts admin dashboard logins; break-glass accounts are exempt) · Terms and Conditions (`.docx` upload, version and document date) · Alternative Vet Care Authorisation, Off-Lead Consent and Declaration wording · **Vet Practices** · Deposit percentage · QR Code URL (what the staff app connects to) · **Document Numbering** for invoices, quotes, payments and credit notes |
| **Staff** | Staff accounts (break-glass, locked, role) and **Access Permissions** (roles). See [Staff accounts and permissions](Staff-Accounts-and-Permissions). |
| **Email** | Microsoft 365 connection, test email, **Email Groups** for bulk email |
| **Email Templates** | One template per kind of email, with variables and preview. See [Communications](Communications-and-Notifications). |
| **Invoice/Quotes** | Products (code, name, price, availability on weekdays, weekends or bank holidays, shown in the price list), bank holidays, annual leave, the PDF template designer, invoice terms, bank details, default invoice and quote messages |
| **Bookings** | Which products price visits (1 or 2 visits × weekday, weekend, bank holiday), day care (half or full day, 2nd dog) and boarding (per day, half day, 2nd dog) |
| **Boarding** | Booking reference format and next number · Booking Information and Booking Terms for the confirmation PDF · Pre-check-in: how many days before, and which forms · Check-in and check-out forms, and whether a photo or signature is required · Checklist templates |
| **Pre-Boarding** | The pre-boarding questionnaire: sections, questions, follow-ups, scores and auto-fail answers |
| **Forms** | The form builder. See [Compliance and training](Compliance-and-Training). |
| **Finance** | Bank accounts (with a default), payment methods, expense categories and vendors (import and export as CSV) |
| **Notifications** | Which staff push notifications are sent, and when |
| **Recycle Bin** | Everything deleted anywhere (admin, staff app or customer app). Anyone can restore; permanent deletion needs `recycleBin.purge`. |

## Settings that live outside the app

Some things are set as environment variables on the Portainer stack instead, because they're secrets or URLs the apps are built with. See [Deployment with Portainer](Deployment-with-Portainer).

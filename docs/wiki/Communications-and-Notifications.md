# Communications and notifications

## Email

All email is sent from the business's Microsoft 365 mailbox using the Microsoft Graph API. Every sent email also appears in that mailbox's Sent Items.

**Setting it up** (Settings > Email):
1. In Microsoft Entra (Azure AD), register an app and give it the **application** permission `Mail.Send` with admin consent.
2. Enter the Tenant ID, Client ID, Client secret (stored encrypted) and the From address.
3. Click **Send a test email**.

The step-by-step guide is in [`admin/README.md`](https://github.com/brownnetuk/PawfectPetsSherborne/blob/main/admin/README.md) under "Sending email via Microsoft 365".

### Email templates

Settings > Email Templates has one template per kind of email. Each has a subject and a rich-text body with **Insert variable** placeholders such as `{{name}}`, `{{link}}`, `{{invoice_link}}` or `{{items_table}}`, and a **Preview**.

| Template | Sent when |
| --- | --- |
| New customer registration | A lead's registration link |
| Update info request | Asking a customer to re-check their details |
| Add a pet | A link to add pets |
| Invoice Template, Quote Template | Sending an invoice or quote |
| Thank You for Payment | After a payment |
| Request Deposit | Asking for a deposit or full payment |
| Payment Overdue | The overdue payment reminder |
| Forms, Form Copy | Sending a form, and a copy of the answers |
| Booking Confirmation | A boarding or day care booking confirmation |
| Pre-Boarding Questionnaire | The pre-boarding form |
| Post Registration Email | The copy of a completed registration |
| Portal Login Code, Portal Password Reset, Customer Portal Enabled, Customer Portal Sign-in Code | Customer app and portal access |
| Generic Email | The wrapper for bulk emails from Communications |

If a template hasn't been set up, sending that kind of email fails with a message telling you so. Emails include a tracking pixel, so you can see when an invoice or bulk email was read.

## Communications page

| Tab | What it does |
| --- | --- |
| Conversations | Two-way chat with customers who use the customer app (refreshes every few seconds) |
| Push Messages | Send a push to chosen customers, optionally requiring them to **Acknowledge** it; see who received and acknowledged |
| Email | Send a bulk email to customers or to an **Email Group** (Settings > Email); see who read it |

## Push notifications

Push goes straight to Apple (APNs) for both iPhone apps, using one `.p8` key. Set these on the stack in Portainer:

| Variable | Value |
| --- | --- |
| `APNS_KEY` | The contents of the `.p8` file (multi-line is fine) |
| `APNS_KEY_ID`, `APNS_TEAM_ID` | From the Apple Developer account |
| `APNS_BUNDLE_ID` | The staff app's bundle id |
| `APNS_CUSTOMER_BUNDLE_ID` | The customer app's bundle id |
| `APNS_PRODUCTION` | `true` for App Store and TestFlight builds |

Leave them unset and push is turned off (the backend logs and skips).

### Staff notifications

Settings > Notifications (or the staff app's Settings) turns each on or off:

- Customer activated (pending to active)
- Appointment reminders, 15 minutes to 3 hours before
- Daily digest at a set time
- Invoice overdue
- Invoice read
- Checklist reminders

Review dates for risk assessments, policies and training also notify staff. Notifications appear in the bell in both the admin dashboard and the staff app.

### Customer notifications

Customers get pushes for messages from staff, push messages, and invoices becoming overdue. They show in the customer app's bell.

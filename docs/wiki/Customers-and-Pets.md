# Customers and pets

## Customers

A customer starts as a **lead** and becomes **active** once they've registered. See [Customer journey](Customer-Journey) for the statuses.

Ways to create a customer:
- **Customers > New customer** in the admin dashboard: first name, surname, email, and whether to email the registration link now.
- **Enquiries > Convert to Customer**: copies the enquiry's details across and deletes the enquiry.
- The customer registers themselves at the intake site's home page.
- The staff app's **+** button on the Customers tab.

What's stored on a customer:
- Client details, address and phone (the last 3 digits of the mobile number are used for [Customer portal](Customer-Portal) sign-in).
- Emergency contact, or "same as client".
- Emergency vet and the signed alternative vet care authorisation.
- Security: keys provided, the alarm / key-safe code (encrypted; only staff with `customers.viewSecurity` can reveal it), further information.
- The signed agreement: name, signature, date, and the terms version and document date at the time of signing.
- **Customer Defaults**: default product, travel charging (see below), regular days (used for "Recommended" on the calendar and for income projections), and app access.

### Travel

The **Travel** card on Customer Defaults has two settings that share one travel product:

| Setting | What it adds to invoices |
|---|---|
| **Travel Chargeable for Visits** | One travel line per visit: 1 x Visit adds 1 x Travel, 2 x Visit adds 2 x Travel. |
| **Travel Chargeable for Walks** | One travel line per dog walk: 1 x Walk adds 1 x Travel, 2 x Walk adds 2 x Travel. |

Tick either or both. Day care and boarding never carry travel. Travel is counted from the bookings when invoices are generated, and kept in step when a booking on a draft or scheduled invoice changes.

Every change is written to the customer's **Activity** tab (the audit log). **Notes** is for the team's own CRM entries: notes, calls, emails and tasks, with image attachments.

## Pets

Each pet belongs to a customer and records species, breed, sex, age, vaccination status and expiry (with a photo of the card), neutered status, microchip, colour, insurance, temperament, aggression, travel, livestock, allergies, medication (name, dosage, frequency, prescribed by a vet, given by Pawfect Pets), walking on or off lead, and up to 2 photos.

Dogs walked off lead need a signed **off-lead consent**, using the wording in Settings > Business Info (`{{petName}}` is filled in).

A pet can be **copied** or **moved** to another customer (for example, a dog shared between two households). A copy stays linked to the original until you choose **Unlink from copy**.

## Forms on a customer

The **Forms** tab lists every form sent to the customer, its status and the answers. **Send form** emails a link to any form built in Settings > Forms. See [Compliance and training](Compliance-and-Training).

## Deleting

Deleting a customer is blocked while they still have pets, bookings, invoices, quotes or notes. **Force delete** removes everything (it needs `customers.manage`). Everything deleted lands in **Settings > Recycle Bin** first, where anyone can restore it.

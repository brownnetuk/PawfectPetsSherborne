# Staff accounts and permissions

## Accounts

There's no self sign-up for staff.

- **The very first account** is created from the command line: `npm run seed:staff -- "Your Name" you@example.com "a-strong-password"` in a checkout of `backend/`, with `MONGODB_URI` in `backend/.env` pointing at the database. The scripts aren't in the production image, so this runs from a developer machine, not the container.
- **Everyone else** is added in **Settings > Staff > New staff account**: name, username, email, password (8+ characters), break-glass and role.

| Flag | Effect |
| --- | --- |
| **Break-glass** | Full access, and exempt from the Trusted IPs restriction. Keep one so you can always get back in if the IP list is wrong. |
| **Locked** | Can't sign in at all, even break-glass. Another staff member has to unlock it. |
| **No role** | Full access |

Staff sessions last 12 hours, or 30 days with "Keep me signed in" in the admin dashboard. The last remaining staff account can't be deleted.

## Roles and permissions

**Settings > Staff > Access Permissions** defines roles. A role is a name and a set of these permissions:

| Permission | Allows |
| --- | --- |
| `customers.manage` | Deleting customers, their pets or their notes |
| `customers.viewSecurity` | Revealing a customer's decrypted alarm or key-safe code |
| `bookings.manage` | Deleting bookings |
| `invoicing.manage` | Deleting invoices and quotes |
| `financial.manage` | Deleting payments, expenses, bank accounts and credit notes |
| `settings.manage` | Changing Settings: business info, email, templates, invoice and quote setup, forms, PDF template, finance reference data |
| `staff.manage` | Creating, editing and deleting staff accounts and roles |
| `training.manage` | Managing training modules and seeing the compliance audit (also needed just to view the module list, because it holds the answers) |
| `recycleBin.purge` | Permanently deleting from the Recycle Bin, or emptying it |

Everything not listed is open to any signed-in staff member. The backend checks permissions on every request; the apps don't hide pages, so an action you can't do just shows an error.

## Customers' sign-ins

Customers sign in separately, to the [Customer app](Customer-App) and [Customer portal](Customer-Portal), using tokens that can't be used on staff routes.

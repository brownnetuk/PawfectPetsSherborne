# PawfectPets Sherborne

Welcome to the wiki for **PawfectPets Sherborne**, the system that runs the business day to day: client intake, bookings (boarding, day care, walks and visits), invoicing and payments, CRM, customer communications, compliance and staff training.

The repository is a monorepo of six apps that all talk to one NestJS + MongoDB API, deployed as a Docker stack in Portainer behind a Cloudflare Tunnel.

## The apps at a glance

| App | Who uses it | Where | Wiki page |
| --- | --- | --- | --- |
| Admin dashboard | Staff, at a desk | `admin.pawfectpetssherborne.co.uk` | [Admin dashboard](Admin-Dashboard) |
| Staff app | Staff, out and about (iPhone) | Installed on staff phones | [Staff app](Staff-App) |
| Customer app | Customers (iPhone) | Installed on customer phones | [Customer app](Customer-App) |
| Customer portal | Customers, in a browser | `portal.pawfectpetssherborne.co.uk` | [Customer portal](Customer-Portal) |
| Public intake site | Customers, no login | `intake.pawfectpetssherborne.co.uk` | [Public intake site](Public-Intake-Site) |
| Backend API | Every other app | `api.pawfectpetssherborne.co.uk` | [Backend API](Backend-API) |

## Where to start

- **New to the system?** Read the [System overview](System-Overview), then the [Customer journey](Customer-Journey).
- **Running the business?** See [Boarding and day care](Boarding-and-Day-Care), [Calendar and bookings](Calendar-and-Bookings), [Invoicing and finance](Invoicing-and-Finance) and [Communications](Communications-and-Notifications).
- **Setting things up?** See [Settings reference](Settings-Reference) and [Staff accounts and permissions](Staff-Accounts-and-Permissions).
- **Shipping a change?** See [Versioning and releases](Versioning-and-Releases) and [Deployment with Portainer](Deployment-with-Portainer).
- **Fixing data?** See [Database maintenance](Database-Maintenance).

## Features

- **Customers and pets**: leads, registration links, a multi-step intake wizard with signed agreement, pet records with health, medication, behaviour, photos and off-lead consent.
- **Boarding and day care**: booking references, a 9-stage lifecycle from quote to invoice paid, pre-check-in, check-in and check-out forms, observations, incident reports, occupancy and capacity.
- **Calendar**: walks, visits, day care, boarding and appointments in one month or week view, with recommended regulars and monthly invoice generation.
- **Invoices and quotes**: numbered documents, HTML and PDF views, public links, deposits, payment requests, overdue reminders, scheduled send.
- **Finance**: payments (including SumUp card payments from the staff app), other income, expenses with receipt uploads, credit notes, bank accounts and transfers, reports and cash-flow projections.
- **Communications**: two-way messaging with customers, push notifications, bulk email to customers or groups, 18 editable email templates.
- **Compliance**: risk assessments, policies, checklists, pre-boarding eligibility questionnaires, staff training modules with quizzes and a compliance audit.
- **Admin**: staff accounts, roles and permissions, trusted IPs, a recycle bin, an audit log on every customer and invoice.

## More detail

This wiki is the friendly guide. The repository [README](https://github.com/brownnetuk/PawfectPetsSherborne/blob/main/README.md) is the exhaustive technical reference: every route, every data model, every scheduled job. Each app folder also has its own setup README, and there is a prioritised [security review](https://github.com/brownnetuk/PawfectPetsSherborne/blob/main/docs/security-review.md).

> The wiki is published from the `docs/wiki/` folder in the repository. To change a page, edit it there and merge to `main`; see [Editing this wiki](Editing-This-Wiki).

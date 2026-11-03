# Calendar and bookings

The **Calendar** (admin `/bookings`, staff app **Bookings** tab) shows walks, visits, day care, boarding and appointments together.

## Using the calendar

- Switch between **This Week** and **This Month**; move with ← **Today** →.
- Filter with the pills: Walks, Visits, Day Care, Boarding, Appointments.
- Each day shows up to 3 entries and "+N more". A ✓ means it's been invoiced. Annual leave days are crossed out.
- Click a day to open the day panel:
  - Walks, Visits, Day Care, Boarding and Appointments for that day, editable inline.
  - **Recommended**: customers whose regular days include this weekday, with a quick-add button.
  - **Add Dog**: pick a dog, a product and a quantity.

## Adding bookings

| Button | What it creates |
| --- | --- |
| New Booking | Visits over a date range (1 or 2 visits a day, with visit length), day care or boarding |
| Add Appointment | A staff appointment with a reminder push before it |
| Generate Invoice | One invoice per customer for the month's uninvoiced bookings (see below) |

If a product isn't available on that kind of day (weekday, weekend or bank holiday), you get a warning first. Bank holidays and annual leave are set in Settings > Invoice/Quotes.

Visit prices come from **Settings > Bookings > Visits**, which maps 1 or 2 visits on a weekday, weekend or bank holiday to a product.

## Monthly invoicing

**Generate Invoice** gathers every uninvoiced booking in the month, groups it per customer into line items, and shows a running total of what's selected. It offers to add new bookings to a customer's existing open invoice instead of creating another one. Travel is charged per visit (and for walks only if switched on for that customer).

Invoice due dates never come before the payment terms allow. See [Invoicing and finance](Invoicing-and-Finance).

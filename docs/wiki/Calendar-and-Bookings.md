# Calendar and bookings

The **Calendar** (admin `/bookings`, staff app **Bookings** tab) shows walks, visits, day care, boarding and appointments together.

## Using the calendar

- Switch between **This Week** and **This Month**; move with ← **Today** →.
- Filter with the pills: Walks, Visits, Day Care, Boarding, Appointments.
- Each day shows up to 3 entries and "+N more". A ✓ means it's been invoiced. Annual leave days are crossed out.
- Click a day to open the day panel:
  - **Revenue** under the date: the value of everything booked that day (walks, visits, day care, boarding), each at its product price × quantity, plus travel worked out from each customer's Travel settings for Visits and Walks, the same way Generate Invoice counts it. Boarding pick-up-day markers aren't counted, and the figure covers the whole day whichever filter pills are on.
  - Walks, Visits, Day Care, Boarding and Appointments for that day, editable inline.
  - **Recommended**: customers whose regular days include this weekday, with a quick-add button.
  - **Add Dog**: pick a dog, a product and a quantity.

## Adding bookings

| Button | What it creates |
| --- | --- |
| New Booking | Visits over a date range (1 or 2 visits a day, with visit length; separate first-day and end-day counts, or just visits per day when the start and end date are the same), day care or boarding |
| Add Appointment | A staff appointment with a reminder push before it |
| Generate Invoice | One invoice per customer for the month's uninvoiced bookings (see below) |

If a product isn't available on that kind of day (weekday, weekend or bank holiday), you get a warning first. Bank holidays and annual leave are set in Settings > Invoice/Quotes.

Visit prices come from **Settings > Bookings > Visits**, which maps 1 or 2 visits on a weekday, weekend or bank holiday to a product.

## Monthly invoicing

**Generate Invoice** gathers every uninvoiced booking in the month, groups it per customer into line items, and shows a running total of what's selected. It offers to add new bookings to a customer's existing open invoice instead of creating another one: their lines (and any travel) are added to that invoice's Item Table, a line for the same item at the same price just gaining quantity, and its due date moves later if the bookings run past it. Travel is charged per visit and per walk, following the customer's **Travel Chargeable for Visits** and **Travel Chargeable for Walks** settings (see [Customers and pets](Customers-and-Pets#travel)).

Each customer card shows the customer's dog names under their name. The calendar button beside the total opens a month calendar of just that customer's bookings, coloured like the Bookings calendar, with already-invoiced days ticked.

The create button next to it invoices just that customer, whether or not they're ticked. For a new invoice it asks whether to **Save as Draft**, **Create & Send** (email it now), **Schedule Send** (opens the usual Schedule Send dialog; cancelling that leaves a draft) or **Mark as Sent** (no email). If an existing invoice is picked in their dropdown, it asks the same about that invoice once the bookings are added: **Just Add**, **Add & Send**, and, while the invoice is still a draft or scheduled, **Add & Schedule Send** or **Add & Mark as Sent**. The customer then drops off the list so **Confirm & Create** doesn't invoice them twice.

Invoice due dates never come before the payment terms allow. See [Invoicing and finance](Invoicing-and-Finance).

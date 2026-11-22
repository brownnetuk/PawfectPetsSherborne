import type { Customer, DayBooking, Product, VisitMapping } from '../types';
import { bookingUnitPrice } from './customerPricing';
import { travelProductForCustomer, travelQuantityForCustomer, travelUnitsForBookings } from './travelLines';

function customerIdOf(customer: DayBooking['customer']): string {
  return typeof customer === 'string' ? customer : customer._id;
}

function productIdOf(product: DayBooking['product']): string {
  return typeof product === 'string' ? product : product._id;
}


// The value of the services booked on one day, worked out the same way
// Generate Invoices builds each customer's lines: every booked row at its
// product's price x quantity (the customer's Pricing Override where set) (boarding pick-up-day placeholders are never
// billed), with travel counted from each customer's Travel settings (Visits
// and/or Walks) rather than from any travel rows that were booked.
export function dayRevenue(
  bookings: DayBooking[],
  customers: Customer[],
  products: Product[],
  mapping: VisitMapping | null,
): number {
  const billable = bookings.filter((b) => !b.placeholder);
  const byCustomer = new Map<string, DayBooking[]>();
  for (const b of billable) {
    const cid = customerIdOf(b.customer);
    const list = byCustomer.get(cid);
    if (list) list.push(b);
    else byCustomer.set(cid, [b]);
  }
  const customerById = new Map(customers.map((c) => [c._id, c]));
  let total = 0;
  for (const [cid, custBookings] of byCustomer) {
    const customer = customers.find((c) => c._id === cid);
    const travel = mapping ? travelProductForCustomer(customer, products) : null;
    for (const b of custBookings) {
      if (travel && productIdOf(b.product) === travel._id) continue;
      total += bookingUnitPrice(b, customerById, products) * (Number(b.quantity) || 0);
    }
    if (travel && mapping) {
      total += travel.price * travelQuantityForCustomer(customer, travelUnitsForBookings(custBookings, mapping, travel));
    }
  }
  return total;
}

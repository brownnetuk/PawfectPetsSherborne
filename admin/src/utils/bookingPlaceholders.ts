import { escapeHtml } from '../pdf/htmlToPdf';
import type { BoardingBooking, BusinessInfo, Invoice } from '../types';

// The {{token}} placeholders Settings > Boarding > Booking Terms can use --
// resolved against a specific booking when its Booking Confirmation PDF is
// generated (admin/src/pdf/bookingConfirmationPdf.ts). Same {{token}} syntax
// and "Insert variable…" picker as email templates and forms.
export const BOOKING_PLACEHOLDERS: { key: string; hint: string }[] = [
  { key: 'customerName', hint: "Customer's full name" },
  { key: 'firstName', hint: "Customer's first name" },
  { key: 'petName', hint: "The booked pet's name (or \"Claude and Vera\" for several)" },
  { key: 'bookingReference', hint: 'Booking reference, e.g. BK00005' },
  { key: 'bookingType', hint: 'Boarding or Day Care' },
  { key: 'dropOffDate', hint: 'Drop-off date, e.g. Sunday, 25 October 2026' },
  { key: 'dropOffTime', hint: 'Drop-off time, e.g. 18:00' },
  { key: 'pickUpDate', hint: 'Pick-up date' },
  { key: 'pickUpTime', hint: 'Pick-up time' },
  { key: 'invoiceNumber', hint: 'Invoice number (blank if not yet invoiced)' },
  { key: 'total', hint: 'Invoice total, e.g. £135.00' },
  { key: 'balanceDue', hint: 'Invoice balance still due' },
  { key: 'businessName', hint: 'Your business name' },
  { key: 'businessPhone', hint: 'Your business telephone' },
  { key: 'businessEmail', hint: 'Your business email' },
  { key: 'businessAddress', hint: 'Your business address, town and postcode' },
  { key: 'businessWebsite', hint: 'Your business website' },
];

function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function buildVars(booking: BoardingBooking, invoice: Invoice | null, info: BusinessInfo): Record<string, string> {
  const customerName =
    booking.customer && typeof booking.customer !== 'string' ? booking.customer.name : '';
  const petNames = booking.animals
    .map((a) => (typeof a === 'string' ? '' : a.name))
    .filter(Boolean);
  const balance = invoice ? invoice.total - (invoice.amountPaid ?? 0) : 0;
  return {
    customerName,
    firstName: customerName.split(' ')[0] ?? '',
    petName: joinNames(petNames),
    bookingReference: booking.reference,
    bookingType: booking.type === 'boarding' ? 'Boarding' : 'Day Care',
    dropOffDate: longDate(booking.startDate),
    dropOffTime: booking.dropOffTime,
    pickUpDate: longDate(booking.endDate),
    pickUpTime: booking.pickUpTime,
    invoiceNumber: invoice?.invoiceNumber ?? '',
    total: invoice ? `£${invoice.total.toFixed(2)}` : '',
    balanceDue: invoice ? `£${balance.toFixed(2)}` : '',
    businessName: info.name ?? '',
    businessPhone: info.telephone ?? '',
    businessEmail: info.email ?? '',
    businessAddress: [info.address, [info.town, info.postcode].filter(Boolean).join(' ')]
      .filter(Boolean)
      .join(', '),
    businessWebsite: info.website ?? '',
  };
}

/**
 * Substitutes every known {{token}} in rich-text HTML with this booking's
 * (HTML-escaped) value; an unrecognised token is left as literal text so a
 * typo is visible in the PDF rather than silently blanked.
 */
export function interpolateBookingPlaceholders(
  html: string,
  booking: BoardingBooking,
  invoice: Invoice | null,
  info: BusinessInfo,
): string {
  const vars = buildVars(booking, invoice, info);
  return html.replace(/\{\{(\w+)\}\}/g, (match, key: string) => (key in vars ? escapeHtml(vars[key]) : match));
}

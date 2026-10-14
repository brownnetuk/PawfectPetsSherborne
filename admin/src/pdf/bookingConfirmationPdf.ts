import { jsPDF } from 'jspdf';
import {
  BLUE,
  BODY_FONT,
  INK,
  PINK,
  card,
  escapeHtml,
  fieldRow,
  loadBrandFonts,
  pdfBrandHeader,
  pdfFooter,
  renderHtmlToPdf,
  sectionHeading,
} from './htmlToPdf';
import { buildInvoicePdf } from './invoicePdf';
import { interpolateBookingPlaceholders } from '../utils/bookingPlaceholders';
import type { BoardingBooking, BusinessInfo, Invoice } from '../types';

// Fallback for a BusinessInfo with no bookingTerms set yet (Settings >
// Boarding > Booking Terms) -- the original fixed closing message this
// section used before that became staff-editable.
const DEFAULT_BOOKING_INFORMATION =
  "<p>We're looking forward to looking after your pet. If anything about this booking needs to change, just get in touch and we'll sort it out.</p>";

function customerName(customer: BoardingBooking['customer']): string {
  if (!customer) return '(deleted customer)';
  return typeof customer === 'string' ? customer : customer.name;
}

function petNames(animals: BoardingBooking['animals']): string {
  const names = animals.map((a) => (typeof a === 'string' ? null : a.name)).filter(Boolean) as string[];
  return names.join(', ') || '—';
}

function formatDateTime(dateIso: string, time: string): string {
  const date = new Date(dateIso).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return `${date}, ${time}`;
}

/**
 * Renders a boarding/day care booking as a branded, customer-facing
 * confirmation PDF, ending with the booking's invoice (same layout as the
 * Invoices page PDF) when it has one.
 */
export async function buildBookingConfirmationPdf(
  booking: BoardingBooking,
  invoice: Invoice | null,
  businessInfo: BusinessInfo,
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  const detailRows = [
    fieldRow(booking.animals.length > 1 ? 'Pets' : 'Pet', petNames(booking.animals)),
    fieldRow('Type', booking.type === 'boarding' ? 'Boarding' : 'Day Care'),
    fieldRow('Drop off', formatDateTime(booking.startDate, booking.dropOffTime)),
    fieldRow('Pick up', formatDateTime(booking.endDate, booking.pickUpTime)),
    ...(booking.notes ? [fieldRow('Notes', booking.notes)] : []),
  ].join('');

  const balanceDue = invoice ? invoice.total - (invoice.amountPaid ?? 0) : 0;
  const paymentRows = invoice
    ? [
        fieldRow('Invoice', invoice.invoiceNumber),
        fieldRow('Total', `£${invoice.total.toFixed(2)}`),
        fieldRow('Payments received', `£${(invoice.amountPaid ?? 0).toFixed(2)}`),
        fieldRow(
          balanceDue > 0 ? 'Balance due' : 'Status',
          balanceDue > 0 ? `£${balanceDue.toFixed(2)}` : 'Paid in full',
          true,
        ),
      ].join('')
    : fieldRow('Status', 'Not yet invoiced');

  const information = businessInfo.bookingInformation
    ? interpolateBookingPlaceholders(businessInfo.bookingInformation, booking, invoice, businessInfo)
    : '';

  const name = customerName(booking.customer);
  const contact = [businessInfo.telephone, businessInfo.email].filter(Boolean).map(escapeHtml).join(' &middot; ');

  const html = `
    <style>
      .pp-bc-rich { font-size:13px; line-height:1.45; color:${INK}; }
      .pp-bc-rich p { margin:0 0 6px; }
      .pp-bc-rich ul, .pp-bc-rich ol { margin:4px 0 6px; padding-left:20px; }
      .pp-bc-rich li { margin:0 0 2px; }
      .pp-bc-rich b, .pp-bc-rich strong { color:${BLUE}; }
      .pp-bc-rich u { text-decoration:none; font-weight:700; color:${PINK}; }
      .pp-bc-rich a { color:${BLUE}; }
    </style>
    <div style="font-family:${BODY_FONT};color:${INK};">
      ${pdfBrandHeader({ title: 'Booking confirmed', subtitle: `for ${name}`, badge: { label: 'Reference', value: booking.reference } })}

      <div style="display:flex;gap:14px;margin-top:16px;">
        ${card('Your booking', detailRows)}
        ${card('Payment', paymentRows)}
      </div>

      ${information ? `<div class="pp-bc-rich" style="margin:16px 2px 0;">${information}</div>` : ''}

      <div style="margin:18px 2px 0;">
        ${sectionHeading('Booking terms')}
        <div class="pp-bc-rich">${interpolateBookingPlaceholders(businessInfo.bookingTerms || DEFAULT_BOOKING_INFORMATION, booking, invoice, businessInfo)}</div>
      </div>

      ${pdfFooter(contact)}
    </div>
  `;

  await loadBrandFonts();
  await renderHtmlToPdf(doc, html);
  if (invoice) await buildInvoicePdf(invoice, 'invoice', businessInfo, doc);
  return doc;
}

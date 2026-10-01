import { jsPDF } from 'jspdf';
import { escapeHtml, pdfBrandHeader, pdfFooter, renderHtmlToPdf } from './htmlToPdf';
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

function fieldRow(label: string, value: string): string {
  return `<div style="display:flex;justify-content:space-between;gap:16px;padding:7px 0;border-bottom:1px solid #e3e8de;font-size:13px;">
    <span style="color:#6f7d72;">${escapeHtml(label)}</span>
    <span style="font-weight:bold;text-align:right;">${escapeHtml(value)}</span>
  </div>`;
}

function sectionHeading(title: string): string {
  return `<h2 style="font-family:Georgia,'Times New Roman',serif;font-size:18px;color:#1f3b2c;margin:26px 0 4px;">${escapeHtml(title)}</h2>`;
}

/** Renders a boarding/day care booking as a branded, customer-facing confirmation PDF. */
export async function buildBookingConfirmationPdf(
  booking: BoardingBooking,
  invoice: Invoice | null,
  businessInfo: BusinessInfo,
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  const detailRows = [
    fieldRow('Reference', booking.reference),
    fieldRow('Customer', customerName(booking.customer)),
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
        fieldRow(
          balanceDue > 0 ? 'Balance due' : 'Status',
          balanceDue > 0 ? `£${balanceDue.toFixed(2)}` : 'Paid in full',
        ),
      ].join('')
    : fieldRow('Status', 'Not yet invoiced');

  const html = `
    ${pdfBrandHeader()}
    <div style="font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:#6f7d72;font-weight:bold;margin-bottom:6px;">Booking confirmation for ${escapeHtml(customerName(booking.customer))}</div>
    <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:27px;color:#1f3b2c;margin:0 0 20px;">${escapeHtml(booking.reference)}</h1>

    ${sectionHeading('Booking details')}
    ${detailRows}

    ${sectionHeading('Payment')}
    ${paymentRows}

    ${sectionHeading('Booking Information')}
    <div>${businessInfo.bookingTerms || DEFAULT_BOOKING_INFORMATION}</div>

    ${pdfFooter()}
  `;

  await renderHtmlToPdf(doc, html);
  return doc;
}

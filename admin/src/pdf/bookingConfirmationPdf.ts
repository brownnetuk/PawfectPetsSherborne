import { jsPDF } from 'jspdf';
import { escapeHtml, renderHtmlToPdf } from './htmlToPdf';
import logoUrl from '../assets/logo.png';
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

// Brand palette and type from the Pawfect Pets social posts: a bold blue
// ground, yellow highlights, a pink call-out band and cream lettering, with
// Archivo Black display headings over DM Sans body text (both loaded from
// Google Fonts in index.html).
const BLUE = '#0072b5';
const YELLOW = '#fdf101';
const PINK = '#d7385e';
const CREAM = '#fbf7ee';
const INK = '#1d2a33';
const MUTED = '#5f6f7a';
const DISPLAY_FONT = "'Archivo Black', 'Arial Black', Helvetica, sans-serif";
const BODY_FONT = "'DM Sans', Helvetica, Arial, sans-serif";

// html2canvas draws with whatever fonts are already loaded, so make sure the
// web fonts have arrived before the capture or it falls back to Helvetica.
async function loadBrandFonts(): Promise<void> {
  if (!document.fonts) return;
  await Promise.all(
    ['400 20px "Archivo Black"', '400 13px "DM Sans"', '700 13px "DM Sans"', 'italic 400 13px "DM Sans"'].map((f) =>
      document.fonts.load(f).catch(() => undefined),
    ),
  );
}

function fieldRow(label: string, value: string, highlight = false): string {
  const valueStyle = highlight
    ? `background:${PINK};color:#fff;border-radius:999px;padding:1px 10px;`
    : '';
  return `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:5px 0;border-bottom:1px solid #d9e6ef;font-size:13px;line-height:1.35;">
    <span style="color:${MUTED};white-space:nowrap;">${escapeHtml(label)}</span>
    <span style="font-weight:700;text-align:right;${valueStyle}">${escapeHtml(value)}</span>
  </div>`;
}

function sectionHeading(title: string): string {
  return `<h2 style="font-family:${DISPLAY_FONT};font-weight:400;font-size:16px;line-height:1.2;color:${BLUE};margin:0 0 6px;">${escapeHtml(title)}<span style="display:block;width:34px;height:4px;background:${YELLOW};border-radius:2px;margin-top:5px;"></span></h2>`;
}

function card(title: string, rows: string): string {
  return `<div style="flex:1;min-width:0;background:${CREAM};border-radius:12px;padding:14px 16px 10px;">
    ${sectionHeading(title)}
    ${rows}
  </div>`;
}

/** Renders a boarding/day care booking as a branded, customer-facing confirmation PDF. */
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
      <div style="background:${BLUE};border-radius:14px;padding:18px 22px;display:flex;align-items:center;gap:18px;color:${CREAM};">
        <div style="flex:none;width:78px;height:78px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;">
          <img src="${logoUrl}" style="width:64px;height:64px;object-fit:contain;" />
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;">Pawfect Pets &middot; Sherborne</div>
          <div style="font-family:${DISPLAY_FONT};font-size:30px;line-height:1.1;letter-spacing:-0.01em;margin:4px 0 4px;">Booking <span style="color:${YELLOW};border-bottom:4px solid ${YELLOW};">confirmed</span></div>
          <div style="font-size:13px;font-style:italic;">for ${escapeHtml(name)}</div>
        </div>
        <div style="flex:none;text-align:right;">
          <div style="font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;opacity:0.85;">Reference</div>
          <div style="display:inline-block;margin-top:4px;background:${YELLOW};color:${BLUE};font-family:${DISPLAY_FONT};font-size:18px;padding:4px 12px;border-radius:999px;">${escapeHtml(booking.reference)}</div>
        </div>
      </div>

      <div style="display:flex;gap:14px;margin-top:16px;">
        ${card('Your booking', detailRows)}
        ${card('Payment', paymentRows)}
      </div>

      ${information ? `<div class="pp-bc-rich" style="margin:16px 2px 0;">${information}</div>` : ''}

      <div style="margin:18px 2px 0;">
        ${sectionHeading('Booking terms')}
        <div class="pp-bc-rich">${interpolateBookingPlaceholders(businessInfo.bookingTerms || DEFAULT_BOOKING_INFORMATION, booking, invoice, businessInfo)}</div>
      </div>

      <div style="margin-top:18px;background:${PINK};border-radius:12px;padding:11px 18px;display:flex;justify-content:space-between;align-items:center;gap:12px;color:#fff;">
        <div style="font-weight:700;font-size:14px;">Questions? Just get in touch</div>
        <div style="font-size:12px;text-align:right;">${contact}</div>
      </div>
      <div style="margin-top:6px;font-size:9.5px;color:${MUTED};text-align:right;">Generated ${new Date().toLocaleDateString('en-GB')}</div>
    </div>
  `;

  await loadBrandFonts();
  await renderHtmlToPdf(doc, html);
  return doc;
}

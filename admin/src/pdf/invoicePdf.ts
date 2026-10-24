import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import logoUrl from '../assets/logo.png';
import { registerBrandFonts } from './brandPdf';
import type {
  BusinessInfo,
  CustomerRef,
  Invoice,
  PdfElementType,
  PdfItemTableElement,
  PdfTemplateElement,
  PdfVisitTableElement,
  Quote,
} from '../types';

export const PAGE_WIDTH = 595.28; // A4, points -- same as customerFormPdf.ts
export const PAGE_HEIGHT = 841.89;
const TOP_MARGIN = 40;
const BOTTOM_MARGIN = 40;

// Brand palette and type from the booking confirmation PDF (the Pawfect Pets
// social posts): a bold blue ground, yellow highlights, a pink call-out band
// and cream cards, with Archivo Black display headings over DM Sans body
// text. Kept in sync by hand with admin/src/pdf/brandPdf.ts.
const BLUE = '#0072b5';
const YELLOW = '#fdf101';
const PINK = '#d7385e';
const CREAM = '#fbf7ee';
const INK = '#1d2a33';
const MUTED = '#5f6f7a';
const BORDER = '#d9e6ef';
/** The palette above, for the Settings template editor's on-screen canvas. */
export const PDF_BRAND = { blue: BLUE, cream: CREAM, ink: INK, muted: MUTED, border: BORDER };
const DISPLAY = 'ArchivoBlack';
const BODY = 'DMSans';

// Templates saved before the restyle carry the old green/orange palette;
// map those colours onto their brand equivalents so a customised layout
// still comes out in the booking confirmation's look.
const LEGACY_COLOURS: Record<string, string> = {
  '#1f3b2c': BLUE,
  '#232c26': INK,
  '#6f7d72': MUTED,
  '#e3e8de': BORDER,
  '#f3f6ee': CREAM,
  '#c85a4a': PINK,
  '#e8963c': PINK,
};

/** Sets a brand font, falling back to Helvetica if the brand fonts weren't embedded. */
function setPdfFont(doc: jsPDF, family: 'display' | 'body', style: 'normal' | 'bold' | 'italic' = 'normal') {
  if (BODY in doc.getFontList()) {
    doc.setFont(family === 'display' ? DISPLAY : BODY, family === 'display' ? 'normal' : style);
  } else {
    doc.setFont('helvetica', family === 'display' ? 'bold' : style);
  }
}

/** A template colour as it actually prints -- old-palette colours come out as their brand equivalents. */
export function brandColour(hex: string): string {
  return LEGACY_COLOURS[hex.toLowerCase()] ?? hex;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = brandColour(hex).replace('#', '');
  const n = parseInt(clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

async function loadLogoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch(logoUrl);
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function formatUkDateFromIso(iso: string | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function scheduleAnimalNames(animals: (string | { name: string })[]): string {
  return animals
    .map((a) => (typeof a === 'string' ? null : a.name))
    .filter(Boolean)
    .join(', ');
}
function ukDate(s: string): string {
  return s.slice(0, 10).split('-').reverse().join('/');
}

// A compact label/value block appended to the {{notes}} token so the PDF
// shows the Visits/Day Care/Boarding schedule for a quote (and the invoices
// converted from them) -- the HTML views render the same rows as a table via
// components/ScheduleTable.tsx. A record carries at most one of the three.
function scheduleFor(record: Invoice | Quote): { title: string; rows: [string, string][] } | null {
  if (record.visitPlan) {
    const plan = record.visitPlan;
    const rows: [string, string][] = [
      ['Dates', `${ukDate(plan.startDate)} - ${ukDate(plan.endDate)}`],
      ['Visits', `${plan.visitsPerDay} per day (first day ${plan.visitsFirstDay}, last day ${plan.visitsLastDay})`],
      ['Duration', `${plan.visitDuration ?? '20'} minutes per visit`],
    ];
    const names = scheduleAnimalNames(plan.animals);
    if (names) rows.push(['Pets', names]);
    return { title: 'Visit Schedule', rows };
  }
  if (record.dayCarePlan) {
    const plan = record.dayCarePlan;
    const rows: [string, string][] = [
      ['Date', ukDate(plan.date)],
      ['Drop off', `${plan.dropOffPeriod} (${plan.dropOffTime})`],
      ['Collection', `${plan.collectionPeriod} (${plan.collectionTime})`],
    ];
    const names = scheduleAnimalNames(plan.animals);
    if (names) rows.push(['Pets', names]);
    return { title: 'Day Care Schedule', rows };
  }
  if (record.boardingPlan) {
    const plan = record.boardingPlan;
    const rows: [string, string][] = [
      ['Dates', `${ukDate(plan.startDate)} - ${ukDate(plan.endDate)}`],
      ['Drop off', plan.dropOffTime],
      ['Pick up', plan.pickUpTime],
    ];
    const names = scheduleAnimalNames(plan.animals);
    if (names) rows.push(['Pets', names]);
    return { title: 'Boarding Schedule', rows };
  }
  return null;
}

function scheduleText(record: Invoice | Quote): string {
  const schedule = scheduleFor(record);
  if (!schedule) return '';
  return [schedule.title, ...schedule.rows.map(([label, value]) => `${label} :   ${value}`)].join('\n');
}

function money(n: number): string {
  return n.toFixed(2);
}

function customerRef(customer: Invoice['customer'] | Quote['customer']): CustomerRef | null {
  return customer && typeof customer !== 'string' ? customer : null;
}

/** Every {{token}} a template's text/qrcode content can reference. */
export const PDF_PLACEHOLDERS: { token: string; label: string }[] = [
  { token: 'invoiceNumber', label: 'Invoice / Quote number' },
  { token: 'invoiceDate', label: 'Invoice / Quote date' },
  { token: 'dueDate', label: 'Due date / Valid until' },
  { token: 'terms', label: 'Payment terms' },
  { token: 'docTypeLabel', label: '"Invoice" / "Quote"' },
  { token: 'docNumberLabel', label: '"Invoice#" / "Quote#"' },
  { token: 'docToLabel', label: '"Invoice To:" / "Quote To:"' },
  { token: 'docDateLabel', label: '"Invoice Date :" / "Quote Date :"' },
  { token: 'dueDateLabel', label: '"Due Date :" / "Valid Until :"' },
  { token: 'customerName', label: 'Customer name' },
  { token: 'customerAddress', label: 'Customer address' },
  { token: 'customerEmail', label: 'Customer email' },
  { token: 'customerPhone', label: 'Customer phone' },
  { token: 'subtotal', label: 'Subtotal' },
  { token: 'total', label: 'Total' },
  { token: 'amountPaid', label: 'Amount paid' },
  { token: 'balanceDue', label: 'Balance due' },
  { token: 'subject', label: 'Subject' },
  { token: 'notes', label: 'Notes message (Settings > Invoice/Quotes)' },
  { token: 'businessName', label: 'Business name' },
  { token: 'businessAddress', label: 'Business address' },
  { token: 'businessTown', label: 'Business town' },
  { token: 'businessPostcode', label: 'Business postcode' },
  { token: 'businessTelephone', label: 'Business telephone' },
  { token: 'businessEmail', label: 'Business email' },
  { token: 'businessWebsite', label: 'Business website' },
  { token: 'bankName', label: 'Bank account name' },
  { token: 'sortCode', label: 'Bank sort code' },
  { token: 'accountNumber', label: 'Bank account number' },
  { token: 'status', label: 'Status' },
];

export function buildPdfVars(
  record: Invoice | Quote,
  kind: 'invoice' | 'quote',
  businessInfo: BusinessInfo,
): Record<string, string> {
  const isInvoice = kind === 'invoice';
  const inv = isInvoice ? (record as Invoice) : null;
  const quote = !isInvoice ? (record as Quote) : null;
  const amountPaid = inv?.amountPaid ?? 0;
  const balanceDue = record.total - amountPaid;
  const customer = customerRef(record.customer);
  return {
    invoiceNumber: inv?.invoiceNumber ?? quote?.quoteNumber ?? '',
    invoiceDate: formatUkDateFromIso(record.issueDate),
    dueDate: formatUkDateFromIso(inv?.dueDate ?? quote?.validUntil),
    terms: record.paymentTerms ?? '',
    // Kind-aware labels -- the template's static text elements reference
    // these instead of hardcoding "Invoice" wording, since the same
    // template (default or staff-customized) renders both invoices and
    // quotes.
    docTypeLabel: isInvoice ? 'Invoice' : 'Quote',
    docNumberLabel: isInvoice ? 'Invoice#' : 'Quote#',
    docToLabel: isInvoice ? 'Invoice To:' : 'Quote To:',
    docDateLabel: isInvoice ? 'Invoice Date :' : 'Quote Date :',
    dueDateLabel: isInvoice ? 'Due Date :' : 'Valid Until :',
    customerName:
      customer?.name ??
      (typeof record.customer === 'string' ? record.customer : quote?.manualCustomerName ?? '(deleted customer)'),
    customerAddress: customer?.address ?? '',
    customerEmail: customer?.email ?? quote?.manualCustomerEmail ?? '',
    customerPhone: customer?.phoneNumber ?? '',
    subtotal: money(record.subtotal),
    total: money(record.total),
    amountPaid: money(amountPaid),
    balanceDue: money(balanceDue),
    subject: record.subject ?? '',
    notes: [
      (isInvoice ? businessInfo.invoiceNotesMessage : businessInfo.quoteNotesMessage) || 'Thanks for your business.',
      scheduleText(record),
    ]
      .filter(Boolean)
      .join('\n\n'),
    businessName: businessInfo.name ?? '',
    businessAddress: businessInfo.address ?? '',
    businessTown: businessInfo.town ?? '',
    businessPostcode: businessInfo.postcode ?? '',
    businessTelephone: businessInfo.telephone ?? '',
    businessEmail: businessInfo.email ?? '',
    businessWebsite: businessInfo.website ?? '',
    bankName: businessInfo.bankName ?? '',
    sortCode: businessInfo.sortCode ?? '',
    accountNumber: businessInfo.accountNumber ?? '',
    status: record.status,
  };
}

function substitute(content: string, vars: Record<string, string>): string {
  return content.replace(/\{\{(\w+)\}\}/g, (m, key: string) => vars[key] ?? m);
}

// Belt-and-braces for quote exports: even if the saved template predates quote
// support (literal "Invoice" wording, un-flagged Balance Due / Payment Made
// rows), a quote should never show invoice-only money or invoice wording.
function isInvoiceOnlyMoneyEl(el: PdfTemplateElement): boolean {
  if (el.type !== 'text' && el.type !== 'qrcode') return false;
  return /\{\{\s*(balanceDue|amountPaid)\s*\}\}/.test(el.content);
}
function quotifyWording(s: string): string {
  return s
    .replace(/Invoice date/g, 'Quote date')
    .replace(/Due date/g, 'Valid until')
    .replace(/Invoice Date/gi, 'Quote Date')
    .replace(/Due Date/gi, 'Valid Until')
    .replace(/Invoice#/gi, 'Quote#')
    .replace(/\bInvoices\b/g, 'Quotes')
    .replace(/\bInvoice\b/g, 'Quote');
}
function prepareForKind(template: PdfTemplateElement[], kind: 'invoice' | 'quote'): PdfTemplateElement[] {
  if (kind !== 'quote') return template;
  return template
    .filter((el) => !isInvoiceOnlyMoneyEl(el))
    .map((el) => (el.type === 'text' ? { ...el, content: quotifyWording(el.content) } : el));
}

function isVisible(el: PdfTemplateElement, isPaid: boolean, kind: 'invoice' | 'quote'): boolean {
  if (!el.visibleWhen || el.visibleWhen === 'always') return true;
  if (el.visibleWhen === 'invoice-only') return kind === 'invoice';
  if (el.visibleWhen === 'quote-only') return kind === 'quote';
  return el.visibleWhen === 'paid' ? isPaid : !isPaid;
}

export const TABLE_COLUMNS = [
  { key: 'no', label: '#', ratio: 0.06, align: 'left' as const },
  { key: 'desc', label: 'Item & Description', ratio: 0.46, align: 'left' as const },
  { key: 'qty', label: 'Qty', ratio: 0.12, align: 'right' as const },
  { key: 'price', label: 'Unit Price', ratio: 0.16, align: 'right' as const },
  { key: 'total', label: 'Line Total', ratio: 0.2, align: 'right' as const },
];
const TABLE_HEADER_HEIGHT = 24;
const TABLE_ROW_PADDING = 10;

interface MeasuredRow {
  lines: string[];
  height: number;
  item: Invoice['lineItems'][number];
  index: number;
}

function measureTableRows(doc: jsPDF, lineItems: Invoice['lineItems'], width: number): MeasuredRow[] {
  const descWidth = width * TABLE_COLUMNS[1].ratio - 10;
  setPdfFont(doc, 'body', 'bold');
  doc.setFontSize(9.5);
  return lineItems.map((item, index) => {
    const lines = doc.splitTextToSize(item.description, descWidth) as string[];
    return { lines, height: Math.max(lines.length * 12, 12) + TABLE_ROW_PADDING, item, index };
  });
}

// A rounded blue header bar with small cream capitals, like the booking
// confirmation's header band.
function drawTableHeader(doc: jsPDF, x: number, y: number, width: number) {
  doc.setFillColor(...hexToRgb(BLUE));
  doc.roundedRect(x, y, width, TABLE_HEADER_HEIGHT, 7, 7, 'F');
  setPdfFont(doc, 'body', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...hexToRgb(CREAM));
  let cx = x;
  for (const col of TABLE_COLUMNS) {
    const colWidth = width * col.ratio;
    const tx = col.align === 'right' ? cx + colWidth - 8 : cx + 8;
    doc.text(col.label.toUpperCase(), tx, y + TABLE_HEADER_HEIGHT / 2 + 2.5, { align: col.align, charSpace: 0.6 });
    cx += colWidth;
  }
  doc.setTextColor(...hexToRgb(INK));
}

function drawTableRow(doc: jsPDF, x: number, y: number, width: number, row: MeasuredRow) {
  let cx = x;
  const rowMid = y + row.height / 2;
  for (const col of TABLE_COLUMNS) {
    const colWidth = width * col.ratio;
    const tx = col.align === 'right' ? cx + colWidth - 8 : cx + 8;
    setPdfFont(doc, 'body', col.key === 'desc' || col.key === 'total' ? 'bold' : 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...hexToRgb(col.key === 'no' ? MUTED : INK));
    if (col.key === 'no') {
      doc.text(String(row.index + 1), tx, rowMid + 3, { align: col.align });
    } else if (col.key === 'desc') {
      row.lines.forEach((line, i) => doc.text(line, tx, y + TABLE_ROW_PADDING / 2 + 10 + i * 12, { align: col.align }));
    } else if (col.key === 'qty') {
      doc.text(row.item.quantity.toFixed(2), tx, rowMid + 3, { align: col.align });
    } else if (col.key === 'price') {
      doc.text(`£${money(row.item.unitPrice)}`, tx, rowMid + 3, { align: col.align });
    } else {
      const lineTotal = row.item.quantity * row.item.unitPrice * (1 - (row.item.discountPercent ?? 0) / 100);
      doc.text(`£${money(lineTotal)}`, tx, rowMid + 3, { align: col.align });
    }
    cx += colWidth;
  }
  doc.setDrawColor(...hexToRgb(BORDER));
  doc.setLineWidth(0.75);
  doc.line(x + 4, y + row.height, x + width - 4, y + row.height);
}

/**
 * Draws the item table starting at its template position, breaking to a new
 * page (repeating the header row) if it runs past the bottom margin. Returns
 * the y position immediately after the table finishes, and the page it ended
 * on, so the caller can place any elements the table pushed down.
 */
function drawItemTable(
  doc: jsPDF,
  el: PdfItemTableElement,
  lineItems: Invoice['lineItems'],
): { endY: number; endPage: number } {
  const rows = measureTableRows(doc, lineItems, el.width);
  let y = el.y;
  let page = doc.getCurrentPageInfo().pageNumber;
  drawTableHeader(doc, el.x, y, el.width);
  y += TABLE_HEADER_HEIGHT;
  for (const row of rows) {
    if (y + row.height > PAGE_HEIGHT - BOTTOM_MARGIN) {
      doc.addPage();
      page += 1;
      y = TOP_MARGIN;
      drawTableHeader(doc, el.x, y, el.width);
      y += TABLE_HEADER_HEIGHT;
    }
    drawTableRow(doc, el.x, y, el.width, row);
    y += row.height;
  }
  return { endY: y, endPage: page };
}

function drawText(doc: jsPDF, el: Extract<PdfTemplateElement, { type: 'text' }>, vars: Record<string, string>) {
  const text = substitute(el.content, vars);
  setPdfFont(doc, el.font === 'display' ? 'display' : 'body', el.fontWeight);
  doc.setFontSize(el.fontSize);
  doc.setTextColor(...hexToRgb(el.color));
  const lineHeight = el.fontSize * 1.25;
  const rawLines = text.split('\n');
  const wrapped = rawLines.flatMap((line) => doc.splitTextToSize(line, el.width) as string[]);
  const tx = el.align === 'center' ? el.x + el.width / 2 : el.align === 'right' ? el.x + el.width : el.x;
  wrapped.forEach((line, i) => {
    const opts: { align: 'left' | 'center' | 'right'; angle?: number } = { align: el.align };
    if (el.rotation) opts.angle = el.rotation;
    doc.text(line, tx, el.y + el.fontSize + i * lineHeight, opts);
  });
  doc.setTextColor(...hexToRgb(INK));
}

function drawLine(doc: jsPDF, el: Extract<PdfTemplateElement, { type: 'line' }>) {
  doc.setDrawColor(...hexToRgb(el.strokeColor));
  doc.setLineWidth(el.lineWidth);
  doc.line(el.x, el.y, el.x + el.width, el.y + el.height);
  doc.setLineWidth(1);
}

function drawRect(doc: jsPDF, el: Extract<PdfTemplateElement, { type: 'rect' }>) {
  const hasFill = !!el.fillColor;
  const hasStroke = !!el.strokeColor;
  if (hasFill) doc.setFillColor(...hexToRgb(el.fillColor!));
  if (hasStroke) doc.setDrawColor(...hexToRgb(el.strokeColor!));
  const style = hasFill && hasStroke ? 'FD' : hasFill ? 'F' : 'S';
  const r = Math.min(el.radius ?? 0, el.width / 2, el.height / 2);
  if (r > 0) doc.roundedRect(el.x, el.y, el.width, el.height, r, r, style);
  else doc.rect(el.x, el.y, el.width, el.height, style);
}

function drawImage(doc: jsPDF, el: Extract<PdfTemplateElement, { type: 'image' }>, logo: string | null) {
  if (!logo) return;
  try {
    doc.addImage(logo, 'PNG', el.x, el.y, el.width, el.height);
  } catch {
    // malformed/missing logo data -- skip rather than fail the whole PDF
  }
}

async function qrDataUrl(text: string): Promise<string | null> {
  try {
    return await QRCode.toDataURL(text || ' ', { margin: 0 });
  } catch {
    return null;
  }
}

function drawQr(doc: jsPDF, el: Extract<PdfTemplateElement, { type: 'qrcode' }>, dataUrl: string | null) {
  if (!dataUrl) return;
  try {
    doc.addImage(dataUrl, 'PNG', el.x, el.y, el.width, el.height);
  } catch {
    // ignore
  }
}

export const DEFAULT_INVOICE_TEMPLATE: PdfTemplateElement[] = [
  // Header band: logo in a white circle, title in cream, number in a yellow pill.
  { id: 'header-band', type: 'rect', x: 40, y: 40, width: 515, height: 80, fillColor: BLUE, radius: 10 },
  { id: 'logo-badge', type: 'rect', x: 56, y: 53, width: 54, height: 54, fillColor: '#ffffff', radius: 27 },
  { id: 'logo', type: 'image', x: 61, y: 58, width: 44, height: 44, src: 'logo' },
  { id: 'header-eyebrow', type: 'text', x: 124, y: 55, width: 220, height: 10, content: 'PAWFECT PETS  ·  SHERBORNE', fontSize: 7.5, fontWeight: 'bold', color: CREAM, align: 'left' },
  { id: 'doc-title', type: 'text', x: 124, y: 64, width: 220, height: 28, content: '{{docTypeLabel}}', fontSize: 24, fontWeight: 'normal', color: CREAM, align: 'left', font: 'display' },
  { id: 'header-customer', type: 'text', x: 124, y: 94, width: 220, height: 14, content: 'for {{customerName}}', fontSize: 9, fontWeight: 'italic', color: CREAM, align: 'left' },
  { id: 'doc-number-label', type: 'text', x: 415, y: 62, width: 124, height: 10, content: 'NUMBER', fontSize: 6.5, fontWeight: 'bold', color: CREAM, align: 'right' },
  { id: 'doc-number-pill', type: 'rect', x: 429, y: 74, width: 110, height: 20, fillColor: YELLOW, radius: 10 },
  { id: 'doc-number', type: 'text', x: 429, y: 77, width: 110, height: 14, content: '{{invoiceNumber}}', fontSize: 11, fontWeight: 'normal', color: BLUE, align: 'center', font: 'display' },
  { id: 'paid-pill', type: 'rect', x: 479, y: 99, width: 60, height: 14, fillColor: PINK, radius: 7, visibleWhen: 'paid' },
  { id: 'paid-stamp', type: 'text', x: 479, y: 101, width: 60, height: 10, content: 'PAID', fontSize: 8, fontWeight: 'bold', color: '#ffffff', align: 'center', visibleWhen: 'paid' },
  // Customer and document details, side by side in cream cards.
  { id: 'invoice-to-card', type: 'rect', x: 40, y: 136, width: 250, height: 100, fillColor: CREAM, radius: 9 },
  { id: 'invoice-to-label', type: 'text', x: 54, y: 148, width: 222, height: 16, content: 'Invoice to', fontSize: 12, fontWeight: 'normal', color: BLUE, align: 'left', font: 'display' },
  { id: 'invoice-to-bar', type: 'rect', x: 54, y: 166, width: 24, height: 3, fillColor: YELLOW, radius: 1.5 },
  { id: 'invoice-to-body', type: 'text', x: 54, y: 174, width: 222, height: 54, content: '{{customerName}}\n{{customerAddress}}\n{{customerEmail}}', fontSize: 9.5, fontWeight: 'normal', color: INK, align: 'left' },
  { id: 'details-card', type: 'rect', x: 305, y: 136, width: 250, height: 100, fillColor: CREAM, radius: 9 },
  { id: 'details-label', type: 'text', x: 319, y: 148, width: 222, height: 16, content: 'Invoice details', fontSize: 12, fontWeight: 'normal', color: BLUE, align: 'left', font: 'display' },
  { id: 'details-bar', type: 'rect', x: 319, y: 166, width: 24, height: 3, fillColor: YELLOW, radius: 1.5 },
  { id: 'invoice-date-label', type: 'text', x: 319, y: 176, width: 90, height: 12, content: 'Invoice date', fontSize: 9, fontWeight: 'normal', color: MUTED, align: 'left' },
  { id: 'invoice-date-row', type: 'text', x: 409, y: 175.5, width: 132, height: 12, content: '{{invoiceDate}}', fontSize: 9.5, fontWeight: 'bold', color: INK, align: 'right' },
  { id: 'invoice-date-rule', type: 'line', x: 319, y: 191, width: 222, height: 0, strokeColor: BORDER, lineWidth: 0.75 },
  { id: 'terms-label', type: 'text', x: 319, y: 193, width: 90, height: 12, content: 'Terms', fontSize: 9, fontWeight: 'normal', color: MUTED, align: 'left' },
  { id: 'terms-row', type: 'text', x: 409, y: 192.5, width: 132, height: 12, content: '{{terms}}', fontSize: 9.5, fontWeight: 'bold', color: INK, align: 'right' },
  { id: 'terms-rule', type: 'line', x: 319, y: 208, width: 222, height: 0, strokeColor: BORDER, lineWidth: 0.75 },
  { id: 'due-date-label', type: 'text', x: 319, y: 210, width: 90, height: 12, content: 'Due date', fontSize: 9, fontWeight: 'normal', color: MUTED, align: 'left' },
  { id: 'due-date-row', type: 'text', x: 409, y: 209.5, width: 132, height: 12, content: '{{dueDate}}', fontSize: 9.5, fontWeight: 'bold', color: INK, align: 'right' },
  { id: 'due-date-rule', type: 'line', x: 319, y: 225, width: 222, height: 0, strokeColor: BORDER, lineWidth: 0.75 },
  { id: 'item-table', type: 'itemTable', x: 40, y: 256, width: 515, height: 120 },
  // Notes and bank details down the left; the money summary card on the right.
  { id: 'notes-label', type: 'text', x: 42, y: 396, width: 246, height: 16, content: 'Notes', fontSize: 12, fontWeight: 'normal', color: BLUE, align: 'left', font: 'display' },
  { id: 'notes-bar', type: 'rect', x: 42, y: 414, width: 24, height: 3, fillColor: YELLOW, radius: 1.5 },
  { id: 'notes-body', type: 'text', x: 42, y: 422, width: 246, height: 28, content: '{{notes}}', fontSize: 9, fontWeight: 'normal', color: INK, align: 'left' },
  { id: 'bank-card', type: 'rect', x: 40, y: 466, width: 250, height: 104, fillColor: CREAM, radius: 9 },
  { id: 'bank-label', type: 'text', x: 54, y: 478, width: 222, height: 16, content: 'Pay by bank transfer', fontSize: 12, fontWeight: 'normal', color: BLUE, align: 'left', font: 'display' },
  { id: 'bank-bar', type: 'rect', x: 54, y: 496, width: 24, height: 3, fillColor: YELLOW, radius: 1.5 },
  { id: 'bank-body', type: 'text', x: 54, y: 506, width: 150, height: 40, content: 'Account name: {{businessName}}\nSort code: {{sortCode}}\nAccount no: {{accountNumber}}', fontSize: 9, fontWeight: 'normal', color: INK, align: 'left' },
  { id: 'qr-caption', type: 'text', x: 54, y: 548, width: 150, height: 12, content: 'Or scan the QR code for our details.', fontSize: 7.5, fontWeight: 'normal', color: MUTED, align: 'left' },
  { id: 'qr-code', type: 'qrcode', x: 212, y: 494, width: 64, height: 64, content: '{{bankName}} {{sortCode}} {{accountNumber}}' },
  { id: 'summary-card', type: 'rect', x: 305, y: 396, width: 250, height: 112, fillColor: CREAM, radius: 9, visibleWhen: 'invoice-only' },
  { id: 'summary-card-quote', type: 'rect', x: 305, y: 396, width: 250, height: 80, fillColor: CREAM, radius: 9, visibleWhen: 'quote-only' },
  { id: 'summary-label', type: 'text', x: 319, y: 408, width: 222, height: 16, content: 'Summary', fontSize: 12, fontWeight: 'normal', color: BLUE, align: 'left', font: 'display' },
  { id: 'summary-bar', type: 'rect', x: 319, y: 426, width: 24, height: 3, fillColor: YELLOW, radius: 1.5 },
  { id: 'summary-subtotal-label', type: 'text', x: 319, y: 436, width: 110, height: 12, content: 'Sub total', fontSize: 9, fontWeight: 'normal', color: MUTED, align: 'left' },
  { id: 'summary-subtotal', type: 'text', x: 429, y: 435.5, width: 112, height: 12, content: '£{{subtotal}}', fontSize: 9.5, fontWeight: 'bold', color: INK, align: 'right' },
  { id: 'summary-subtotal-rule', type: 'line', x: 319, y: 451, width: 222, height: 0, strokeColor: BORDER, lineWidth: 0.75 },
  { id: 'summary-total-label', type: 'text', x: 319, y: 453, width: 110, height: 12, content: 'Total', fontSize: 9, fontWeight: 'normal', color: MUTED, align: 'left' },
  { id: 'summary-total', type: 'text', x: 429, y: 452.5, width: 112, height: 12, content: '£{{total}}', fontSize: 9.5, fontWeight: 'bold', color: INK, align: 'right' },
  { id: 'summary-total-rule', type: 'line', x: 319, y: 468, width: 222, height: 0, strokeColor: BORDER, lineWidth: 0.75 },
  { id: 'summary-paid-label', type: 'text', x: 319, y: 470, width: 110, height: 12, content: 'Payments received', fontSize: 9, fontWeight: 'normal', color: MUTED, align: 'left', visibleWhen: 'invoice-only' },
  { id: 'summary-paid', type: 'text', x: 429, y: 469.5, width: 112, height: 12, content: '£{{amountPaid}}', fontSize: 9.5, fontWeight: 'bold', color: INK, align: 'right', visibleWhen: 'invoice-only' },
  { id: 'summary-paid-rule', type: 'line', x: 319, y: 485, width: 222, height: 0, strokeColor: BORDER, lineWidth: 0.75, visibleWhen: 'invoice-only' },
  { id: 'summary-balance-label', type: 'text', x: 319, y: 488, width: 110, height: 12, content: 'Balance due', fontSize: 9, fontWeight: 'normal', color: MUTED, align: 'left', visibleWhen: 'invoice-only' },
  { id: 'summary-box', type: 'rect', x: 471, y: 485, width: 70, height: 16, fillColor: PINK, radius: 8, visibleWhen: 'invoice-only' },
  { id: 'summary-balance', type: 'text', x: 471, y: 487.5, width: 70, height: 12, content: '£{{balanceDue}}', fontSize: 9.5, fontWeight: 'bold', color: '#ffffff', align: 'center', visibleWhen: 'invoice-only' },
  // Sign-off band, as on the booking confirmation.
  { id: 'contact-band', type: 'rect', x: 40, y: 590, width: 515, height: 30, fillColor: PINK, radius: 9 },
  { id: 'contact-heading', type: 'text', x: 56, y: 596, width: 483, height: 14, content: 'Questions? Just get in touch', fontSize: 10, fontWeight: 'bold', color: '#ffffff', align: 'left' },
  { id: 'contact-details', type: 'text', x: 56, y: 597.5, width: 483, height: 12, content: '{{businessTelephone}}  ·  {{businessEmail}}', fontSize: 8.5, fontWeight: 'normal', color: '#ffffff', align: 'right' },
];

/**
 * True for a template saved before the restyle: it has none of the new
 * layout's header band and still uses the old green palette. Those are
 * superseded by the branded default, so every invoice and quote comes out in
 * the restyled look (and the Settings editor opens the default in their place).
 */
export function isPreRestyleTemplate(template: PdfTemplateElement[]): boolean {
  if (template.some((el) => el.id === 'header-band')) return false;
  return template.some((el) => {
    const colours = [
      el.type === 'text' ? el.color : undefined,
      el.type === 'line' ? el.strokeColor : undefined,
      el.type === 'rect' ? el.fillColor : undefined,
      el.type === 'rect' ? el.strokeColor : undefined,
    ];
    return colours.some((c) => !!c && c.toLowerCase() in LEGACY_COLOURS);
  });
}

function rangesOverlap(a1: number, a2: number, b1: number, b2: number): boolean {
  return a1 < b2 && b1 < a2;
}

function measureTextNaturalHeight(
  doc: jsPDF,
  el: Extract<PdfTemplateElement, { type: 'text' }>,
  vars: Record<string, string>,
): number {
  const text = substitute(el.content, vars);
  setPdfFont(doc, el.font === 'display' ? 'display' : 'body', el.fontWeight);
  doc.setFontSize(el.fontSize);
  const lineHeight = el.fontSize * 1.25;
  const wrapped = text.split('\n').flatMap((line) => doc.splitTextToSize(line, el.width) as string[]);
  return wrapped.length * lineHeight;
}

interface LayoutResolution {
  y: Map<string, number>;
  naturalHeight: Map<string, number>;
}

/**
 * Resolves each element's actual draw position. Content that grows past its
 * configured height -- a long address, an item table with many rows -- pushes
 * down anything positioned below it in the same horizontal lane; elements
 * side by side (e.g. "Invoice To" and the date block, which share a y range
 * but sit in different x ranges) don't affect each other, only elements
 * genuinely stacked underneath one that grew. Processed top-to-bottom so
 * growth cascades: if A pushes B down and B also grows, C (below B) is
 * pushed by both.
 */
function resolveLayout(
  doc: jsPDF,
  elements: PdfTemplateElement[],
  lineItems: Invoice['lineItems'],
  vars: Record<string, string>,
): LayoutResolution {
  const sorted = [...elements].sort((a, b) => a.y - b.y);
  const y = new Map<string, number>();
  const naturalHeight = new Map<string, number>();
  const zones: { x1: number; x2: number; shift: number }[] = [];

  for (const el of sorted) {
    let shift = 0;
    for (const zone of zones) {
      if (rangesOverlap(el.x, el.x + el.width, zone.x1, zone.x2)) shift = Math.max(shift, zone.shift);
    }
    const effectiveY = el.y + shift;
    y.set(el.id, effectiveY);

    let natural = el.height;
    if (el.type === 'text') {
      natural = Math.max(el.height, measureTextNaturalHeight(doc, el, vars));
    } else if (el.type === 'itemTable') {
      const rows = measureTableRows(doc, lineItems, el.width);
      natural = Math.max(el.height, TABLE_HEADER_HEIGHT + rows.reduce((sum, r) => sum + r.height, 0));
    } else if (el.type === 'visitTable') {
      natural = Math.max(el.height, VISIT_TITLE_H + el.rows.length * VISIT_ROW_H);
    }
    naturalHeight.set(el.id, natural);

    if (natural > el.height) {
      zones.push({ x1: el.x, x2: el.x + el.width, shift: shift + (natural - el.height) });
    }
  }
  // A card (rect) behind text that grew -- e.g. the "Quote to" card around a
  // long address plus email -- grows with it, as do the other cards in its
  // row (same top and height) so the pair stays level.
  const growth = new Map<string, number>();
  for (const rect of elements) {
    if (rect.type !== 'rect') continue;
    let grownBy = 0;
    for (const el of elements) {
      if (el.type !== 'text') continue;
      const inside =
        el.x >= rect.x &&
        el.x + el.width <= rect.x + rect.width &&
        el.y >= rect.y &&
        el.y + el.height <= rect.y + rect.height;
      if (inside) grownBy = Math.max(grownBy, naturalHeight.get(el.id)! - el.height);
    }
    if (grownBy > 0) growth.set(rect.id, grownBy);
  }
  for (const [id, grownBy] of [...growth]) {
    const card = elements.find((el) => el.id === id)!;
    for (const el of elements) {
      if (el.type === 'rect' && el.y === card.y && el.height === card.height) {
        growth.set(el.id, Math.max(growth.get(el.id) ?? 0, grownBy));
      }
    }
  }
  for (const [id, grownBy] of growth) {
    const card = elements.find((el) => el.id === id)!;
    naturalHeight.set(id, card.height + grownBy);
  }
  return { y, naturalHeight };
}

/**
 * Renders an Invoice or Quote as a PDF, using the staff-designed template
 * from Settings > Invoices (BusinessInfo.invoicePdfTemplate) if one's been
 * saved, else DEFAULT_INVOICE_TEMPLATE. Every element's real draw position
 * comes from resolveLayout() above -- content that overflows its configured
 * box pushes lane-mates below it down, cascading through the rest of the
 * page. Anything that still doesn't fit above the bottom margin (most
 * commonly the item table itself, for an invoice with many line items) moves
 * to a fresh page, offset so the first pushed element lands at the top
 * margin; the item table additionally paginates its own rows internally,
 * repeating the header row on each continuation page.
 */

// Draws the injected schedule mini table (see injectVisitSchedule): a bold
// title, then bordered label/value rows mirroring the on-screen
// ScheduleTable component. Used for all three of Visits/Day Care/Boarding.
const VISIT_TITLE_H = 14;
const VISIT_ROW_H = 18;
const VISIT_LABEL_W = 70;
function drawVisitTable(doc: jsPDF, el: PdfVisitTableElement): void {
  setPdfFont(doc, 'body', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...hexToRgb(BLUE));
  doc.text(el.title, el.x, el.y + 9);
  const tableY = el.y + VISIT_TITLE_H;
  doc.setDrawColor(...hexToRgb(BORDER));
  doc.setLineWidth(0.75);
  el.rows.forEach(([label, value], i) => {
    const ry = tableY + i * VISIT_ROW_H;
    setPdfFont(doc, 'body', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...hexToRgb(MUTED));
    doc.text(label, el.x, ry + 12);
    setPdfFont(doc, 'body', 'bold');
    doc.setTextColor(...hexToRgb(INK));
    doc.text(value, el.x + VISIT_LABEL_W, ry + 12);
    doc.line(el.x, ry + VISIT_ROW_H, el.x + el.width, ry + VISIT_ROW_H);
  });
}

// Saved templates can carry a literal notes message instead of the {{notes}}
// token (the token path appends the schedule into the message itself) -- for
// those, inject the schedule as its own text element just below the notes
// body (or the lowest text element), and let the layout resolver reflow
// anything underneath it.
function injectVisitSchedule(template: PdfTemplateElement[], record: Invoice | Quote): PdfTemplateElement[] {
  const schedule = scheduleFor(record);
  if (!schedule) return template;
  if (template.some((el) => el.type === 'text' && el.content.includes('{{notes}}'))) return template;
  const texts = template
    .filter((el): el is Extract<PdfTemplateElement, { type: 'text' }> => el.type === 'text')
    .sort((a, b) => a.y - b.y);
  const anchor = texts.find((el) => el.id === 'notes-body') ?? texts[texts.length - 1];
  if (!anchor) return template;
  return [
    ...template,
    {
      id: 'visit-schedule',
      type: 'visitTable',
      x: anchor.x,
      y: anchor.y + anchor.height + 8,
      width: 280,
      // Deliberately smaller than the drawn size -- the layout resolver's
      // natural-height overflow is what pushes everything below down.
      height: 12,
      title: schedule.title,
      rows: schedule.rows,
    },
  ];
}

/**
 * Renders an invoice/quote PDF. Pass `appendTo` to draw it onto fresh pages at
 * the end of an existing A4 document instead (the Booking Confirmation PDF
 * ends with the booking's invoice this way).
 */
export async function buildInvoicePdf(
  record: Invoice | Quote,
  kind: 'invoice' | 'quote',
  businessInfo: BusinessInfo,
  appendTo?: jsPDF,
): Promise<jsPDF> {
  const doc = appendTo ?? new jsPDF({ unit: 'pt', format: 'a4' });
  if (appendTo) doc.addPage('a4', 'portrait');
  await registerBrandFonts(doc);
  const saved = (businessInfo.invoicePdfTemplate ?? []) as unknown as PdfTemplateElement[];
  const rawTemplate =
    saved.length && !isPreRestyleTemplate(saved) ? saved : DEFAULT_INVOICE_TEMPLATE;
  const template = injectVisitSchedule(prepareForKind(rawTemplate, kind), record);
  const vars = buildPdfVars(record, kind, businessInfo);
  const isPaid = kind === 'invoice' && record.status === 'paid';
  const visibleElements = template.filter((el) => isVisible(el, isPaid, kind));

  const logo = await loadLogoDataUrl();
  const qrElements = visibleElements.filter((el): el is Extract<PdfTemplateElement, { type: 'qrcode' }> => el.type === 'qrcode');
  const qrDataUrls = new Map<string, string | null>(
    await Promise.all(qrElements.map(async (el) => [el.id, await qrDataUrl(substitute(el.content, vars))] as const)),
  );

  const draw = (el: PdfTemplateElement) => {
    if (el.type === 'text') drawText(doc, el, vars);
    else if (el.type === 'line') drawLine(doc, el);
    else if (el.type === 'rect') drawRect(doc, el);
    else if (el.type === 'image') drawImage(doc, el, logo);
    else if (el.type === 'qrcode') drawQr(doc, el, qrDataUrls.get(el.id) ?? null);
    else if (el.type === 'visitTable') drawVisitTable(doc, el);
  };

  const bottomLimit = PAGE_HEIGHT - BOTTOM_MARGIN;
  const tableEl = visibleElements.find((el): el is PdfItemTableElement => el.type === 'itemTable');
  const layout = resolveLayout(doc, visibleElements, record.lineItems, vars);
  // Cards are drawn at their resolved height, so one grown to fit its text
  // still encloses it.
  const resolved = visibleElements.map((el) => {
    const naturalHeight = layout.naturalHeight.get(el.id)!;
    return {
      el: el.type === 'rect' ? { ...el, height: naturalHeight } : el,
      y: layout.y.get(el.id)!,
      naturalHeight,
    };
  });
  const fits = (r: (typeof resolved)[number]) => r.y + r.naturalHeight <= bottomLimit;

  for (const r of resolved) {
    if (r.el === tableEl) continue; // drawn separately below -- paginates its own rows
    if (fits(r)) draw({ ...r.el, y: r.y } as PdfTemplateElement);
  }

  if (tableEl) {
    const tableY = layout.y.get(tableEl.id)!;
    if (tableY > bottomLimit) doc.addPage();
    drawItemTable(doc, { ...tableEl, y: tableY > bottomLimit ? TOP_MARGIN : tableY }, record.lineItems);
  }

  const overflowing = resolved.filter((r) => r.el !== tableEl && !fits(r));
  if (overflowing.length > 0) {
    doc.addPage();
    const minY = Math.min(...overflowing.map((r) => r.y));
    const pageOffset = TOP_MARGIN - minY;
    for (const r of overflowing) draw({ ...r.el, y: r.y + pageOffset } as PdfTemplateElement);
  }

  return doc;
}

export function elementTypeLabel(type: PdfElementType): string {
  switch (type) {
    case 'text':
      return 'Text';
    case 'image':
      return 'Logo image';
    case 'line':
      return 'Line';
    case 'rect':
      return 'Rectangle';
    case 'qrcode':
      return 'QR code';
    case 'itemTable':
      return 'Item table';
    // Render-time only (injected by injectVisitSchedule) -- never appears in
    // the Settings template editor's palette.
    case 'visitTable':
      return 'Visit schedule';
  }
}

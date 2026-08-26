import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import logoUrl from '../assets/logo.png';
import type {
  BusinessInfo,
  CustomerRef,
  Invoice,
  PdfElementType,
  PdfItemTableElement,
  PdfTemplateElement,
  Quote,
} from '../types';

export const PAGE_WIDTH = 595.28; // A4, points -- same as customerFormPdf.ts
export const PAGE_HEIGHT = 841.89;
const TOP_MARGIN = 40;
const BOTTOM_MARGIN = 40;

// Brand palette -- kept in sync by hand with admin/src/index.css, same
// approach (and same lack of a shared token source) as customerFormPdf.ts.
const INK = '#232c26';
const BORDER = '#e3e8de';

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
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
    notes: (isInvoice ? businessInfo.invoiceNotesMessage : businessInfo.quoteNotesMessage) || 'Thanks for your business.',
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

function isVisible(el: PdfTemplateElement, isPaid: boolean, kind: 'invoice' | 'quote'): boolean {
  if (!el.visibleWhen || el.visibleWhen === 'always') return true;
  if (el.visibleWhen === 'invoice-only') return kind === 'invoice';
  if (el.visibleWhen === 'quote-only') return kind === 'quote';
  return el.visibleWhen === 'paid' ? isPaid : !isPaid;
}

const TABLE_COLUMNS = [
  { key: 'no', label: '#', ratio: 0.06, align: 'left' as const },
  { key: 'desc', label: 'Item & Description', ratio: 0.46, align: 'left' as const },
  { key: 'qty', label: 'Qty', ratio: 0.12, align: 'right' as const },
  { key: 'price', label: 'Unit Price', ratio: 0.16, align: 'right' as const },
  { key: 'total', label: 'Line Total', ratio: 0.2, align: 'right' as const },
];
const TABLE_HEADER_HEIGHT = 22;
const TABLE_ROW_PADDING = 8;

interface MeasuredRow {
  lines: string[];
  height: number;
  item: Invoice['lineItems'][number];
  index: number;
}

function measureTableRows(doc: jsPDF, lineItems: Invoice['lineItems'], width: number): MeasuredRow[] {
  const descWidth = width * TABLE_COLUMNS[1].ratio - 10;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  return lineItems.map((item, index) => {
    const lines = doc.splitTextToSize(item.description, descWidth) as string[];
    return { lines, height: Math.max(lines.length * 12, 12) + TABLE_ROW_PADDING, item, index };
  });
}

function drawTableHeader(doc: jsPDF, x: number, y: number, width: number) {
  doc.setFillColor(35, 44, 38);
  doc.rect(x, y, width, TABLE_HEADER_HEIGHT, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  let cx = x;
  for (const col of TABLE_COLUMNS) {
    const colWidth = width * col.ratio;
    const tx = col.align === 'right' ? cx + colWidth - 6 : cx + 6;
    doc.text(col.label, tx, y + TABLE_HEADER_HEIGHT / 2 + 3, { align: col.align });
    cx += colWidth;
  }
  doc.setTextColor(...hexToRgb(INK));
}

function drawTableRow(doc: jsPDF, x: number, y: number, width: number, row: MeasuredRow) {
  let cx = x;
  const rowMid = y + row.height / 2;
  for (const col of TABLE_COLUMNS) {
    const colWidth = width * col.ratio;
    const tx = col.align === 'right' ? cx + colWidth - 6 : cx + 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...hexToRgb(INK));
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
  doc.setLineWidth(0.5);
  doc.line(x, y + row.height, x + width, y + row.height);
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
  doc.setFont('helvetica', el.fontWeight === 'bold' ? 'bold' : 'normal');
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
  doc.rect(el.x, el.y, el.width, el.height, style);
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
  { id: 'logo', type: 'image', x: 40, y: 30, width: 50, height: 50, src: 'logo' },
  {
    id: 'business-name',
    type: 'text',
    x: 100,
    y: 38,
    width: 220,
    height: 20,
    content: '{{businessName}}',
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1f3b2c',
    align: 'left',
  },
  {
    id: 'business-address',
    type: 'text',
    x: 100,
    y: 58,
    width: 220,
    height: 70,
    content: '{{businessAddress}}\n{{businessTown}} {{businessPostcode}}\n{{businessTelephone}}\n{{businessEmail}}\n{{businessWebsite}}',
    fontSize: 8.5,
    fontWeight: 'normal',
    color: '#6f7d72',
    align: 'left',
  },
  {
    id: 'doc-title',
    type: 'text',
    x: 350,
    y: 40,
    width: 205,
    height: 30,
    content: '{{docTypeLabel}}',
    fontSize: 24,
    fontWeight: 'bold',
    color: '#232c26',
    align: 'right',
  },
  {
    id: 'doc-number',
    type: 'text',
    x: 350,
    y: 72,
    width: 205,
    height: 16,
    content: '{{docNumberLabel}} {{invoiceNumber}}',
    fontSize: 9.5,
    fontWeight: 'normal',
    color: '#232c26',
    align: 'right',
  },
  {
    id: 'balance-due-top',
    type: 'text',
    x: 350,
    y: 92,
    width: 205,
    height: 30,
    content: 'Balance Due\n£{{balanceDue}}',
    fontSize: 10,
    fontWeight: 'bold',
    color: '#232c26',
    align: 'right',
    visibleWhen: 'invoice-only',
  },
  {
    id: 'paid-stamp',
    type: 'text',
    x: 0,
    y: 90,
    width: 140,
    height: 30,
    content: 'PAID',
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1f3b2c',
    align: 'center',
    rotation: 35,
    visibleWhen: 'paid',
  },
  {
    id: 'header-divider',
    type: 'line',
    x: 40,
    y: 140,
    width: 515,
    height: 0,
    strokeColor: '#e3e8de',
    lineWidth: 1,
  },
  {
    id: 'invoice-to-label',
    type: 'text',
    x: 40,
    y: 156,
    width: 250,
    height: 14,
    content: '{{docToLabel}}',
    fontSize: 8.5,
    fontWeight: 'bold',
    color: '#6f7d72',
    align: 'left',
  },
  {
    id: 'invoice-to-body',
    type: 'text',
    x: 40,
    y: 172,
    width: 260,
    height: 60,
    content: '{{customerName}}\n{{customerAddress}}',
    fontSize: 9.5,
    fontWeight: 'normal',
    color: '#232c26',
    align: 'left',
  },
  {
    id: 'invoice-date-row',
    type: 'text',
    x: 350,
    y: 156,
    width: 205,
    height: 14,
    content: '{{docDateLabel}}   {{invoiceDate}}',
    fontSize: 9,
    fontWeight: 'normal',
    color: '#232c26',
    align: 'right',
  },
  {
    id: 'terms-row',
    type: 'text',
    x: 350,
    y: 172,
    width: 205,
    height: 14,
    content: 'Terms :   {{terms}}',
    fontSize: 9,
    fontWeight: 'normal',
    color: '#232c26',
    align: 'right',
  },
  {
    id: 'due-date-row',
    type: 'text',
    x: 350,
    y: 188,
    width: 205,
    height: 14,
    content: '{{dueDateLabel}}   {{dueDate}}',
    fontSize: 9,
    fontWeight: 'normal',
    color: '#232c26',
    align: 'right',
  },
  { id: 'item-table', type: 'itemTable', x: 40, y: 230, width: 515, height: 140 },
  {
    id: 'summary-subtotal',
    type: 'text',
    x: 350,
    y: 390,
    width: 205,
    height: 14,
    content: 'Sub Total   £{{subtotal}}',
    fontSize: 9.5,
    fontWeight: 'normal',
    color: '#232c26',
    align: 'right',
  },
  {
    id: 'summary-total',
    type: 'text',
    x: 350,
    y: 406,
    width: 205,
    height: 16,
    content: 'Total   £{{total}}',
    fontSize: 11,
    fontWeight: 'bold',
    color: '#232c26',
    align: 'right',
  },
  {
    id: 'summary-paid',
    type: 'text',
    x: 350,
    y: 424,
    width: 205,
    height: 14,
    content: 'Payment Made   (-) £{{amountPaid}}',
    fontSize: 9.5,
    fontWeight: 'normal',
    color: '#c85a4a',
    align: 'right',
    visibleWhen: 'invoice-only',
  },
  {
    id: 'summary-box',
    type: 'rect',
    x: 340,
    y: 440,
    width: 215,
    height: 26,
    fillColor: '#f3f6ee',
    visibleWhen: 'invoice-only',
  },
  {
    id: 'summary-balance',
    type: 'text',
    x: 350,
    y: 448,
    width: 195,
    height: 16,
    content: 'Balance Due   £{{balanceDue}}',
    fontSize: 10.5,
    fontWeight: 'bold',
    color: '#232c26',
    align: 'right',
    visibleWhen: 'invoice-only',
  },
  {
    id: 'notes-label',
    type: 'text',
    x: 40,
    y: 480,
    width: 300,
    height: 14,
    content: 'Notes',
    fontSize: 9,
    fontWeight: 'bold',
    color: '#232c26',
    align: 'left',
  },
  {
    id: 'notes-body',
    type: 'text',
    x: 40,
    y: 494,
    width: 300,
    height: 20,
    content: '{{notes}}',
    fontSize: 9,
    fontWeight: 'normal',
    color: '#6f7d72',
    align: 'left',
  },
  {
    id: 'bank-label',
    type: 'text',
    x: 40,
    y: 528,
    width: 300,
    height: 14,
    content: 'BANK Transfer Details',
    fontSize: 10,
    fontWeight: 'bold',
    color: '#232c26',
    align: 'left',
  },
  {
    id: 'bank-body',
    type: 'text',
    x: 40,
    y: 544,
    width: 320,
    height: 50,
    content: 'Account Name :   {{businessName}}\nAccount Sort Code :   {{sortCode}}\nAccount Number :   {{accountNumber}}',
    fontSize: 9,
    fontWeight: 'normal',
    color: '#232c26',
    align: 'left',
  },
  { id: 'qr-code', type: 'qrcode', x: 40, y: 610, width: 64, height: 64, content: '{{bankName}} {{sortCode}} {{accountNumber}}' },
  {
    id: 'qr-caption',
    type: 'text',
    x: 114,
    y: 620,
    width: 220,
    height: 40,
    content: 'Scan the QR code to view the configured information.',
    fontSize: 8,
    fontWeight: 'normal',
    color: '#6f7d72',
    align: 'left',
  },
];

function rangesOverlap(a1: number, a2: number, b1: number, b2: number): boolean {
  return a1 < b2 && b1 < a2;
}

function measureTextNaturalHeight(
  doc: jsPDF,
  el: Extract<PdfTemplateElement, { type: 'text' }>,
  vars: Record<string, string>,
): number {
  const text = substitute(el.content, vars);
  doc.setFont('helvetica', el.fontWeight === 'bold' ? 'bold' : 'normal');
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
    }
    naturalHeight.set(el.id, natural);

    if (natural > el.height) {
      zones.push({ x1: el.x, x2: el.x + el.width, shift: shift + (natural - el.height) });
    }
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
export async function buildInvoicePdf(
  record: Invoice | Quote,
  kind: 'invoice' | 'quote',
  businessInfo: BusinessInfo,
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const template = businessInfo.invoicePdfTemplate?.length
    ? (businessInfo.invoicePdfTemplate as unknown as PdfTemplateElement[])
    : DEFAULT_INVOICE_TEMPLATE;
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
  };

  const bottomLimit = PAGE_HEIGHT - BOTTOM_MARGIN;
  const tableEl = visibleElements.find((el): el is PdfItemTableElement => el.type === 'itemTable');
  const layout = resolveLayout(doc, visibleElements, record.lineItems, vars);
  const resolved = visibleElements.map((el) => ({
    el,
    y: layout.y.get(el.id)!,
    naturalHeight: layout.naturalHeight.get(el.id)!,
  }));
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
  }
}

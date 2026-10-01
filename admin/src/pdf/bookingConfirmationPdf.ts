import { jsPDF } from 'jspdf';
import logoUrl from '../assets/logo.png';
import type { BoardingBooking, Invoice } from '../types';

const MARGIN = 40;
const PAGE_WIDTH = 595.28; // A4, points -- same as the other PDF builders
const PAGE_HEIGHT = 841.89;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const HEADER_HEIGHT = 74;

// Brand palette -- kept in sync by hand with admin/src/index.css and the
// other PDF builders (no shared token source between them, same as those).
const GREEN: [number, number, number] = [31, 59, 44]; // --brand-green
const ACCENT: [number, number, number] = [232, 150, 60]; // --accent
const MUTED: [number, number, number] = [111, 125, 114]; // --muted
const BORDER: [number, number, number] = [227, 232, 222]; // --border
const INK: [number, number, number] = [35, 44, 38]; // --ink

interface Block {
  height: number;
  draw: (doc: jsPDF, y: number) => void;
}

const FIELD_LABEL_WIDTH = 170;

function fieldBlock(doc: jsPDF, label: string, value: string): Block {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const lines = doc.splitTextToSize(value || '—', CONTENT_WIDTH - FIELD_LABEL_WIDTH) as string[];
  const height = lines.length * 13 + 6;
  return {
    height,
    draw(doc, y) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...MUTED);
      doc.text(label.toUpperCase(), MARGIN, y);
      doc.setTextColor(...INK);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      lines.forEach((line, i) => doc.text(line, MARGIN + FIELD_LABEL_WIDTH, y + i * 13));
    },
  };
}

function paragraphBlock(doc: jsPDF, text: string): Block {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const lines = doc.splitTextToSize(text, CONTENT_WIDTH) as string[];
  const height = lines.length * 14;
  return {
    height,
    draw(doc, y) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(...INK);
      lines.forEach((line, i) => doc.text(line, MARGIN, y + i * 14));
    },
  };
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

// Same PdfWriter shape as receiptPdf.ts/checklistPdf.ts/etc -- duplicated
// rather than shared, matching this codebase's existing convention of each
// PDF builder keeping its own private copy (see those files' own header
// comments on the brand palette).
class PdfWriter {
  doc = new jsPDF({ unit: 'pt', format: 'a4' });
  y = MARGIN;

  drawHeader(logo: string | null, subtitle: string) {
    const doc = this.doc;
    doc.setFillColor(...GREEN);
    doc.rect(0, 0, PAGE_WIDTH, HEADER_HEIGHT, 'F');

    const badgeCx = MARGIN + 17;
    const badgeCy = HEADER_HEIGHT / 2;
    doc.setFillColor(255, 255, 255);
    doc.circle(badgeCx, badgeCy, 19, 'F');
    if (logo) {
      try {
        doc.addImage(logo, 'PNG', badgeCx - 14, badgeCy - 14, 28, 28);
      } catch {
        // ignore malformed logo data
      }
    }

    doc.setFont('times', 'bold');
    doc.setFontSize(19);
    doc.setTextColor(255, 255, 255);
    doc.text('PawfectPets Sherborne', MARGIN + 46, badgeCy - 3);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(224, 233, 226);
    const wrapped = doc.splitTextToSize(subtitle, PAGE_WIDTH - MARGIN * 2 - 46) as string[];
    doc.text(wrapped[0] ?? '', MARGIN + 46, badgeCy + 14);

    doc.setTextColor(...INK);
    this.y = HEADER_HEIGHT + 26;
  }

  section(title: string, blocks: Block[]) {
    const doc = this.doc;
    this.y += 10;
    doc.setFont('times', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...GREEN);
    doc.text(title, MARGIN, this.y);
    doc.setTextColor(...INK);
    this.y += 7;
    doc.setDrawColor(...ACCENT);
    doc.setLineWidth(1.6);
    doc.line(MARGIN, this.y, MARGIN + 46, this.y);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.75);
    doc.line(MARGIN + 46, this.y, PAGE_WIDTH - MARGIN, this.y);
    doc.setLineWidth(1);
    this.y += 16;

    for (const block of blocks) {
      block.draw(doc, this.y);
      this.y += block.height;
    }
  }

  finish(generatedNote: string) {
    this.doc.setDrawColor(...BORDER);
    this.doc.setLineWidth(0.75);
    this.doc.line(MARGIN, PAGE_HEIGHT - MARGIN - 16, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - MARGIN - 16);
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(8);
    this.doc.setTextColor(...MUTED);
    this.doc.text(generatedNote, MARGIN, PAGE_HEIGHT - MARGIN - 4);
    this.doc.setTextColor(...INK);
  }
}

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

/** Renders a boarding/day care booking as a branded, customer-facing confirmation PDF. */
export async function buildBookingConfirmationPdf(booking: BoardingBooking, invoice: Invoice | null): Promise<jsPDF> {
  const logo = await loadLogoDataUrl();
  const w = new PdfWriter();
  const doc = w.doc;
  const now = new Date();

  w.drawHeader(logo, `Booking confirmation for ${customerName(booking.customer)}`);

  const detailBlocks: Block[] = [
    fieldBlock(doc, 'Reference', booking.reference),
    fieldBlock(doc, 'Customer', customerName(booking.customer)),
    fieldBlock(doc, booking.animals.length > 1 ? 'Pets' : 'Pet', petNames(booking.animals)),
    fieldBlock(doc, 'Type', booking.type === 'boarding' ? 'Boarding' : 'Day Care'),
    fieldBlock(doc, 'Drop off', formatDateTime(booking.startDate, booking.dropOffTime)),
    fieldBlock(doc, 'Pick up', formatDateTime(booking.endDate, booking.pickUpTime)),
  ];
  if (booking.notes) {
    detailBlocks.push(fieldBlock(doc, 'Notes', booking.notes));
  }
  w.section('Booking details', detailBlocks);

  const balanceDue = invoice ? invoice.total - (invoice.amountPaid ?? 0) : 0;
  const paymentBlocks: Block[] = invoice
    ? [
        fieldBlock(doc, 'Invoice', invoice.invoiceNumber),
        fieldBlock(doc, 'Total', `£${invoice.total.toFixed(2)}`),
        fieldBlock(
          doc,
          balanceDue > 0 ? 'Balance due' : 'Status',
          balanceDue > 0 ? `£${balanceDue.toFixed(2)}` : 'Paid in full',
        ),
      ]
    : [fieldBlock(doc, 'Status', 'Not yet invoiced')];
  w.section('Payment', paymentBlocks);

  w.section('Thank you', [
    paragraphBlock(
      doc,
      "We're looking forward to looking after your pet. If anything about this booking needs to change, just get in touch and we'll sort it out.",
    ),
  ]);

  w.finish(`Generated ${now.toLocaleDateString('en-GB')} · PawfectPets Sherborne`);
  return w.doc;
}

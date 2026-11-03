import type { jsPDF } from 'jspdf';
import {
  BLUE,
  BODY,
  BrandPdfWriter,
  DISPLAY,
  INK,
  INNER_X,
  MUTED,
  PINK,
  RULE,
  loadContactLine,
  setFont,
  type Block,
} from './brandPdf';
import type { BoardingBookingWithStatus } from '../types';

// Bookings > Check In / Check Out > Export: the bookings in a date range (or
// all of them) as a landscape table in the branded style -- the same columns
// as the on-screen table, with who recorded each check-in/out underneath.

export interface CheckInOutReportExport {
  rows: BoardingBookingWithStatus[];
  /** 'DD/MM/YYYY – DD/MM/YYYY', or 'All dates'. */
  periodLabel: string;
}

type Booking = BoardingBookingWithStatus['booking'];

function customerName(customer: Booking['customer']): string {
  return typeof customer === 'string' ? customer : customer?.name ?? '';
}
function dogNames(animals: Booking['animals']): string {
  return animals.map((a) => (typeof a === 'string' ? a : a.name)).join(', ');
}
function scheduledDay(date: string): string {
  return new Date(date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
function stamp(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Whether a stay overlaps the inclusive yyyy-mm-dd range; open ends match everything. */
export function stayInRange(booking: Booking, from: string, to: string): boolean {
  const start = booking.startDate.slice(0, 10);
  const end = booking.endDate.slice(0, 10);
  return (!to || start <= to) && (!from || end >= from);
}

export function checkInOutReportFileName(periodLabel: string): string {
  return `Check In - Check Out Report - ${periodLabel}`.replace(/[/\\:]/g, '-') + '.pdf';
}

// --- layout ---------------------------------------------------------------------

const FONT = 8.5;
const SUB_FONT = 7.5;
const LEADING = 10.5;
const ROW_PAD = 6;
const GAP = 8;

interface Col {
  key: 'reference' | 'customer' | 'dogs' | 'type' | 'dropOff' | 'checkIn' | 'pickUp' | 'checkOut';
  label: string;
  w: number;
}
// Widths in points, summed with GAP between them to the landscape card's
// inner width (~734pt); laid out left to right from INNER_X.
const COL_DEFS: Col[] = [
  { key: 'reference', label: 'Reference', w: 62 },
  { key: 'customer', label: 'Customer', w: 108 },
  { key: 'dogs', label: 'Dog(s)', w: 92 },
  { key: 'type', label: 'Type', w: 50 },
  { key: 'dropOff', label: 'Drop off', w: 82 },
  { key: 'checkIn', label: 'Checked in', w: 112 },
  { key: 'pickUp', label: 'Pick up', w: 82 },
  { key: 'checkOut', label: 'Checked out', w: 112 },
];

function columnsFor(innerWidth: number): (Col & { x: number })[] {
  // Any slack (or shortfall) goes to the name columns, so the table always
  // spans the card exactly.
  const used = COL_DEFS.reduce((s, c) => s + c.w, 0) + GAP * (COL_DEFS.length - 1);
  const extra = (innerWidth - used) / 2;
  let x = INNER_X;
  return COL_DEFS.map((c) => {
    const w = c.key === 'customer' || c.key === 'dogs' ? c.w + extra : c.w;
    const col = { ...c, w, x };
    x += w + GAP;
    return col;
  });
}

interface Line {
  text: string;
  style: 'normal' | 'bold' | 'italic';
  size: number;
  color: [number, number, number];
}

function wrap(doc: jsPDF, text: string, style: Line['style'], size: number, width: number, color: Line['color']): Line[] {
  if (!text) return [];
  setFont(doc, BODY, style);
  doc.setFontSize(size);
  return (doc.splitTextToSize(text, width) as string[]).map((t) => ({ text: t, style, size, color }));
}

// One check-in or check-out cell: when and who if recorded, otherwise
// "Not recorded" once it's past, or "Due …" while it's still to come --
// the same wording the on-screen table uses.
function stageLines(doc: jsPDF, booking: Booking, stage: 'checkIn' | 'checkOut', width: number): Line[] {
  const at = stage === 'checkIn' ? booking.checkInAt : booking.checkOutAt;
  const by = stage === 'checkIn' ? booking.checkInBy : booking.checkOutBy;
  if (at) {
    return [...wrap(doc, stamp(at), 'bold', FONT, width, INK), ...wrap(doc, by ? `by ${by}` : '', 'normal', SUB_FONT, width, MUTED)];
  }
  const due = new Date(stage === 'checkIn' ? booking.startDate : booking.endDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  if (due < today) return wrap(doc, 'Not recorded', 'italic', FONT, width, PINK);
  return wrap(doc, `Due ${due.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`, 'italic', FONT, width, MUTED);
}

function cellLines(doc: jsPDF, booking: Booking, col: Col & { x: number }): Line[] {
  switch (col.key) {
    case 'reference':
      return [
        ...wrap(doc, booking.reference, 'bold', FONT, col.w, BLUE),
        ...wrap(doc, booking.archived ? 'Archived' : '', 'normal', SUB_FONT, col.w, MUTED),
      ];
    case 'customer':
      return wrap(doc, customerName(booking.customer), 'normal', FONT, col.w, INK);
    case 'dogs':
      return wrap(doc, dogNames(booking.animals), 'normal', FONT, col.w, INK);
    case 'type':
      return wrap(doc, booking.type === 'boarding' ? 'Boarding' : 'Day Care', 'normal', FONT, col.w, INK);
    case 'dropOff':
      return [
        ...wrap(doc, scheduledDay(booking.startDate), 'normal', FONT, col.w, INK),
        ...wrap(doc, booking.dropOffTime ?? '', 'normal', SUB_FONT, col.w, MUTED),
      ];
    case 'pickUp':
      return [
        ...wrap(doc, scheduledDay(booking.endDate), 'normal', FONT, col.w, INK),
        ...wrap(doc, booking.pickUpTime ?? '', 'normal', SUB_FONT, col.w, MUTED),
      ];
    case 'checkIn':
      return stageLines(doc, booking, 'checkIn', col.w);
    case 'checkOut':
      return stageLines(doc, booking, 'checkOut', col.w);
  }
}

function headerBlock(cols: (Col & { x: number })[], innerWidth: number): Block {
  return {
    height: 20,
    draw: (doc, y) => {
      setFont(doc, BODY, 'bold');
      doc.setFontSize(6.8);
      doc.setTextColor(...BLUE);
      for (const c of cols) doc.text(c.label.toUpperCase(), c.x, y + 11, { charSpace: 0.6 });
      doc.setDrawColor(...RULE);
      doc.setLineWidth(0.6);
      doc.line(INNER_X, y + 17, INNER_X + innerWidth, y + 17);
    },
  };
}

function rowBlock(doc: jsPDF, booking: Booking, cols: (Col & { x: number })[], innerWidth: number, last: boolean): Block {
  const cells = cols.map((c) => ({ x: c.x, lines: cellLines(doc, booking, c) }));
  const lines = Math.max(1, ...cells.map((c) => c.lines.length));
  const height = ROW_PAD * 2 + lines * LEADING;
  return {
    height,
    draw: (d, y) => {
      const base = y + ROW_PAD + FONT;
      for (const cell of cells) {
        cell.lines.forEach((l, i) => {
          setFont(d, BODY, l.style);
          d.setFontSize(l.size);
          d.setTextColor(...l.color);
          d.text(l.text, cell.x, base + i * LEADING);
        });
      }
      if (!last) {
        d.setDrawColor(...RULE);
        d.setLineWidth(0.5);
        d.line(INNER_X, y + height, INNER_X + innerWidth, y + height);
      }
    },
  };
}

// A row of headline counts across the summary card.
function statsBlock(stats: [string, number][], innerWidth: number): Block {
  const tileGap = 10;
  const tileW = (innerWidth - tileGap * (stats.length - 1)) / stats.length;
  return {
    height: 50,
    draw: (doc, y) => {
      stats.forEach(([label, value], i) => {
        const x = INNER_X + i * (tileW + tileGap);
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(...RULE);
        doc.setLineWidth(0.6);
        doc.roundedRect(x, y + 4, tileW, 40, 6, 6, 'FD');
        setFont(doc, DISPLAY);
        doc.setFontSize(15);
        doc.setTextColor(...BLUE);
        doc.text(String(value), x + 10, y + 24);
        setFont(doc, BODY, 'bold');
        doc.setFontSize(6.8);
        doc.setTextColor(...MUTED);
        doc.text(label.toUpperCase(), x + 10, y + 36, { charSpace: 0.6 });
      });
    },
  };
}

/** Builds the landscape report; the caller downloads or emails the result. */
export async function buildCheckInOutReportPdf(e: CheckInOutReportExport): Promise<jsPDF> {
  const w = new BrandPdfWriter({ orientation: 'landscape' });
  await w.init();
  const doc = w.doc;
  w.drawHeader({
    title: 'Check In / Check Out Report',
    subtitle: 'Boarding & Day Care',
    badge: { label: 'Period', value: e.periodLabel },
  });

  const bookings = e.rows
    .map((r) => r.booking)
    .sort((a, b) =>
      `${a.startDate.slice(0, 10)} ${a.dropOffTime ?? ''}`.localeCompare(`${b.startDate.slice(0, 10)} ${b.dropOffTime ?? ''}`, undefined, {
        numeric: true,
      }),
    );
  const checkedIn = bookings.filter((b) => b.checkInAt).length;
  const checkedOut = bookings.filter((b) => b.checkOutAt).length;
  const inNow = bookings.filter((b) => b.checkInAt && !b.checkOutAt).length;
  const today = new Date().toISOString().slice(0, 10);
  const notRecorded = bookings.filter(
    (b) => (!b.checkInAt && b.startDate.slice(0, 10) < today) || (!b.checkOutAt && b.endDate.slice(0, 10) < today),
  ).length;
  w.section('Summary', [
    statsBlock(
      [
        ['Bookings', bookings.length],
        ['Checked in', checkedIn],
        ['Checked out', checkedOut],
        ['Checked in, not out', inNow],
        ['Missing a record', notRecorded],
      ],
      w.innerWidth,
    ),
  ]);

  const cols = columnsFor(w.innerWidth);
  w.section(
    'Check ins & check outs',
    bookings.length === 0
      ? [
          {
            height: 24,
            draw: (d, y) => {
              setFont(d, BODY, 'italic');
              d.setFontSize(9.5);
              d.setTextColor(...MUTED);
              d.text('No bookings in this period.', INNER_X, y + 14);
            },
          },
        ]
      : [headerBlock(cols, w.innerWidth), ...bookings.map((b, i) => rowBlock(doc, b, cols, w.innerWidth, i === bookings.length - 1))],
  );

  w.finish(await loadContactLine());
  return doc;
}

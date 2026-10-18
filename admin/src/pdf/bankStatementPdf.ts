import type { jsPDF } from 'jspdf';
import {
  BLUE,
  BODY,
  BrandPdfWriter,
  INK,
  INNER_WIDTH,
  INNER_X,
  MUTED,
  PINK,
  RULE,
  fieldRowBlock,
  loadContactLine,
  setFont,
  type Block,
} from './brandPdf';
import type { BankAccount, BankTransaction } from '../types';
import { bankAccountTypeLabel } from '../utils/bankAccountType';

export interface BankStatementExport {
  account: BankAccount;
  /** 'DD/MM/YYYY – DD/MM/YYYY', or 'All dates'. */
  periodLabel: string;
  openingBalance: number;
  closingBalance: number;
  moneyIn: number;
  moneyOut: number;
  /** Rows in the order shown on screen (search already applied). */
  transactions: BankTransaction[];
  /** Whether the opening balance row goes last (newest first) or first. */
  newestFirst: boolean;
  /** Date shown on the opening balance row, or '' when open-ended. */
  openingDate: string;
}

export function money(n: number): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}£${Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fileBase(e: BankStatementExport): string {
  return `Transaction Statement - ${e.account.name} - ${e.periodLabel}`.replace(/[/\\:]/g, '-');
}

// --- CSV ----------------------------------------------------------------------

function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Downloads the statement as a CSV, one row per transaction plus the opening balance. */
export function downloadBankStatementCsv(e: BankStatementExport) {
  const header = ['Date', 'Reference', 'Type', 'Details', 'Deposits', 'Withdrawals', 'Running balance'];
  const opening = [e.openingDate, '', 'Opening balance', '', '', '', e.openingBalance.toFixed(2)];
  const rows = e.transactions.map((t) => [
    new Date(t.date).toLocaleDateString('en-GB'),
    t.reference ?? '',
    t.label,
    t.party ?? '',
    t.amount > 0 ? t.amount.toFixed(2) : '',
    t.amount < 0 ? (-t.amount).toFixed(2) : '',
    t.balance.toFixed(2),
  ]);
  const all = [header, ...(e.newestFirst ? [...rows, opening] : [opening, ...rows])];
  // Leading BOM so Excel reads the file as UTF-8 (names with accents etc.).
  const csv = '﻿' + all.map((r) => r.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileBase(e)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// --- PDF ----------------------------------------------------------------------

// Column x-offsets (from INNER_X) and widths; the three money columns are
// right-aligned to their right edge.
const COLS = {
  date: { x: 0, w: 54 },
  ref: { x: 56, w: 96 },
  type: { x: 156, w: 136 },
  in: { right: 352 },
  out: { right: 418 },
  balance: { right: INNER_WIDTH },
};
const FONT = 8.5;
const SUB_FONT = 7.5;
const LEADING = 10.5;
const ROW_PAD = 6;

function headerBlock(): Block {
  return {
    height: 20,
    draw: (doc, y) => {
      setFont(doc, BODY, 'bold');
      doc.setFontSize(6.8);
      doc.setTextColor(...BLUE);
      const base = y + 11;
      const opts = { charSpace: 0.6 };
      doc.text('DATE', INNER_X + COLS.date.x, base, opts);
      doc.text('REFERENCE', INNER_X + COLS.ref.x, base, opts);
      doc.text('TYPE', INNER_X + COLS.type.x, base, opts);
      doc.text('DEPOSITS', INNER_X + COLS.in.right, base, { ...opts, align: 'right' });
      doc.text('WITHDRAWALS', INNER_X + COLS.out.right, base, { ...opts, align: 'right' });
      doc.text('BALANCE', INNER_X + COLS.balance.right, base, { ...opts, align: 'right' });
      doc.setDrawColor(...RULE);
      doc.setLineWidth(0.6);
      doc.line(INNER_X, y + 17, INNER_X + INNER_WIDTH, y + 17);
    },
  };
}

function rowBlock(
  doc: jsPDF,
  r: { date: string; reference: string; label: string; party: string; deposit: string; withdrawal: string; balance: number },
  last: boolean,
): Block {
  setFont(doc, BODY, 'normal');
  doc.setFontSize(FONT);
  const refLines = r.reference ? (doc.splitTextToSize(r.reference, COLS.ref.w) as string[]) : [];
  setFont(doc, BODY, 'bold');
  const labelLines = doc.splitTextToSize(r.label, COLS.type.w) as string[];
  setFont(doc, BODY, 'normal');
  doc.setFontSize(SUB_FONT);
  const partyLines = r.party ? (doc.splitTextToSize(r.party, COLS.type.w) as string[]) : [];
  const lines = Math.max(1, refLines.length, labelLines.length + partyLines.length);
  const height = ROW_PAD * 2 + lines * LEADING;

  return {
    height,
    draw: (d, y) => {
      const base = y + ROW_PAD + FONT;
      setFont(d, BODY, 'normal');
      d.setFontSize(FONT);
      d.setTextColor(...INK);
      d.text(r.date, INNER_X + COLS.date.x, base);
      d.setTextColor(...MUTED);
      refLines.forEach((l, i) => d.text(l, INNER_X + COLS.ref.x, base + i * LEADING));
      d.setTextColor(...INK);
      if (r.deposit) d.text(r.deposit, INNER_X + COLS.in.right, base, { align: 'right' });
      if (r.withdrawal) d.text(r.withdrawal, INNER_X + COLS.out.right, base, { align: 'right' });
      setFont(d, BODY, 'bold');
      labelLines.forEach((l, i) => d.text(l, INNER_X + COLS.type.x, base + i * LEADING));
      d.setTextColor(...(r.balance < 0 ? PINK : INK));
      d.text(money(r.balance), INNER_X + COLS.balance.right, base, { align: 'right' });
      if (partyLines.length) {
        setFont(d, BODY, 'normal');
        d.setFontSize(SUB_FONT);
        d.setTextColor(...MUTED);
        partyLines.forEach((l, i) =>
          d.text(l, INNER_X + COLS.type.x, base + (labelLines.length + i) * LEADING),
        );
      }
      if (!last) {
        d.setDrawColor(...RULE);
        d.setLineWidth(0.5);
        d.line(INNER_X, y + height, INNER_X + INNER_WIDTH, y + height);
      }
    },
  };
}

/** Renders the statement in the booking-confirmation style and downloads it. */
export async function downloadBankStatementPdf(e: BankStatementExport) {
  const w = new BrandPdfWriter();
  await w.init();
  const doc = w.doc;
  w.drawHeader({
    title: 'Transaction Statement',
    subtitle: e.account.name,
    badge: { label: 'Period', value: e.periodLabel },
  });

  const details: [string, string][] = [
    ['Account', `${e.account.name} (${bankAccountTypeLabel(e.account.type)})`],
    ...(e.account.sortCode ? [['Sort code', e.account.sortCode] as [string, string]] : []),
    ...(e.account.accountNumber ? [['Account number', e.account.accountNumber] as [string, string]] : []),
    ['Opening balance', money(e.openingBalance)],
    ['Money in', money(e.moneyIn)],
    ['Money out', money(e.moneyOut)],
    ['Closing balance', money(e.closingBalance)],
  ];
  setFont(doc, BODY, 'normal');
  doc.setFontSize(9);
  const labelWidth = Math.max(...details.map(([l]) => doc.getTextWidth(l))) + 18;
  w.section('Summary', details.map(([l, v]) => fieldRowBlock(doc, l, v, labelWidth)));

  const opening = {
    date: e.openingDate,
    reference: '',
    label: 'Opening balance',
    party: '',
    deposit: '',
    withdrawal: '',
    balance: e.openingBalance,
  };
  const rows = e.transactions.map((t) => ({
    date: new Date(t.date).toLocaleDateString('en-GB'),
    reference: t.reference ?? '',
    label: t.label,
    party: t.party ?? '',
    deposit: t.amount > 0 ? money(t.amount) : '',
    withdrawal: t.amount < 0 ? money(-t.amount) : '',
    balance: t.balance,
  }));
  const ordered = e.newestFirst ? [...rows, opening] : [opening, ...rows];
  w.section('Transactions', [
    headerBlock(),
    ...ordered.map((r, i) => rowBlock(doc, r, i === ordered.length - 1)),
  ]);

  w.finish(await loadContactLine());
  doc.save(`${fileBase(e)}.pdf`);
}

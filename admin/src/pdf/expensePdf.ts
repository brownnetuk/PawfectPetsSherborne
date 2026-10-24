import type { jsPDF } from 'jspdf';
import { PDFDocument } from 'pdf-lib';
import {
  BODY,
  BrandPdfWriter,
  INNER_WIDTH,
  INNER_X,
  MARGIN,
  PAGE_HEIGHT,
  RULE,
  fieldRowBlock,
  loadContactLine,
  mutedNoteBlock,
  setFont,
  type Block,
} from './brandPdf';
import { dataUriToBlob, expenseReceiptName, isPdfReceipt, receiptFileName, receiptMimeType } from '../utils/receiptFile';
import type { Expense } from '../types';

// An expense's details in the booking-confirmation style, with its uploaded
// receipt appended: an image receipt is drawn on a page of its own inside a
// cream card; a PDF receipt has its own pages copied on after ours (they
// keep their original look, so they don't carry our footer).

// Tallest an image can be and still share a fresh page with its section
// heading, card padding and the footer.
const MAX_IMAGE_HEIGHT = PAGE_HEIGHT - MARGIN * 2 - 22 - 60;
// Receipt photos straight off a phone can be 4000px+; this keeps the PDF
// small enough to email while staying easily legible.
const MAX_IMAGE_PX = 1800;

function accountLabel(account: Expense['account']): string {
  if (!account) return '—';
  return typeof account === 'string' ? account : account.name;
}

/**
 * Decodes an image receipt and re-encodes it as a JPEG via a canvas, so any
 * format the browser can show (WebP, GIF, rotated phone photos...) embeds
 * the same way. Null if the browser can't decode it (e.g. HEIC on Chrome).
 */
async function receiptAsJpeg(dataUri: string): Promise<{ dataUrl: string; width: number; height: number } | null> {
  const img = new Image();
  try {
    img.src = dataUri;
    await img.decode();
  } catch {
    return null;
  }
  const scale = Math.min(1, MAX_IMAGE_PX / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  // Transparent PNGs would otherwise turn black as a JPEG.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return { dataUrl: canvas.toDataURL('image/jpeg', 0.85), width, height };
}

/** The receipt image, scaled to fit the card, centred on a white pad with a hairline border. */
function imageBlock(image: { dataUrl: string; width: number; height: number }): Block {
  const pad = 6;
  const scale = Math.min((INNER_WIDTH - pad * 2) / image.width, (MAX_IMAGE_HEIGHT - pad * 2) / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  return {
    height: h + pad * 2 + 8,
    draw(doc, y) {
      const x = INNER_X + (INNER_WIDTH - w) / 2;
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(...RULE);
      doc.setLineWidth(0.75);
      doc.roundedRect(x - pad, y + 2, w + pad * 2, h + pad * 2, 6, 6, 'FD');
      doc.addImage(image.dataUrl, 'JPEG', x, y + 2 + pad, w, h, undefined, 'FAST');
    },
  };
}

function rows(doc: jsPDF, pairs: [string, string][]): Block[] {
  setFont(doc, BODY, 'normal');
  doc.setFontSize(9);
  const width = Math.max(...pairs.map(([l]) => doc.getTextWidth(l))) + 18;
  return pairs.map(([label, value]) => fieldRowBlock(doc, label, value, width));
}

/** Builds the expense PDF, with its receipt appended, as raw PDF bytes. */
export async function buildExpensePdf(expense: Expense): Promise<Uint8Array> {
  const w = new BrandPdfWriter();
  await w.init();
  const doc = w.doc;
  const date = new Date(expense.date).toLocaleDateString('en-GB');
  w.drawHeader({
    title: 'Expense record',
    subtitle: [expense.payee, date].filter(Boolean).join('  ·  '),
    badge: { label: 'Expense', value: expense.expenseId || date },
  });

  const receipt = expense.receipt;
  const receiptIsPdf = !!receipt && isPdfReceipt(receipt);
  const receiptName = expenseReceiptName(expense);
  w.section(
    'Expense details',
    rows(doc, [
      ...(expense.expenseId ? [['Expense ID', expense.expenseId] as [string, string]] : []),
      ['Date', date],
      ['Payee', expense.payee || '—'],
      ['Category', expense.category || '—'],
      ['Paid from', accountLabel(expense.account)],
      ['Payment method', expense.paymentMethod || '—'],
      ['Reference', expense.reference || '—'],
      ['Description', expense.description || '—'],
      ['Amount', `£${expense.amount.toFixed(2)}`],
      ['Attachment', receipt ? `${receiptName}${receiptIsPdf ? ' (on the following pages)' : ''}` : 'None uploaded'],
    ]),
  );

  if (receipt && !receiptIsPdf) {
    const image = receiptMimeType(receipt).startsWith('image/') ? await receiptAsJpeg(receipt) : null;
    if (image) {
      w.startNewPage();
      w.section('Attached receipt', [imageBlock(image)]);
    } else {
      w.section('Attached receipt', [
        mutedNoteBlock(`${receiptName} can't be shown in a PDF. Open the expense to download the original file.`),
      ]);
    }
  }

  w.finish(await loadContactLine());
  const ours = new Uint8Array(doc.output('arraybuffer'));
  if (!receiptIsPdf) return ours;

  const merged = await PDFDocument.load(ours);
  let attached: PDFDocument;
  try {
    attached = await PDFDocument.load(await dataUriToBlob(receipt).arrayBuffer(), { ignoreEncryption: true });
  } catch {
    throw new Error(`The attached receipt (${receiptName}) couldn't be read as a PDF, so it couldn't be appended.`);
  }
  const pages = await merged.copyPages(attached, attached.getPageIndices());
  pages.forEach((page) => merged.addPage(page));
  return merged.save();
}

/** Builds the expense PDF and downloads it, e.g. EXP00012-08-10-2026-Amazon-9.99.pdf. */
export async function downloadExpensePdf(expense: Expense) {
  const bytes = await buildExpensePdf(expense);
  const base = receiptFileName(expense.date, expense.payee, expense.amount, 'pdf');
  const name = expense.expenseId ? `${expense.expenseId}-${base}` : `Expense-${base}`;
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

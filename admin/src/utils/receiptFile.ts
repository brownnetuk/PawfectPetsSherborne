// Expense receipts are stored as base64 data URIs (images or PDFs) with a
// separate receiptName, which is always Date-Payee-Amount.ext so downloaded
// receipts line up with the expense they belong to, e.g.
// 08-10-2026-Amazon-9.99.pdf.

const MIME_EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

/** The MIME type of a data URI, e.g. "application/pdf". */
export function receiptMimeType(dataUri: string): string {
  const match = /^data:([^;,]+)/.exec(dataUri);
  return match ? match[1].toLowerCase() : '';
}

export function isPdfReceipt(dataUri: string): boolean {
  return receiptMimeType(dataUri) === 'application/pdf';
}

export function isAcceptedReceiptFile(file: File): boolean {
  return file.type.startsWith('image/') || file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

/**
 * The extension to keep for a receipt: the uploaded file's own (lowercased),
 * else the stored receiptName's, else one inferred from the data URI.
 */
export function receiptExtension(fileName: string | undefined, dataUri: string): string {
  const fromName = fileName ? /\.([A-Za-z0-9]{1,5})$/.exec(fileName)?.[1] : undefined;
  if (fromName) return fromName.toLowerCase();
  return MIME_EXTENSIONS[receiptMimeType(dataUri)] ?? 'bin';
}

// Letters, digits, dots and underscores pass through; any other run of
// characters (spaces, slashes, ampersands, accents...) becomes a single "-".
function safePart(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
}

// dd-mm-yyyy from a YYYY-MM-DD (or full ISO) date string.
function ukDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : safePart(date.slice(0, 10));
}

/** Date-Payee-Amount.ext, e.g. 08-10-2026-Amazon-9.99.pdf. */
export function receiptFileName(date: string, payee: string | undefined, amount: number, ext: string): string {
  const parts = [
    ukDate(date) || 'undated',
    safePart(payee ?? '') || 'No-payee',
    Number.isFinite(amount) ? amount.toFixed(2) : '0.00',
  ];
  return `${parts.join('-')}.${safePart(ext).toLowerCase() || 'bin'}`;
}

/**
 * The name an expense's receipt is shown and downloaded as. Always rebuilt
 * from the expense so older stored names (no name at all, or the earlier
 * yyyy-mm-dd format) come out the same; the stored name only supplies the
 * extension.
 */
export function expenseReceiptName(expense: { date: string; payee?: string; amount: number; receipt?: string; receiptName?: string }): string {
  if (!expense.receipt) return '';
  return receiptFileName(expense.date, expense.payee, expense.amount, receiptExtension(expense.receiptName, expense.receipt));
}

/** Turns a data URI into a Blob, so PDFs can be shown in an iframe or downloaded. */
export function dataUriToBlob(dataUri: string): Blob {
  const [, base64 = ''] = dataUri.split(',');
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: receiptMimeType(dataUri) || 'application/octet-stream' });
}

export function downloadReceipt(dataUri: string, fileName: string) {
  const url = URL.createObjectURL(dataUriToBlob(dataUri));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

import type { jsPDF } from 'jspdf';
import { BODY, BrandPdfWriter, fieldRowBlock, loadContactLine, setFont, type Block } from './brandPdf';
import type { Invoice, Payment } from '../types';

function customerName(customer: Invoice['customer']): string {
  if (!customer) return '(deleted customer)';
  return typeof customer === 'string' ? customer : customer.name;
}

// Label column sized to the longest label in the card, like the booking
// confirmation's rows.
function labelWidth(doc: jsPDF, labels: string[]): number {
  setFont(doc, BODY, 'normal');
  doc.setFontSize(9);
  return Math.max(...labels.map((l) => doc.getTextWidth(l))) + 18;
}

function rows(doc: jsPDF, pairs: [string, string][]): Block[] {
  const width = labelWidth(doc, pairs.map(([l]) => l));
  return pairs.map(([label, value]) => fieldRowBlock(doc, label, value, width));
}

/** Renders a single payment as a branded receipt PDF, referencing the invoice it was applied to. */
export async function buildReceiptPdf(payment: Payment, invoice: Invoice): Promise<jsPDF> {
  const w = new BrandPdfWriter();
  await w.init();
  const doc = w.doc;
  w.drawHeader({
    title: 'Payment received',
    subtitle: `for ${customerName(invoice.customer)}`,
    badge: { label: 'Receipt', value: payment.paymentId },
  });

  const balanceDue = invoice.total - (invoice.amountPaid ?? 0);
  w.section(
    'Your payment',
    rows(doc, [
      ['Date', new Date(payment.date).toLocaleDateString('en-GB')],
      ['Amount received', `£${payment.amount.toFixed(2)}`],
      ['Payment method', payment.paymentMethod || '—'],
    ]),
  );
  w.section(
    'Invoice',
    rows(doc, [
      ['Invoice', invoice.invoiceNumber],
      ['Invoice total', `£${invoice.total.toFixed(2)}`],
      ['Payments received', `£${(invoice.amountPaid ?? 0).toFixed(2)}`],
      [balanceDue > 0 ? 'Balance remaining' : 'Status', balanceDue > 0 ? `£${balanceDue.toFixed(2)}` : 'Paid in full'],
    ]),
  );

  w.finish(await loadContactLine());
  return w.doc;
}

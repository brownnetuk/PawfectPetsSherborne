import { escapeHtml } from './html.util';

export function formatUkDate(date: Date | string): string {
  const d = new Date(date);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

interface EmailLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
}

// Renders the {{items_table}} placeholder for invoice/quote emails -- inline
// styles throughout since email clients don't apply a <style> sheet.
export function buildItemsTableHtml(lineItems: EmailLineItem[]): string {
  const cell = 'padding:8px 12px;border-bottom:1px solid #e5e7eb;';
  const rows = lineItems
    .map((item) => {
      const amount = item.quantity * item.unitPrice * (1 - (item.discountPercent ?? 0) / 100);
      return `<tr>
        <td style="${cell}">${escapeHtml(item.description)}</td>
        <td style="${cell}text-align:center;">${item.quantity}</td>
        <td style="${cell}text-align:right;">£${item.unitPrice.toFixed(2)}</td>
        <td style="${cell}text-align:right;">${item.discountPercent ? `${item.discountPercent}%` : '—'}</td>
        <td style="${cell}text-align:right;">£${amount.toFixed(2)}</td>
      </tr>`;
    })
    .join('');
  const head = 'text-align:left;padding:8px 12px;border-bottom:2px solid #1f2937;';
  return `<table style="width:100%;border-collapse:collapse;font-size:14px;">
    <thead><tr>
      <th style="${head}">Description</th>
      <th style="${head}text-align:center;">Qty</th>
      <th style="${head}text-align:right;">Rate</th>
      <th style="${head}text-align:right;">Discount</th>
      <th style="${head}text-align:right;">Amount</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

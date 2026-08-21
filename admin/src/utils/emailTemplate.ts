// Hand-kept copy of backend/src/settings/settings.service.ts's
// interpolateSubject/interpolateBody/stripConditionals plus
// backend/src/common/invoice-email.util.ts's buildItemsTableHtml -- so what
// staff see in a Preview (Settings > Email Templates) or a Send confirmation
// (Invoices & Quotes) matches what actually sends. Update both sides
// together if the rendering logic ever changes.

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function stripConditionals(template: string, vars: Record<string, string | undefined>): string {
  return template.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, key, inner) => (vars[key] ? inner : ''));
}

export function interpolateSubject(template: string, vars: Record<string, string | undefined>): string {
  return stripConditionals(template, vars).replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

export function interpolateBody(
  template: string,
  vars: Record<string, string | undefined>,
  rawVars: Record<string, string>,
  htmlBody: boolean,
): string {
  let working = htmlBody ? template : escapeHtml(template);
  working = stripConditionals(working, vars);
  working = working.replace(/\{\{(\w+)\}\}/g, (_, key) => (key in rawVars ? rawVars[key] : escapeHtml(vars[key] ?? '')));
  return htmlBody ? working : working.replace(/\n/g, '<br>');
}

interface EmailLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
}

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

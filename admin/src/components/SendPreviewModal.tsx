import { useEffect, useState } from 'react';
import * as api from '../api/client';
import Modal from './Modal';
import { buildItemsTableHtml, interpolateBody, interpolateSubject } from '../utils/emailTemplate';
import type { BusinessInfo, Invoice, Quote } from '../types';

// Populate returns null for a dangling reference (the customer was deleted
// after this invoice/quote was created) -- the type doesn't say so, but the
// real data can, so this guards against it rather than crash. A quote with
// no customer at all but a manualCustomerName is a "Manual Customer"
// placeholder (see Quote.manualCustomerName), not a deleted one -- returned
// plain (no annotation) since this also feeds real outgoing email content;
// callers that want to visually flag "still just a placeholder" (e.g. the
// quotes list) add their own badge alongside it.
export function customerLabel(
  customer: Invoice['customer'] | Quote['customer'],
  manualCustomerName?: string,
): string {
  if (!customer) return manualCustomerName ?? '(deleted customer)';
  return typeof customer === 'string' ? customer : customer.name;
}

// Same DD/MM/YYYY as the backend's formatUkDate, worked out from the stored
// date's own YYYY-MM-DD prefix rather than a Date object -- guarantees no
// timezone drift.
function formatUkDateFromIso(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

interface Props {
  kind: 'invoice' | 'quote';
  doc: Invoice | Quote;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export default function SendPreviewModal({ kind, doc, onClose, onConfirm }: Props) {
  const [businessInfo, setBusinessInfo] = useState<BusinessInfo | null>(null);
  const [template, setTemplate] = useState<{ subject: string; body: string } | null | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.getBusinessInfo().then(setBusinessInfo).catch(() => {});
    api
      .listEmailTemplates()
      .then((templates) => setTemplate(templates.find((t) => t.trigger === kind) ?? null))
      .catch(() => setTemplate(null));
  }, [kind]);

  async function handleConfirm() {
    setSubmitting(true);
    await onConfirm();
    setSubmitting(false);
    onClose();
  }

  const isInvoice = kind === 'invoice';
  const number = isInvoice ? (doc as Invoice).invoiceNumber : (doc as Quote).quoteNumber;
  const dueDate = isInvoice ? (doc as Invoice).dueDate : (doc as Quote).validUntil;
  const manualCustomerName = isInvoice ? undefined : (doc as Quote).manualCustomerName;

  let renderedSubject = '';
  let renderedBody = '';
  if (businessInfo && template) {
    const vars: Record<string, string | undefined> = {
      businessName: businessInfo.name,
      businessAddress: businessInfo.address,
      businessTown: businessInfo.town,
      businessPostcode: businessInfo.postcode,
      businessTelephone: businessInfo.telephone,
      businessEmail: businessInfo.email,
      businessWebsite: businessInfo.website,
      customer_name: customerLabel(doc.customer, manualCustomerName),
      subject: doc.subject,
      subtotal: doc.subtotal.toFixed(2),
      total: doc.total.toFixed(2),
      bank_name: businessInfo.bankName,
      sort_code: businessInfo.sortCode,
      account_number: businessInfo.accountNumber,
      ...(isInvoice
        ? {
            invoice_number: number,
            invoice_date: formatUkDateFromIso(doc.issueDate),
            due_date: formatUkDateFromIso(dueDate),
          }
        : {
            quote_number: number,
            quote_date: formatUkDateFromIso(doc.issueDate),
            valid_until: formatUkDateFromIso(dueDate),
          }),
    };
    const logoTag = businessInfo.logoImage
      ? `<img src="${businessInfo.logoImage}" alt="" style="max-height:60px;max-width:220px;display:block;" />`
      : '';
    const rawVars = { logo: logoTag, items_table: buildItemsTableHtml(doc.lineItems) };
    renderedSubject = interpolateSubject(template.subject, vars);
    renderedBody = interpolateBody(template.body, vars, rawVars, true);
  }

  return (
    <Modal title={`Send ${isInvoice ? 'Invoice' : 'Quote'} ${number}`} onClose={onClose} wide>
      {template === undefined && <div className="empty-state">Loading…</div>}
      {template === null && (
        <>
          <div className="error-banner">
            No {isInvoice ? 'Invoice' : 'Quote'} Template is set up yet — add one in Settings &gt; Email Templates
            first.
          </div>
          <div className="modal-actions">
            <button className="btn btn-primary" onClick={onClose}>
              Close
            </button>
          </div>
        </>
      )}
      {template && businessInfo && (
        <>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: -6 }}>
            This is exactly what will be emailed to {customerLabel(doc.customer, manualCustomerName)}.
          </p>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ background: 'var(--sage)', padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase' }}>Subject</div>
              <div style={{ fontWeight: 600 }}>{renderedSubject}</div>
            </div>
            <div
              style={{ padding: '16px 20px', background: '#fff', lineHeight: 1.5, maxHeight: 420, overflowY: 'auto' }}
              dangerouslySetInnerHTML={{ __html: renderedBody }}
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={handleConfirm} disabled={submitting}>
              {submitting ? 'Sending…' : 'Send'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

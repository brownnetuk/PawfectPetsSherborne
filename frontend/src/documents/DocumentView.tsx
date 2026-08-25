import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import * as api from '../api/client';
import { buildInvoicePdf } from '../pdf/invoicePdf';
import logoUrl from '../assets/logo.png';
import type { InvoiceRecord, PublicBusinessInfo, QuoteRecord } from '../types';

type LoadState = 'loading' | 'not-found' | 'ready';

function formatUkDateFromIso(iso: string | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function money(n: number): string {
  return n.toFixed(2);
}

interface Props {
  kind: 'invoice' | 'quote';
  id: string;
}

/**
 * Public `/invoices/:id` and `/quotes/:id` page -- the id is effectively its
 * own access token here, same as this app's other public routes
 * (`/forms/:id`, `/intake/:id`). Deliberately its own flowing-layout render
 * (not driven by the staff PDF template, same reasoning as admin's
 * InvoiceHtmlView/QuoteHtmlView) with a "Download PDF" button that does use
 * the staff template, via the ported buildInvoicePdf().
 */
export default function DocumentView({ kind, id }: Props) {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [record, setRecord] = useState<InvoiceRecord | QuoteRecord | null>(null);
  const [businessInfo, setBusinessInfo] = useState<PublicBusinessInfo | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<'accept' | 'reject' | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionResult, setActionResult] = useState<{ ok: boolean; message: string } | null>(null);

  const isInvoice = kind === 'invoice';

  useEffect(() => {
    Promise.all([
      isInvoice ? api.fetchInvoicePublic(id) : api.fetchQuotePublic(id),
      api.fetchBusinessInfoPublic(),
    ])
      .then(([rec, info]) => {
        setRecord(rec);
        setBusinessInfo(info);
        setLoadState('ready');
      })
      .catch(() => setLoadState('not-found'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id]);

  useEffect(() => {
    if (!businessInfo) return;
    let cancelled = false;
    const content = `${businessInfo.bankName ?? ''} ${businessInfo.sortCode ?? ''} ${businessInfo.accountNumber ?? ''}`.trim();
    QRCode.toDataURL(content || ' ', { margin: 0 })
      .then((url) => {
        if (!cancelled) setQrUrl(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [businessInfo]);

  async function handleDownload() {
    if (!record || !businessInfo) return;
    setPdfBusy(true);
    setPdfError(null);
    try {
      const doc = await buildInvoicePdf(record, kind, businessInfo);
      const number = isInvoice ? (record as InvoiceRecord).invoiceNumber : (record as QuoteRecord).quoteNumber;
      doc.save(`${number}.pdf`);
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Failed to prepare the PDF');
    } finally {
      setPdfBusy(false);
    }
  }

  async function handleAccept() {
    setActionBusy(true);
    setActionResult(null);
    try {
      const { invoice } = await api.acceptQuote(id);
      setActionResult({
        ok: true,
        message: `Thanks! Your quote has been accepted. Invoice ${invoice.invoiceNumber} has been raised, and a deposit request has been emailed to you.`,
      });
      const updated = await api.fetchQuotePublic(id);
      setRecord(updated);
    } catch (err) {
      setActionResult({ ok: false, message: err instanceof Error ? err.message : 'Failed to accept the quote.' });
    } finally {
      setActionBusy(false);
      setConfirming(null);
    }
  }

  async function handleReject() {
    setActionBusy(true);
    setActionResult(null);
    try {
      const updated = await api.rejectQuote(id);
      setRecord(updated);
      setActionResult({ ok: true, message: 'This quote has been declined.' });
    } catch (err) {
      setActionResult({ ok: false, message: err instanceof Error ? err.message : 'Failed to decline the quote.' });
    } finally {
      setActionBusy(false);
      setConfirming(null);
    }
  }

  if (loadState === 'loading') {
    return <div className="card">Loading…</div>;
  }
  if (loadState === 'not-found' || !record || !businessInfo) {
    return (
      <div className="card">
        <h2>Not found</h2>
        <p className="subtitle">
          This {isInvoice ? 'invoice' : 'quote'} link is invalid, or the {isInvoice ? 'invoice' : 'quote'} no longer exists.
        </p>
      </div>
    );
  }

  const invoice = isInvoice ? (record as InvoiceRecord) : null;
  const quote = !isInvoice ? (record as QuoteRecord) : null;
  const customer = typeof record.customer === 'string' ? null : (record.customer ?? null);
  const customerName =
    customer?.name ?? (typeof record.customer === 'string' ? record.customer : quote?.manualCustomerName ?? '(deleted customer)');
  const amountPaid = invoice?.amountPaid ?? 0;
  const balanceDue = record.total - amountPaid;
  const isPaid = invoice?.status === 'paid';
  const number = invoice?.invoiceNumber ?? quote!.quoteNumber;
  const dueDateValue = invoice?.dueDate ?? quote!.validUntil;
  const notesMessage = (isInvoice ? businessInfo.invoiceNotesMessage : businessInfo.quoteNotesMessage) || 'Thanks for your business.';
  const canRespond = quote && (quote.status === 'draft' || quote.status === 'sent');

  return (
    <div style={{ width: '100%', maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button type="button" className="btn btn-secondary" onClick={handleDownload} disabled={pdfBusy}>
          {pdfBusy ? 'Preparing…' : 'Download PDF'}
        </button>
      </div>
      {pdfError && (
        <div style={{ color: 'var(--error)', marginBottom: 12, fontSize: '0.9rem' }}>{pdfError}</div>
      )}

      <div
        style={{
          background: 'white',
          border: '1px solid var(--border)',
          borderRadius: 10,
          boxShadow: '0 1px 3px rgba(16, 24, 32, 0.06)',
          padding: '44px 52px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {isPaid && (
          <div
            style={{
              position: 'absolute',
              top: 22,
              left: -52,
              width: 190,
              transform: 'rotate(-45deg)',
              background: 'var(--brand)',
              color: 'white',
              textAlign: 'center',
              fontWeight: 700,
              fontSize: '0.82rem',
              letterSpacing: '0.08em',
              padding: '5px 0',
            }}
          >
            PAID
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 16 }}>
            <img src={logoUrl} alt="" style={{ width: 60, height: 60, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: '1.15rem', color: 'var(--brand-dark)' }}>{businessInfo.name}</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: 6, lineHeight: 1.6 }}>
                {businessInfo.address}
                <br />
                {businessInfo.town} {businessInfo.postcode}
                <br />
                {businessInfo.telephone}
                <br />
                {businessInfo.email}
                <br />
                {businessInfo.website}
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '1.9rem', fontWeight: 700 }}>{isInvoice ? 'Invoice' : 'Quote'}</div>
            <div style={{ fontSize: '0.9rem', marginTop: 8 }}>
              {isInvoice ? 'Invoice#' : 'Quote#'} <strong>{number}</strong>
            </div>
            {isInvoice && (
              <>
                <div style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: 14, fontWeight: 600 }}>Balance Due</div>
                <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>£{money(balanceDue)}</div>
              </>
            )}
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--border)', margin: '28px 0' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {isInvoice ? 'Invoice To:' : 'Quote To:'}
            </div>
            <div style={{ marginTop: 8, fontSize: '0.95rem' }}>
              <div style={{ fontWeight: 600 }}>{customerName}</div>
              <div style={{ color: 'var(--muted)', whiteSpace: 'pre-line', marginTop: 3, lineHeight: 1.6 }}>
                {customer?.address ?? (!customer ? quote?.manualCustomerEmail : undefined)}
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: '0.88rem', lineHeight: 1.9 }}>
            <div>
              {isInvoice ? 'Invoice Date' : 'Quote Date'} :&nbsp;&nbsp;<strong>{formatUkDateFromIso(record.issueDate)}</strong>
            </div>
            <div>
              Terms :&nbsp;&nbsp;<strong>{record.paymentTerms || '—'}</strong>
            </div>
            <div>
              {isInvoice ? 'Due Date' : 'Valid Until'} :&nbsp;&nbsp;<strong>{formatUkDateFromIso(dueDateValue)}</strong>
            </div>
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 32, fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ background: 'var(--ink)', color: 'white' }}>
              <th style={{ padding: '11px 14px', textAlign: 'left', fontWeight: 600 }}>#</th>
              <th style={{ padding: '11px 14px', textAlign: 'left', fontWeight: 600 }}>Item &amp; Description</th>
              <th style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 600 }}>Qty</th>
              <th style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 600 }}>Unit Price</th>
              <th style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 600 }}>Line Total</th>
            </tr>
          </thead>
          <tbody>
            {record.lineItems.map((item, i) => {
              const lineTotal = item.quantity * item.unitPrice * (1 - (item.discountPercent ?? 0) / 100);
              return (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '11px 14px' }}>{i + 1}</td>
                  <td style={{ padding: '11px 14px' }}>{item.description}</td>
                  <td style={{ padding: '11px 14px', textAlign: 'right' }}>{item.quantity.toFixed(2)}</td>
                  <td style={{ padding: '11px 14px', textAlign: 'right' }}>£{money(item.unitPrice)}</td>
                  <td style={{ padding: '11px 14px', textAlign: 'right' }}>£{money(lineTotal)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
          <div style={{ width: 280, fontSize: '0.9rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}>
              <span>Sub Total</span>
              <span>£{money(record.subtotal)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontWeight: 700 }}>
              <span>Total</span>
              <span>£{money(record.total)}</span>
            </div>
            {isInvoice && amountPaid > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', color: 'var(--error)' }}>
                <span>Payment Made</span>
                <span>(-) £{money(amountPaid)}</span>
              </div>
            )}
            {isInvoice && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  marginTop: 8,
                  background: '#eef5f0',
                  borderRadius: 6,
                  fontWeight: 700,
                }}
              >
                <span>Balance Due</span>
                <span>£{money(balanceDue)}</span>
              </div>
            )}
          </div>
        </div>

        <div style={{ marginTop: 36, fontSize: '0.88rem' }}>
          <div style={{ fontWeight: 700 }}>Notes</div>
          <div style={{ color: 'var(--muted)', marginTop: 5, whiteSpace: 'pre-line' }}>{notesMessage}</div>
        </div>

        {(businessInfo.bankName || businessInfo.sortCode || businessInfo.accountNumber) && (
          <div style={{ marginTop: 22, fontSize: '0.88rem' }}>
            <div style={{ fontWeight: 700, textDecoration: 'underline' }}>BANK Transfer Details</div>
            <div style={{ marginTop: 7, lineHeight: 1.8 }}>
              Account Name :&nbsp;&nbsp;{businessInfo.name}
              <br />
              Account Sort Code :&nbsp;&nbsp;{businessInfo.sortCode}
              <br />
              Account Number :&nbsp;&nbsp;{businessInfo.accountNumber}
            </div>
          </div>
        )}

        {qrUrl && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 22 }}>
            <img src={qrUrl} alt="QR code" style={{ width: 76, height: 76 }} />
            <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Scan the QR code to view the configured information.</div>
          </div>
        )}
      </div>

      {quote && (
        <div className="card" style={{ marginTop: 20, maxWidth: 'none' }}>
          {actionResult ? (
            <p style={{ color: actionResult.ok ? 'var(--brand-dark)' : 'var(--error)', margin: 0 }}>{actionResult.message}</p>
          ) : canRespond ? (
            confirming === 'accept' ? (
              <>
                <p style={{ marginTop: 0 }}>
                  Accepting will raise an invoice for this quote and email you a deposit request straight away. Are you sure?
                </p>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setConfirming(null)} disabled={actionBusy}>
                    Cancel
                  </button>
                  <button type="button" className="btn btn-primary" onClick={handleAccept} disabled={actionBusy}>
                    {actionBusy ? 'Accepting…' : 'Yes, Accept Quote'}
                  </button>
                </div>
              </>
            ) : confirming === 'reject' ? (
              <>
                <p style={{ marginTop: 0 }}>Are you sure you want to decline this quote?</p>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setConfirming(null)} disabled={actionBusy}>
                    Cancel
                  </button>
                  <button type="button" className="btn btn-primary" onClick={handleReject} disabled={actionBusy}>
                    {actionBusy ? 'Declining…' : 'Yes, Decline Quote'}
                  </button>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', gap: 12 }}>
                <button type="button" className="btn btn-primary" onClick={() => setConfirming('accept')}>
                  Accept Quote
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setConfirming('reject')}>
                  Reject Quote
                </button>
              </div>
            )
          ) : (
            <p style={{ margin: 0 }}>
              This quote has already been <strong>{quote.status}</strong>.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

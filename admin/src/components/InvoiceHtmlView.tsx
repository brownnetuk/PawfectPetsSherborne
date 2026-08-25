import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import logoUrl from '../assets/logo.png';
import type { BusinessInfo, Invoice } from '../types';

function formatUkDateFromIso(iso: string | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function money(n: number): string {
  return n.toFixed(2);
}

interface Props {
  invoice: Invoice;
  businessInfo: BusinessInfo;
}

/**
 * A clean HTML rendering of an invoice for on-screen viewing -- deliberately
 * not driven by the staff-designed PDF template (admin/src/pdf/invoicePdf.ts):
 * that template is a freeform, absolutely-positioned canvas meant for print
 * output, while this is a normal flowing document that reads well at any
 * size and never overlaps regardless of content length. The actual
 * downloadable PDF still goes through buildInvoicePdf() and does honour the
 * staff template.
 */
export default function InvoiceHtmlView({ invoice, businessInfo }: Props) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const customer = typeof invoice.customer === 'string' ? null : invoice.customer;
  const customerName = customer?.name ?? (typeof invoice.customer === 'string' ? invoice.customer : '(deleted customer)');
  const amountPaid = invoice.amountPaid ?? 0;
  const balanceDue = invoice.total - amountPaid;
  const isPaid = invoice.status === 'paid';

  useEffect(() => {
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
  }, [businessInfo.bankName, businessInfo.sortCode, businessInfo.accountNumber]);

  return (
    <div
      style={{
        maxWidth: 900,
        margin: '0 auto',
        background: 'white',
        border: '1px solid var(--border)',
        borderRadius: 10,
        boxShadow: 'var(--shadow-md)',
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
            background: 'var(--brand-green)',
            color: 'white',
            textAlign: 'center',
            fontWeight: 700,
            fontSize: '0.82rem',
            letterSpacing: '0.08em',
            padding: '5px 0',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          PAID
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 16 }}>
          <img src={logoUrl} alt="" style={{ width: 60, height: 60, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.15rem', color: 'var(--brand-green)' }}>{businessInfo.name}</div>
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
          <div style={{ fontSize: '1.9rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>Invoice</div>
          <div style={{ fontSize: '0.9rem', marginTop: 8 }}>
            Invoice# <strong>{invoice.invoiceNumber}</strong>
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: 14, fontWeight: 600 }}>Balance Due</div>
          <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>£{money(balanceDue)}</div>
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', margin: '28px 0' }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <div
            style={{
              fontSize: '0.78rem',
              fontWeight: 700,
              color: 'var(--muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Invoice To:
          </div>
          <div style={{ marginTop: 8, fontSize: '0.95rem' }}>
            <div style={{ fontWeight: 600 }}>{customerName}</div>
            <div style={{ color: 'var(--muted)', whiteSpace: 'pre-line', marginTop: 3, lineHeight: 1.6 }}>
              {customer?.address}
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right', fontSize: '0.88rem', lineHeight: 1.9 }}>
          <div>
            Invoice Date :&nbsp;&nbsp;<strong>{formatUkDateFromIso(invoice.issueDate)}</strong>
          </div>
          <div>
            Terms :&nbsp;&nbsp;<strong>{invoice.paymentTerms || '—'}</strong>
          </div>
          <div>
            Due Date :&nbsp;&nbsp;<strong>{formatUkDateFromIso(invoice.dueDate)}</strong>
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
          {invoice.lineItems.map((item, i) => {
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
            <span>£{money(invoice.subtotal)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontWeight: 700 }}>
            <span>Total</span>
            <span>£{money(invoice.total)}</span>
          </div>
          {amountPaid > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', color: 'var(--error)' }}>
              <span>Payment Made</span>
              <span>(-) £{money(amountPaid)}</span>
            </div>
          )}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '10px 12px',
              marginTop: 8,
              background: 'var(--sage)',
              borderRadius: 6,
              fontWeight: 700,
            }}
          >
            <span>Balance Due</span>
            <span>£{money(balanceDue)}</span>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 36, fontSize: '0.88rem' }}>
        <div style={{ fontWeight: 700 }}>Notes</div>
        <div style={{ color: 'var(--muted)', marginTop: 5, whiteSpace: 'pre-line' }}>
          {businessInfo.invoiceNotesMessage || 'Thanks for your business.'}
        </div>
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
  );
}

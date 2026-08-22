import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import logoUrl from '../assets/logo.png';
import type { BusinessInfo, Quote } from '../types';

function formatUkDateFromIso(iso: string | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function money(n: number): string {
  return n.toFixed(2);
}

interface Props {
  quote: Quote;
  businessInfo: BusinessInfo;
}

/**
 * A clean HTML rendering of a quote for on-screen viewing -- mirrors
 * InvoiceHtmlView.tsx (see there for why this isn't driven by the staff PDF
 * template), minus the invoice-only Payment Made/Balance Due/"Paid" ribbon,
 * since a Quote has no amountPaid or paid status at all.
 */
export default function QuoteHtmlView({ quote, businessInfo }: Props) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const customer = typeof quote.customer === 'string' ? null : quote.customer;
  const customerName = customer?.name ?? (typeof quote.customer === 'string' ? quote.customer : '(deleted customer)');

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
          <div style={{ fontSize: '1.9rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>Quote</div>
          <div style={{ fontSize: '0.9rem', marginTop: 8 }}>
            Quote# <strong>{quote.quoteNumber}</strong>
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: 14, fontWeight: 600 }}>Total</div>
          <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>£{money(quote.total)}</div>
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
            Quote To:
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
            Quote Date :&nbsp;&nbsp;<strong>{formatUkDateFromIso(quote.issueDate)}</strong>
          </div>
          <div>
            Terms :&nbsp;&nbsp;<strong>{quote.paymentTerms || '—'}</strong>
          </div>
          <div>
            Valid Until :&nbsp;&nbsp;<strong>{formatUkDateFromIso(quote.validUntil)}</strong>
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
          {quote.lineItems.map((item, i) => {
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
            <span>£{money(quote.subtotal)}</span>
          </div>
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
            <span>Total</span>
            <span>£{money(quote.total)}</span>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 36, fontSize: '0.88rem' }}>
        <div style={{ fontWeight: 700 }}>Notes</div>
        <div style={{ color: 'var(--muted)', marginTop: 5 }}>Thanks for your business.</div>
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

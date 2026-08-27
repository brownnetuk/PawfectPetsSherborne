import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import * as api from '../api/client';
import Modal from './Modal';

interface Props {
  onClose: () => void;
}

type LoadState = 'loading' | 'not-configured' | 'ready' | 'error';

/**
 * Opened by clicking the avatar in the top bar (Layout.tsx) -- shows a QR
 * code pointing at BusinessInfo.qrLoginUrl (Settings > Business Info),
 * typically the admin login page, so staff can quickly pick this app up on
 * a phone without typing the URL.
 */
export default function QrLoginModal({ onClose }: Props) {
  const [state, setState] = useState<LoadState>('loading');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getBusinessInfo()
      .then((info) => {
        if (cancelled) return;
        if (!info.qrLoginUrl) {
          setState('not-configured');
          return;
        }
        return QRCode.toDataURL(info.qrLoginUrl, { margin: 1, width: 240 }).then((dataUrl) => {
          if (cancelled) return;
          setQrDataUrl(dataUrl);
          setState('ready');
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load the QR code');
        setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Modal title="Scan to log in" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '8px 0' }}>
        {state === 'loading' && <p style={{ color: 'var(--muted)', margin: 0 }}>Loading…</p>}
        {state === 'error' && <div className="error-banner" style={{ width: '100%' }}>{error}</div>}
        {state === 'not-configured' && (
          <p style={{ color: 'var(--muted)', margin: 0, textAlign: 'center' }}>
            No login URL is set up yet -- add one in Settings &gt; Business Info &gt; QR Code Login URL.
          </p>
        )}
        {state === 'ready' && qrDataUrl && (
          <>
            <img
              src={qrDataUrl}
              alt="QR code to the login page"
              style={{ width: 240, height: 240, border: '1px solid var(--border)', borderRadius: 8 }}
            />
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem', textAlign: 'center', margin: 0 }}>
              Scan with a phone camera to open the login page.
            </p>
          </>
        )}
      </div>
      <div className="modal-actions">
        <button className="btn btn-secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}

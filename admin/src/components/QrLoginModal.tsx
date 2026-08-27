import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { API_URL } from '../api/client';
import Modal from './Modal';

interface Props {
  onClose: () => void;
}

/**
 * Opened by clicking the avatar in the top bar (Layout.tsx). Encodes this
 * backend's own API_URL -- the mobile app's "Scan QR code" first-launch
 * screen (mobile/lib/screens/scan_qr_screen.dart) scans exactly this to
 * provision which server it talks to, so this is the admin-side pairing for
 * that flow, not a page meant to be opened in a browser.
 */
export default function QrLoginModal({ onClose }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(API_URL, { margin: 1, width: 240 })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to generate the QR code');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Modal title="Connect the mobile app" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '8px 0' }}>
        {error && <div className="error-banner" style={{ width: '100%' }}>{error}</div>}
        {!error && !qrDataUrl && <p style={{ color: 'var(--muted)', margin: 0 }}>Loading…</p>}
        {!error && qrDataUrl && (
          <>
            <img
              src={qrDataUrl}
              alt="QR code encoding this server's address"
              style={{ width: 240, height: 240, border: '1px solid var(--border)', borderRadius: 8 }}
            />
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem', textAlign: 'center', margin: 0 }}>
              On a phone that hasn't set up the PawfectPets app yet, scan this on its "Scan QR code"
              screen to connect it to this server.
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

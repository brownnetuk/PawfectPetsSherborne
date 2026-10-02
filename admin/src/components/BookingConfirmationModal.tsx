import type { jsPDF } from 'jspdf';
import { useEffect, useRef, useState } from 'react';
import * as api from '../api/client';
import { buildBookingConfirmationPdf } from '../pdf/bookingConfirmationPdf';
import type { BoardingBooking, Invoice } from '../types';
import Modal from './Modal';

// Previews the exact Booking Confirmation PDF (the same jsPDF document that
// gets downloaded/attached -- not a separate HTML approximation) and lets
// staff download it or email it to the customer with the "Booking
// Confirmation" email template.
export default function BookingConfirmationModal({
  booking,
  invoice,
  onClose,
}: {
  booking: BoardingBooking;
  invoice: Invoice | null;
  onClose: () => void;
}) {
  const docRef = useRef<jsPDF | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const customer = booking.customer && typeof booking.customer !== 'string' ? booking.customer : null;
  const fileName = `Booking Confirmation - ${booking.reference}.pdf`;

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const info = await api.getBusinessInfo();
        const doc = await buildBookingConfirmationPdf(booking, invoice, info);
        if (cancelled) return;
        docRef.current = doc;
        url = URL.createObjectURL(doc.output('blob'));
        setPreviewUrl(url);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to generate the booking confirmation');
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
    // Built once per open -- booking/invoice are fixed while the modal is up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSend() {
    const doc = docRef.current;
    if (!doc) return;
    setSending(true);
    try {
      await api.sendBoardingBookingConfirmation(booking._id, doc.output('datauristring'), fileName);
      setResult({
        ok: true,
        message: `The booking confirmation for ${booking.reference} was emailed to ${customer?.email ?? 'the customer'}.`,
      });
    } catch (err) {
      setResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Failed to send the booking confirmation.',
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <>
    <Modal title={`Booking Confirmation - ${booking.reference}`} onClose={onClose} xl>
      {error && <div className="error-banner">{error}</div>}
      {previewUrl ? (
        <iframe
          title="Booking confirmation preview"
          src={previewUrl}
          style={{ width: '100%', height: '68vh', border: '1px solid var(--border)', borderRadius: 8 }}
        />
      ) : (
        !error && <div className="empty-state">Preparing preview…</div>
      )}
      <div className="modal-actions">
        <button className="btn btn-secondary" onClick={onClose}>
          Close
        </button>
        <button
          className="btn btn-secondary"
          disabled={!previewUrl}
          onClick={() => docRef.current?.save(fileName)}
        >
          Download
        </button>
        <button className="btn btn-primary" disabled={!previewUrl || sending} onClick={handleSend}>
          {sending ? 'Sending…' : customer?.email ? `Send by Email to ${customer.email}` : 'Send by Email'}
        </button>
      </div>
    </Modal>
      {result && (
        <Modal title={result.ok ? 'Email sent' : 'Email failed'} onClose={() => setResult(null)}>
          {result.ok ? (
            <p>{result.message}</p>
          ) : (
            <div className="error-banner">{result.message}</div>
          )}
          <div className="modal-actions">
            <button className="btn btn-primary" onClick={() => setResult(null)}>
              {result.ok ? 'OK' : 'Close'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

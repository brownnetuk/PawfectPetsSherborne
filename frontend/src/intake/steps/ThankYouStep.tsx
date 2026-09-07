interface Props {
  name: string;
  sendCopyState: 'idle' | 'sending' | 'sent' | 'error';
  onSendCopy: () => void;
}

export default function ThankYouStep({ name, sendCopyState, onSendCopy }: Props) {
  return (
    <div className="center-message">
      <h1>Thank you{name ? `, ${name}` : ''}!</h1>
      <p className="subtitle">
        Your registration is complete. We'll be in touch to confirm your pet's booking.
      </p>
      {sendCopyState === 'sent' ? (
        <p className="subtitle">A copy has been emailed to you.</p>
      ) : (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onSendCopy}
          disabled={sendCopyState === 'sending'}
          style={{ marginTop: 10 }}
        >
          {sendCopyState === 'sending' ? 'Sending…' : 'Send a copy by Email'}
        </button>
      )}
      {sendCopyState === 'error' && (
        <p className="subtitle" style={{ color: 'var(--error)' }}>
          Something went wrong sending that -- please try again.
        </p>
      )}
    </div>
  );
}

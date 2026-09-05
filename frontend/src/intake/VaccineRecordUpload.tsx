import { useState } from 'react';

const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

interface Props {
  value?: string;
  onChange: (photo: string) => void;
}

// Single-photo upload for a vaccination record/certificate, offered as a
// convenience alongside the required vaccine expiry date -- not itself
// required. `capture="environment"` opens the camera directly on mobile
// while still falling back to a normal file picker everywhere else.
export default function VaccineRecordUpload({ value, onChange }: Props) {
  const [error, setError] = useState<string | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError('That photo is too large — please use one under 4MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result as string);
    reader.onerror = () => setError('Failed to read that file.');
    reader.readAsDataURL(file);
  }

  return (
    <div className="field">
      <label>Vaccination record</label>
      <div className="field-hint">
        Optionally take a picture or upload a copy of the vaccination record/certificate.
      </div>
      {value ? (
        <div className="photo-upload">
          <img src={value} alt="Vaccination record" className="photo-preview" />
          <div className="signature-actions">
            <span className="hint">Vaccination record</span>
            <button type="button" className="btn-link" onClick={() => onChange('')}>
              Remove
            </button>
          </div>
        </div>
      ) : (
        <input type="file" accept="image/*" capture="environment" onChange={handleChange} />
      )}
      {error && <div className="field-hint" style={{ color: 'var(--error)' }}>{error}</div>}
    </div>
  );
}

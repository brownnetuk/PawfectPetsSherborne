import { useState } from 'react';

const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

interface Props {
  value?: string;
  onChange: (dataUrl: string | undefined) => void;
}

export default function PhotoUpload({ value, onChange }: Props) {
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
      <label>Photo</label>
      {value ? (
        <div className="photo-upload">
          <img src={value} alt="Pet" className="photo-preview" />
          <div className="signature-actions">
            <span className="hint">Photo added</span>
            <button type="button" className="btn-link" onClick={() => onChange(undefined)}>
              Remove
            </button>
          </div>
        </div>
      ) : (
        <input type="file" accept="image/*" onChange={handleChange} />
      )}
      {error && <div className="field-hint" style={{ color: 'var(--error)' }}>{error}</div>}
    </div>
  );
}

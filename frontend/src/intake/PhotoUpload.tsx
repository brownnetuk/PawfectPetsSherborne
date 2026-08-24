import { useState } from 'react';

const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const MAX_PHOTOS = 2;

interface Props {
  value?: string[];
  onChange: (photos: string[]) => void;
}

export default function PhotoUpload({ value, onChange }: Props) {
  const [error, setError] = useState<string | null>(null);
  const photos = value ?? [];

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
    reader.onload = () => onChange([...photos, reader.result as string]);
    reader.onerror = () => setError('Failed to read that file.');
    reader.readAsDataURL(file);
  }

  function remove(index: number) {
    onChange(photos.filter((_, i) => i !== index));
  }

  return (
    <div className="field">
      <label>Photos</label>
      <div className="field-hint">Please add up to 2 photos of your pet.</div>
      {photos.length > 0 && (
        <div className="photo-upload-grid">
          {photos.map((p, i) => (
            <div key={i} className="photo-upload">
              <img src={p} alt="Pet" className="photo-preview" />
              <div className="signature-actions">
                <span className="hint">Photo {i + 1}</span>
                <button type="button" className="btn-link" onClick={() => remove(i)}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {photos.length < MAX_PHOTOS && (
        <input type="file" accept="image/*" onChange={handleChange} />
      )}
      {photos.length >= MAX_PHOTOS && (
        <div className="field-hint">You've added the maximum of {MAX_PHOTOS} photos.</div>
      )}
      {error && <div className="field-hint" style={{ color: 'var(--error)' }}>{error}</div>}
    </div>
  );
}

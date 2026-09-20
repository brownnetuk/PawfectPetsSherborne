import { useState } from 'react';

// Ported from frontend/src/intake/PhotoUpload.tsx (customer-facing intake)
// for the new staff-facing FormFillModal -- admin has no equivalent grid/
// preview CSS classes yet, so the layout below is inlined instead of adding
// new global rules for this one component.
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
      {photos.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
          {photos.map((p, i) => (
            <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
              <img src={p} alt="" style={{ display: 'block', width: '100%', maxHeight: 160, objectFit: 'cover' }} />
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
      {photos.length < MAX_PHOTOS && <input type="file" accept="image/*" onChange={handleChange} />}
      {photos.length >= MAX_PHOTOS && (
        <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>You've added the maximum of {MAX_PHOTOS} photos.</div>
      )}
      {error && <div style={{ fontSize: '0.85rem', color: 'var(--error)' }}>{error}</div>}
    </div>
  );
}

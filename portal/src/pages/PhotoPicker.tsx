import { useState, type ChangeEvent } from 'react';

const MAX_PHOTOS = 2;
const MAX_EDGE = 1600;

// Phone photos are often 5-10MB; shrink to at most 1600px on the long edge
// as a JPEG so two of them fit comfortably in one save (the API caps a
// request at 8MB, and the photos travel base64-encoded).
function shrink(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file could not be read as an image.'));
    };
    img.src = url;
  });
}

export default function PhotoPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (photos: string[]) => void;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function add(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    setBusy(true);
    try {
      onChange([...value, await shrink(file)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That photo could not be added.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="field">
      <p className="muted small hint-line">Add up to {MAX_PHOTOS} photos so we can recognise your pet.</p>
      {value.length > 0 && (
        <div className="photo-grid">
          {value.map((src, i) => (
            <div key={i} className="photo-tile">
              <img src={src} alt={`Photo ${i + 1}`} />
              <button type="button" className="link danger" onClick={() => onChange(value.filter((_, j) => j !== i))}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      {value.length < MAX_PHOTOS && (
        <label className="btn btn-secondary btn-small file-button">
          {busy ? 'Adding…' : 'Add a photo'}
          <input type="file" accept="image/*" onChange={(e) => void add(e)} disabled={busy} hidden />
        </label>
      )}
      {error && <div className="error-banner">{error}</div>}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { fetchAnimals, fetchProfile } from '../api';
import { formatDate } from '../format';
import type { AnimalRecord } from '../types';
import PetEditor from './PetEditor';

const cap = (s?: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

export default function PetsPage() {
  const [pets, setPets] = useState<AnimalRecord[] | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<AnimalRecord | null>(null);
  const [savedName, setSavedName] = useState('');
  const [consentText, setConsentText] = useState('');

  useEffect(() => {
    fetchAnimals().then(setPets).catch((err: Error) => setError(err.message));
    // The business's off-lead wording, shown above the signature pad.
    fetchProfile()
      .then((p) => setConsentText(p.offLeadConsentText ?? ''))
      .catch(() => {});
  }, []);

  if (editing) {
    return (
      <PetEditor
        pet={editing}
        offLeadConsentText={consentText}
        onCancel={() => setEditing(null)}
        onSaved={(updated) => {
          setPets((list) => (list ?? []).map((p) => (p._id === updated._id ? updated : p)));
          setSavedName(updated.name);
          setEditing(null);
          window.scrollTo({ top: 0 });
        }}
      />
    );
  }

  return (
    <section>
      {error && <div className="error-banner">{error}</div>}
      {savedName && <div className="success-banner">{savedName}'s details have been saved.</div>}
      {!pets && !error && <p className="empty-state">Loading…</p>}
      {pets && pets.length === 0 && <p className="empty-state">We don't have any pets on file for you yet.</p>}
      {pets && pets.length > 0 && (
        <ul className="doc-list">
          {pets.map((p) => (
            <li key={p._id} className="doc-row">
              {p.photos?.[0] && <img src={p.photos[0]} alt="" className="pet-thumb" />}
              <div className="doc-main grow">
                <div className="doc-title">{p.name}</div>
                <div className="muted small">
                  {[cap(p.species), p.breed, cap(p.sex)].filter(Boolean).join(' · ')}
                  {p.dateOfBirth && ` · Born ${formatDate(p.dateOfBirth)}`}
                </div>
              </div>
              <div className="doc-side">
                <button
                  className="btn btn-secondary btn-small"
                  onClick={() => {
                    setSavedName('');
                    setEditing(p);
                  }}
                >
                  Edit details
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

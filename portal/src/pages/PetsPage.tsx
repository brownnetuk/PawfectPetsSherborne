import { useEffect, useState } from 'react';
import { fetchAnimals } from '../api';
import { formatDate } from '../format';
import type { AnimalRecord } from '../types';

const cap = (s?: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

export default function PetsPage() {
  const [pets, setPets] = useState<AnimalRecord[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchAnimals().then(setPets).catch((err: Error) => setError(err.message));
  }, []);

  return (
    <section>
      <h2>My Pets</h2>
      {error && <p className="error">{error}</p>}
      {!pets && !error && <p className="muted">Loading…</p>}
      {pets && pets.length === 0 && <p className="muted">We don't have any pets on file for you yet.</p>}
      {pets && pets.length > 0 && (
        <ul className="doc-list">
          {pets.map((p) => (
            <li key={p._id} className="doc-row">
              <div className="doc-main">
                <div className="doc-title">{p.name}</div>
                <div className="muted small">
                  {[cap(p.species), p.breed, cap(p.sex)].filter(Boolean).join(' · ')}
                  {p.dateOfBirth && ` · Born ${formatDate(p.dateOfBirth)}`}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="muted small">To change your pets' details, please get in touch with us.</p>
    </section>
  );
}

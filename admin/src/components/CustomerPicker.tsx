import { useState } from 'react';
import type { Animal, Customer } from '../types';
import { ChevronDownIcon } from './icons';

// A searchable customer picker: the field doubles as a search box, and the
// dropdown lists customers A-Z (filtered by name/email as you type, and by
// their animals' names when `animals` is passed -- typing a dog's name finds
// its owner). Shared by the invoice/quote form and the New Booking modal,
// replacing a plain <select> so a long, unordered customer list is quick to search.
export default function CustomerPicker({
  customers,
  animals,
  value,
  onChange,
}: {
  customers: Customer[];
  animals?: Animal[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = customers.find((c) => c._id === value);
  const sorted = [...customers].sort((a, b) => a.name.localeCompare(b.name));
  const q = query.trim().toLowerCase();
  // Names of each customer's animals matching the query, shown beside the
  // customer so it's clear why they matched.
  const animalMatches = new Map<string, string[]>();
  if (q && animals) {
    for (const a of animals) {
      if (a.name?.toLowerCase().includes(q)) {
        animalMatches.set(a.customer, [...(animalMatches.get(a.customer) ?? []), a.name]);
      }
    }
  }
  const filtered = q
    ? sorted.filter(
        (c) => c.name.toLowerCase().includes(q) || (c.email ?? '').toLowerCase().includes(q) || animalMatches.has(c._id),
      )
    : sorted;

  return (
    <div className="item-picker">
      <input
        type="text"
        placeholder={animals ? 'Search customer or dog name…' : 'Select a customer…'}
        value={open ? query : selected?.name ?? ''}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setQuery('');
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      <button type="button" className="item-picker-btn" onClick={() => setOpen((o) => !o)} aria-label="Choose a customer">
        <ChevronDownIcon />
      </button>
      {open && (
        <div className="item-suggestions" style={{ maxHeight: 280, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div className="item-suggestion-row" style={{ color: 'var(--muted)' }}>
              No matches
            </div>
          ) : (
            filtered.map((c) => (
              <div
                key={c._id}
                className="item-suggestion-row"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(c._id);
                  setQuery('');
                  setOpen(false);
                }}
              >
                <span className="item-suggestion-name">{c.name}</span>
                {animalMatches.has(c._id) && (
                  <span style={{ color: 'var(--muted)', fontSize: '0.85em' }}>{animalMatches.get(c._id)!.join(', ')}</span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

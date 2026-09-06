import { useState } from 'react';
import type { Customer } from '../types';
import { ChevronDownIcon } from './icons';

// A searchable customer picker: the field doubles as a search box, and the
// dropdown lists customers A-Z (filtered by name/email as you type). Shared by
// the invoice/quote form and the New Booking modal, replacing a plain <select>
// so a long, unordered customer list is quick to search.
export default function CustomerPicker({
  customers,
  value,
  onChange,
}: {
  customers: Customer[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = customers.find((c) => c._id === value);
  const sorted = [...customers].sort((a, b) => a.name.localeCompare(b.name));
  const q = query.trim().toLowerCase();
  const filtered = q
    ? sorted.filter((c) => c.name.toLowerCase().includes(q) || (c.email ?? '').toLowerCase().includes(q))
    : sorted;

  return (
    <div className="item-picker">
      <input
        type="text"
        placeholder="Select a customer…"
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
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

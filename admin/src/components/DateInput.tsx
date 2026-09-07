import { useEffect, useRef, useState } from 'react';

// A native <input type="date"> draws its text in the device's own region
// format -- a US-region device shows mm/dd/yyyy no matter what the page
// declares (Safari and Firefox ignore lang="en-GB" entirely). This replaces
// the visible control with a dd/mm/yyyy text field the user can type into,
// keeping a hidden native input purely so the calendar button can open its
// picker. Value in/out stays 'YYYY-MM-DD', same as a native date input's.

function toDisplay(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : '';
}

function toIso(text: string): string {
  const match = text.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return '';
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const probe = new Date(year, month - 1, day);
  if (probe.getFullYear() !== year || probe.getMonth() !== month - 1 || probe.getDate() !== day) return '';
  return `${match[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export default function DateInput({
  value,
  onChange,
  required,
  disabled,
  readOnly,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState(toDisplay(value));
  const textRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);

  // Adopt outside changes (calendar picks, code setting a date) without
  // clobbering half-typed text that already parses to the current value.
  useEffect(() => {
    setText((prev) => (toIso(prev) === value ? prev : toDisplay(value)));
  }, [value]);

  function handleText(next: string) {
    setText(next);
    const iso = toIso(next);
    onChange(iso);
    // A filled-but-unparseable field must block submit even when the form
    // only marks the input `required` (its emitted value being '' wouldn't).
    textRef.current?.setCustomValidity(next.trim() && !iso ? 'Enter the date as dd/mm/yyyy' : '');
  }

  function handleBlur() {
    // Normalise e.g. "1/2/2026" -> "01/02/2026"; leave invalid text visible
    // so the validity message shown on submit refers to what the user typed.
    const iso = toIso(text);
    if (iso) setText(toDisplay(iso));
  }

  function openPicker() {
    const el = pickerRef.current;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      el.focus();
    }
  }

  return (
    <div className="date-input">
      <input
        ref={textRef}
        type="text"
        inputMode="numeric"
        placeholder="dd/mm/yyyy"
        value={text}
        onChange={(e) => handleText(e.target.value)}
        onBlur={handleBlur}
        required={required}
        disabled={disabled}
        readOnly={readOnly}
        autoFocus={autoFocus}
      />
      {!disabled && !readOnly && (
        <>
          <button type="button" className="date-input-btn" onClick={openPicker} tabIndex={-1} aria-label="Open calendar">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </button>
          <input
            ref={pickerRef}
            type="date"
            className="date-input-native"
            tabIndex={-1}
            aria-hidden="true"
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              // Chrome/Firefox close the picker on selection; Safari keeps it
              // open until the input blurs, and this input is invisible so the
              // user has no way to blur it themselves.
              e.target.blur();
            }}
          />
        </>
      )}
    </div>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: 'text' | 'tel' | 'email' | 'number' | 'date';
  multiline?: boolean;
  hint?: string;
  placeholder?: string;
}

// A native <input type="date">'s own displayed text follows the browser/OS
// locale -- Chrome respects lang="en-GB", but Safari and Firefox always use
// the device's own region setting and ignore the page entirely. Rather than
// fight that per-browser, this renders a small always-correct label
// alongside it, computed from the input's own value (a date input's value is
// always 'YYYY-MM-DD' regardless of how the widget itself displays it).
function DateReadout({ value }: { value: string }) {
  if (!value) return null;
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  const label = new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return <span className="date-readout">{label}</span>;
}

export function TextField({
  label,
  value,
  onChange,
  required,
  type = 'text',
  multiline,
  hint,
  placeholder,
}: TextFieldProps) {
  return (
    <div className="field">
      <label>
        {label} {required && <span className="required">*</span>}
      </label>
      {multiline ? (
        <textarea value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input
          type={type}
          lang={type === 'date' ? 'en-GB' : undefined}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {type === 'date' && <DateReadout value={value} />}
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

interface ToggleFieldProps {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}

export function ToggleField({ label, value, onChange }: ToggleFieldProps) {
  return (
    // The whole row is one label (not just the switch) so tapping the text
    // toggles it too -- a 44x24px switch alone is a small target on mobile.
    <label className="toggle-row">
      <span className="toggle">
        <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
        <span className="toggle-slider" />
      </span>
      <span>{label}</span>
    </label>
  );
}

interface ChoiceGroupProps<T extends string> {
  label: string;
  value: T | '' | null;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  required?: boolean;
}

export function ChoiceGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  required,
}: ChoiceGroupProps<T>) {
  return (
    <div className="field">
      <label>
        {label} {required && <span className="required">*</span>}
      </label>
      <div className="choice-group">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`choice-btn${value === opt.value ? ' active' : ''}`}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface SelectFieldProps<T extends string> {
  label: string;
  value: T | '';
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  required?: boolean;
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  required,
}: SelectFieldProps<T>) {
  return (
    <div className="field">
      <label>
        {label} {required && <span className="required">*</span>}
      </label>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        <option value="" disabled>
          Select…
        </option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

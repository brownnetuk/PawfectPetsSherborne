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
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
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
    <div className="toggle-row">
      <label className="toggle">
        <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
        <span className="toggle-slider" />
      </label>
      <span>{label}</span>
    </div>
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

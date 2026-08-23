// Re-exports the intake wizard's own field primitives -- they're already
// generic, not intake-specific -- plus one genuinely new field: a checkbox
// group for "multichoice" answers, which nothing in this app has needed before.
export { TextField, ToggleField, ChoiceGroup, SelectField } from '../intake/fields';

interface MultiChoiceFieldProps {
  label: string;
  value: string[];
  options: string[];
  onChange: (v: string[]) => void;
  required?: boolean;
}

export function MultiChoiceField({ label, value, options, onChange, required }: MultiChoiceFieldProps) {
  function toggle(option: string) {
    onChange(value.includes(option) ? value.filter((v) => v !== option) : [...value, option]);
  }

  return (
    <div className="field">
      <label>
        {label} {required && <span className="required">*</span>}
      </label>
      <div className="choice-group">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            className={`choice-btn${value.includes(opt) ? ' active' : ''}`}
            onClick={() => toggle(opt)}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

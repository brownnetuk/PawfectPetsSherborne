interface Props {
  value: number;
  onChange: (value: number) => void;
  title?: string;
  subtitle?: string;
  allowZero?: boolean;
}

const OPTIONS = [1, 2, 3, 4, 5, 6];

export default function PetCountStep({
  value,
  onChange,
  title = 'How many pets?',
  subtitle = "We'll ask for details on each one next.",
  allowZero,
}: Props) {
  const options = allowZero ? [0, ...OPTIONS] : OPTIONS;
  return (
    <div>
      <h2>{title}</h2>
      <p className="subtitle">{subtitle}</p>
      <div className="choice-group">
        {options.map((n) => (
          <button
            key={n}
            type="button"
            className={`choice-btn${value === n ? ' active' : ''}`}
            onClick={() => onChange(n)}
          >
            {n === 0 ? 'None' : n}
          </button>
        ))}
      </div>
      <p className="field-hint" style={{ marginTop: 12 }}>
        More than 6 pets? Get in touch with us directly and we'll help you register them.
      </p>
    </div>
  );
}

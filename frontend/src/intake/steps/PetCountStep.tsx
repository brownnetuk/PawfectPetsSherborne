interface Props {
  value: number;
  onChange: (value: number) => void;
}

const OPTIONS = [1, 2, 3, 4, 5, 6];

export default function PetCountStep({ value, onChange }: Props) {
  return (
    <div>
      <h2>How many pets?</h2>
      <p className="subtitle">We'll ask for details on each one next.</p>
      <div className="choice-group">
        {OPTIONS.map((n) => (
          <button
            key={n}
            type="button"
            className={`choice-btn${value === n ? ' active' : ''}`}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        ))}
      </div>
      <p className="field-hint" style={{ marginTop: 12 }}>
        More than 6 pets? Get in touch with us directly and we'll help you register them.
      </p>
    </div>
  );
}

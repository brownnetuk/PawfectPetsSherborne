interface Props {
  current: number;
  total: number;
  label: string;
}

export default function ProgressBar({ current, total, label }: Props) {
  const percent = Math.round((current / total) * 100);
  return (
    <div className="progress">
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <div className="progress-label">
        Step {current} of {total} — {label}
      </div>
    </div>
  );
}

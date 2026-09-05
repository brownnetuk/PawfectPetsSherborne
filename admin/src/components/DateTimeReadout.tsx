// A native <input type="date">/<input type="time">'s own displayed text
// follows the browser/OS's locale -- Chrome respects a page's lang="en-GB"
// attribute, but Safari and Firefox always use the device's own region
// setting and ignore the page entirely. Rather than fight that per-browser,
// these render a small always-correct label alongside the input, computed
// in code from the input's own value (which is locale-independent: a date
// input's value is always 'YYYY-MM-DD' and a time input's is always 24h
// 'HH:mm' regardless of how the widget itself displays it).

export function DateReadout({ value }: { value: string | undefined | null }) {
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

export function TimeReadout({ value }: { value: string | undefined | null }) {
  if (!value) return null;
  return <span className="date-readout">{value}</span>;
}

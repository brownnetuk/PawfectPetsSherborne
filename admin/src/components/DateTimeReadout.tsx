// A native <input type="time">'s own displayed text follows the browser/OS's
// locale -- Chrome respects a page's lang="en-GB" attribute, but Safari and
// Firefox always use the device's own region setting and ignore the page
// entirely (so a US-region device shows 12h AM/PM). Rather than fight that
// per-browser, this renders a small always-correct label alongside the
// input, computed from the input's own value (which is locale-independent:
// a time input's value is always 24h 'HH:mm' regardless of how the widget
// itself displays it). Date inputs used to get the same treatment; they're
// now replaced entirely by components/DateInput.tsx instead.

export function TimeReadout({ value }: { value: string | undefined | null }) {
  if (!value) return null;
  return <span className="date-readout">{value}</span>;
}

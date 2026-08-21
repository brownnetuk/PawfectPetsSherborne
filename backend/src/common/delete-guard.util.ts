/** Turns e.g. { invoice: 2, quote: 1 } into "2 invoices and 1 quote", skipping zero counts. */
export function describeBlockers(counts: Record<string, number>): string | null {
  const parts = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([label, n]) => `${n} ${label}${n === 1 ? '' : 's'}`);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

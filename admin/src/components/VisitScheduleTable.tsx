import type { QuoteVisitPlan } from '../types';

// The small visit-schedule table shown inside a document's Notes section for
// quotes carrying a Visits plan (and the invoices converted from them). The
// PDFs render the same content as text via visitScheduleText in the PDF
// builders; this is the on-screen HTML twin.
export default function VisitScheduleTable({ plan }: { plan: QuoteVisitPlan }) {
  const uk = (s: string) => s.slice(0, 10).split('-').reverse().join('/');
  const names = plan.animals
    .map((a) => (typeof a === 'string' ? null : a.name))
    .filter(Boolean)
    .join(', ');
  const rows: [string, string][] = [
    ['Dates', `${uk(plan.startDate)} – ${uk(plan.endDate)}`],
    ['Visits', `${plan.visitsPerDay} per day (first day ${plan.visitsFirstDay}, last day ${plan.visitsLastDay})`],
  ];
  if (names) rows.push(['Pets', names]);
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 4 }}>Visit Schedule</div>
      <table style={{ borderCollapse: 'collapse', fontSize: '0.82rem' }}>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <td style={{ border: '1px solid var(--border, #e3e8de)', padding: '4px 10px', fontWeight: 600 }}>{label}</td>
              <td style={{ border: '1px solid var(--border, #e3e8de)', padding: '4px 10px', color: 'var(--muted, #6f7d72)' }}>
                {value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

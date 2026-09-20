import type { QuoteBoardingPlan, QuoteDayCarePlan, QuoteVisitPlan } from '../types';

function animalNames(animals: (string | { name: string })[]): string {
  return animals
    .map((a) => (typeof a === 'string' ? null : a.name))
    .filter(Boolean)
    .join(', ');
}
function uk(s: string): string {
  return s.slice(0, 10).split('-').reverse().join('/');
}

interface Props {
  visitPlan?: QuoteVisitPlan | null;
  dayCarePlan?: QuoteDayCarePlan | null;
  boardingPlan?: QuoteBoardingPlan | null;
}

// The small schedule table shown inside a document's Notes section for a
// quote carrying a Visits/Day Care/Boarding plan (and the invoices converted
// from them) -- a record only ever has one of the three. The PDFs render the
// same rows as text via scheduleText in the PDF builders; this is the
// on-screen HTML twin.
export default function ScheduleTable({ visitPlan, dayCarePlan, boardingPlan }: Props) {
  let title: string;
  let rows: [string, string][];
  if (visitPlan) {
    title = 'Visit Schedule';
    rows = [
      ['Dates', `${uk(visitPlan.startDate)} – ${uk(visitPlan.endDate)}`],
      [
        'Visits',
        `${visitPlan.visitsPerDay} per day (first day ${visitPlan.visitsFirstDay}, last day ${visitPlan.visitsLastDay})`,
      ],
    ];
    const names = animalNames(visitPlan.animals);
    if (names) rows.push(['Pets', names]);
  } else if (dayCarePlan) {
    title = 'Day Care Schedule';
    rows = [
      ['Date', uk(dayCarePlan.date)],
      ['Drop off', `${dayCarePlan.dropOffPeriod} (${dayCarePlan.dropOffTime})`],
      ['Collection', `${dayCarePlan.collectionPeriod} (${dayCarePlan.collectionTime})`],
    ];
    const names = animalNames(dayCarePlan.animals);
    if (names) rows.push(['Pets', names]);
  } else if (boardingPlan) {
    title = 'Boarding Schedule';
    rows = [
      ['Dates', `${uk(boardingPlan.startDate)} – ${uk(boardingPlan.endDate)}`],
      ['Drop off', boardingPlan.dropOffTime],
      ['Pick up', boardingPlan.pickUpTime],
    ];
    const names = animalNames(boardingPlan.animals);
    if (names) rows.push(['Pets', names]);
  } else {
    return null;
  }

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 4 }}>{title}</div>
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

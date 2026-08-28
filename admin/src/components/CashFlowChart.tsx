import type { IncomeExpenseMonth } from '../types';

interface Props {
  data: IncomeExpenseMonth[];
  // Running cash balance at the start of `data[0]`'s month -- the line plots
  // this plus each month's net income/expense added on cumulatively, ending
  // at the sum of the bank accounts' current balances.
  startingCash: number;
}

function monthLabel(month: string): { label: string; year: string } {
  const [y, m] = month.split('-').map(Number);
  const date = new Date(y, m - 1, 1);
  return { label: date.toLocaleDateString('en-GB', { month: 'short' }), year: String(y) };
}

// Rounds a chart max up to a "nice" gridline value (1/2/2.5/5/10 x a power of ten).
function niceCeil(value: number): number {
  if (value <= 0) return 100;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = step * magnitude;
    if (candidate >= value) return candidate;
  }
  return 10 * magnitude;
}

const WIDTH = 700;
const HEIGHT = 220;
const PADDING_LEFT = 54;
const PADDING_BOTTOM = 34;
const PADDING_TOP = 14;
const GRID_LINES = 4;

export default function CashFlowChart({ data, startingCash }: Props) {
  const chartHeight = HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  const chartWidth = WIDTH - PADDING_LEFT - 10;

  const points: number[] = [];
  let running = startingCash;
  for (const m of data) {
    running += m.net;
    points.push(running);
  }

  const allValues = [startingCash, ...points];
  const minValue = Math.min(...allValues, 0);
  const maxValue = niceCeil(Math.max(...allValues, 0));
  const range = maxValue - minValue || 1;

  const stepX = data.length > 1 ? chartWidth / (data.length - 1) : 0;
  const toY = (value: number) => PADDING_TOP + chartHeight - ((value - minValue) / range) * chartHeight;
  const toX = (i: number) => PADDING_LEFT + i * stepX;

  const linePath = points.map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(v)}`).join(' ');
  const areaPath = `${linePath} L ${toX(points.length - 1)} ${PADDING_TOP + chartHeight} L ${toX(0)} ${PADDING_TOP + chartHeight} Z`;

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {Array.from({ length: GRID_LINES + 1 }, (_, i) => {
        const y = PADDING_TOP + (chartHeight / GRID_LINES) * i;
        const value = Math.round(maxValue - ((maxValue - minValue) / GRID_LINES) * i);
        return (
          <g key={i}>
            <line x1={PADDING_LEFT} y1={y} x2={WIDTH} y2={y} stroke="var(--border)" strokeWidth={1} />
            <text x={PADDING_LEFT - 8} y={y + 4} textAnchor="end" fontSize={11} fill="var(--muted)">
              £{value}
            </text>
          </g>
        );
      })}
      {points.length > 0 && (
        <>
          <path d={areaPath} fill="var(--accent-light)" stroke="none" />
          <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          {points.map((v, i) => (
            <circle key={i} cx={toX(i)} cy={toY(v)} r={3.5} fill="var(--accent)">
              <title>
                {monthLabel(data[i].month).label} {monthLabel(data[i].month).year} — £{v.toFixed(2)}
              </title>
            </circle>
          ))}
        </>
      )}
      {data.map((d, i) => {
        const { label, year } = monthLabel(d.month);
        return (
          <g key={d.month}>
            <text x={toX(i)} y={HEIGHT - PADDING_BOTTOM + 16} textAnchor="middle" fontSize={11} fill="var(--muted)">
              {label}
            </text>
            <text x={toX(i)} y={HEIGHT - PADDING_BOTTOM + 30} textAnchor="middle" fontSize={10} fill="var(--muted)">
              {year}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

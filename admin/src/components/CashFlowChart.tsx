import type { IncomeExpenseMonth } from '../types';

interface Props {
  // Only `net` is plotted; `month` (YYYY-MM) supplies the axis label unless
  // `labels` overrides it (e.g. weekly buckets on the Projected Flow card).
  data: Pick<IncomeExpenseMonth, 'month' | 'net'>[];
  // Running cash balance at the start of `data[0]`'s month -- the line plots
  // this plus each month's net income/expense added on cumulatively, ending
  // at the sum of the bank accounts' current balances.
  startingCash: number;
  labels?: { label: string; year: string }[];
  // Dashed line + lighter fill, for a forecast rather than actuals.
  projected?: boolean;
  // false plots each period's own net figure instead of the running balance
  // (startingCash is then ignored).
  cumulative?: boolean;
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
// Room for the last point's centred axis label, which otherwise clips.
const PADDING_RIGHT = 24;
const PADDING_BOTTOM = 34;
const PADDING_TOP = 14;
const GRID_LINES = 4;

export default function CashFlowChart({ data, startingCash, labels, projected, cumulative = true }: Props) {
  const labelAt = (i: number) => labels?.[i] ?? monthLabel(data[i].month);
  const chartHeight = HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  const chartWidth = WIDTH - PADDING_LEFT - PADDING_RIGHT;

  const points: number[] = [];
  let running = startingCash;
  for (const m of data) {
    running += m.net;
    points.push(cumulative ? running : m.net);
  }

  const allValues = cumulative ? [startingCash, ...points] : points;
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
          <path d={areaPath} fill="var(--accent-light)" fillOpacity={projected ? 0.6 : 1} stroke="none" />
          <path
            d={linePath}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray={projected ? '7 6' : undefined}
          />
          {points.map((v, i) => (
            <circle key={i} cx={toX(i)} cy={toY(v)} r={3.5} fill="var(--accent)">
              <title>
                {labelAt(i).label} {labelAt(i).year} — £{v.toFixed(2)}
              </title>
            </circle>
          ))}
        </>
      )}
      {data.map((d, i) => {
        const { label, year } = labelAt(i);
        return (
          <g key={`${d.month}-${i}`}>
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

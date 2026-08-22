import type { IncomeMonth } from '../types';

interface Props {
  data: IncomeMonth[];
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
const PADDING_LEFT = 44;
const PADDING_BOTTOM = 34;
const PADDING_TOP = 10;
const GRID_LINES = 5;

export default function IncomeChart({ data }: Props) {
  const chartHeight = HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  const chartWidth = WIDTH - PADDING_LEFT;
  const actualMax = Math.max(...data.map((d) => d.total), 0);
  const maxValue = actualMax > 0 ? niceCeil(actualMax) : 100;
  const barGap = data.length > 0 ? Math.min(20, chartWidth / data.length / 3) : 0;
  const barWidth = data.length > 0 ? (chartWidth - barGap * (data.length + 1)) / data.length : 0;

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {Array.from({ length: GRID_LINES + 1 }, (_, i) => {
        const y = PADDING_TOP + (chartHeight / GRID_LINES) * i;
        const value = Math.round(maxValue - (maxValue / GRID_LINES) * i);
        return (
          <g key={i}>
            <line x1={PADDING_LEFT} y1={y} x2={WIDTH} y2={y} stroke="var(--border)" strokeWidth={1} />
            <text x={PADDING_LEFT - 8} y={y + 4} textAnchor="end" fontSize={11} fill="var(--muted)">
              {value}
            </text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const x = PADDING_LEFT + barGap + i * (barWidth + barGap);
        const barHeight = maxValue > 0 ? (d.total / maxValue) * chartHeight : 0;
        const y = PADDING_TOP + chartHeight - barHeight;
        const { label, year } = monthLabel(d.month);
        return (
          <g key={d.month}>
            <rect x={x} y={y} width={barWidth} height={Math.max(barHeight, 0)} rx={3} fill="var(--accent)">
              <title>
                {label} {year} — £{d.total.toFixed(2)}
              </title>
            </rect>
            <text x={x + barWidth / 2} y={HEIGHT - PADDING_BOTTOM + 16} textAnchor="middle" fontSize={11} fill="var(--muted)">
              {label}
            </text>
            <text x={x + barWidth / 2} y={HEIGHT - PADDING_BOTTOM + 30} textAnchor="middle" fontSize={10} fill="var(--muted)">
              {year}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

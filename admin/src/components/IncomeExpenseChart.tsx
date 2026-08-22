import type { IncomeExpenseMonth } from '../types';

interface Props {
  data: IncomeExpenseMonth[];
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
const HEIGHT = 240;
const PADDING_LEFT = 44;
const PADDING_BOTTOM = 34;
const PADDING_TOP = 10;
const GRID_LINES = 5;

export default function IncomeExpenseChart({ data }: Props) {
  const chartHeight = HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  const chartWidth = WIDTH - PADDING_LEFT;
  const actualMax = Math.max(...data.map((d) => Math.max(d.income, d.expenses)), 0);
  const maxValue = actualMax > 0 ? niceCeil(actualMax) : 100;
  const groupGap = data.length > 0 ? Math.min(20, chartWidth / data.length / 3) : 0;
  const groupWidth = data.length > 0 ? (chartWidth - groupGap * (data.length + 1)) / data.length : 0;
  const barGap = 3;
  const barWidth = (groupWidth - barGap) / 2;

  return (
    <div>
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
          const groupX = PADDING_LEFT + groupGap + i * (groupWidth + groupGap);
          const incomeHeight = maxValue > 0 ? (d.income / maxValue) * chartHeight : 0;
          const expenseHeight = maxValue > 0 ? (d.expenses / maxValue) * chartHeight : 0;
          const { label, year } = monthLabel(d.month);
          return (
            <g key={d.month}>
              <rect
                x={groupX}
                y={PADDING_TOP + chartHeight - Math.max(incomeHeight, 0)}
                width={barWidth}
                height={Math.max(incomeHeight, 0)}
                rx={3}
                fill="var(--accent)"
              >
                <title>
                  {label} {year} Income — £{d.income.toFixed(2)}
                </title>
              </rect>
              <rect
                x={groupX + barWidth + barGap}
                y={PADDING_TOP + chartHeight - Math.max(expenseHeight, 0)}
                width={barWidth}
                height={Math.max(expenseHeight, 0)}
                rx={3}
                fill="var(--error)"
              >
                <title>
                  {label} {year} Expenses — £{d.expenses.toFixed(2)}
                </title>
              </rect>
              <text x={groupX + groupWidth / 2} y={HEIGHT - PADDING_BOTTOM + 16} textAnchor="middle" fontSize={11} fill="var(--muted)">
                {label}
              </text>
              <text x={groupX + groupWidth / 2} y={HEIGHT - PADDING_BOTTOM + 30} textAnchor="middle" fontSize={10} fill="var(--muted)">
                {year}
              </text>
            </g>
          );
        })}
      </svg>
      <div style={{ display: 'flex', gap: 18, justifyContent: 'center', marginTop: 6, fontSize: '0.8rem', color: 'var(--muted)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--accent)', display: 'inline-block' }} />
          Income
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--error)', display: 'inline-block' }} />
          Expenses
        </span>
      </div>
    </div>
  );
}

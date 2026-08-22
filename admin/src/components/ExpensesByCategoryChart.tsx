import type { ExpenseCategoryTotal } from '../types';

interface Props {
  data: ExpenseCategoryTotal[];
}

const ROW_HEIGHT = 32;
const BAR_HEIGHT = 18;
const LABEL_WIDTH = 160;
const WIDTH = 700;

export default function ExpensesByCategoryChart({ data }: Props) {
  const maxValue = Math.max(...data.map((d) => d.total), 0);
  const chartWidth = WIDTH - LABEL_WIDTH - 70;
  const height = data.length * ROW_HEIGHT;

  return (
    <svg viewBox={`0 0 ${WIDTH} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {data.map((d, i) => {
        const y = i * ROW_HEIGHT + (ROW_HEIGHT - BAR_HEIGHT) / 2;
        const barWidth = maxValue > 0 ? (d.total / maxValue) * chartWidth : 0;
        return (
          <g key={d.category}>
            <text x={LABEL_WIDTH - 10} y={y + BAR_HEIGHT / 2 + 4} textAnchor="end" fontSize={12} fill="var(--ink)">
              {d.category}
            </text>
            <rect x={LABEL_WIDTH} y={y} width={Math.max(barWidth, 2)} height={BAR_HEIGHT} rx={3} fill="var(--error)">
              <title>
                {d.category} — £{d.total.toFixed(2)}
              </title>
            </rect>
            <text x={LABEL_WIDTH + barWidth + 8} y={y + BAR_HEIGHT / 2 + 4} fontSize={12} fill="var(--muted)">
              £{d.total.toFixed(2)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

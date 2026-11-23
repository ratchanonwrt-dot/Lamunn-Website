import { formatBaht } from "@/lib/format";

interface Slice {
  label: string;
  value: number;
  color: string;
}

// Fixed categorical order (validated palette) — never reassign per data, always by role.
export const CHART_COLORS = {
  blue: "#2a78d6",
  green: "#008300",
  magenta: "#e87ba4",
  yellow: "#eda100",
  aqua: "#1baf7a",
  orange: "#eb6834",
  violet: "#4a3aa7",
  red: "#e34948",
};

export default function DonutChart({
  data,
  size = 160,
  formatValue = formatBaht,
  unit = "บาท",
}: {
  data: Slice[];
  size?: number;
  formatValue?: (value: number) => string;
  unit?: string;
}) {
  const total = data.reduce((a, d) => a + d.value, 0);
  const r = size / 2 - 14;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const gapPx = 3;

  let cumulative = 0;
  const segments = data
    .filter((d) => d.value > 0)
    .map((d) => {
      const fraction = total > 0 ? d.value / total : 0;
      const dash = Math.max(0, fraction * circumference - gapPx);
      const offset = -cumulative * circumference;
      cumulative += fraction;
      return { ...d, dash, offset, fraction };
    });

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e1e0d9" strokeWidth={16} />
        {segments.map((s, i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={16}
            strokeDasharray={`${s.dash} ${circumference - s.dash}`}
            strokeDashoffset={s.offset}
            strokeLinecap="round"
            transform={`rotate(-90 ${cx} ${cy})`}
          >
            {/* A single interpolated string, not multiple JSX children — React DOM only
                supports one text-node child for <title>; with several children it renders
                empty server-side but joins them client-side, causing a hydration mismatch. */}
            <title>{`${s.label}: ${formatValue(s.value)} ${unit} (${(s.fraction * 100).toFixed(1)}%)`}</title>
          </circle>
        ))}
        <text x={cx} y={cy - 4} textAnchor="middle" className="fill-gray-800" style={{ fontSize: 15, fontWeight: 700 }}>
          {formatValue(total)}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" className="fill-gray-400" style={{ fontSize: 10 }}>
          {unit}
        </text>
      </svg>
      <ul className="flex flex-col gap-1.5 text-sm">
        {data.map((d, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
            <span className="text-gray-600">{d.label}</span>
            <span className="ml-auto font-medium text-gray-800">
              {total > 0 ? ((d.value / total) * 100).toFixed(1) : "0.0"}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

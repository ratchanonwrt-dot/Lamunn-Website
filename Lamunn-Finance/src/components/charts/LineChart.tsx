import { formatBaht } from "@/lib/format";

interface Series {
  label: string;
  color: string;
  points: number[]; // one value per day index (1..N)
  /** เส้นประ — ใช้กับเส้นค่าเฉลี่ย/แนวโน้ม ให้แยกจากเส้นยอดจริงได้ด้วยตา */
  dashed?: boolean;
}

/** xLabels: ป้ายแกน X ต่อจุด (เช่น "14/10") — ไม่ใส่ = ใช้เลขลำดับวัน 1..N แบบเดิม (กราฟรายเดือน) */
export default function LineChart({
  series,
  width = 720,
  height = 220,
  xLabels,
}: {
  series: Series[];
  width?: number;
  height?: number;
  xLabels?: string[];
}) {
  const padding = { top: 12, right: 12, bottom: 24, left: 48 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const maxLen = Math.max(...series.map((s) => s.points.length), 1);
  const maxVal = Math.max(...series.flatMap((s) => s.points), 1);
  const niceMax = maxVal <= 0 ? 1 : Math.ceil(maxVal / 4) * 4;

  const xFor = (i: number) => padding.left + (maxLen === 1 ? 0 : (i / (maxLen - 1)) * innerW);
  const yFor = (v: number) => padding.top + innerH - (v / niceMax) * innerH;

  const gridTicks = [0, 0.25, 0.5, 0.75, 1];
  const xLabelEvery = Math.max(1, Math.round(maxLen / 8));

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
        {gridTicks.map((t, i) => {
          const y = padding.top + innerH * (1 - t);
          return (
            <g key={i}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#e1e0d9" strokeWidth={1} />
              <text x={padding.left - 8} y={y + 3} textAnchor="end" className="fill-gray-400" style={{ fontSize: 10 }}>
                {formatBaht(niceMax * t)}
              </text>
            </g>
          );
        })}

        {Array.from({ length: maxLen }, (_, i) => i)
          .filter((i) => i % xLabelEvery === 0)
          .map((i) => (
            <text
              key={i}
              x={xFor(i)}
              y={height - 6}
              textAnchor="middle"
              className="fill-gray-400"
              style={{ fontSize: 10 }}
            >
              {xLabels?.[i] ?? i + 1}
            </text>
          ))}

        {series.map((s, si) => {
          const points = s.points.map((v, i) => `${xFor(i)},${yFor(v)}`).join(" ");
          return (
            <polyline
              key={si}
              points={points}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeDasharray={s.dashed ? "6 4" : undefined}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}
      </svg>
      {series.length > 1 && (
        <ul className="mt-2 flex flex-wrap gap-4 text-xs text-gray-600">
          {series.map((s, i) => (
            <li key={i} className="flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-full" style={{ backgroundColor: s.color }} />
              {s.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

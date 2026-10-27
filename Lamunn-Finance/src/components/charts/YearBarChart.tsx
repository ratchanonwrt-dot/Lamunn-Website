import { formatBaht } from "@/lib/format";

/** กราฟแท่งยอดรายเดือนทั้งปี + เส้นปีก่อน + เส้นแนวโน้ม (ค่าเฉลี่ย 3 เดือน)
 * SVG ล้วน ไม่มี JS ฝั่ง client — วาดเสร็จจากเซิร์ฟเวอร์ ขยายตามความกว้างจอด้วย viewBox */
export default function YearBarChart({
  labels,
  bars,
  partial,
  lastYear,
  trend,
  width = 760,
  height = 260,
}: {
  labels: string[];
  bars: (number | null)[]; // null = เดือนอนาคต
  partial: boolean[]; // เดือนที่ยังไม่จบ วาดแท่งจางกว่า
  lastYear: number[];
  trend: (number | null)[];
  width?: number;
  height?: number;
}) {
  const pad = { top: 16, right: 12, bottom: 28, left: 56 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const n = labels.length;
  const maxVal = Math.max(1, ...bars.map((v) => v ?? 0), ...lastYear, ...trend.map((v) => v ?? 0));
  const step = Math.pow(10, Math.floor(Math.log10(maxVal)));
  const niceMax = Math.ceil(maxVal / step) * step;
  const slot = innerW / n;
  const barW = Math.min(36, slot * 0.6);
  const xMid = (i: number) => pad.left + slot * i + slot / 2;
  const y = (v: number) => pad.top + innerH - (v / niceMax) * innerH;

  const line = (vals: (number | null)[]) =>
    vals
      .map((v, i) => (v === null ? null : `${xMid(i)},${y(v)}`))
      .filter(Boolean)
      .join(" ");
  const hasLastYear = lastYear.some((v) => v > 0);

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const yy = pad.top + innerH * (1 - t);
          return (
            <g key={t}>
              <line x1={pad.left} x2={width - pad.right} y1={yy} y2={yy} stroke="#e6e3dc" strokeWidth={1} />
              <text x={pad.left - 8} y={yy + 3} textAnchor="end" className="fill-gray-400" style={{ fontSize: 10 }}>
                {niceMax * t >= 1_000_000 ? `${(niceMax * t) / 1_000_000}M` : formatBaht(niceMax * t)}
              </text>
            </g>
          );
        })}

        {bars.map((v, i) =>
          v === null || v <= 0 ? null : (
            <g key={i}>
              <rect
                x={xMid(i) - barW / 2}
                y={y(v)}
                width={barW}
                height={pad.top + innerH - y(v)}
                rx={3}
                fill="#3468b5"
                opacity={partial[i] ? 0.45 : 1}
              >
                <title>{`${labels[i]}: ${formatBaht(v)} บาท${partial[i] ? " (ยังไม่จบเดือน)" : ""}`}</title>
              </rect>
              <text x={xMid(i)} y={y(v) - 4} textAnchor="middle" className="fill-gray-500" style={{ fontSize: 9 }}>
                {v >= 1_000_000 ? `${(v / 1_000_000).toFixed(2)}M` : `${Math.round(v / 1000)}k`}
              </text>
            </g>
          )
        )}

        {hasLastYear && <polyline points={line(lastYear.map((v) => (v > 0 ? v : null)))} fill="none" stroke="#a39e93" strokeWidth={2} strokeDasharray="2 4" strokeLinecap="round" />}
        <polyline points={line(trend)} fill="none" stroke="#eb6834" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

        {labels.map((l, i) => (
          <text key={l} x={xMid(i)} y={height - 8} textAnchor="middle" className="fill-gray-500" style={{ fontSize: 11 }}>
            {l}
          </text>
        ))}
      </svg>
      <ul className="mt-2 flex flex-wrap gap-4 text-xs text-gray-600">
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-[#3468b5]" /> ยอดรายเดือน (แท่งจาง = เดือนที่ยังไม่จบ)
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 bg-[#eb6834]" /> แนวโน้ม (เฉลี่ย 3 เดือน)
        </li>
        {hasLastYear && (
          <li className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 border-t-2 border-dotted border-[#a39e93]" /> ปีก่อน
          </li>
        )}
      </ul>
    </div>
  );
}

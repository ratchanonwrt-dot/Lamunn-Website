import type { ReactNode } from "react";

export interface HeaderStat {
  label: string;
  value: string;
  sub?: string;
  // สีของตัวเลข — ใช้เฉพาะตัวเลขที่ต้องการให้คนหันมาดู (เช่น เลยกำหนดจ่าย) ที่เหลือเป็นสีขาว
  accent?: "amber" | "red" | "orange" | "emerald" | "sky";
}

const ACCENT: Record<NonNullable<HeaderStat["accent"]>, string> = {
  amber: "text-amber-300",
  red: "text-red-400",
  orange: "text-orange-300",
  emerald: "text-emerald-300",
  sky: "text-sky-300",
};

/** แถบหัวสีเข้มของหน้า Catering — ผู้ใช้ชอบเว็บพื้นดำ (หน้าแอดมินไลฟ์) เพราะตัวเลขเด่นอ่านง่าย
 * จึงรวมชื่อหน้า ปุ่มหลัก และตัวเลขสำคัญไว้ในแถบเดียว ไม่ต้องไล่อ่านหลายกล่อง */
export default function CateringHeader({ title, sub, actions, stats }: { title: string; sub?: ReactNode; actions?: ReactNode; stats?: HeaderStat[] }) {
  return (
    <div className="mb-5 overflow-hidden rounded-2xl bg-gray-900 text-white shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {sub && <div className="mt-0.5 text-sm text-gray-300">{sub}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {stats && stats.length > 0 && (
        <div className="grid grid-cols-2 border-t border-white/10 sm:grid-cols-4">
          {stats.map((s, i) => (
            <div key={s.label} className={`px-5 py-3 ${i % 2 === 1 ? "border-l border-white/10" : ""} ${i >= 2 ? "border-t border-white/10 sm:border-t-0" : ""} ${i > 0 ? "sm:border-l" : ""}`}>
              <p className="text-xs font-medium text-gray-400">{s.label}</p>
              <p className={`mt-0.5 text-2xl font-bold tabular-nums ${s.accent ? ACCENT[s.accent] : "text-white"}`}>{s.value}</p>
              {s.sub && <p className="text-xs text-gray-400">{s.sub}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** ปุ่มบนแถบเข้ม — ปุ่มหลักสีขาว ปุ่มรองโปร่ง */
export const headerBtn = {
  primary: "inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-100",
  ghost: "inline-flex items-center gap-1.5 rounded-xl border border-white/20 px-4 py-2 text-sm font-medium text-white hover:bg-white/10",
};

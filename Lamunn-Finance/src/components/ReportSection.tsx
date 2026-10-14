import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/** กล่องหมวดของหน้ารายงานที่กดเปิด/ปิดได้ — หน้ารายงานยาวหลายหน้าจอเมื่อกางทุกหมวด
 * จึงให้แต่ละหมวดโชว์แค่หัวข้อกับตัวเลขสรุปบรรทัดเดียวก่อน กดแล้วค่อยกางรายละเอียด
 *
 * ใช้ <details> ของ HTML ล้วน — ไม่ต้องมี JS ฝั่ง client เปิด/ปิดได้ทันทีแม้หน้ายังโหลด JS ไม่เสร็จ
 * กราฟในหน้านี้เป็น SVG viewBox ไม่ได้วัดขนาดกล่อง จึงวาดถูกแม้ตอนแรกกล่องยังปิดอยู่ */
const TONES = {
  default: { box: "border-gray-200 bg-white", title: "text-gray-700", hint: "text-gray-400" },
  amber: { box: "border-amber-200 bg-amber-50", title: "text-amber-800", hint: "text-amber-700" },
  emerald: { box: "border-emerald-200 bg-emerald-50", title: "text-emerald-800", hint: "text-emerald-700" },
  red: { box: "border-red-200 bg-red-50", title: "text-red-800", hint: "text-red-700" },
  brand: { box: "border-brand-200 bg-brand-50/60", title: "text-brand-800", hint: "text-brand-700" },
} as const;

export default function ReportSection({
  id,
  title,
  summary,
  tone = "default",
  defaultOpen = false,
  children,
}: {
  id?: string;
  title: ReactNode;
  /** ตัวเลขสรุปบรรทัดเดียวที่เห็นได้โดยไม่ต้องกางกล่อง */
  summary?: ReactNode;
  tone?: keyof typeof TONES;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const t = TONES[tone];
  return (
    <details id={id} open={defaultOpen} className={`group mb-4 scroll-mt-4 rounded-xl border ${t.box}`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3.5 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className={`block text-sm font-semibold ${t.title}`}>{title}</span>
          {summary && <span className={`mt-0.5 block text-xs ${t.hint}`}>{summary}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-xs text-gray-400">
          <span className="group-open:hidden">ดู</span>
          <span className="hidden group-open:inline">ซ่อน</span>
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="px-5 pb-5">{children}</div>
    </details>
  );
}

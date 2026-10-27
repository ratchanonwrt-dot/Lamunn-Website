import { TONE, CHANNEL_COLOR, CHANNEL_LABEL, type BookingTone } from "@/lib/cateringStatus";

export function StatusBadge({ tone, size = "sm" }: { tone: BookingTone; size?: "sm" | "lg" }) {
  const t = TONE[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium ring-1 ring-inset ${t.badge} ${size === "lg" ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />
      {t.label}
    </span>
  );
}

export function ChannelTag({ source }: { source: string | null | undefined }) {
  if (!source) return null;
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${CHANNEL_COLOR[source] ?? CHANNEL_COLOR.OTHER}`}>{CHANNEL_LABEL[source] ?? source}</span>;
}

/** ตัวบอกจำนวนพนักงาน "คน 2/3" — แดงเมื่อยังไม่ครบตามกฎ 75 เสิร์ฟ/คน */
export function StaffCount({ have, need }: { have: number; need: number }) {
  const ok = have >= need;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${ok ? "bg-gray-100 text-gray-600" : "bg-red-100 text-red-700"}`}>
      👤 {have}/{need}
    </span>
  );
}

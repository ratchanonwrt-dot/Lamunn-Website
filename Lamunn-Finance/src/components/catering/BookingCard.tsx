import Link from "next/link";
import { formatBaht } from "@/lib/format";
import { TONE, bookingTone, daysAway, shortThaiDate } from "@/lib/cateringStatus";
import { StatusBadge, ChannelTag, StaffCount } from "./StatusBadge";

export interface BookingCardData {
  id: string;
  eventDate: Date;
  eventEndDate: Date | null;
  eventStartTime: string | null;
  eventEndTime: string | null;
  location: string | null;
  guestCount: number | null;
  totalAmount: number;
  paymentStatus: string;
  status: string;
  paymentDueDate: Date | null;
  customer: { name: string; source?: string | null };
  staffNames: string[];
  needStaff: number;
}

/** การ์ดงานจัดเลี้ยง 1 แถว — กล่องวันที่ทาสีตามสถานะ (เห็นสีก่อนอ่าน), ตัวหนังสือเข้มขนาดอ่านง่าย,
 * ข้อมูลรองเหลือบรรทัดเดียว ชื่อพนักงานโชว์เฉพาะตอนยังไม่ครบ (ตอนครบแล้วไม่ต้องอ่าน) */
export default function BookingCard({ b, today }: { b: BookingCardData; today: Date }) {
  const tone = bookingTone(b, today);
  const end = b.eventEndDate && b.eventEndDate > b.eventDate ? b.eventEndDate : b.eventDate;
  const past = end < today;
  const isToday = b.eventDate <= today && end >= today;
  const time = b.eventStartTime ? `${b.eventStartTime}${b.eventEndTime ? `–${b.eventEndTime}` : ""} น.` : null;
  const details = [time, b.guestCount != null ? `${b.guestCount} เสิร์ฟ` : null, b.location].filter(Boolean).join(" · ");
  const short = b.staffNames.length < b.needStaff && !past && tone !== "cancelled";
  const [dow, , mon] = shortThaiDate(b.eventDate).split(" ");

  return (
    <Link
      href={`/catering/bookings/${b.id}`}
      className={`group flex items-center gap-3.5 rounded-2xl border border-gray-200 bg-white p-3 shadow-card transition hover:border-gray-400 ${past ? "opacity-60" : ""} ${isToday ? "ring-2 ring-gray-900" : ""}`}
    >
      <div className={`flex w-16 shrink-0 flex-col items-center rounded-xl py-2 ${TONE[tone].date}`}>
        <span className="text-xs font-semibold">{dow}</span>
        <span className="text-2xl font-bold leading-none">{b.eventDate.getUTCDate()}</span>
        <span className="text-xs font-semibold">{mon}</span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-base font-bold text-gray-900">{b.customer.name}</span>
          <ChannelTag source={b.customer.source} />
          {end > b.eventDate && <span className="text-sm font-medium text-gray-600">ถึง {shortThaiDate(end)}</span>}
        </div>
        <p className="mt-0.5 truncate text-sm text-gray-700">{details || "ยังไม่ได้ระบุเวลา/จำนวนเสิร์ฟ"}</p>
        {short && (
          <p className="mt-0.5 truncate text-sm font-medium text-red-700">
            พนักงานยังไม่ครบ{b.staffNames.length ? ` · ${b.staffNames.join(", ")}` : ""}
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="text-base font-bold tabular-nums text-gray-900">{formatBaht(b.totalAmount)}</span>
        <div className="flex items-center gap-1.5">
          <StaffCount have={b.staffNames.length} need={b.needStaff} />
          <StatusBadge tone={tone} />
        </div>
        <span className={`text-xs font-semibold ${isToday ? "text-gray-900" : "text-gray-500"}`}>{daysAway(b.eventDate, today)}</span>
      </div>
    </Link>
  );
}

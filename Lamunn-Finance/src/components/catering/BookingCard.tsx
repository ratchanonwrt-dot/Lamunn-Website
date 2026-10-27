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

/** การ์ดงานจัดเลี้ยง 1 แถว — แถบสีซ้ายบอกสถานะ, กล่องวันที่ใหญ่อ่านง่าย, รายละเอียดรองบรรทัดเดียว */
export default function BookingCard({ b, today }: { b: BookingCardData; today: Date }) {
  const tone = bookingTone(b, today);
  const end = b.eventEndDate && b.eventEndDate > b.eventDate ? b.eventEndDate : b.eventDate;
  const past = end < today;
  const isToday = b.eventDate <= today && end >= today;
  const time = b.eventStartTime ? `${b.eventStartTime}${b.eventEndTime ? `–${b.eventEndTime}` : ""}` : null;
  const details = [time, b.guestCount != null ? `${b.guestCount} เสิร์ฟ` : null, b.location].filter(Boolean).join(" · ");

  return (
    <Link
      href={`/catering/bookings/${b.id}`}
      className={`group flex items-center gap-3 rounded-xl border border-l-4 border-gray-200 bg-white p-3 transition hover:shadow-sm ${TONE[tone].card} ${past ? "opacity-60" : ""} ${isToday ? "ring-2 ring-brand-200" : ""}`}
    >
      <div className="flex w-14 shrink-0 flex-col items-center rounded-lg bg-gray-50 py-1.5">
        <span className="text-[10px] text-gray-500">{shortThaiDate(b.eventDate).split(" ")[0]}</span>
        <span className="text-xl font-bold leading-none text-gray-800">{b.eventDate.getUTCDate()}</span>
        <span className="text-[10px] text-gray-500">{shortThaiDate(b.eventDate).split(" ")[2]}</span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate font-semibold text-gray-900 group-hover:text-brand-700">{b.customer.name}</span>
          <ChannelTag source={b.customer.source} />
          {end > b.eventDate && <span className="text-[11px] text-gray-400">ถึง {shortThaiDate(end)}</span>}
        </div>
        <p className="truncate text-xs text-gray-500">{details || "ยังไม่ได้ระบุเวลา/จำนวนเสิร์ฟ"}</p>
        <p className="mt-0.5 truncate text-[11px] text-gray-400">{b.staffNames.length ? b.staffNames.join(", ") : "ยังไม่ได้เลือกพนักงาน"}</p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <StatusBadge tone={tone} />
        <div className="flex items-center gap-1.5">
          <StaffCount have={b.staffNames.length} need={b.needStaff} />
          <span className="text-xs font-semibold text-gray-700">{formatBaht(b.totalAmount)}</span>
        </div>
        <span className={`text-[10px] ${isToday ? "font-semibold text-brand-600" : "text-gray-400"}`}>{daysAway(b.eventDate, today)}</span>
      </div>
    </Link>
  );
}

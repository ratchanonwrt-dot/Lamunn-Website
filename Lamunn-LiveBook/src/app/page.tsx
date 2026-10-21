import Link from "next/link";
import clsx from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { loadPublicWeek } from "@/lib/publicWeek";
import { todayTH, weekStartOf, isoDate } from "@/lib/schedule";
import { formatThaiDateShort } from "@/lib/format";
import PublicGrid from "@/components/PublicGrid";
import { LiveMark, TikTokGlyph } from "@/components/Logo";
import { phoneFromCookies, maskPhone } from "@/lib/me";
import { loadMyRequests } from "@/lib/myRequests";

export const dynamic = "force-dynamic";

export default async function PublicSchedulePage({ searchParams }: { searchParams: { week?: string; channel?: string } }) {
  const today = todayTH();
  const phone = phoneFromCookies();
  // โหลดตาราง + รายการ "ของฉัน" พร้อมกันในรอบเดียว ไม่ต้องให้เบราว์เซอร์ยิงขอทีหลัง
  const [week, myRows] = await Promise.all([loadPublicWeek(searchParams.week, searchParams.channel, today, phone), phone ? loadMyRequests(phone, today) : null]);
  const ws = new Date(week.weekStart + "T00:00:00Z");
  const we = new Date(week.weekEnd + "T00:00:00Z");
  const prev = isoDate(new Date(ws.getTime() - 7 * 86400000));
  const next = isoDate(new Date(ws.getTime() + 7 * 86400000));
  const isCurrent = week.weekStart === isoDate(weekStartOf(today));
  const q = (w: string) => `/?week=${w}${week.channelId ? `&channel=${week.channelId}` : ""}`;
  const freeCount = week.days.filter((d) => !d.isPast).reduce((a, d) => a + d.free.length, 0);
  const channelName = week.channels.find((c) => c.id === week.channelId)?.name ?? null;

  return (
    <main className="min-h-screen pb-[env(safe-area-inset-bottom)]">
      {/* แถบหัวเข้ม — บนมือถือย่อให้กะทัดรัด */}
      <header className="bg-ink text-white">
        <div className="mx-auto max-w-6xl px-4 pb-5 pt-5 md:px-6 md:py-7">
          <div className="flex items-center gap-3 md:hidden">
            <LiveMark size={40} />
            <div className="min-w-0 leading-tight">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-300">Lamunn Live</p>
              <h1 className="font-display text-xl font-semibold tracking-tight">จองช่วงไลฟ์กับ Lamunn</h1>
            </div>
          </div>

          <div className="hidden flex-wrap items-end justify-between gap-6 md:flex">
            <div className="flex items-start gap-4">
              <LiveMark size={56} className="mt-1" />
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-300">Lamunn Live</div>
                <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight md:text-4xl">จองช่วงไลฟ์กับ Lamunn</h1>
                <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-stone-400">เลือกช่วงที่ว่างแล้วส่งคำขอ ทีมงานจะติดต่อกลับเพื่อยืนยัน ตารางนี้ไม่แสดงชื่อผู้ไลฟ์</p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-3">
              <ChannelTabs week={week} />
              <WeekNav prev={q(prev)} next={q(next)} label={`${formatThaiDateShort(ws)} – ${formatThaiDateShort(we)}`} isCurrent={isCurrent} homeHref={`/${week.channelId ? `?channel=${week.channelId}` : ""}`} />
            </div>
          </div>

          {/* มือถือ: แถวช่องทาง + สัปดาห์ */}
          <div className="mt-4 flex flex-col gap-2.5 md:hidden">
            <ChannelTabs week={week} />
            <WeekNav prev={q(prev)} next={q(next)} label={`${formatThaiDateShort(ws)} – ${formatThaiDateShort(we)}`} isCurrent={isCurrent} homeHref={`/${week.channelId ? `?channel=${week.channelId}` : ""}`} full />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-4 md:px-6 md:py-6">
        <p className="mb-3 text-[13px] leading-relaxed text-muted md:hidden">เลื่อนตารางซ้าย-ขวาเพื่อดูทั้งสัปดาห์ แล้วกดช่วง &quot;ว่าง&quot; เพื่อส่งคำขอจอง ทีมงานจะติดต่อกลับเพื่อยืนยัน ตารางนี้ไม่แสดงชื่อผู้ไลฟ์</p>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 md:mb-4">
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-muted md:gap-x-5 md:text-xs">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-5 rounded border border-dashed border-brand-500 bg-brand-50" /> ว่าง
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-5 rounded bg-stone-300" /> มีคนไลฟ์แล้ว
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-5 rounded bg-ink" /> unavailable
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-5 rounded border-2 border-violet-600 bg-violet-100" /> ของฉัน
            </span>
          </div>
          {week.channels.length > 0 && (
            <p className="text-[11px] text-muted md:text-xs">
              สัปดาห์นี้ว่าง <span className="font-semibold text-ink">{freeCount}</span> ช่วง
            </p>
          )}
        </div>

        {week.channels.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-white p-12 text-center text-muted">ขณะนี้ยังไม่เปิดรับจองช่วงไลฟ์จากภายนอก กรุณาติดต่อทีมงาน Lamunn โดยตรง</div>
        ) : (
          <PublicGrid days={week.days} channelId={week.channelId} channelName={channelName} phoneMasked={phone ? maskPhone(phone) : null} myRows={myRows} />
        )}

        <p className="mt-8 text-center text-[11px] text-stone-400 md:mt-10">การจองจะยืนยันเมื่อทีมงาน Lamunn อนุมัติแล้วเท่านั้น</p>
      </div>
    </main>
  );
}

function ChannelTabs({ week }: { week: { channels: { id: string; name: string }[]; channelId: string | null; weekStart: string } }) {
  if (week.channels.length === 0) return null;
  return (
    <div className="flex items-center gap-1 self-start rounded-full bg-white/10 p-1">
      {week.channels.map((c) => {
        const active = c.id === week.channelId;
        const tiktok = /tiktok/i.test(c.name);
        const Inner = (
          <>
            {tiktok && <TikTokGlyph size={13} />}
            {c.name}
          </>
        );
        if (week.channels.length === 1)
          return (
            <span key={c.id} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-sm font-semibold text-ink">
              {Inner}
            </span>
          );
        return (
          <Link key={c.id} href={`/?week=${week.weekStart}&channel=${c.id}`} className={clsx("inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition", active ? "bg-white font-semibold text-ink" : "text-stone-300 hover:text-white")}>
            {Inner}
          </Link>
        );
      })}
    </div>
  );
}

function WeekNav({ prev, next, label, isCurrent, homeHref, full }: { prev: string; next: string; label: string; isCurrent: boolean; homeHref: string; full?: boolean }) {
  return (
    <div className={clsx("flex items-center gap-2", full && "w-full")}>
      <div className={clsx("flex items-center rounded-full bg-white/10", full && "flex-1 justify-between")}>
        <Link href={prev} className="flex h-10 w-10 items-center justify-center rounded-full text-stone-300 hover:bg-white/10 hover:text-white md:h-9 md:w-9" aria-label="สัปดาห์ก่อน">
          <ChevronLeft size={18} />
        </Link>
        <span className="min-w-[170px] text-center text-sm font-medium tabular-nums text-white">{label}</span>
        <Link href={next} className="flex h-10 w-10 items-center justify-center rounded-full text-stone-300 hover:bg-white/10 hover:text-white md:h-9 md:w-9" aria-label="สัปดาห์ถัดไป">
          <ChevronRight size={18} />
        </Link>
      </div>
      {!isCurrent && (
        <Link href={homeHref} className="whitespace-nowrap rounded-full border border-white/20 px-3 py-1.5 text-xs text-stone-300 hover:border-white/40 hover:text-white">
          สัปดาห์นี้
        </Link>
      )}
    </div>
  );
}

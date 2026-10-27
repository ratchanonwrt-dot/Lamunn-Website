import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@lamunn/db-finance";
import { requireSectionPage } from "@/lib/permissions";
import { formatBaht, pickupStatusLabel, paymentStatusLabel } from "@/lib/format";
import { bangkokToday } from "@/lib/cateringCalendar";
import { daysAway, shortThaiDate } from "@/lib/cateringStatus";
import DeletePickupOrderButton from "@/components/catering/DeletePickupOrderButton";
import CateringHeader, { headerBtn } from "@/components/catering/CateringHeader";

const STATUS_OPTIONS = ["PENDING", "READY", "COMPLETED", "CANCELLED"] as const;
type PickupStatus = (typeof STATUS_OPTIONS)[number];

// สีเดียวกับป้ายงานจัดเลี้ยง: เหลือง = ยังต้องทำ, เขียว = พร้อมส่ง, เทา = จบแล้ว — ไล่ดูรายการแล้วรู้ทันทีว่าอันไหนต้องเตรียม
const STATUS_STYLE: Record<PickupStatus, { pill: string; date: string }> = {
  PENDING: { pill: "bg-amber-400 text-amber-950", date: "bg-amber-400 text-amber-950" },
  READY: { pill: "bg-emerald-600 text-white", date: "bg-emerald-600 text-white" },
  COMPLETED: { pill: "bg-gray-300 text-gray-800", date: "bg-gray-200 text-gray-700" },
  CANCELLED: { pill: "bg-gray-200 text-gray-500 line-through", date: "bg-gray-100 text-gray-400" },
};

const PAY_STYLE: Record<string, string> = {
  FULLY_PAID: "bg-emerald-100 text-emerald-800",
  DEPOSIT_PAID: "bg-sky-100 text-sky-800",
  UNPAID: "bg-red-100 text-red-700",
};

/** ออเดอร์นัดรับหน้าร้าน — การ์ดแทนตาราง 8 คอลัมน์ ตัวกรองเป็นปุ่มกดทีเดียว (เก็บใน query string) */
export default async function PickupOrdersPage({ searchParams }: { searchParams: { branchId?: string; status?: string } }) {
  await requireSectionPage("CATERING");
  const branchId = searchParams.branchId || null;
  const status = STATUS_OPTIONS.includes(searchParams.status as PickupStatus) ? (searchParams.status as PickupStatus) : null;
  const today = bangkokToday();

  const [orders, branches] = await Promise.all([
    prisma.pickupOrder.findMany({
      where: { ...(branchId ? { branchId } : {}) },
      include: { branch: true, items: true },
      orderBy: { pickupDate: "asc" },
    }),
    prisma.branch.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  const counts = Object.fromEntries(STATUS_OPTIONS.map((s) => [s, orders.filter((o) => o.status === s).length])) as Record<PickupStatus, number>;
  const shown = status ? orders.filter((o) => o.status === status) : orders;
  const openOrders = orders.filter((o) => o.status === "PENDING" || o.status === "READY");
  const next3 = openOrders.filter((o) => o.pickupDate >= today && o.pickupDate.getTime() <= today.getTime() + 3 * 86400000).length;
  const unpaid = openOrders.filter((o) => o.paymentStatus !== "FULLY_PAID");

  const href = (over: { branchId?: string | null; status?: string | null }) => {
    const u = new URLSearchParams();
    const b = over.branchId === undefined ? branchId : over.branchId;
    const s = over.status === undefined ? status : over.status;
    if (b) u.set("branchId", b);
    if (s) u.set("status", s);
    const q = u.toString();
    return `/catering/pickup-orders${q ? `?${q}` : ""}`;
  };
  const chip = (on: boolean) => `rounded-full px-3 py-1 text-sm font-semibold ${on ? "bg-gray-900 text-white" : "bg-white text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-100"}`;

  return (
    <div className="mx-auto max-w-5xl">
      <CateringHeader
        title="นัดรับหน้าร้าน"
        sub={`${orders.length} ออเดอร์${branchId ? ` · ${branches.find((b) => b.id === branchId)?.name ?? ""}` : ""}`}
        actions={
          <Link href="/catering/pickup-orders/new" className={headerBtn.primary}>
            <Plus className="h-4 w-4" /> บันทึกออเดอร์
          </Link>
        }
        stats={[
          { label: "รอทำ", value: `${counts.PENDING}`, accent: counts.PENDING ? "amber" : undefined },
          { label: "พร้อมส่ง", value: `${counts.READY}`, accent: counts.READY ? "emerald" : undefined },
          { label: "นัดรับใน 3 วัน", value: `${next3}`, sub: "เฉพาะที่ยังไม่ส่ง" },
          { label: "ยังจ่ายไม่ครบ", value: `${unpaid.length}`, sub: `${formatBaht(unpaid.reduce((a, o) => a + o.amount, 0))} บาท`, accent: unpaid.length ? "red" : "emerald" },
        ]}
      />

      <div className="mb-2 flex flex-wrap gap-2">
        <Link href={href({ status: null })} className={chip(!status)}>
          ทั้งหมด {orders.length}
        </Link>
        {STATUS_OPTIONS.map((s) => (
          <Link key={s} href={href({ status: status === s ? null : s })} className={`rounded-full px-3 py-1 text-sm font-semibold ${status === s ? `${STATUS_STYLE[s].pill} ring-2 ring-gray-900 ring-offset-1` : "bg-white text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-100"}`}>
            {pickupStatusLabel[s]} {counts[s]}
          </Link>
        ))}
      </div>
      {branches.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          <Link href={href({ branchId: null })} className={`${chip(!branchId)} !text-xs`}>
            ทุกสาขา
          </Link>
          {branches.map((b) => (
            <Link key={b.id} href={href({ branchId: branchId === b.id ? null : b.id })} className={`${chip(branchId === b.id)} !text-xs`}>
              {b.name}
            </Link>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {shown.map((o) => {
          const st = STATUS_STYLE[o.status as PickupStatus] ?? STATUS_STYLE.PENDING;
          const items = o.items.length > 0 ? o.items.map((i) => i.description).join(", ") : o.itemsDescription;
          const done = o.status === "COMPLETED" || o.status === "CANCELLED";
          const [dow, , mon] = shortThaiDate(o.pickupDate).split(" ");
          return (
            <div key={o.id} className={`flex items-center gap-3.5 rounded-2xl border border-gray-200 bg-white p-3 shadow-card transition hover:border-gray-400 ${done ? "opacity-60" : ""}`}>
              <Link href={`/catering/pickup-orders/${o.id}`} className="flex min-w-0 flex-1 items-center gap-3.5">
                <div className={`flex w-16 shrink-0 flex-col items-center rounded-xl py-2 ${st.date}`}>
                  <span className="text-xs font-semibold">{dow}</span>
                  <span className="text-2xl font-bold leading-none">{o.pickupDate.getUTCDate()}</span>
                  <span className="text-xs font-semibold">{mon}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-bold text-gray-900">{o.customerName}</p>
                  <p className="truncate text-sm text-gray-700">{items || "ยังไม่ระบุรายการ"}</p>
                  <p className="truncate text-sm text-gray-500">
                    {[o.pickupTime ? `${o.pickupTime} น.` : null, o.branch?.name, done ? null : daysAway(o.pickupDate, today)].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="text-base font-bold tabular-nums text-gray-900">{formatBaht(o.amount)}</span>
                  <div className="flex items-center gap-1.5">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${PAY_STYLE[o.paymentStatus] ?? PAY_STYLE.UNPAID}`}>{paymentStatusLabel[o.paymentStatus]}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.pill}`}>{pickupStatusLabel[o.status]}</span>
                  </div>
                </div>
              </Link>
              <DeletePickupOrderButton id={o.id} />
            </div>
          );
        })}
        {shown.length === 0 && <p className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-600">ไม่พบรายการ</p>}
      </div>
    </div>
  );
}

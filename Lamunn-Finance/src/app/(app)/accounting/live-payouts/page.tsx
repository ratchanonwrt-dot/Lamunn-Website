import { requireLivePayoutPage } from "@/lib/livePayoutAccess";
import { fetchLivePayouts } from "@/lib/accounting/livePayouts";
import { fetchLivePayoutWorkItems, mergeLivePayoutWorkItems } from "@/lib/accounting/livePayoutWorkItems";
import LivePayoutsPanel from "@/components/accounting/LivePayoutsPanel";

export const dynamic = "force-dynamic";

const isoOr = (s: string | undefined, fallback: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : fallback);

export default async function LivePayoutsPage({ searchParams }: { searchParams: { from?: string; to?: string; status?: string } }) {
  const staff = await requireLivePayoutPage();
  const todayTH = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const from = isoOr(searchParams.from, new Date(Date.now() - 23 * 86400e3).toISOString().slice(0, 10));
  const to = isoOr(searchParams.to, todayTH);
  const status = searchParams.status === "APPROVED" || searchParams.status === "PAID" ? searchParams.status : "ALL";
  const { rows: liveRows, error } = await fetchLivePayouts(from, to, status);
  const workItems = await fetchLivePayoutWorkItems(from, to, liveRows.map((row) => row.id));
  const rows = mergeLivePayoutWorkItems(liveRows, workItems, status);

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-gray-900">ทำจ่ายคนไลฟ์ (รายวัน)</h1>
      <p className="mb-4 text-sm text-gray-500">
        ยอดที่แอดมินเว็บ Live <b>อนุมัติแล้ว</b> พร้อมรายการที่บัญชีเพิ่มเอง — ติ๊กช่องสุดท้ายเมื่อขึ้นระบบโอนเงินแล้ว
      </p>
      <LivePayoutsPanel
        rows={rows}
        error={error}
        from={from}
        to={to}
        status={status}
        canAdd
        canManagePayment={staff.canQueueTransfer}
        canQueueTransfer={staff.canQueueTransfer}
        canEditNote={staff.role === "SUPER_ADMIN"}
      />
    </div>
  );
}

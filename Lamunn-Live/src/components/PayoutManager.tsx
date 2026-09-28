"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import clsx from "clsx";
import { Download } from "lucide-react";
import type { PayoutRow } from "@/lib/payouts";
import { payoutCsv, payoutList } from "@/lib/payoutExport";
import { formatBaht, formatNum, formatThaiDate, thaiDays } from "@/lib/format";

const inputCls = "rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-ink focus:ring-2 focus:ring-ink/10";

const STATUS: Record<PayoutRow["status"], { label: string; cls: string }> = {
  NOT_READY: { label: "ยังไม่กรอกยอด", cls: "bg-stone-100 text-muted" },
  READY: { label: "รออนุมัติ", cls: "bg-amber-100 text-amber-800" },
  APPROVED: { label: "อนุมัติแล้ว · รอบัญชีจ่าย", cls: "bg-emerald-100 text-emerald-800" },
  PAID: { label: "บัญชีจ่ายแล้ว", cls: "bg-sky-100 text-sky-800" },
};

function fmtDT(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" });
}

export default function PayoutManager({ rows, from, to, canEdit }: { rows: PayoutRow[]; from: string; to: string; canEdit: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyPending, setOnlyPending] = useState(false);

  const refresh = () => router.refresh();

  async function call(url: string, method: string, body?: unknown) {
    setBusy(url);
    setError(null);
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    setBusy(null);
    const b = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(b.error ?? "ทำรายการไม่สำเร็จ");
      return null;
    }
    refresh();
    return b;
  }

  const approve = (r: PayoutRow) => call("/api/payouts", "POST", { date: r.date, streamerId: r.streamerId });
  const approveDay = async (date: string) => {
    const b = await call("/api/payouts", "POST", { date });
    if (b?.skipped?.length) setError(`ข้ามบางรายการ: ${b.skipped.join(" · ")}`);
  };
  const revoke = async (r: PayoutRow) => {
    if (!r.id || !confirm(`ยกเลิกการอนุมัติยอดของ ${r.streamerName} วันที่ ${r.date}?`)) return;
    await call(`/api/payouts/${r.id}`, "DELETE");
  };

  /** ดาวน์โหลดรายการที่ต้องจ่าย (อนุมัติแล้ว ยังไม่จ่าย) เป็นไฟล์ CSV เปิดด้วย Excel ได้ */
  function exportList(source: PayoutRow[], label: string) {
    const items = payoutList(source);
    if (items.length === 0) {
      setError("ไม่มีรายการที่อนุมัติแล้วและยังไม่จ่าย ในช่วงนี้ — กดอนุมัติก่อนแล้วค่อย export");
      return;
    }
    setError(null);
    const url = URL.createObjectURL(new Blob([payoutCsv(items)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `live-payouts_${label}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // จัดกลุ่มตามวัน (ใหม่สุดก่อน)
  const shown = onlyPending ? rows.filter((r) => r.status === "READY" || (r.status === "APPROVED" && r.changed)) : rows;
  const days = new Map<string, PayoutRow[]>();
  for (const r of shown) days.set(r.date, [...(days.get(r.date) ?? []), r]);

  const totalReady = rows.filter((r) => r.status === "READY").reduce((a, r) => a + r.amount, 0);
  const totalApproved = rows.filter((r) => r.status === "APPROVED").reduce((a, r) => a + (r.approvedAmount ?? 0), 0);
  const totalPaid = rows.filter((r) => r.status === "PAID").reduce((a, r) => a + (r.approvedAmount ?? 0), 0);
  const changedCount = rows.filter((r) => r.status === "APPROVED" && r.changed).length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">ตั้งแต่</label>
          <input type="date" value={f} onChange={(e) => setF(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">ถึง</label>
          <input type="date" value={t} onChange={(e) => setT(e.target.value)} className={inputCls} />
        </div>
        <button onClick={() => router.push(`${pathname}?from=${f}&to=${t}`)} className="rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
          แสดง
        </button>
        <label className="ml-2 inline-flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} /> เฉพาะที่รออนุมัติ
        </label>
        <button
          onClick={() => exportList(rows, from === to ? from : `${from}_${to}`)}
          disabled={totalApproved === 0}
          title="ชื่อ · เลขบัญชี · ธนาคาร · ยอดที่ต้องจ่าย — เฉพาะที่อนุมัติแล้วและยังไม่จ่าย รวมหลายวันเป็นหนึ่งแถวต่อคน"
          className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-line bg-white px-4 py-2 text-sm font-medium text-ink shadow-card hover:bg-paper disabled:opacity-40"
        >
          <Download size={15} /> Export รายการจ่าย (ทั้งช่วง)
        </button>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-line bg-white p-4 shadow-card">
          <p className="text-xs text-muted">รออนุมัติ</p>
          <p className="font-display text-2xl font-semibold tabular-nums text-amber-700">{formatBaht(totalReady)}</p>
        </div>
        <div className="rounded-2xl border border-line bg-white p-4 shadow-card">
          <p className="text-xs text-muted">อนุมัติแล้ว รอบัญชีจ่าย</p>
          <p className="font-display text-2xl font-semibold tabular-nums text-emerald-700">{formatBaht(totalApproved)}</p>
          {changedCount > 0 && <p className="mt-1 text-xs text-red-600">{changedCount} รายการยอดเปลี่ยนหลังอนุมัติ — กดอนุมัติใหม่</p>}
        </div>
        <div className="rounded-2xl border border-line bg-white p-4 shadow-card">
          <p className="text-xs text-muted">บัญชีจ่ายแล้ว</p>
          <p className="font-display text-2xl font-semibold tabular-nums text-sky-700">{formatBaht(totalPaid)}</p>
        </div>
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {days.size === 0 && <div className="rounded-2xl border border-dashed border-line bg-white p-10 text-center text-muted">ไม่มียอดในช่วงที่เลือก</div>}

      <div className="space-y-4">
        {Array.from(days.entries()).map(([date, list]) => {
          const d = new Date(date + "T00:00:00Z");
          const readyCount = list.filter((r) => r.status === "READY" || (r.status === "APPROVED" && r.changed)).length;
          const dayTotal = list.reduce((a, r) => a + (r.status === "APPROVED" || r.status === "PAID" ? (r.approvedAmount ?? 0) : r.amount), 0);
          return (
            <section key={date} className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-paper/60 px-4 py-2.5">
                <p className="font-display text-[15px] font-semibold text-ink">
                  {thaiDays[d.getUTCDay()]} {formatThaiDate(d)}
                  <span className="ml-2 text-xs font-normal text-muted">{list.length} คน · รวม {formatBaht(dayTotal)}</span>
                </p>
                <div className="flex items-center gap-2">
                  {list.some((r) => r.status === "APPROVED") && (
                    <button
                      onClick={() => exportList(list, date)}
                      title="ชื่อ · เลขบัญชี · ธนาคาร · ยอดที่ต้องจ่าย ของวันนี้ (เฉพาะที่อนุมัติแล้วและยังไม่จ่าย)"
                      className="inline-flex items-center gap-1 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink hover:bg-paper"
                    >
                      <Download size={13} /> Export วันนี้
                    </button>
                  )}
                  {canEdit && readyCount > 0 && (
                    <button disabled={busy !== null} onClick={() => approveDay(date)} className="rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
                      อนุมัติทั้งวัน ({readyCount})
                    </button>
                  )}
                </div>
              </header>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted">
                    <tr>
                      <th className="px-4 py-2">คนไลฟ์</th>
                      <th className="px-3 py-2">บัญชีรับเงิน</th>
                      <th className="px-3 py-2 text-right">กะ / ชม.</th>
                      <th className="px-3 py-2 text-right">ยอดขาย</th>
                      <th className="px-3 py-2 text-right">ยอดจ่าย</th>
                      <th className="px-3 py-2">สถานะ</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r) => {
                      const st = STATUS[r.status];
                      const noBank = !r.bankAccountNo;
                      return (
                        <tr key={r.streamerId} className="border-t border-line/60 align-top">
                          <td className="px-4 py-2.5">
                            <p className="font-medium text-ink">
                              {r.streamerName}
                              {r.nickname && <span className="ml-1 text-xs font-normal text-stone-400">({r.nickname})</span>}
                            </p>
                            {r.overridden && <p className="text-[11px] text-brand-700">มีกะที่แอดมินกำหนดยอดเอง</p>}
                            {r.note && <p className="text-[11px] text-muted">📝 {r.note}</p>}
                          </td>
                          <td className="px-3 py-2.5 text-xs">
                            {noBank ? (
                              <Link href="/streamers" className="text-red-600 hover:underline">
                                ยังไม่มีเลขบัญชี — กรอกที่หน้าคนไลฟ์
                              </Link>
                            ) : (
                              <>
                                <p className="text-ink">{r.bankAccountName || r.streamerName}</p>
                                <p className="tabular-nums text-muted">
                                  {r.bankName ? `${r.bankName} · ` : ""}
                                  {r.bankAccountNo}
                                </p>
                              </>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-muted">
                            {r.shiftCount} กะ / {formatNum(r.hours, 1)} ชม.
                            {r.pendingShifts > 0 && <p className="text-[11px] text-amber-700">ยังไม่กรอก {r.pendingShifts} กะ</p>}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-muted">{formatBaht(r.sales)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            <p className="font-semibold text-ink">{formatBaht(r.status === "APPROVED" || r.status === "PAID" ? (r.approvedAmount ?? 0) : r.amount)}</p>
                            {/* % คอมจริง = ยอดที่จ่าย ÷ ยอดหลังหักค่าส่ง (นิยามเดียวกับหน้าค่าคอมมิชชั่นและตารางไลฟ์) */}
                            {r.net > 0 && (
                              <p className="text-[11px] text-muted">
                                คอมจริง {(((r.status === "APPROVED" || r.status === "PAID" ? (r.approvedAmount ?? 0) : r.amount) / r.net) * 100).toFixed(1)}%
                              </p>
                            )}
                            {r.changed && r.status !== "PAID" && <p className="text-[11px] text-red-600">ยอดปัจจุบัน {formatBaht(r.amount)} — อนุมัติใหม่</p>}
                            {r.changed && r.status === "PAID" && <p className="text-[11px] text-red-600">ยอดปัจจุบัน {formatBaht(r.amount)} (จ่ายไปแล้ว)</p>}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={clsx("inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium", st.cls)}>{st.label}</span>
                            {r.approvedBy && <p className="mt-1 text-[11px] text-muted">อนุมัติโดย {r.approvedBy} · {fmtDT(r.approvedAt)}</p>}
                            {r.status === "PAID" && (
                              <p className="mt-0.5 text-[11px] text-muted">
                                จ่ายเมื่อ {fmtDT(r.paidAt)}
                                {r.paidBy ? ` โดย ${r.paidBy}` : ""}
                                {r.paidRef ? ` · อ้างอิง ${r.paidRef}` : ""}
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            {canEdit && (r.status === "READY" || (r.status === "APPROVED" && r.changed)) && (
                              <button disabled={busy !== null} onClick={() => approve(r)} className="rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
                                {r.status === "APPROVED" ? "อนุมัติใหม่" : "อนุมัติ"}
                              </button>
                            )}
                            {canEdit && r.status === "APPROVED" && (
                              <button disabled={busy !== null} onClick={() => revoke(r)} className="ml-2 text-xs text-stone-400 hover:text-red-600">
                                ยกเลิกอนุมัติ
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

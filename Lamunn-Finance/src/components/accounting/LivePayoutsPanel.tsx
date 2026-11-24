"use client";

import { FormEvent, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { Download, Plus, Search, X } from "lucide-react";
import type { DisplayLivePayout } from "@/lib/accounting/livePayoutWorkItems";
import { formatBaht } from "@/lib/format";
import AccountingDateInput from "./AccountingDateInput";
import { formatAccountingDate } from "@/lib/accounting/dateFormat";
import { useServerRefresh } from "./useServerRefresh";
import DonutChart, { CHART_COLORS } from "@/components/charts/DonutChart";
import LineChart from "@/components/charts/LineChart";

const inputCls = "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
const thaiDays = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์"];
const hourFormatter = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return `${thaiDays[d.getUTCDay()]} ${formatAccountingDate(iso)}`;
}
function fmtDT(iso: string | null): string {
  if (!iso) return "";
  const bangkok = new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1_000);
  const time = `${String(bangkok.getUTCHours()).padStart(2, "0")}:${String(bangkok.getUTCMinutes()).padStart(2, "0")}`;
  return `${formatAccountingDate(bangkok)} ${time}`;
}

export default function LivePayoutsPanel({
  rows,
  error,
  from,
  to,
  status,
  canAdd,
  canManagePayment,
  canQueueTransfer,
  canEditNote,
}: {
  rows: DisplayLivePayout[];
  error: string | null;
  from: string;
  to: string;
  status: string;
  canAdd: boolean;
  canManagePayment: boolean;
  canQueueTransfer: boolean;
  canEditNote: boolean;
}) {
  const { router, refresh, refreshing } = useServerRefresh();
  const pathname = usePathname();
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  const [st, setSt] = useState(status);
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [manual, setManual] = useState({ liveDate: to, payeeName: "", hours: "", amount: "", transferQueued: false });
  const [queuedById, setQueuedById] = useState<Record<string, boolean>>(() => Object.fromEntries(rows.map((row) => [row.id, row.transferQueued])));
  const [noteById, setNoteById] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((row) => [row.id, row.note ?? ""])));

  useEffect(() => {
    setQueuedById(Object.fromEntries(rows.map((row) => [row.id, row.transferQueued])));
    setNoteById(Object.fromEntries(rows.map((row) => [row.id, row.note ?? ""])));
  }, [rows]);

  async function setPaid(r: DisplayLivePayout, paid: boolean) {
    let paidRef: string | null = null;
    if (paid) {
      const v = prompt(`ยืนยันทำจ่าย ${r.payeeName} ${formatBaht(r.amount)} (${r.date})\nเลขอ้างอิงการโอน (ไม่บังคับ):`, "");
      if (v === null) return;
      paidRef = v.trim() || null;
    } else if (!confirm(`ถอนสถานะ "จ่ายแล้ว" ของ ${r.payeeName} วันที่ ${r.date}?`)) return;
    setBusy(r.id);
    setErr(null);
    const res = await fetch(`/api/accounting/live-payouts/${r.id}/paid`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paid, paidRef }) });
    setBusy(null);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setErr(b.error ?? "ทำรายการไม่สำเร็จ");
      return;
    }
    refresh();
  }

  async function addManual(event: FormEvent) {
    event.preventDefault();
    setBusy("add");
    setErr(null);
    const res = await fetch("/api/accounting/live-payouts/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(manual),
    });
    setBusy(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setErr(body.error ?? "เพิ่มรายการไม่สำเร็จ");
      return;
    }
    setShowAdd(false);
    setManual({ liveDate: to, payeeName: "", hours: "", amount: "", transferQueued: false });
    refresh();
  }

  async function setTransferQueued(row: DisplayLivePayout, transferQueued: boolean) {
    const previous = queuedById[row.id] ?? false;
    setQueuedById((current) => ({ ...current, [row.id]: transferQueued }));
    setBusy(`queue:${row.id}`);
    setErr(null);
    const res = await fetch("/api/accounting/live-payouts/transfer-queued", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: row.source,
        workItemId: row.workItemId,
        sourceId: row.source === "LIVE" ? row.id : null,
        date: row.date,
        payeeName: row.payeeName,
        hours: row.hours,
        amount: row.amount,
        note: noteById[row.id] ?? row.note,
        transferQueued,
      }),
    });
    setBusy(null);
    if (!res.ok) {
      setQueuedById((current) => ({ ...current, [row.id]: previous }));
      const body = await res.json().catch(() => ({}));
      setErr(body.error ?? "บันทึกสถานะขึ้นระบบโอนไม่สำเร็จ");
      return;
    }
    refresh();
  }

  async function saveNote(row: DisplayLivePayout) {
    if (!canEditNote) return;
    setBusy(`note:${row.id}`);
    setErr(null);
    const res = await fetch("/api/accounting/live-payouts/note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: row.source,
        workItemId: row.workItemId,
        sourceId: row.source === "LIVE" ? row.id : null,
        date: row.date,
        payeeName: row.payeeName,
        hours: row.hours,
        amount: row.amount,
        transferQueued: queuedById[row.id] ?? row.transferQueued,
        note: noteById[row.id] ?? "",
      }),
    });
    setBusy(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setErr(body.error ?? "บันทึกหมายเหตุไม่สำเร็จ");
      return;
    }
    refresh();
  }

  const normalizedSearch = searchTerm.trim().toLocaleLowerCase("th-TH");
  const numericSearch = normalizedSearch ? Number(normalizedSearch.replace(/,/g, "")) : Number.NaN;
  const visibleRows = normalizedSearch
    ? rows.filter((row) => {
        const names = [row.payeeName, row.streamerName, row.nickname].filter(Boolean).join(" ").toLocaleLowerCase("th-TH");
        const nameMatches = names.includes(normalizedSearch);
        const amountMatches = Number.isFinite(numericSearch) && Math.abs(row.amount - numericSearch) < 0.005;
        const hourMatches = Number.isFinite(numericSearch) && Math.abs(row.hours - numericSearch) < 0.005;
        return nameMatches || amountMatches || hourMatches;
      })
    : rows;

  function exportCsv() {
    const pending = visibleRows.filter((r) => !(queuedById[r.id] ?? r.transferQueued));
    const lines = [["วันที่", "ชื่อผู้รับเงิน", "ชั่วโมง", "ยอดจ่าย", "หมายเหตุ"].join(",")];
    for (const r of pending) lines.push([r.date, r.payeeName, r.hours, r.amount, (r.note ?? "").replace(/,/g, " ")].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `live-payouts-${from}_${to}.csv`;
    a.click();
  }

  const days = new Map<string, DisplayLivePayout[]>();
  for (const r of visibleRows) days.set(r.date, [...(days.get(r.date) ?? []), r]);
  const totalPending = visibleRows.filter((r) => !(queuedById[r.id] ?? r.transferQueued)).reduce((a, r) => a + r.amount, 0);
  const totalPaid = visibleRows.filter((r) => queuedById[r.id] ?? r.transferQueued).reduce((a, r) => a + r.amount, 0);
  const totalHours = visibleRows.reduce((sum, row) => sum + row.hours, 0);
  const totalLiveFee = visibleRows.reduce((sum, row) => sum + row.amount, 0);
  const streamerTotals = new Map<string, { name: string; hours: number; amount: number; sessions: number }>();
  for (const row of visibleRows) {
    const name = row.streamerName?.trim() || row.payeeName.trim() || "ไม่ระบุชื่อ";
    const current = streamerTotals.get(name) ?? { name, hours: 0, amount: 0, sessions: 0 };
    current.hours += row.hours;
    current.amount += row.amount;
    current.sessions += 1;
    streamerTotals.set(name, current);
  }
  const streamerRanking = Array.from(streamerTotals.values())
    .sort((a, b) => b.hours - a.hours || b.amount - a.amount || a.name.localeCompare(b.name, "th"))
    .slice(0, 5);
  const topStreamer = streamerRanking[0] ?? null;
  const allStreamerRanking = Array.from(streamerTotals.values())
    .sort((a, b) => b.hours - a.hours || b.amount - a.amount || a.name.localeCompare(b.name, "th"));
  const donutLeaders = allStreamerRanking.slice(0, 5);
  const otherHours = allStreamerRanking.slice(5).reduce((sum, streamer) => sum + streamer.hours, 0);
  const chartColors = [CHART_COLORS.violet, CHART_COLORS.magenta, CHART_COLORS.blue, CHART_COLORS.aqua, CHART_COLORS.orange];
  const hourSlices = [
    ...donutLeaders.map((streamer, index) => ({ label: streamer.name, value: streamer.hours, color: chartColors[index] })),
    ...(otherHours > 0 ? [{ label: "อื่น ๆ", value: otherHours, color: CHART_COLORS.yellow }] : []),
  ];
  const dailyTrend = Array.from(days.entries())
    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
    .map(([date, dailyRows]) => ({ date, amount: dailyRows.reduce((sum, row) => sum + row.amount, 0) }));
  const dailyAverage = dailyTrend.map((_, index) => {
    const window = dailyTrend.slice(Math.max(0, index - 6), index + 1);
    return window.reduce((sum, day) => sum + day.amount, 0) / window.length;
  });
  const staleCount = visibleRows.filter((r) => r.stale && r.status === "APPROVED").length;

  return (
    <div className="flex flex-col">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">ตั้งแต่</label>
          <AccountingDateInput value={f} onChange={setF} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">ถึง</label>
          <AccountingDateInput value={t} onChange={setT} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">สถานะ</label>
          <select value={st} onChange={(e) => setSt(e.target.value)} className={inputCls}>
            <option value="ALL">ทั้งหมด</option>
            <option value="APPROVED">รอจ่าย</option>
            <option value="PAID">จ่ายแล้ว</option>
          </select>
        </div>
        <button onClick={() => router.push(`${pathname}?from=${f}&to=${t}&status=${st}`)} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
          แสดง
        </button>
        <button onClick={exportCsv} disabled={visibleRows.length === 0 || visibleRows.every((r) => queuedById[r.id] ?? r.transferQueued)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40">
          <Download size={14} /> CSV รายการยังไม่ขึ้นระบบโอน
        </button>
        {canAdd && (
          <button onClick={() => setShowAdd(true)} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            <Plus size={16} /> เพิ่มรายการ
          </button>
        )}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          setSearchTerm(searchInput);
        }}
        className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3"
      >
        <div className="relative min-w-[240px] flex-1">
          <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="ค้นหาชื่อ จำนวนเงิน หรือจำนวนชั่วโมง"
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
          <Search size={15} /> ค้นหา
        </button>
        {searchTerm && (
          <button
            type="button"
            onClick={() => { setSearchInput(""); setSearchTerm(""); }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            ล้างการค้นหา
          </button>
        )}
        <span className="text-xs text-gray-500">พบ {visibleRows.length} จาก {rows.length} รายการ</span>
      </form>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="add-live-payout-title">
          <form onSubmit={addManual} className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 id="add-live-payout-title" className="text-lg font-bold text-gray-900">เพิ่มรายการทำจ่ายคนไลฟ์</h2>
                <p className="text-sm text-gray-500">รายการนี้เก็บในระบบบัญชี และไม่แก้ข้อมูลต้นทางของเว็บ Live</p>
              </div>
              <button type="button" onClick={() => setShowAdd(false)} aria-label="ปิด" className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                <X size={18} />
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-sm font-medium text-gray-700">ชื่อผู้รับเงิน</span>
                <input required value={manual.payeeName} onChange={(event) => setManual((current) => ({ ...current, payeeName: event.target.value }))} className={`${inputCls} w-full`} placeholder="กรอกชื่อผู้รับเงิน" />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">วันที่ไลฟ์</span>
                <AccountingDateInput value={manual.liveDate} onChange={(liveDate) => setManual((current) => ({ ...current, liveDate }))} className={`${inputCls} w-full`} />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">จำนวนชั่วโมง</span>
                <input required inputMode="decimal" type="number" min="0.01" max="24" step="0.01" value={manual.hours} onChange={(event) => setManual((current) => ({ ...current, hours: event.target.value }))} className={`${inputCls} w-full`} placeholder="เช่น 3.5" />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">จำนวนเงิน (บาท)</span>
                <input required inputMode="decimal" value={manual.amount} onChange={(event) => setManual((current) => ({ ...current, amount: event.target.value }))} className={`${inputCls} w-full`} placeholder="เช่น 1,500.00" />
              </label>
              {canQueueTransfer && (
                <label className="flex items-center gap-2 self-end rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-700">
                  <input type="checkbox" checked={manual.transferQueued} onChange={(event) => setManual((current) => ({ ...current, transferQueued: event.target.checked }))} className="h-4 w-4 rounded border-gray-300 text-brand-600" />
                  ขึ้นระบบโอนเงินแล้ว
                </label>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setShowAdd(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">ยกเลิก</button>
              <button type="submit" disabled={busy !== null || refreshing} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">บันทึกรายการ</button>
            </div>
          </form>
        </div>
      )}

      <section className="order-last mt-5 overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-br from-white via-violet-50/50 to-pink-50/60 shadow-sm">
        <div className="border-b border-violet-100 px-5 py-4">
          <h2 className="text-base font-bold text-gray-900">ภาพรวมค่าไลฟ์และประสิทธิภาพนักไลฟ์</h2>
          <p className="mt-0.5 text-xs text-gray-500">สรุปตามช่วงวันที่และสถานะที่เลือก · จัดอันดับมือ 1 จากจำนวนชั่วโมงรวม</p>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          <div className="rounded-xl border border-pink-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-pink-600">ค่าไลฟ์รวม</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">{formatBaht(totalLiveFee)}</p>
            <p className="mt-1 text-xs text-gray-400">{visibleRows.length} รายการ</p>
          </div>
          <div className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-blue-600">จำนวนชั่วโมงรวม</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">{hourFormatter.format(totalHours)} ชั่วโมง</p>
            <p className="mt-1 text-xs text-gray-400">รวมทุกคนในช่วงที่เลือก</p>
          </div>
          <div className="rounded-xl border border-amber-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-amber-600">นักไลฟ์มือ 1</p>
            <p className="mt-1 truncate text-xl font-bold text-gray-900">{topStreamer?.name ?? "ยังไม่มีข้อมูล"}</p>
            <p className="mt-1 text-xs text-gray-500">
              {topStreamer ? `${hourFormatter.format(topStreamer.hours)} ชั่วโมง · ค่าไลฟ์ ${formatBaht(topStreamer.amount)}` : "เลือกช่วงวันที่ที่มีรายการเพื่อดูอันดับ"}
            </p>
          </div>
        </div>
        <div className="grid gap-4 border-t border-violet-100 bg-white/70 p-4 lg:grid-cols-2">
          <div className="rounded-xl border border-gray-100 bg-white p-4">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-gray-800">สัดส่วนชั่วโมงของนักไลฟ์</h3>
              <p className="text-[11px] text-gray-400">5 อันดับแรกตามจำนวนชั่วโมง · ที่เหลือรวมเป็นอื่น ๆ</p>
            </div>
            {hourSlices.length > 0 ? (
              <DonutChart data={hourSlices} size={180} formatValue={(value) => hourFormatter.format(value)} unit="ชั่วโมง" />
            ) : (
              <p className="py-16 text-center text-sm text-gray-400">ยังไม่มีข้อมูลสำหรับแสดงกราฟ</p>
            )}
          </div>
          <div className="rounded-xl border border-gray-100 bg-white p-4">
            <div className="mb-2">
              <h3 className="text-sm font-semibold text-gray-800">แนวโน้มค่าไลฟ์รายวัน</h3>
              <p className="text-[11px] text-gray-400">เส้นประคือค่าเฉลี่ยเคลื่อนที่ย้อนหลังสูงสุด 7 วัน</p>
            </div>
            {dailyTrend.length > 0 ? (
              <LineChart
                xLabels={dailyTrend.map((day) => `${day.date.slice(8, 10)}/${day.date.slice(5, 7)}`)}
                series={[
                  { label: "ค่าไลฟ์รายวัน", color: CHART_COLORS.magenta, points: dailyTrend.map((day) => day.amount) },
                  { label: "ค่าเฉลี่ย 7 วัน", color: CHART_COLORS.violet, points: dailyAverage, dashed: true },
                ]}
              />
            ) : (
              <p className="py-16 text-center text-sm text-gray-400">ยังไม่มีข้อมูลสำหรับแสดงกราฟ</p>
            )}
          </div>
        </div>
      </section>

      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">ยังไม่ขึ้นระบบโอนเงิน</p>
          <p className="text-2xl font-bold tabular-nums text-amber-700">{formatBaht(totalPending)}</p>
          {staleCount > 0 && <p className="mt-1 text-xs text-red-600">{staleCount} รายการยอดในเว็บ Live เปลี่ยนหลังอนุมัติ — รอแอดมิน Live อนุมัติใหม่ก่อนจ่าย</p>}
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">ขึ้นระบบโอนเงินแล้ว</p>
          <p className="text-2xl font-bold tabular-nums text-emerald-700">{formatBaht(totalPaid)}</p>
        </div>
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {err && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      {!error && visibleRows.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-gray-500">
          {searchTerm ? "ไม่พบรายการที่ตรงกับคำค้นหา" : "ยังไม่มีรายการที่อนุมัติในช่วงที่เลือก"}
        </div>
      )}

      <div className="space-y-4">
        {Array.from(days.entries()).map(([date, list]) => (
          <section key={date} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2.5">
              <p className="text-sm font-semibold text-gray-900">
                {fmtDate(date)}
                <span className="ml-2 text-xs font-normal text-gray-500">{list.length} คน · รวม {formatBaht(list.reduce((a, r) => a + r.amount, 0))}</span>
              </p>
              <p className="text-xs text-gray-500">ยังไม่ขึ้นระบบโอน {formatBaht(list.filter((r) => !(queuedById[r.id] ?? r.transferQueued)).reduce((a, r) => a + r.amount, 0))}</p>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-sm">
                <thead className="text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="px-4 py-2">ชื่อผู้รับเงิน</th>
                    <th className="px-3 py-2">วันที่ไลฟ์</th>
                    <th className="px-3 py-2 text-right">จำนวนชั่วโมง</th>
                    <th className="px-3 py-2 text-right">จำนวนเงิน</th>
                    <th className="px-3 py-2">อนุมัติโดย</th>
                    <th className="px-4 py-2 text-center">ขึ้นระบบโอนเงินแล้ว</th>
                    <th className="px-3 py-2">หมายเหตุ (Admin)</th>
                    <th className="px-3 py-2">สถานะ</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.id} className="border-t border-gray-100 align-top">
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-gray-900">{r.payeeName}</p>
                        {r.payeeName !== r.streamerName && <p className="text-xs text-gray-500">คนไลฟ์: {r.streamerName}</p>}
                        {r.source === "MANUAL" && <span className="mt-1 inline-block rounded bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-700">เพิ่มเอง</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-gray-600">{formatAccountingDate(r.date)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">{r.hours}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-gray-900">
                        {formatBaht(r.amount)}
                        {r.stale && <p className="text-[11px] font-normal text-red-600">ยอดในเว็บ Live เปลี่ยน — รออนุมัติใหม่</p>}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-500">
                        {r.approvedBy ?? "-"}
                        <p>{fmtDT(r.approvedAt)}</p>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={queuedById[r.id] ?? r.transferQueued}
                          disabled={!canQueueTransfer || busy !== null || refreshing}
                          title={!canQueueTransfer ? "เฉพาะ Admin และบัญชีเท่านั้นที่แก้ไขได้" : undefined}
                          onChange={(event) => setTransferQueued(r, event.target.checked)}
                          aria-label={`ขึ้นระบบโอนเงินแล้ว ${r.payeeName} ${formatAccountingDate(r.date)}`}
                          className="h-5 w-5 rounded border-gray-300 text-brand-600 focus:ring-brand-500 disabled:opacity-50"
                        />
                      </td>
                      <td className="min-w-[240px] px-3 py-2.5">
                        {canEditNote ? (
                          <div className="flex items-center gap-2">
                            <input
                              value={noteById[r.id] ?? ""}
                              maxLength={500}
                              onChange={(event) => setNoteById((current) => ({ ...current, [r.id]: event.target.value }))}
                              placeholder="Admin กรอกหมายเหตุ"
                              className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700 outline-none focus:border-brand-400"
                            />
                            <button
                              type="button"
                              disabled={busy !== null || refreshing || (noteById[r.id] ?? "") === (r.note ?? "")}
                              onClick={() => saveNote(r)}
                              className="rounded-lg border border-brand-200 px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-40"
                            >
                              บันทึก
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-500">{r.note || "-"}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={clsx("inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium", (queuedById[r.id] ?? r.transferQueued) ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>
                          {r.source === "MANUAL"
                            ? ((queuedById[r.id] ?? r.transferQueued) ? "ขึ้นระบบโอนแล้ว" : "ยังไม่ขึ้นระบบโอน")
                            : (r.status === "PAID" ? "จ่ายแล้ว" : "รอจ่าย")}
                        </span>
                        {r.source === "LIVE" && r.status === "PAID" && (
                          <p className="mt-1 text-[11px] text-gray-500">
                            {fmtDT(r.paidAt)}
                            {r.paidBy ? ` · ${r.paidBy}` : ""}
                            {r.paidRef ? ` · ${r.paidRef}` : ""}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {canManagePayment && r.source === "LIVE" && r.status === "APPROVED" && (
                          <button disabled={busy !== null || r.stale} title={r.stale ? "รอแอดมิน Live อนุมัติยอดใหม่ก่อน" : ""} onClick={() => setPaid(r, true)} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
                            ทำจ่ายแล้ว
                          </button>
                        )}
                        {canManagePayment && r.source === "LIVE" && r.status === "PAID" && (
                          <button disabled={busy !== null} onClick={() => setPaid(r, false)} className="text-xs text-gray-400 hover:text-red-600">
                            ถอนสถานะจ่าย
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

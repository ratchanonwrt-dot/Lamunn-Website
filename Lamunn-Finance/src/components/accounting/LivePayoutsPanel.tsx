"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import clsx from "clsx";
import { Copy, Download } from "lucide-react";
import type { LivePayout } from "@/lib/accounting/livePayouts";
import { formatBaht } from "@/lib/format";

const inputCls = "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
const thaiDays = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์"];

function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return `${thaiDays[d.getUTCDay()]} ${d.toLocaleDateString("th-TH", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" })}`;
}
function fmtDT(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" }) : "";
}

export default function LivePayoutsPanel({ rows, error, from, to, status, canEdit }: { rows: LivePayout[]; error: string | null; from: string; to: string; status: string; canEdit: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  const [st, setSt] = useState(status);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function setPaid(r: LivePayout, paid: boolean) {
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
    router.refresh();
  }

  function copy(text: string, id: string) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  function exportCsv() {
    const pending = rows.filter((r) => r.status === "APPROVED");
    const lines = [["วันที่", "ชื่อบัญชี", "ธนาคาร", "เลขบัญชี", "ชั่วโมง", "ยอดขาย", "ยอดจ่าย", "หมายเหตุ"].join(",")];
    for (const r of pending) lines.push([r.date, r.payeeName, r.bankName ?? "", r.bankAccountNo ?? "", r.hours, r.sales, r.amount, (r.note ?? "").replace(/,/g, " ")].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `live-payouts-${from}_${to}.csv`;
    a.click();
  }

  const days = new Map<string, LivePayout[]>();
  for (const r of rows) days.set(r.date, [...(days.get(r.date) ?? []), r]);
  const totalPending = rows.filter((r) => r.status === "APPROVED").reduce((a, r) => a + r.amount, 0);
  const totalPaid = rows.filter((r) => r.status === "PAID").reduce((a, r) => a + r.amount, 0);
  const staleCount = rows.filter((r) => r.stale && r.status === "APPROVED").length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">ตั้งแต่</label>
          <input type="date" lang="en-GB" value={f} onChange={(e) => setF(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">ถึง</label>
          <input type="date" lang="en-GB" value={t} onChange={(e) => setT(e.target.value)} className={inputCls} />
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
        <button onClick={exportCsv} disabled={rows.every((r) => r.status !== "APPROVED")} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40">
          <Download size={14} /> CSV รายการรอจ่าย
        </button>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">รอจ่าย (อนุมัติแล้ว)</p>
          <p className="text-2xl font-bold tabular-nums text-amber-700">{formatBaht(totalPending)}</p>
          {staleCount > 0 && <p className="mt-1 text-xs text-red-600">{staleCount} รายการยอดในเว็บ Live เปลี่ยนหลังอนุมัติ — รอแอดมิน Live อนุมัติใหม่ก่อนจ่าย</p>}
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">จ่ายแล้วในช่วงนี้</p>
          <p className="text-2xl font-bold tabular-nums text-emerald-700">{formatBaht(totalPaid)}</p>
        </div>
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {err && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      {!error && rows.length === 0 && <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-gray-500">ยังไม่มีรายการที่อนุมัติในช่วงที่เลือก</div>}

      <div className="space-y-4">
        {Array.from(days.entries()).map(([date, list]) => (
          <section key={date} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2.5">
              <p className="text-sm font-semibold text-gray-900">
                {fmtDate(date)}
                <span className="ml-2 text-xs font-normal text-gray-500">{list.length} คน · รวม {formatBaht(list.reduce((a, r) => a + r.amount, 0))}</span>
              </p>
              <p className="text-xs text-gray-500">รอจ่าย {formatBaht(list.filter((r) => r.status === "APPROVED").reduce((a, r) => a + r.amount, 0))}</p>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="px-4 py-2">ชื่อผู้รับเงิน</th>
                    <th className="px-3 py-2">ธนาคาร / เลขบัญชี</th>
                    <th className="px-3 py-2 text-right">ชม.</th>
                    <th className="px-3 py-2 text-right">ยอดขาย</th>
                    <th className="px-3 py-2 text-right">ยอดจ่าย</th>
                    <th className="px-3 py-2">อนุมัติโดย</th>
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
                        {r.note && <p className="text-xs text-gray-500">📝 {r.note}</p>}
                      </td>
                      <td className="px-3 py-2.5">
                        {r.bankAccountNo ? (
                          <div className="flex items-center gap-2">
                            <div className="text-xs">
                              {r.bankName && <p className="text-gray-600">{r.bankName}</p>}
                              <p className="font-mono text-[13px] tabular-nums text-gray-900">{r.bankAccountNo}</p>
                            </div>
                            <button onClick={() => copy(r.bankAccountNo!, r.id)} title="คัดลอกเลขบัญชี" className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                              <Copy size={13} />
                            </button>
                            {copied === r.id && <span className="text-[11px] text-emerald-600">คัดลอกแล้ว</span>}
                          </div>
                        ) : (
                          <span className="text-xs text-red-600">ไม่มีเลขบัญชี — แจ้งแอดมิน Live กรอกที่หน้าคนไลฟ์</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">{r.hours}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">{formatBaht(r.sales)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-gray-900">
                        {formatBaht(r.amount)}
                        {r.stale && <p className="text-[11px] font-normal text-red-600">ยอดในเว็บ Live เปลี่ยน — รออนุมัติใหม่</p>}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-500">
                        {r.approvedBy ?? "-"}
                        <p>{fmtDT(r.approvedAt)}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={clsx("inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium", r.status === "PAID" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>
                          {r.status === "PAID" ? "จ่ายแล้ว" : "รอจ่าย"}
                        </span>
                        {r.status === "PAID" && (
                          <p className="mt-1 text-[11px] text-gray-500">
                            {fmtDT(r.paidAt)}
                            {r.paidBy ? ` · ${r.paidBy}` : ""}
                            {r.paidRef ? ` · ${r.paidRef}` : ""}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {canEdit && r.status === "APPROVED" && (
                          <button disabled={busy !== null || r.stale} title={r.stale ? "รอแอดมิน Live อนุมัติยอดใหม่ก่อน" : ""} onClick={() => setPaid(r, true)} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
                            ทำจ่ายแล้ว
                          </button>
                        )}
                        {canEdit && r.status === "PAID" && (
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

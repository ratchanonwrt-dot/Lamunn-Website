"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";
import { useServerRefresh } from "./useServerRefresh";
import type { CashReport } from "@/lib/accounting/allChannelCash";
import { fmtSatang } from "@/lib/accounting/money";

const MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

export function AllChannelCashSheet({ initialReport, fallbackBranches }: { initialReport: CashReport; fallbackBranches: readonly string[] }) {
  const [report, setReport] = useState(initialReport);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const { refresh, refreshing } = useServerRefresh();
  useEffect(() => setReport(initialReport), [initialReport]);

  async function importFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return setMessage("กรุณาเลือกไฟล์ Cash.xlsx");
    setBusy(true);
    setMessage("");
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("year", String(report.year));
      form.set("month", String(report.month));
      const response = await fetch("/api/accounting/all-channel-sales/cash/import", { method: "POST", body: form });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "นำเข้าไฟล์ไม่สำเร็จ");
      setReport(payload.report);
      setMessage(`นำเข้า ${file.name} สำเร็จ — ${payload.report.branches.length} สาขา ยอดรวม ${fmtSatang(payload.report.grandTotal, { zeroDash: false })} บาท`);
      refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "นำเข้าไฟล์ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const branches = report.branches.length ? report.branches.map((branch) => branch.name) : [...fallbackBranches];
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2"><FileSpreadsheet size={20} className="text-pink-500" /><h2 className="font-semibold text-gray-900">Cash</h2></div>
            <p className="mt-1 text-sm text-gray-500">ยอดขายเงินสดรายวันแยกตามสาขา — เป็นรายงานเท่านั้น ไม่ลงบัญชีและไม่ออกใบกำกับภาษี</p>
          </div>
          <form method="GET" className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="sheet" value="cash" />
            <label className="text-xs text-gray-600">เดือน<select name="month" defaultValue={report.month} className="mt-1 block rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900">{MONTHS.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select></label>
            <label className="text-xs text-gray-600">ปี<select name="year" defaultValue={report.year} className="mt-1 block rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900">{Array.from({ length: 9 }, (_, index) => report.year - 4 + index).map((year) => <option key={year} value={year}>{year + 543}</option>)}</select></label>
            <button className="rounded-xl border border-pink-200 bg-pink-50 px-4 py-2 text-sm font-medium text-pink-700 hover:bg-pink-100">แสดงรายงาน</button>
          </form>
        </div>
        <form onSubmit={importFile} className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-gray-50 p-3">
          <input ref={fileRef} type="file" accept=".xlsx" className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm file:mr-3 file:border-0 file:bg-transparent file:font-medium" />
          <button disabled={busy || refreshing} className="inline-flex items-center gap-2 rounded-xl bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-700 disabled:opacity-50"><Upload size={16} />{busy ? "กำลังนำเข้า..." : "นำเข้าไฟล์ Cash"}</button>
          {report.sourceFile && <span className="text-xs text-gray-500">ไฟล์ล่าสุด: {report.sourceFile}</span>}
        </form>
        {message && <p className={`mt-2 text-sm ${message.includes("สำเร็จ") ? "text-emerald-700" : "text-red-600"}`}>{message}</p>}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-max text-sm">
          <thead className="bg-gray-50 text-xs font-medium text-gray-600">
            <tr className="border-b border-gray-200">
              <th rowSpan={2} className="sticky left-0 z-20 min-w-20 bg-gray-50 px-4 py-3 text-left">วันที่</th>
              <th rowSpan={2} className="sticky left-20 z-20 min-w-40 bg-gray-50 px-4 py-3 text-left">รายการ</th>
              <th colSpan={branches.length} className="px-4 py-2 text-center">สาขา</th>
              <th rowSpan={2} className="min-w-36 border-l border-gray-200 px-4 py-3 text-right">รวมรายวัน</th>
            </tr>
            <tr>{branches.map((branch, index) => <th key={`${branch}-${index}`} className="min-w-36 whitespace-nowrap border-l border-gray-100 px-4 py-3 text-right">{branch}</th>)}</tr>
          </thead>
          <tbody>
            {report.rows.length ? report.rows.map((row) => (
              <tr key={row.day} className="border-t border-gray-100 hover:bg-pink-50/40">
                <td className="sticky left-0 bg-white px-4 py-3 text-gray-600">{row.day}/{report.month}/{report.year + 543}</td>
                <td className="sticky left-20 bg-white px-4 py-3 font-medium text-gray-800">ยอดขายเงินสด</td>
                {row.amounts.map((amount, index) => <td key={index} className="border-l border-gray-100 px-4 py-3 text-right tabular-nums">{fmtSatang(amount)}</td>)}
                <td className="border-l border-gray-200 px-4 py-3 text-right font-semibold tabular-nums">{fmtSatang(row.total)}</td>
              </tr>
            )) : <tr><td colSpan={branches.length + 3} className="px-4 py-14 text-center text-gray-400">ยังไม่มีข้อมูล — เลือกเดือน/ปี แล้วนำเข้าไฟล์ Cash.xlsx</td></tr>}
          </tbody>
          <tfoot className="border-t-2 border-pink-200 bg-pink-50 font-semibold text-gray-900">
            <tr>
              <td className="sticky left-0 bg-pink-50 px-4 py-3" />
              <td className="sticky left-20 bg-pink-50 px-4 py-3">ยอดรวมทั้งสิ้น</td>
              {branches.map((branch, index) => <td key={`${branch}-${index}`} className="border-l border-pink-100 px-4 py-3 text-right tabular-nums">{report.branchTotals[index] === undefined ? "—" : fmtSatang(report.branchTotals[index])}</td>)}
              <td className="border-l border-pink-200 px-4 py-3 text-right tabular-nums">{fmtSatang(report.grandTotal, { zeroDash: false })}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

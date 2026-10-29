"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Printer, Save } from "lucide-react";
import { useServerRefresh } from "./useServerRefresh";
import ProjectionTable from "./ProjectionTable";
import type { ProjectionReport } from "@/lib/accounting/projection";

const MONTH_NAMES = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const field = "mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

function inputValue(satang: number) {
  return satang === 0 ? "" : (satang / 100).toFixed(2);
}

export default function ProjectionWorkspace({ initialReport, selectedMonth }: { initialReport: ProjectionReport; selectedMonth: number }) {
  const [report, setReport] = useState(initialReport);
  const [estimatedRevenue, setEstimatedRevenue] = useState("");
  const [estimatedExpense, setEstimatedExpense] = useState("");
  const [losses, setLosses] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const { refreshing, refresh, router } = useServerRefresh();
  const years = useMemo(() => Array.from({ length: 12 }, (_, index) => report.year + 2 - index), [report.year]);

  useEffect(() => {
    const month = report.months[selectedMonth - 1];
    setEstimatedRevenue(inputValue(month?.estimatedRevenue ?? 0));
    setEstimatedExpense(inputValue(month?.estimatedExpense ?? 0));
    setLosses(Object.fromEntries(report.losses.map((loss) => [loss.lossYear, inputValue(loss.amount)])));
  }, [report, selectedMonth]);

  function navigate(year: number, month: number) {
    router.push(`/accounting/projection?year=${year}&month=${month}`);
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/accounting/projections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: report.year,
          month: selectedMonth,
          estimatedRevenue,
          estimatedExpense,
          losses: report.losses.map((loss) => ({ lossYear: loss.lossYear, amount: losses[loss.lossYear] ?? "" })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "บันทึกไม่สำเร็จ");
      // ใช้ผลที่ API คำนวณคืนมาทันที ตารางจึงเปลี่ยนก่อน refresh ของ server เสร็จ
      setReport(data.report);
      setMessage({ text: `บันทึกประมาณการเดือน${MONTH_NAMES[selectedMonth - 1]}แล้ว` });
      refresh();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "บันทึกไม่สำเร็จ", error: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[180px_180px_1fr_1fr_auto] lg:items-end">
          <label className="text-sm font-medium text-gray-700">
            ปี
            <select value={report.year} onChange={(event) => navigate(Number(event.target.value), selectedMonth)} className={field}>
              {years.map((year) => <option key={year} value={year}>{year + 543} ({year})</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700">
            เดือนที่กรอกประมาณการ
            <select value={selectedMonth} onChange={(event) => navigate(report.year, Number(event.target.value))} className={field}>
              {MONTH_NAMES.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700">
            รายได้ประมาณการ (บาท)
            <input value={estimatedRevenue} onChange={(event) => setEstimatedRevenue(event.target.value)} inputMode="decimal" className={field} placeholder="0.00" />
          </label>
          <label className="text-sm font-medium text-gray-700">
            ค่าใช้จ่ายประมาณการ (บาท)
            <input value={estimatedExpense} onChange={(event) => setEstimatedExpense(event.target.value)} inputMode="decimal" className={field} placeholder="0.00" />
          </label>
          <button
            type="button"
            onClick={save}
            disabled={saving || refreshing}
            className="flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <Save size={16} /> {saving || refreshing ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        </div>

        <div className="mt-5 border-t border-gray-100 pt-4">
          <p className="text-sm font-semibold text-gray-800">ขาดทุนสุทธิทางภาษียกมาไม่เกิน 5 ปีก่อนรอบบัญชี {report.year + 543}</p>
          <p className="mt-1 text-xs text-gray-500">กรอกยอดคงเหลือที่ยังมีสิทธิใช้จริงแยกตามปี ระบบจะนำไปหักไม่เกินกำไรของแต่ละฝั่ง</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {report.losses.map((loss) => (
              <label key={loss.lossYear} className="text-xs font-medium text-gray-600">
                ปี {loss.lossYear + 543} ({loss.lossYear})
                <input
                  value={losses[loss.lossYear] ?? ""}
                  onChange={(event) => setLosses((current) => ({ ...current, [loss.lossYear]: event.target.value }))}
                  inputMode="decimal"
                  className={field}
                  placeholder="0.00"
                />
              </label>
            ))}
          </div>
        </div>

        {message && <p className={`mt-3 text-sm ${message.error ? "text-rose-600" : "text-emerald-700"}`}>{message.text}</p>}
      </section>

      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-900">เปรียบเทียบประมาณการกับผลที่เกิดขึ้นจริง</h2>
          <p className="text-xs text-gray-500">ผลจริงดึงจากงบกำไรขาดทุนเฉพาะใบสำคัญที่ผ่านรายการแล้ว</p>
        </div>
        <Link
          href={`/print/projection?year=${report.year}`}
          target="_blank"
          className="flex shrink-0 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          <Printer size={15} /> พิมพ์ / บันทึก PDF
        </Link>
      </div>

      <ProjectionTable report={report} selectedMonth={selectedMonth} />
      <p className="text-xs text-gray-500">
        หมายเหตุ: “เกิดขึ้นจริง” รวมต้นทุนขาย ค่าใช้จ่ายขาย/บริหาร ต้นทุนทางการเงิน และภาษีเงินได้จากงบกำไรขาดทุน ส่วนขาดทุนยกมาเป็นข้อมูลภาษีที่ผู้ใช้ยืนยันเอง
      </p>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Building2, CheckCircle2, FileSpreadsheet, Loader2, UploadCloud } from "lucide-react";
import {
  parseReconciliationTable,
  reconcileBankRows,
  reconciliationAmountLabel,
  summarizeReconciliationRows,
  type ReconciliationDirection,
  type ReconciliationItem,
  type ReconciliationResultRow,
} from "@/lib/accounting/bankReconciliation";
import { fmtSatang } from "@/lib/accounting/money";
import { useServerRefresh } from "./useServerRefresh";

type UploadKind = "bank" | "ledger";

type SelectedFiles = Record<UploadKind, File | null>;

const DIRECTION_LABELS: Record<ReconciliationDirection, string> = {
  in: "เงินเข้า",
  out: "เงินออก",
  both: "ทั้งเงินเข้าและเงินออก",
};

const UPLOADS = [
  {
    kind: "bank" as const,
    title: "ไฟล์รายการเดินบัญชีธนาคาร",
    hint: "Statement ที่ดาวน์โหลดจากธนาคาร",
    icon: Building2,
    tone: "border-blue-200 bg-blue-50/60 text-blue-700 hover:border-blue-400",
  },
  {
    kind: "ledger" as const,
    title: "ไฟล์บัญชี",
    hint: "รายการบัญชีเงินฝากจากโปรแกรมบัญชี",
    icon: FileSpreadsheet,
    tone: "border-emerald-200 bg-emerald-50/60 text-emerald-700 hover:border-emerald-400",
  },
];

function fileSizeLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function sideLabel(item: ReconciliationItem | null) {
  if (!item) return "—";
  return item.amount > 0 ? "เดบิต" : "เครดิต";
}

function resultTone(row: ReconciliationResultRow) {
  if (row.status === "matched") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (row.status === "mismatched") return "border-rose-200 bg-rose-50 text-rose-900";
  return "border-amber-200 bg-amber-50 text-amber-900";
}

function statusBadge(row: ReconciliationResultRow) {
  if (row.status === "matched") return "bg-emerald-100 text-emerald-700";
  if (row.status === "mismatched") return "bg-rose-100 text-rose-700";
  return "bg-amber-100 text-amber-800";
}

function statusLabel(row: ReconciliationResultRow) {
  if (row.status === "not-found") return "ไม่พบคู่";
  if (row.status === "mismatched") return row.matchKind === "amount-mismatch" ? "ยอดไม่ตรงกัน" : "รายละเอียดไม่ตรงกัน";
  return row.daysApart ? `ตรงกัน · วันที่ต่าง ${row.daysApart} วัน` : "ตรงกัน";
}

function parseCsv(text: string): unknown[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index++;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index++;
      row.push(value);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  row.push(value);
  if (row.some((cell) => cell.trim())) rows.push(row);
  if (rows[0]?.[0]) rows[0][0] = rows[0][0].replace(/^\uFEFF/, "");
  return rows;
}

function excelValue(value: unknown): unknown {
  if (value && typeof value === "object") {
    if ("result" in value) return (value as { result?: unknown }).result;
    if ("text" in value) return (value as { text?: unknown }).text;
  }
  return value;
}

async function readFileTable(file: File): Promise<unknown[][]> {
  if (file.name.toLowerCase().endsWith(".csv")) return parseCsv(await file.text());
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error(`ไม่พบแผ่นงานในไฟล์ ${file.name}`);
  const rows: unknown[][] = [];
  sheet.eachRow({ includeEmpty: false }, (sheetRow) => {
    const values = Array.isArray(sheetRow.values) ? sheetRow.values.slice(1) : [];
    rows.push(values.map(excelValue));
  });
  return rows;
}

export default function BankReconciliationUpload() {
  const [files, setFiles] = useState<SelectedFiles>({ bank: null, ledger: null });
  const [results, setResults] = useState<ReconciliationResultRow[] | null>(null);
  const [direction, setDirection] = useState<ReconciliationDirection>("both");
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);
  const { refreshing, refresh } = useServerRefresh();
  const ready = Boolean(files.bank && files.ledger);

  const selectFile = (kind: UploadKind, file: File | null) => {
    setFiles((current) => ({ ...current, [kind]: file }));
    setResults(null);
    setError("");
  };

  const reconcile = async () => {
    if (!files.bank || !files.ledger) return;
    setProcessing(true);
    setError("");
    try {
      const [bankTable, ledgerTable] = await Promise.all([readFileTable(files.bank), readFileTable(files.ledger)]);
      const bankRows = parseReconciliationTable(bankTable, "bank");
      const ledgerRows = parseReconciliationTable(ledgerTable, "ledger");
      if (!bankRows.length || !ledgerRows.length) throw new Error("ไม่พบรายการที่มีวันที่และจำนวนเงินในไฟล์ใดไฟล์หนึ่ง");
      setResults(reconcileBankRows(bankRows, ledgerRows, direction));
      refresh();
    } catch (caught) {
      setResults(null);
      setError(caught instanceof Error ? caught.message : "ไม่สามารถอ่านไฟล์ได้");
    } finally {
      setProcessing(false);
    }
  };

  const summary = results ? summarizeReconciliationRows(results) : null;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-2">
        {UPLOADS.map(({ kind, title, hint, icon: Icon, tone }) => {
          const file = files[kind];
          return (
            <section key={kind} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-start gap-3">
                <span className="rounded-lg bg-gray-100 p-2 text-gray-600">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <div>
                  <h2 className="font-semibold text-gray-900">{title}</h2>
                  <p className="mt-0.5 text-sm text-gray-500">{hint}</p>
                </div>
              </div>

              <label className={`flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-5 py-7 text-center transition-colors ${tone}`}>
                {file ? <CheckCircle2 size={32} aria-hidden="true" /> : <UploadCloud size={32} aria-hidden="true" />}
                <span className="mt-3 text-sm font-semibold">{file ? "เลือกไฟล์แล้ว" : "คลิกเพื่อเลือกไฟล์"}</span>
                <span className="mt-1 text-xs opacity-75">รองรับ Excel (.xlsx) และ CSV</span>
                <input
                  type="file"
                  accept=".xlsx,.csv"
                  className="sr-only"
                  onChange={(event) => selectFile(kind, event.target.files?.[0] ?? null)}
                />
              </label>

              <div className="mt-3 min-h-11 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                {file ? (
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate font-medium text-gray-700">{file.name}</span>
                    <span className="shrink-0 text-xs text-gray-400">{fileSizeLabel(file.size)}</span>
                  </div>
                ) : (
                  <span className="text-gray-400">ยังไม่ได้เลือกไฟล์</span>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-semibold text-gray-900">พร้อมตรวจสอบและจับคู่รายการ</h2>
            <p className="mt-1 text-sm text-gray-500">
              {ready ? "เลือกไฟล์ครบทั้ง 2 ฝั่งแล้ว" : "เลือกไฟล์ธนาคารและไฟล์บัญชีให้ครบก่อนเริ่มกระทบยอด"}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block text-sm font-medium text-gray-700">
              เลือกรายการที่จะจับคู่
              <select
                value={direction}
                onChange={(event) => {
                  setDirection(event.target.value as ReconciliationDirection);
                  setResults(null);
                  setError("");
                }}
                className="mt-1 block min-w-52 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="in">เงินเข้า</option>
                <option value="out">เงินออก</option>
                <option value="both">ทั้งเงินเข้าและเงินออก</option>
              </select>
            </label>
            <button
              type="button"
              disabled={!ready || processing || refreshing}
              onClick={reconcile}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500"
            >
              {(processing || refreshing) && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
              {processing ? "กำลังอ่านไฟล์..." : refreshing ? "กำลังแสดงผล..." : "ตรวจสอบและจับคู่"}
            </button>
          </div>
        </div>
        {error && <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          รอบนี้ตรวจ{DIRECTION_LABELS[direction]} ไฟล์ประมวลผลในเบราว์เซอร์ ไม่อัปโหลด ไม่บันทึก และไม่นำไปลงบัญชี
        </p>
      </section>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="font-semibold text-gray-900">ผลการกระทบยอด</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {summary
                ? `ตรงกัน ${summary.matchedCount.toLocaleString("th-TH")} · ไม่ตรงกัน ${summary.mismatchedCount.toLocaleString("th-TH")} · ไม่พบ ${summary.notFoundCount.toLocaleString("th-TH")} รายการ`
                : "เลือกไฟล์ทั้งสองฝั่งแล้วกดตรวจสอบและจับคู่"}
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-emerald-700">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> ตรงกัน
            </span>
            <span className="flex items-center gap-1.5 text-rose-700">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> ไม่ตรงกัน
            </span>
            <span className="flex items-center gap-1.5 text-amber-700">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> ไม่พบคู่
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[68rem] text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left font-medium">วันที่</th>
                <th className="px-4 py-3 text-left font-medium">รายการธนาคาร</th>
                <th className="px-4 py-3 text-center font-medium">เดบิต/เครดิต</th>
                <th className="px-4 py-3 text-right font-medium">ยอดธนาคาร</th>
                <th className="px-4 py-3 text-left font-medium">รายการบัญชี</th>
                <th className="px-4 py-3 text-center font-medium">เดบิต/เครดิต</th>
                <th className="px-4 py-3 text-right font-medium">ยอดบัญชี</th>
                <th className="px-4 py-3 text-left font-medium">คำที่ตรงกัน</th>
                <th className="px-4 py-3 text-center font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {(results ?? []).map((row) => (
                <tr
                  key={row.id}
                  className={`border-t ${resultTone(row)}`}
                >
                  <td className="whitespace-nowrap px-4 py-3">{row.dateLabel}</td>
                  <td className="px-4 py-3 font-medium">{row.bank?.detail || "—"}</td>
                  <td className="px-4 py-3 text-center">{sideLabel(row.bank)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{reconciliationAmountLabel(row.bank)}</td>
                  <td className="px-4 py-3 font-medium">{row.ledger?.detail || "—"}</td>
                  <td className="px-4 py-3 text-center">{sideLabel(row.ledger)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{reconciliationAmountLabel(row.ledger)}</td>
                  <td className="px-4 py-3 text-xs">{row.commonWords.length ? row.commonWords.join(", ") : "—"}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadge(row)}`}>
                      {statusLabel(row)}
                    </span>
                  </td>
                </tr>
              ))}
              {results?.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-400">ไม่พบรายการสำหรับกระทบยอด</td></tr>
              )}
              {!results && (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-400">ยังไม่ได้เริ่มตรวจสอบ</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {summary && (
          <div className="border-t border-gray-200 bg-gray-50 px-5 py-5">
            <h3 className="font-semibold text-gray-900">สรุปผลต่าง</h3>
            <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200 bg-white">
              <table className="w-full min-w-[36rem] text-sm">
                <thead className="bg-gray-100 text-xs text-gray-600">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">ประเภท</th>
                    <th className="px-4 py-3 text-right font-medium">ยอดธนาคาร</th>
                    <th className="px-4 py-3 text-right font-medium">ยอดบัญชี</th>
                    <th className="px-4 py-3 text-right font-medium">ผลต่าง</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700">
                  {[
                    ["เงินเข้า", summary.bankIn, summary.ledgerIn, summary.inDifference],
                    ["เงินออก", summary.bankOut, summary.ledgerOut, summary.outDifference],
                    ["ยอดสุทธิ", summary.bankNet, summary.ledgerNet, summary.netDifference],
                  ].map(([name, bank, account, difference]) => (
                    <tr key={String(name)} className={name === "ยอดสุทธิ" ? "bg-blue-50 font-semibold text-blue-900" : ""}>
                      <td className="px-4 py-3">{String(name)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtSatang(Number(bank), { zeroDash: false })}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtSatang(Number(account), { zeroDash: false })}</td>
                      <td className={`px-4 py-3 text-right font-semibold tabular-nums ${Number(difference) === 0 ? "text-emerald-700" : "text-rose-700"}`}>
                        {fmtSatang(Number(difference), { zeroDash: false })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-gray-500">ผลต่างคำนวณจากยอดธนาคารลบยอดบัญชี และไม่สร้างรายการบัญชีใหม่</p>
          </div>
        )}
      </section>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, FileSpreadsheet, Layers3, Loader2, UploadCloud } from "lucide-react";
import { parseReconciliationTable, type ReconciliationItem } from "@/lib/accounting/bankReconciliation";
import { fmtSatang } from "@/lib/accounting/money";
import { buildPlatformReconciliationWorkbook } from "@/lib/accounting/reconciliationExcel";
import {
  PLATFORM_LABELS,
  deduplicatePlatformPayouts,
  parseGrabReportTable,
  parseLineManReportText,
  parsePlatformTable,
  parseShopeeReportTable,
  reconcilePlatformPayouts,
  summarizePlatformReconciliation,
  type PlatformCode,
  type PlatformPayoutItem,
  type PlatformReconciliationResult,
} from "@/lib/accounting/platformBankReconciliation";
import { useServerRefresh } from "./useServerRefresh";

type ResultFilter = "all" | "matched" | "mismatched" | "platform-without-bank" | "bank-without-platform";

const FILTER_LABELS: Record<ResultFilter, string> = {
  all: "ทั้งหมด",
  matched: "ตรงกัน",
  mismatched: "ไม่ตรงกัน",
  "platform-without-bank": "มีรายการแพลตฟอร์ม แต่ไม่พบเงินเข้า",
  "bank-without-platform": "มีเงินเข้า แต่ไม่พบยอดโอนจากแพลตฟอร์ม",
};

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

async function readFileTable(file: File, preferredSheetName?: string): Promise<unknown[][]> {
  if (file.name.toLowerCase().endsWith(".csv")) return parseCsv(await file.text());
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = preferredSheetName
    ? workbook.worksheets.find((worksheet) => worksheet.name.trim().toLowerCase() === preferredSheetName.toLowerCase())
    : workbook.worksheets[0];
  if (!sheet) throw new Error(`ไม่พบแผ่นงานในไฟล์ ${file.name}`);
  const rows: unknown[][] = [];
  sheet.eachRow({ includeEmpty: false }, (sheetRow) => {
    const values = Array.isArray(sheetRow.values) ? sheetRow.values.slice(1) : [];
    rows.push(values.map(excelValue));
  });
  return rows;
}

async function readPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // โหลดเฉพาะโปรแกรมอ่าน PDF จาก CDN ส่วนเอกสารยังอ่านในเบราว์เซอร์และไม่ถูกอัปโหลดออกไป
  pdfjs.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/pdf.worker.min.mjs";
  const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items.map((item) => {
      if (!("str" in item)) return "";
      return `${item.str}${item.hasEOL ? "\n" : " "}`;
    }).join("");
    pages.push(text);
  }
  return pages.join("\n");
}

async function parsePlatformFile(file: File, platform: PlatformCode): Promise<PlatformPayoutItem[]> {
  if (file.name.toLowerCase().endsWith(".pdf")) {
    if (platform !== "LINE_MAN") {
      throw new Error(`PDF ของ ${PLATFORM_LABELS[platform]} ต้องมีไฟล์ตัวอย่างก่อนเพิ่มรูปแบบการอ่านเฉพาะแพลตฟอร์ม`);
    }
    return parseLineManReportText(await readPdfText(file), file.name);
  }
  if (platform === "SHOPEE" && file.name.toLowerCase().endsWith(".xlsx")) {
    return parseShopeeReportTable(await readFileTable(file, "Income"), file.name);
  }
  const table = await readFileTable(file);
  if (platform === "GRAB") {
    try {
      return parseGrabReportTable(table, file.name);
    } catch {
      // ยังรองรับไฟล์ Grab รูปแบบกลางที่มีวันที่และยอดรับสุทธิเดิม
    }
  }
  return parsePlatformTable(table, platform, file.name);
}

function fileSizeLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function tone(status: PlatformReconciliationResult["status"]) {
  if (status === "matched") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (status === "mismatched") return "border-rose-200 bg-rose-50 text-rose-900";
  return "border-amber-200 bg-amber-50 text-amber-900";
}

function badge(status: PlatformReconciliationResult["status"]) {
  if (status === "matched") return "bg-emerald-100 text-emerald-700";
  if (status === "mismatched") return "bg-rose-100 text-rose-700";
  return "bg-amber-100 text-amber-800";
}

function statusLabel(row: PlatformReconciliationResult) {
  if (row.status === "matched") {
    const fee = row.inferredTransferFee ? " · หักค่าธรรมเนียมโอน 5 บาท" : "";
    return `ตรงกัน${row.daysApart ? ` · เข้าหลัง ${row.daysApart} วัน` : ""}${fee}`;
  }
  if (row.status === "mismatched") return "ยอดไม่ตรงกัน";
  return row.bank && row.payouts.length === 0
    ? "ไม่พบยอดโอนจากแพลตฟอร์ม"
    : "ไม่พบเงินเข้าธนาคาร";
}

function matchesFilter(row: PlatformReconciliationResult, filter: ResultFilter): boolean {
  if (filter === "all") return true;
  if (filter === "matched" || filter === "mismatched") return row.status === filter;
  if (filter === "bank-without-platform") return row.status === "not-found" && Boolean(row.bank) && row.payouts.length === 0;
  return row.status === "not-found" && !row.bank;
}

export default function PlatformBankReconciliation({ bankFile }: { bankFile: File | null }) {
  const [platform, setPlatform] = useState<PlatformCode>("LINE_MAN");
  const [platformFiles, setPlatformFiles] = useState<File[]>([]);
  const [results, setResults] = useState<PlatformReconciliationResult[] | null>(null);
  const [payoutCount, setPayoutCount] = useState(0);
  const [filter, setFilter] = useState<ResultFilter>("all");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const { refreshing, refresh } = useServerRefresh();

  const summary = useMemo(() => results ? summarizePlatformReconciliation(results) : null, [results]);
  const visibleResults = useMemo(() => (
    results?.filter((row) => matchesFilter(row, filter)) ?? null
  ), [filter, results]);

  const changePlatform = (value: PlatformCode) => {
    setPlatform(value);
    setPlatformFiles([]);
    setResults(null);
    setPayoutCount(0);
    setError("");
  };

  const reconcile = async () => {
    if (!bankFile || !platformFiles.length) return;
    setProcessing(true);
    setError("");
    try {
      const bankRows = parseReconciliationTable(await readFileTable(bankFile), "bank")
        .filter((row): row is ReconciliationItem => row.amount > 0);
      const parsed = await Promise.all(platformFiles.map((file) => parsePlatformFile(file, platform)));
      const payouts = deduplicatePlatformPayouts(parsed.flat());
      if (!bankRows.length) throw new Error("ไม่พบรายการเงินเข้าในไฟล์ธนาคาร");
      if (!payouts.length) throw new Error(`ไม่พบยอดโอนสุทธิในไฟล์ ${PLATFORM_LABELS[platform]}`);
      setPayoutCount(payouts.length);
      setResults(reconcilePlatformPayouts(bankRows, payouts, platform));
      refresh();
    } catch (caught) {
      setResults(null);
      setPayoutCount(0);
      setError(caught instanceof Error ? caught.message : "ไม่สามารถอ่านหรือกระทบยอดไฟล์ได้");
    } finally {
      setProcessing(false);
    }
  };

  const exportResults = async () => {
    if (!visibleResults) return;
    setError("");
    try {
      const workbook = buildPlatformReconciliationWorkbook(visibleResults, {
        platform,
        statusLabel: FILTER_LABELS[filter],
      });
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([new Uint8Array(buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `platform-bank-reconciliation-${platform.toLowerCase()}-${filter}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("ไม่สามารถสร้างไฟล์ Excel ได้");
    }
  };

  return (
    <section className="rounded-xl border border-fuchsia-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="rounded-lg bg-fuchsia-50 p-2 text-fuchsia-700">
            <Layers3 size={20} aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-semibold text-gray-900">กระทบยอดเงินเข้าจากแพลตฟอร์ม</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              ตรวจยอดสุทธิจากแพลตฟอร์มกับเงินเข้าธนาคาร รองรับการรวมหลายสาขาเป็นเงินเข้าก้อนเดียว
            </p>
          </div>
        </div>
        <label className="text-sm font-medium text-gray-700">
          แพลตฟอร์ม
          <select
            value={platform}
            onChange={(event) => changePlatform(event.target.value as PlatformCode)}
            className="ml-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            {(Object.keys(PLATFORM_LABELS) as PlatformCode[]).map((code) => (
              <option key={code} value={code}>{PLATFORM_LABELS[code]}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.45fr)]">
        <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-fuchsia-200 bg-fuchsia-50/50 px-5 py-6 text-center text-fuchsia-700 hover:border-fuchsia-400">
          {platformFiles.length ? <CheckCircle2 size={30} aria-hidden="true" /> : <UploadCloud size={30} aria-hidden="true" />}
          <span className="mt-2 text-sm font-semibold">
            {platformFiles.length ? `เลือกแล้ว ${platformFiles.length} ไฟล์` : `เลือกไฟล์ ${PLATFORM_LABELS[platform]}`}
          </span>
          <span className="mt-1 text-xs opacity-75">รองรับ PDF, Excel (.xlsx) และ CSV · เลือกพร้อมกันได้หลายไฟล์</span>
          <input
            type="file"
            accept=".pdf,.xlsx,.csv"
            multiple
            className="sr-only"
            onChange={(event) => {
              setPlatformFiles(Array.from(event.target.files ?? []));
              setResults(null);
              setPayoutCount(0);
              setError("");
            }}
          />
        </label>

        <div className="rounded-xl bg-gray-50 p-4 text-sm">
          <p className="font-semibold text-gray-800">ไฟล์ที่เลือก</p>
          <div className="mt-2 max-h-28 space-y-1 overflow-y-auto">
            {platformFiles.map((file) => (
              <div key={`${file.name}-${file.size}`} className="flex justify-between gap-3 text-xs text-gray-600">
                <span className="truncate">{file.name}</span>
                <span className="shrink-0 text-gray-400">{fileSizeLabel(file.size)}</span>
              </div>
            ))}
            {!platformFiles.length && <p className="text-xs text-gray-400">ยังไม่ได้เลือกไฟล์แพลตฟอร์ม</p>}
          </div>
          <p className={`mt-4 rounded-lg px-3 py-2 text-xs font-medium ${
            bankFile && platformFiles.length
              ? "bg-emerald-50 text-emerald-700"
              : "bg-amber-50 text-amber-700"
          }`}>
            {bankFile && platformFiles.length
              ? "พร้อมเทียบไฟล์ธนาคารกับไฟล์จากแพลตฟอร์ม"
              : "เลือกไฟล์ธนาคารและไฟล์จากแพลตฟอร์มก่อนเริ่มกระทบยอด"}
          </p>
          <button
            type="button"
            disabled={!bankFile || !platformFiles.length || processing || refreshing}
            onClick={reconcile}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-fuchsia-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-fuchsia-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500"
          >
            {(processing || refreshing) && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {processing ? "กำลังอ่านและจัดกลุ่ม..." : "กระทบยอดเงินเข้าแพลตฟอร์ม"}
          </button>
        </div>
      </div>

      {!bankFile && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">กรุณาเลือกไฟล์ธนาคารด้านบนก่อน</p>}
      {platform !== "LINE_MAN" && (
        <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
          Excel/CSV ใช้ได้เมื่อมีคอลัมน์วันที่และยอดรับสุทธิ ส่วน PDF ของ {PLATFORM_LABELS[platform]} ต้องเพิ่มรูปแบบจากไฟล์ตัวอย่างของแพลตฟอร์มนั้น
        </p>
      )}
      {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      {results && summary && (
        <div className="mt-5 overflow-hidden rounded-xl border border-gray-200">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
            <div>
              <h3 className="font-semibold text-gray-900">ผลการกระทบยอด {PLATFORM_LABELS[platform]}</h3>
              <p className="mt-0.5 text-xs text-gray-500">
                อ่านยอดโอน {payoutCount.toLocaleString("th-TH")} รายการ · ตรงกัน {summary.matchedCount} · ไม่ตรง {summary.mismatchedCount} · แพลตฟอร์มไม่มีเงินเข้า {summary.platformWithoutBankCount} · ธนาคารไม่มีรายการแพลตฟอร์ม {summary.bankWithoutPlatformCount}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={exportResults}
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
              >
                <FileSpreadsheet size={16} aria-hidden="true" /> Export Excel
              </button>
              <label className="text-xs font-medium text-gray-600">
                สถานะ
                <select value={filter} onChange={(event) => setFilter(event.target.value as ResultFilter)} className="ml-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
                  <option value="all">ทั้งหมด</option>
                  <option value="matched">ตรงกัน</option>
                  <option value="mismatched">ไม่ตรงกัน</option>
                  <option value="platform-without-bank">มีรายการแพลตฟอร์ม แต่ไม่พบเงินเข้า</option>
                  <option value="bank-without-platform">มีเงินเข้า แต่ไม่พบยอดโอนจากแพลตฟอร์ม</option>
                </select>
              </label>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[72rem] text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">วันที่แพลตฟอร์ม</th>
                  <th className="px-4 py-3 text-left font-medium">สาขา / หมายเลขร้าน</th>
                  <th className="px-4 py-3 text-right font-medium">ยอดโอนจากรายงาน</th>
                  <th className="px-4 py-3 text-right font-medium">ค่าธรรมเนียมโอน</th>
                  <th className="px-4 py-3 text-left font-medium">วันที่ธนาคาร</th>
                  <th className="px-4 py-3 text-left font-medium">รายการธนาคาร</th>
                  <th className="px-4 py-3 text-right font-medium">เงินเข้าธนาคาร</th>
                  <th className="px-4 py-3 text-right font-medium">ผลต่าง</th>
                  <th className="px-4 py-3 text-center font-medium">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {(visibleResults ?? []).map((row) => (
                  <tr key={row.id} className={`border-t ${tone(row.status)}`}>
                    <td className="whitespace-nowrap px-4 py-3">{row.payouts[0]?.dateLabel ?? "—"}</td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        {row.payouts.map((payout) => (
                          <div key={payout.id} className="flex justify-between gap-3">
                            <span className="font-medium">{payout.storeName}</span>
                            <span className="shrink-0 text-xs opacity-70">{payout.storeId || payout.reference}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">{fmtSatang(row.platformTotal, { zeroDash: false })}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtSatang(row.inferredTransferFee, { zeroDash: false })}</td>
                    <td className="whitespace-nowrap px-4 py-3">{row.bank?.dateLabel ?? "—"}</td>
                    <td className="px-4 py-3">{row.bank?.detail || "—"}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">{row.bank ? fmtSatang(row.bank.amount, { zeroDash: false }) : "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{fmtSatang(row.amountDifference, { zeroDash: false })}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badge(row.status)}`}>{statusLabel(row)}</span>
                    </td>
                  </tr>
                ))}
                {visibleResults?.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">ไม่มีรายการในสถานะที่เลือก</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="border-t border-gray-200 bg-gray-50 p-4">
            <h3 className="font-semibold text-gray-900">สรุปผลต่างยอดรับจากแพลตฟอร์ม</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {[
                ["ยอดโอนตามแพลตฟอร์ม", summary.platformTotal],
                ["ค่าธรรมเนียมโอน", summary.transferFeeTotal],
                ["ยอดที่ควรเข้าธนาคาร", summary.bankExpectedTotal],
                ["ยอดเข้าธนาคารที่ตรวจพบ", summary.bankTotal],
                ["ผลต่าง", summary.difference],
              ].map(([label, amount]) => (
                <div key={String(label)} className="rounded-lg border border-gray-200 bg-white p-3">
                  <p className="text-xs text-gray-500">{String(label)}</p>
                  <p className={`mt-1 text-right font-semibold tabular-nums ${label === "ผลต่าง" && Number(amount) !== 0 ? "text-rose-700" : "text-gray-900"}`}>
                    {fmtSatang(Number(amount), { zeroDash: false })}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-gray-500">ระบบอ่านและกระทบยอดเท่านั้น ไม่เก็บไฟล์ ไม่สร้างใบสำคัญ และไม่ลงบัญชี</p>
          </div>
        </div>
      )}
    </section>
  );
}

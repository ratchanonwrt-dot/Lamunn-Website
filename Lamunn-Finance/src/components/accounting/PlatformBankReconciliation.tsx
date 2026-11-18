"use client";

import { useMemo, useState } from "react";
import { BarChart3, CheckCircle2, FileSpreadsheet, Layers3, Loader2, UploadCloud } from "lucide-react";
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
  reconcileAllPlatformPayouts,
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

type PlatformFileReport = {
  fileName: string;
  platform: PlatformCode | null;
  itemCount: number;
  payoutTotal: number;
  error?: string;
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

function platformFromFileName(fileName: string): PlatformCode | null {
  const normalized = fileName.toLowerCase().replace(/[\s_-]+/g, "");
  if (normalized.includes("lineman") || normalized.includes("wongnai") || normalized.includes("ไลน์แมน")) return "LINE_MAN";
  if (normalized.includes("grab") || normalized.includes("แกร็บ")) return "GRAB";
  if (normalized.includes("shopee") || normalized.includes("ช้อปปี้")) return "SHOPEE";
  if (normalized.includes("tiktok") || normalized.includes("ติ๊กต็อก")) return "TIKTOK";
  return null;
}

function platformFromTable(table: unknown[][]): PlatformCode | null {
  const sample = table.slice(0, 20).flat().map((value) => String(value ?? "").toLowerCase()).join(" ");
  if (sample.includes("grab") || sample.includes("รหัสการทำรายการ")) return "GRAB";
  if (sample.includes("shopee") || sample.includes("วันที่โอนชำระเงินสำเร็จ")) return "SHOPEE";
  if (sample.includes("tiktok")) return "TIKTOK";
  if (sample.includes("line man") || sample.includes("lineman") || sample.includes("หมายเลขร้าน")) return "LINE_MAN";
  return null;
}

async function parsePlatformFile(file: File): Promise<{ platform: PlatformCode; payouts: PlatformPayoutItem[] }> {
  const namedPlatform = platformFromFileName(file.name);
  if (file.name.toLowerCase().endsWith(".pdf")) {
    const payouts = parseLineManReportText(await readPdfText(file), file.name);
    if (!payouts.length) throw new Error("ยังอ่าน PDF รูปแบบนี้ไม่ได้ (รองรับ PDF รายงานรายเดือนของ LINE MAN)");
    return { platform: "LINE_MAN", payouts };
  }
  if (file.name.toLowerCase().endsWith(".xlsx") && (!namedPlatform || namedPlatform === "SHOPEE")) {
    try {
      const payouts = parseShopeeReportTable(await readFileTable(file, "Income"), file.name);
      if (payouts.length) return { platform: "SHOPEE", payouts };
    } catch {
      // ไม่ใช่ไฟล์ Shopee ให้ตรวจรูปแบบอื่นต่อ
    }
  }
  const table = await readFileTable(file);
  if (!namedPlatform || namedPlatform === "GRAB") {
    try {
      const payouts = parseGrabReportTable(table, file.name);
      if (payouts.length) return { platform: "GRAB", payouts };
    } catch {
      // ไม่ใช่ไฟล์ Grab ให้ตรวจรูปแบบกลางต่อ
    }
  }
  const platform = namedPlatform ?? platformFromTable(table);
  if (!platform) {
    throw new Error("ไม่ทราบแพลตฟอร์ม กรุณาใส่ชื่อ Grab, LINE MAN, TikTok หรือ Shopee ในชื่อไฟล์");
  }
  return { platform, payouts: parsePlatformTable(table, platform, file.name) };
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
  const [platformFiles, setPlatformFiles] = useState<File[]>([]);
  const [fileReports, setFileReports] = useState<PlatformFileReport[]>([]);
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
  const detectedPlatforms = useMemo(() => (
    (Object.keys(PLATFORM_LABELS) as PlatformCode[]).filter((platform) => fileReports.some((report) => report.platform === platform))
  ), [fileReports]);
  const platformDashboard = useMemo(() => detectedPlatforms.map((platform) => {
    const reports = fileReports.filter((report) => report.platform === platform);
    const platformResults = results?.filter((row) => row.payouts.some((payout) => payout.platform === platform)) ?? [];
    return {
      platform,
      fileCount: reports.length,
      itemCount: reports.reduce((sum, report) => sum + report.itemCount, 0),
      payoutTotal: reports.reduce((sum, report) => sum + report.payoutTotal, 0),
      matchedCount: platformResults.filter((row) => row.status === "matched").length,
      reviewCount: platformResults.filter((row) => row.status !== "matched").length,
    };
  }), [detectedPlatforms, fileReports, results]);

  const reconcile = async () => {
    if (!bankFile || !platformFiles.length) return;
    setProcessing(true);
    setError("");
    try {
      const bankRows = parseReconciliationTable(await readFileTable(bankFile), "bank")
        .filter((row): row is ReconciliationItem => row.amount > 0);
      const parsed = await Promise.all(platformFiles.map(async (file): Promise<{ report: PlatformFileReport; payouts: PlatformPayoutItem[] }> => {
        try {
          const detected = await parsePlatformFile(file);
          return {
            report: {
              fileName: file.name,
              platform: detected.platform,
              itemCount: detected.payouts.length,
              payoutTotal: detected.payouts.reduce((sum, row) => sum + row.payoutAmount, 0),
            },
            payouts: detected.payouts,
          };
        } catch (caught) {
          return {
            report: {
              fileName: file.name,
              platform: null,
              itemCount: 0,
              payoutTotal: 0,
              error: caught instanceof Error ? caught.message : "อ่านไฟล์ไม่ได้",
            },
            payouts: [],
          };
        }
      }));
      setFileReports(parsed.map(({ report }) => report));
      const payouts = deduplicatePlatformPayouts(parsed.flatMap(({ payouts: rows }) => rows));
      if (!bankRows.length) throw new Error("ไม่พบรายการเงินเข้าในไฟล์ธนาคาร");
      if (!payouts.length) throw new Error("ไม่พบยอดโอนสุทธิจากไฟล์แพลตฟอร์มที่เลือก");
      setPayoutCount(payouts.length);
      setResults(reconcileAllPlatformPayouts(bankRows, payouts));
      const failedFiles = parsed.filter(({ report }) => report.error);
      if (failedFiles.length) {
        setError(`อ่านได้ ${parsed.length - failedFiles.length} จาก ${parsed.length} ไฟล์ · ไฟล์ที่อ่านไม่ได้: ${failedFiles.map(({ report }) => report.fileName).join(", ")}`);
      }
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
        statusLabel: FILTER_LABELS[filter],
      });
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([new Uint8Array(buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `platform-bank-reconciliation-all-${filter}.xlsx`;
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
              แนบ Statement และไฟล์ยอดโอนสุทธิ แล้วระบบแยกแพลตฟอร์มและจับคู่ให้เอง
            </p>
          </div>
        </div>
        <span className="rounded-full bg-fuchsia-50 px-3 py-1.5 text-xs font-medium text-fuchsia-700">
          ตรวจแพลตฟอร์มจากไฟล์ให้อัตโนมัติ
        </span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <div className={`rounded-xl border p-4 ${bankFile ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
          <p className="text-xs font-semibold text-gray-500">ขั้นที่ 1</p>
          <p className="mt-1 font-semibold text-gray-900">Statement ธนาคาร</p>
          <p className={`mt-2 truncate text-xs ${bankFile ? "text-emerald-700" : "text-amber-700"}`}>
            {bankFile ? `พร้อมแล้ว · ${bankFile.name}` : "เลือกไฟล์ธนาคารด้านบนก่อน"}
          </p>
        </div>
        <div className={`rounded-xl border p-4 ${platformFiles.length ? "border-emerald-200 bg-emerald-50" : "border-fuchsia-200 bg-fuchsia-50"}`}>
          <p className="text-xs font-semibold text-gray-500">ขั้นที่ 2</p>
          <p className="mt-1 font-semibold text-gray-900">ไฟล์ยอดโอนจากแพลตฟอร์ม</p>
          <p className={`mt-2 text-xs ${platformFiles.length ? "text-emerald-700" : "text-fuchsia-700"}`}>
            {platformFiles.length ? `พร้อมแล้ว ${platformFiles.length} ไฟล์` : "แนบทุกไฟล์พร้อมกันได้"}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <p className="text-xs font-semibold text-gray-500">ขั้นที่ 3</p>
          <p className="mt-1 font-semibold text-gray-900">ตรวจเงินเข้า</p>
          <p className="mt-2 text-xs text-gray-500">กดปุ่มเดียวเพื่อจับคู่ทั้งหมด</p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.45fr)]">
        <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-fuchsia-200 bg-fuchsia-50/50 px-5 py-6 text-center text-fuchsia-700 hover:border-fuchsia-400">
          {platformFiles.length ? <CheckCircle2 size={30} aria-hidden="true" /> : <UploadCloud size={30} aria-hidden="true" />}
          <span className="mt-2 text-sm font-semibold">
            {platformFiles.length ? `เลือกไฟล์ยอดโอนแล้ว ${platformFiles.length} ไฟล์` : "แนบไฟล์ยอดโอนจากทุกแพลตฟอร์ม"}
          </span>
          <span className="mt-1 text-xs opacity-75">Grab CSV · LINE MAN PDF · TikTok Excel/CSV · Shopee Excel</span>
          <span className="mt-1 text-xs opacity-75">เลือกหลายแพลตฟอร์มและหลายสาขาพร้อมกันได้</span>
          <input
            type="file"
            accept=".pdf,.xlsx,.csv"
            multiple
            className="sr-only"
            onChange={(event) => {
              setPlatformFiles(Array.from(event.target.files ?? []));
              setFileReports([]);
              setResults(null);
              setPayoutCount(0);
              setError("");
            }}
          />
        </label>

        <div className="rounded-xl bg-gray-50 p-4 text-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold text-gray-800">ไฟล์ยอดโอนที่เลือก</p>
            {platformFiles.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setPlatformFiles([]);
                  setFileReports([]);
                  setResults(null);
                  setPayoutCount(0);
                  setError("");
                }}
                className="text-xs font-medium text-gray-500 hover:text-rose-600"
              >
                ล้างไฟล์
              </button>
            )}
          </div>
          <div className="mt-2 max-h-28 space-y-1 overflow-y-auto">
            {platformFiles.map((file) => {
              const report = fileReports.find((item) => item.fileName === file.name);
              return (
              <div key={`${file.name}-${file.size}`} className="flex justify-between gap-3 text-xs text-gray-600">
                <span className="min-w-0 truncate">{file.name}</span>
                <span className="flex shrink-0 items-center gap-2">
                  {report?.platform && <span className="rounded-full bg-white px-2 py-0.5 font-medium text-fuchsia-700">{PLATFORM_LABELS[report.platform]}</span>}
                  {report?.error && <span className="rounded-full bg-rose-100 px-2 py-0.5 font-medium text-rose-700">อ่านไม่ได้</span>}
                  <span className="text-gray-400">{fileSizeLabel(file.size)}</span>
                </span>
              </div>
              );
            })}
            {!platformFiles.length && <p className="text-xs text-gray-400">ยังไม่ได้เลือกไฟล์ยอดโอน</p>}
          </div>
          <p className={`mt-4 rounded-lg px-3 py-2 text-xs font-medium ${
            bankFile && platformFiles.length
              ? "bg-emerald-50 text-emerald-700"
              : "bg-amber-50 text-amber-700"
          }`}>
            {bankFile && platformFiles.length
              ? "พร้อมตรวจว่าเงินเข้าธนาคารครบหรือไม่"
              : "ต้องมี Statement และไฟล์ยอดโอนก่อน"}
          </p>
          <button
            type="button"
            disabled={!bankFile || !platformFiles.length || processing || refreshing}
            onClick={reconcile}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-fuchsia-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-fuchsia-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500"
          >
            {(processing || refreshing) && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {processing ? "กำลังตรวจเงินเข้า..." : "ตรวจเงินเข้าจากทุกแพลตฟอร์ม"}
          </button>
        </div>
      </div>

      <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
        ระบบใช้ “ยอดโอนสุทธิและวันที่โอน” จากไฟล์แพลตฟอร์มเทียบกับเงินเข้าธนาคาร รองรับหลายสาขารวมเป็นเงินเข้าก้อนเดียว
      </p>
      {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      {results && summary && (
        <div className="mt-5 overflow-hidden rounded-xl border border-gray-200">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
            <div>
              <h3 className="font-semibold text-gray-900">ผลการกระทบยอดทุกแพลตฟอร์ม</h3>
              <p className="mt-0.5 text-xs text-gray-500">
                พบ {detectedPlatforms.length} แพลตฟอร์ม · อ่านยอดโอน {payoutCount.toLocaleString("th-TH")} รายการ · ตรงกัน {summary.matchedCount} · ต้องตรวจสอบ {summary.mismatchedCount + summary.notFoundCount}
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
            <table className="w-full min-w-[78rem] text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">แพลตฟอร์ม</th>
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
                    <td className="whitespace-nowrap px-4 py-3 font-semibold">{row.payouts[0] ? PLATFORM_LABELS[row.payouts[0].platform] : "—"}</td>
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
                  <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">ไม่มีรายการในสถานะที่เลือก</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="border-t border-gray-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <BarChart3 size={18} className="text-fuchsia-600" aria-hidden="true" />
              <h3 className="font-semibold text-gray-900">แดชบอร์ดแยกตามแพลตฟอร์ม</h3>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {platformDashboard.map((item) => (
                <div key={item.platform} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-gray-900">{PLATFORM_LABELS[item.platform]}</p>
                    <span className="rounded-full bg-white px-2 py-1 text-xs text-gray-500">{item.fileCount} ไฟล์</span>
                  </div>
                  <p className="mt-3 text-xs text-gray-500">ยอดโอนจากรายงาน</p>
                  <p className="mt-1 text-xl font-bold tabular-nums text-gray-900">{fmtSatang(item.payoutTotal, { zeroDash: false })}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700">{item.itemCount} รายการ</span>
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">ตรง {item.matchedCount}</span>
                    <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">ตรวจสอบ {item.reviewCount}</span>
                  </div>
                </div>
              ))}
            </div>
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

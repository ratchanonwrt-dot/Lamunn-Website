import type { InputVatReport, InputVatRow } from "./taxReports";

function normalize(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("th-TH")
    .replace(/[\s,\-./()]+/g, "");
}

function moneySearchValue(satang: number) {
  const absoluteSatang = Math.abs(satang);
  const baht = Math.floor(absoluteSatang / 100);
  const cents = String(absoluteSatang % 100).padStart(2, "0");
  return `${satang < 0 ? "-" : ""}${baht}.${cents}`;
}

export function matchesInputVatVendor(
  row: Pick<InputVatRow, "vendorName" | "invoiceNo" | "taxId" | "branchTag" | "base" | "vat" | "total">,
  query: string,
) {
  const needles = query.trim().split(/\s+/).map(normalize).filter(Boolean);
  if (needles.length === 0) return true;
  // จำนวนเงินเก็บเป็นสตางค์ จึงแปลงเป็นข้อความสองตำแหน่งก่อนค้นหา
  // เพื่อให้ 2523.36 และ 2,523.36 ให้ผลเดียวกัน โดยยังใช้จำนวนเต็มตลอดทาง
  const fields = [
    row.vendorName,
    row.invoiceNo,
    row.taxId,
    row.branchTag,
    moneySearchValue(row.base),
    moneySearchValue(row.vat),
    moneySearchValue(row.total),
  ].map(normalize);
  return needles.every((needle) => fields.some((field) => field.includes(needle)));
}

/** กรองรายงานในหน่วยความจำเพื่อไม่ให้การค้นหาไปเปลี่ยนเงื่อนไขภาษีหรือข้อมูลต้นฉบับ */
export function filterInputVatReportByVendor(report: InputVatReport, query: string): InputVatReport {
  const rows = report.rows.filter((row) => matchesInputVatVendor(row, query));
  return {
    rows,
    totalBase: rows.reduce((sum, row) => sum + row.base, 0),
    totalVat: rows.reduce((sum, row) => sum + row.vat, 0),
    claimableVat: rows.filter((row) => row.isClaimable).reduce((sum, row) => sum + row.vat, 0),
    nonClaimableVat: rows.filter((row) => !row.isClaimable).reduce((sum, row) => sum + row.vat, 0),
    docCount: rows.filter((row) => row.kind === "DOC").length,
    aiAutokeyCount: rows.filter((row) => row.kind === "AI_AUTOKEY").length,
  };
}

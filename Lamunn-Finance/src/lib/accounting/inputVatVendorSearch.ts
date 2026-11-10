import type { InputVatReport, InputVatRow } from "./taxReports";

function normalize(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("th-TH")
    .replace(/[\s\-./()]+/g, "");
}

export function matchesInputVatVendor(row: Pick<InputVatRow, "vendorName" | "taxId" | "branchTag">, query: string) {
  const needles = query.trim().split(/\s+/).map(normalize).filter(Boolean);
  if (needles.length === 0) return true;
  const fields = [row.vendorName, row.taxId, row.branchTag].map(normalize);
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

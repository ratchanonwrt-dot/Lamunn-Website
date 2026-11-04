import { prisma } from "@lamunn/db-finance";
import type { PurchaseTaxItemCategory, PurchaseTaxPriceCondition } from "./purchaseTaxLineItems";

export interface PurchaseItemReportRow {
  invoiceId: string;
  invoiceDate: Date;
  invoiceNo: string;
  vendorName: string;
  vendorBranchTag: string | null;
  category: PurchaseTaxItemCategory;
  description: string;
  quantity: string;
  unitPriceSubSatang: number;
  unitPriceSatang: number;
  priceCondition: PurchaseTaxPriceCondition;
}

export interface PurchaseItemReport {
  rows: PurchaseItemReportRow[];
  totalQuantity: number;
}

export interface PurchaseItemReportFilters {
  from: string;
  to: string;
  start: Date;
  end: Date;
  category: string;
}

const CATEGORIES = new Set<PurchaseTaxItemCategory>(["RAW_MATERIAL", "PACKAGING", "OTHER"]);
const CONDITIONS = new Set<PurchaseTaxPriceCondition>(["VAT", "VAT_EXEMPT", "FREE"]);

export const PURCHASE_ITEM_CATEGORY_LABELS: Record<PurchaseTaxItemCategory, string> = {
  RAW_MATERIAL: "วัตถุดิบ",
  PACKAGING: "บรรจุภัณฑ์",
  OTHER: "อื่น ๆ",
};

const DATE_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function dateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function validDateInput(value: string | undefined): value is string {
  if (!value || !DATE_INPUT_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && dateInputValue(date) === value;
}

/** รับ year/month เดิมไว้ด้วย เพื่อให้ลิงก์เก่าพาผู้ใช้มาช่วงเดือนเดิม ไม่กระโดดกลับเดือนปัจจุบัน */
export function purchaseItemReportFilters(
  params: { from?: string; to?: string; category?: string; year?: string; month?: string },
  now = new Date(),
): PurchaseItemReportFilters {
  const requestedYear = Number(params.year);
  const requestedMonth = Number(params.month);
  const year = Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= 2200
    ? requestedYear
    : now.getUTCFullYear();
  const month = Number.isInteger(requestedMonth) && requestedMonth >= 1 && requestedMonth <= 12
    ? requestedMonth
    : now.getUTCMonth() + 1;
  const defaultFrom = `${year}-${String(month).padStart(2, "0")}-01`;
  const defaultTo = dateInputValue(new Date(Date.UTC(year, month, 0)));
  let from = validDateInput(params.from) ? params.from : defaultFrom;
  let to = validDateInput(params.to) ? params.to : defaultTo;
  if (from > to) [from, to] = [to, from];

  return {
    from,
    to,
    start: new Date(`${from}T00:00:00.000Z`),
    end: new Date(`${to}T23:59:59.999Z`),
    category: String(params.category ?? "").trim(),
  };
}

export function filterPurchaseItemReport(report: PurchaseItemReport, categoryQuery: string): PurchaseItemReport {
  const query = categoryQuery.trim().toLocaleLowerCase("th-TH");
  if (!query) return report;
  const rows = report.rows.filter((row) => {
    const label = PURCHASE_ITEM_CATEGORY_LABELS[row.category].toLocaleLowerCase("th-TH");
    return label.includes(query) || row.category.toLocaleLowerCase("en-US").includes(query);
  });
  return { rows, totalQuantity: rows.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0) };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** อ่าน snapshot อย่างระมัดระวัง เพราะเอกสารเก่าอาจไม่มีรายละเอียด หรือมี JSON จากเวอร์ชันก่อนหน้า */
export function flattenPurchaseItemInvoices(invoices: Array<{
  id: string;
  invoiceDate: Date;
  invoiceNo: string;
  vendorName: string;
  vendorBranchTag: string | null;
  lineItems: unknown;
}>): PurchaseItemReport {
  const rows: PurchaseItemReportRow[] = [];

  for (const invoice of invoices) {
    if (!Array.isArray(invoice.lineItems)) continue;
    for (const rawItem of invoice.lineItems) {
      const item = asRecord(rawItem);
      if (!item) continue;
      const category = CATEGORIES.has(item.category as PurchaseTaxItemCategory)
        ? item.category as PurchaseTaxItemCategory
        : "OTHER";
      const priceCondition = CONDITIONS.has(item.priceCondition as PurchaseTaxPriceCondition)
        ? item.priceCondition as PurchaseTaxPriceCondition
        : "VAT";
      const description = String(item.description ?? "").trim();
      const quantity = String(item.quantity ?? "").trim();
      const unitPriceSatang = Number(item.unitPriceSatang);
      if (!description || !quantity || !Number.isSafeInteger(unitPriceSatang)) continue;
      const storedSubSatang = Number(item.unitPriceSubSatang);
      // ใบเก่าเก็บถึงสตางค์เท่านั้น จึงขยายกลับเป็นหน่วย 0.0001 บาทเพื่ออ่านร่วมกับใบใหม่ได้
      const unitPriceSubSatang = Number.isSafeInteger(storedSubSatang)
        ? storedSubSatang
        : unitPriceSatang * 100;

      rows.push({
        invoiceId: invoice.id,
        invoiceDate: invoice.invoiceDate,
        invoiceNo: invoice.invoiceNo,
        vendorName: invoice.vendorName,
        vendorBranchTag: invoice.vendorBranchTag,
        category,
        description,
        quantity,
        unitPriceSubSatang,
        unitPriceSatang,
        priceCondition,
      });
    }
  }

  return {
    rows,
    totalQuantity: rows.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0),
  };
}

export async function loadPurchaseItemReport(start: Date, end: Date, categoryQuery = ""): Promise<PurchaseItemReport> {
  const invoices = await prisma.accPurchaseTaxInvoice.findMany({
    where: {
      voided: false,
      // ผู้ใช้เลือก "ช่วงวันที่" จากวันที่หน้าใบกำกับ จึงต้องกรองวันที่เอกสาร ไม่ใช่งวดเคลมภาษี
      invoiceDate: { gte: start, lte: end },
    },
    orderBy: [{ invoiceDate: "asc" }, { invoiceNo: "asc" }],
    select: {
      id: true,
      invoiceDate: true,
      invoiceNo: true,
      vendorName: true,
      vendorBranchTag: true,
      lineItems: true,
    },
  });

  return filterPurchaseItemReport(flattenPurchaseItemInvoices(invoices), categoryQuery);
}

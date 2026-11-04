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
  unitPriceSatang: number;
  priceCondition: PurchaseTaxPriceCondition;
}

export interface PurchaseItemReport {
  rows: PurchaseItemReportRow[];
  totalQuantity: number;
}

const CATEGORIES = new Set<PurchaseTaxItemCategory>(["RAW_MATERIAL", "PACKAGING", "OTHER"]);
const CONDITIONS = new Set<PurchaseTaxPriceCondition>(["VAT", "VAT_EXEMPT", "FREE"]);

export const PURCHASE_ITEM_CATEGORY_LABELS: Record<PurchaseTaxItemCategory, string> = {
  RAW_MATERIAL: "วัตถุดิบ",
  PACKAGING: "บรรจุภัณฑ์",
  OTHER: "อื่น ๆ",
};

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

      rows.push({
        invoiceId: invoice.id,
        invoiceDate: invoice.invoiceDate,
        invoiceNo: invoice.invoiceNo,
        vendorName: invoice.vendorName,
        vendorBranchTag: invoice.vendorBranchTag,
        category,
        description,
        quantity,
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

export async function loadPurchaseItemReport(start: Date, end: Date): Promise<PurchaseItemReport> {
  const invoices = await prisma.accPurchaseTaxInvoice.findMany({
    where: {
      voided: false,
      OR: [
        { claimPeriod: { gte: start, lte: end } },
        // ใช้งวดเดียวกับรายงานภาษีซื้อ เพื่อให้ผู้ใช้เทียบสองหน้าแล้วพบข้อมูลชุดเดียวกัน
        { claimPeriod: null, invoiceDate: { gte: start, lte: end } },
      ],
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

  return flattenPurchaseItemInvoices(invoices);
}

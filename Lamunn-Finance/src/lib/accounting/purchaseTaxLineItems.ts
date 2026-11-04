import { addVatExclusive, adjustVatSatang, type VatRounding } from "./money";

export type PurchaseTaxItemCategory = "RAW_MATERIAL" | "PACKAGING" | "OTHER";
export type PurchaseTaxPriceCondition = "VAT" | "VAT_EXEMPT" | "FREE";

export interface PurchaseTaxLineItemInput {
  category?: string;
  description?: string;
  quantity?: string | number;
  unitPrice?: string | number;
  priceCondition?: string;
  vatRatePercent?: string | number;
}

export interface CalculatedPurchaseTaxLineItem {
  category: PurchaseTaxItemCategory;
  description: string;
  quantity: string;
  /** 1 หน่วย = 0.0001 บาท — ต้องเก็บละเอียดกว่าสตางค์เพื่อรองรับราคาต่อหน่วย 4 ตำแหน่ง */
  unitPriceSubSatang: number;
  unitPriceSatang: number;
  priceCondition: PurchaseTaxPriceCondition;
  vatRatePercent: string;
  baseSatang: number;
  vatSatang: number;
  totalSatang: number;
}

export interface PurchaseTaxLineItemSummary {
  hasItems: boolean;
  items: CalculatedPurchaseTaxLineItem[];
  errors: string[];
  baseSatang: number;
  vatSatang: number;
  totalSatang: number;
}

const CATEGORIES = new Set<PurchaseTaxItemCategory>(["RAW_MATERIAL", "PACKAGING", "OTHER"]);
const CONDITIONS = new Set<PurchaseTaxPriceCondition>(["VAT", "VAT_EXEMPT", "FREE"]);

function parsePositiveDecimal(value: unknown): { numerator: bigint; denominator: bigint; normalized: string } | null {
  const text = String(value ?? "").trim().replace(/,/g, "");
  if (!/^\d+(?:\.\d{1,4})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  const denominator = 10n ** BigInt(fraction.length);
  const numerator = BigInt(whole) * denominator + BigInt(fraction || "0");
  if (numerator <= 0n) return null;
  return { numerator, denominator, normalized: text };
}

function parseUnitPriceSubSatang(value: unknown): number | null {
  const original = String(value ?? "").trim();
  const parenthesized = /^\(.*\)$/.test(original);
  const cleaned = original.replace(/^\((.*)\)$/, "$1").replace(/[,\s฿]/g, "");
  if (!/^[+-]?\d+(?:\.\d{1,4})?$/.test(cleaned)) return null;

  const negative = parenthesized || cleaned.startsWith("-");
  const unsigned = cleaned.replace(/^[+-]/, "");
  const [whole, fraction = ""] = unsigned.split(".");
  const scaled = BigInt(whole) * 10_000n + BigInt(fraction.padEnd(4, "0") || "0");
  const signed = negative ? -scaled : scaled;
  if (signed > BigInt(Number.MAX_SAFE_INTEGER) || signed < BigInt(Number.MIN_SAFE_INTEGER)) return null;
  return Number(signed);
}

function roundedSubSatangToSatang(unitPriceSubSatang: number): number {
  const sign = unitPriceSubSatang < 0 ? -1 : 1;
  const rounded = (BigInt(Math.abs(unitPriceSubSatang)) + 50n) / 100n;
  return Number(rounded) * sign;
}

function multiplySubSatang(unitPriceSubSatang: number, quantity: { numerator: bigint; denominator: bigint }): number {
  const sign = unitPriceSubSatang < 0 ? -1 : 1;
  const denominator = quantity.denominator * 100n;
  const product = BigInt(Math.abs(unitPriceSubSatang)) * quantity.numerator;
  const rounded = (product + denominator / 2n) / denominator;
  return Number(rounded) * sign;
}

export function fmtUnitPriceSubSatang(value: number): string {
  if (!Number.isSafeInteger(value)) return "0.0000";
  const sign = value < 0 ? "-" : "";
  const magnitude = Math.abs(value);
  const whole = Math.trunc(magnitude / 10_000).toLocaleString("th-TH");
  const fraction = String(magnitude % 10_000).padStart(4, "0");
  return `${sign}${whole}.${fraction}`;
}

export function summarizePurchaseTaxLineItems(
  rawItems: unknown,
  defaultVatRate: number,
  rounding: VatRounding = "NEAREST"
): PurchaseTaxLineItemSummary {
  const inputs = Array.isArray(rawItems) ? rawItems as PurchaseTaxLineItemInput[] : [];
  const active = inputs.filter((item) => String(item?.description ?? "").trim() || String(item?.unitPrice ?? "").trim());
  const errors: string[] = [];
  const items: CalculatedPurchaseTaxLineItem[] = [];

  active.forEach((input, index) => {
    const row = index + 1;
    const description = String(input.description ?? "").trim();
    const quantity = parsePositiveDecimal(input.quantity ?? "1");
    const category = CATEGORIES.has(input.category as PurchaseTaxItemCategory)
      ? input.category as PurchaseTaxItemCategory
      : "OTHER";
    const priceCondition = CONDITIONS.has(input.priceCondition as PurchaseTaxPriceCondition)
      ? input.priceCondition as PurchaseTaxPriceCondition
      : "VAT";
    const unitPriceText = String(input.unitPrice ?? "").trim();
    const parsedUnitPrice = unitPriceText ? parseUnitPriceSubSatang(unitPriceText) : null;

    if (!description) errors.push(`บรรทัดที่ ${row}: กรุณากรอกรายการ`);
    if (!quantity) errors.push(`บรรทัดที่ ${row}: จำนวนต้องมากกว่า 0 และมีทศนิยมไม่เกิน 4 ตำแหน่ง`);
    if (priceCondition !== "FREE" && !unitPriceText) errors.push(`บรรทัดที่ ${row}: กรุณากรอกราคาต่อหน่วย`);
    if (priceCondition !== "FREE" && unitPriceText && parsedUnitPrice === null) {
      errors.push(`บรรทัดที่ ${row}: ราคาต่อหน่วยต้องเป็นตัวเลขและมีทศนิยมไม่เกิน 4 ตำแหน่ง`);
    }
    if (!quantity || !description || (priceCondition !== "FREE" && (!unitPriceText || parsedUnitPrice === null))) return;

    const rawRatePercent = priceCondition === "VAT"
      ? String(input.vatRatePercent ?? defaultVatRate * 100).trim()
      : "0";
    const ratePercent = Number(rawRatePercent);
    if (!Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 100) {
      errors.push(`บรรทัดที่ ${row}: อัตรา VAT ต้องอยู่ระหว่าง 0 ถึง 100`);
      return;
    }

    const unitPriceSubSatang = priceCondition === "FREE" ? 0 : parsedUnitPrice ?? 0;
    // ปัดเป็นสตางค์หลังคูณจำนวนแล้ว เพื่อไม่ทิ้งทศนิยมตำแหน่งที่ 3–4 ของราคาต่อหน่วยก่อนเวลา
    const baseSatang = priceCondition === "FREE" ? 0 : multiplySubSatang(unitPriceSubSatang, quantity);
    const vatSatang = priceCondition === "VAT"
      ? addVatExclusive(baseSatang, ratePercent / 100, "NEAREST").vat
      : 0;
    items.push({
      category,
      description,
      quantity: quantity.normalized,
      unitPriceSubSatang,
      unitPriceSatang: roundedSubSatangToSatang(unitPriceSubSatang),
      priceCondition,
      vatRatePercent: ratePercent.toString(),
      baseSatang,
      vatSatang,
      totalSatang: baseSatang + vatSatang,
    });
  });

  const baseSatang = items.reduce((sum, item) => sum + item.baseSatang, 0);
  const rawVatSatang = items.reduce((sum, item) => sum + item.vatSatang, 0);
  const vatSatang = adjustVatSatang(rawVatSatang, rounding);
  return {
    hasItems: active.length > 0,
    items,
    errors,
    baseSatang,
    vatSatang,
    totalSatang: baseSatang + vatSatang,
  };
}

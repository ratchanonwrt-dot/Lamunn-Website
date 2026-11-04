import { addVatExclusive, adjustVatSatang, signedInputToSatang, type VatRounding } from "./money";

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

function multiplySatang(unitPriceSatang: number, quantity: { numerator: bigint; denominator: bigint }): number {
  const sign = unitPriceSatang < 0 ? -1 : 1;
  const product = BigInt(Math.abs(Math.trunc(unitPriceSatang))) * quantity.numerator;
  const rounded = (product + quantity.denominator / 2n) / quantity.denominator;
  return Number(rounded) * sign;
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
    const unitPriceSatang = signedInputToSatang(unitPriceText);

    if (!description) errors.push(`บรรทัดที่ ${row}: กรุณากรอกรายการ`);
    if (!quantity) errors.push(`บรรทัดที่ ${row}: จำนวนต้องมากกว่า 0 และมีทศนิยมไม่เกิน 4 ตำแหน่ง`);
    if (priceCondition !== "FREE" && !unitPriceText) errors.push(`บรรทัดที่ ${row}: กรุณากรอกราคาต่อหน่วย`);
    if (!quantity || !description || (priceCondition !== "FREE" && !unitPriceText)) return;

    const rawRatePercent = priceCondition === "VAT"
      ? String(input.vatRatePercent ?? defaultVatRate * 100).trim()
      : "0";
    const ratePercent = Number(rawRatePercent);
    if (!Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 100) {
      errors.push(`บรรทัดที่ ${row}: อัตรา VAT ต้องอยู่ระหว่าง 0 ถึง 100`);
      return;
    }

    const baseSatang = priceCondition === "FREE" ? 0 : multiplySatang(unitPriceSatang, quantity);
    const vatSatang = priceCondition === "VAT"
      ? addVatExclusive(baseSatang, ratePercent / 100, "NEAREST").vat
      : 0;
    items.push({
      category,
      description,
      quantity: quantity.normalized,
      unitPriceSatang,
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

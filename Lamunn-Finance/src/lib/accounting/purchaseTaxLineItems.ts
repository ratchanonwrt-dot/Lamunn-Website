import { addVatExclusive, adjustVatSatang, type VatRounding } from "./money";

export type PurchaseTaxItemCategory = "RAW_MATERIAL" | "PACKAGING" | "OTHER";
export type PurchaseTaxPriceCondition = "VAT" | "VAT_EXEMPT" | "FREE";

export interface PurchaseTaxLineItemInput {
  category?: string;
  description?: string;
  quantity?: string | number;
  unitPrice?: string | number;
  lineTotal?: string | number | null;
  priceCondition?: string;
  vatRatePercent?: string | number;
}

export interface CalculatedPurchaseTaxLineItem {
  category: PurchaseTaxItemCategory;
  description: string;
  quantity: string;
  /** เก็บเป็นข้อความเพื่อรักษาทศนิยมตำแหน่งที่ 1–10 โดยไม่ให้ JavaScript float เปลี่ยนค่า */
  unitPriceDecimal: string;
  /** ค่าเดิมหน่วย 0.0001 บาท เก็บไว้ให้ snapshot/รายงานรุ่นเก่ายังอ่านร่วมกันได้ */
  unitPriceSubSatang: number;
  unitPriceSatang: number;
  /** true เมื่อผู้ใช้แก้ราคารวมเอง เพื่อให้หน้าแก้ไขคืนค่าที่ผู้ใช้กำหนดได้ */
  lineTotalOverridden: boolean;
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
const UNIT_PRICE_DECIMAL_PLACES = 10;
const UNIT_PRICE_SCALE = 10n ** BigInt(UNIT_PRICE_DECIMAL_PLACES);
const SATANG_DIVISOR = UNIT_PRICE_SCALE / 100n;
const LEGACY_SUB_SATANG_DIVISOR = UNIT_PRICE_SCALE / 10_000n;

function parsePositiveDecimal(value: unknown): { numerator: bigint; denominator: bigint; normalized: string } | null {
  const text = String(value ?? "").trim().replace(/,/g, "");
  if (!/^\d+(?:\.\d{1,4})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  const denominator = 10n ** BigInt(fraction.length);
  const numerator = BigInt(whole) * denominator + BigInt(fraction || "0");
  if (numerator <= 0n) return null;
  return { numerator, denominator, normalized: text };
}

function parseUnitPriceDecimal(value: unknown): { scaled: bigint; normalized: string } | null {
  const original = String(value ?? "").trim();
  const parenthesized = /^\(.*\)$/.test(original);
  const cleaned = original.replace(/^\((.*)\)$/, "$1").replace(/[,\s฿]/g, "");
  if (!new RegExp(`^[+-]?\\d+(?:\\.\\d{1,${UNIT_PRICE_DECIMAL_PLACES}})?$`).test(cleaned)) return null;

  const negative = parenthesized || cleaned.startsWith("-");
  const unsigned = cleaned.replace(/^[+-]/, "");
  const [whole, fraction = ""] = unsigned.split(".");
  const magnitude = BigInt(whole) * UNIT_PRICE_SCALE
    + BigInt(fraction.padEnd(UNIT_PRICE_DECIMAL_PLACES, "0") || "0");
  const scaled = negative ? -magnitude : magnitude;
  const normalizedWhole = BigInt(whole).toString();
  const normalized = `${scaled < 0n ? "-" : ""}${normalizedWhole}${fraction ? `.${fraction}` : ""}`;
  return { scaled, normalized };
}

function parseLineTotalSatang(value: unknown): number | null {
  const original = String(value ?? "").trim();
  const parenthesized = /^\(.*\)$/.test(original);
  const cleaned = original.replace(/^\((.*)\)$/, "$1").replace(/[,\s฿]/g, "");
  if (!/^[+-]?\d+(?:\.\d{1,2})?$/.test(cleaned)) return null;
  const negative = parenthesized || cleaned.startsWith("-");
  const unsigned = cleaned.replace(/^[+-]/, "");
  const [whole, fraction = ""] = unsigned.split(".");
  const magnitude = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0") || "0");
  const satang = negative ? -magnitude : magnitude;
  if (satang > BigInt(Number.MAX_SAFE_INTEGER) || satang < BigInt(Number.MIN_SAFE_INTEGER)) return null;
  return Number(satang);
}

function roundedBigIntToSafeNumber(value: bigint, divisor: bigint): number | null {
  const sign = value < 0n ? -1n : 1n;
  const rounded = ((value < 0n ? -value : value) + divisor / 2n) / divisor * sign;
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER) || rounded < BigInt(Number.MIN_SAFE_INTEGER)) return null;
  return Number(rounded);
}

function multiplyUnitPriceToSatang(
  unitPriceScaled: bigint,
  quantity: { numerator: bigint; denominator: bigint },
): number | null {
  return roundedBigIntToSafeNumber(
    unitPriceScaled * quantity.numerator,
    quantity.denominator * SATANG_DIVISOR,
  );
}

export function fmtUnitPriceSubSatang(value: number): string {
  if (!Number.isSafeInteger(value)) return "0.0000";
  const sign = value < 0 ? "-" : "";
  const magnitude = Math.abs(value);
  const whole = Math.trunc(magnitude / 10_000).toLocaleString("th-TH");
  const fraction = String(magnitude % 10_000).padStart(4, "0");
  return `${sign}${whole}.${fraction}`;
}

export function fmtUnitPriceDecimal(value: string): string {
  const parsed = parseUnitPriceDecimal(value);
  if (!parsed) return "0.0000000000";
  const sign = parsed.scaled < 0n ? "-" : "";
  const unsigned = parsed.normalized.replace(/^-/, "");
  const [whole, fraction = ""] = unsigned.split(".");
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${groupedWhole}.${fraction.padEnd(UNIT_PRICE_DECIMAL_PLACES, "0")}`;
}

/** อ่านได้ทั้ง snapshot ใหม่แบบ exact และ snapshot เก่าที่เก็บหน่วย 0.0001 บาท */
export function unitPriceDecimalFromSnapshot(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const item = value as Record<string, unknown>;
  const exact = parseUnitPriceDecimal(item.unitPriceDecimal);
  if (exact) return exact.normalized;
  const legacy = Number(item.unitPriceSubSatang);
  if (Number.isSafeInteger(legacy)) return fmtUnitPriceSubSatang(legacy).replace(/,/g, "");
  const oldestSatang = Number(item.unitPriceSatang);
  return Number.isSafeInteger(oldestSatang)
    ? fmtUnitPriceSubSatang(oldestSatang * 100).replace(/,/g, "")
    : "";
}

export function satangToPlainInput(satang: number): string {
  if (!Number.isSafeInteger(satang)) return "0.00";
  const sign = satang < 0 ? "-" : "";
  const magnitude = Math.abs(satang);
  return `${sign}${Math.trunc(magnitude / 100)}.${String(magnitude % 100).padStart(2, "0")}`;
}

/** เอกสารเก่าไม่มี flag นี้ จึงปล่อยให้คำนวณราคารวมจากจำนวน × ราคาต่อหน่วยเหมือนเดิม */
export function lineTotalInputFromSnapshot(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (item.lineTotalOverridden !== true) return null;
  const baseSatang = Number(item.baseSatang);
  return Number.isSafeInteger(baseSatang) ? satangToPlainInput(baseSatang) : null;
}

export function summarizePurchaseTaxLineItems(
  rawItems: unknown,
  defaultVatRate: number,
  rounding: VatRounding = "NEAREST"
): PurchaseTaxLineItemSummary {
  const inputs = Array.isArray(rawItems) ? rawItems as PurchaseTaxLineItemInput[] : [];
  const active = inputs.filter((item) => String(item?.description ?? "").trim() || String(item?.unitPrice ?? "").trim() || String(item?.lineTotal ?? "").trim());
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
    const parsedUnitPrice = unitPriceText ? parseUnitPriceDecimal(unitPriceText) : null;
    const lineTotalText = String(input.lineTotal ?? "").trim();
    const parsedLineTotal = lineTotalText ? parseLineTotalSatang(lineTotalText) : null;

    if (!description) errors.push(`บรรทัดที่ ${row}: กรุณากรอกรายการ`);
    if (!quantity) errors.push(`บรรทัดที่ ${row}: จำนวนต้องมากกว่า 0 และมีทศนิยมไม่เกิน 4 ตำแหน่ง`);
    if (priceCondition !== "FREE" && !unitPriceText) errors.push(`บรรทัดที่ ${row}: กรุณากรอกราคาต่อหน่วย`);
    if (priceCondition !== "FREE" && unitPriceText && parsedUnitPrice === null) {
      errors.push(`บรรทัดที่ ${row}: ราคาต่อหน่วยต้องเป็นตัวเลขและมีทศนิยมไม่เกิน 10 ตำแหน่ง`);
    }
    if (priceCondition !== "FREE" && lineTotalText && parsedLineTotal === null) {
      errors.push(`บรรทัดที่ ${row}: ราคารวมต้องเป็นตัวเลขและมีทศนิยมไม่เกิน 2 ตำแหน่ง`);
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

    const unitPriceScaled = priceCondition === "FREE" ? 0n : parsedUnitPrice?.scaled ?? 0n;
    // คูณราคา exact กับจำนวนก่อน แล้วจึงปัดผลรวมเป็นสตางค์ เพื่อไม่ทิ้งทศนิยมตำแหน่งที่ 3–10 ก่อนเวลา
    const calculatedBaseSatang = priceCondition === "FREE" ? 0 : multiplyUnitPriceToSatang(unitPriceScaled, quantity);
    const lineTotalOverridden = priceCondition !== "FREE" && parsedLineTotal !== null;
    const baseSatang = lineTotalOverridden ? parsedLineTotal : calculatedBaseSatang;
    const unitPriceSubSatang = roundedBigIntToSafeNumber(unitPriceScaled, LEGACY_SUB_SATANG_DIVISOR);
    const unitPriceSatang = roundedBigIntToSafeNumber(unitPriceScaled, SATANG_DIVISOR);
    if (baseSatang === null || unitPriceSubSatang === null || unitPriceSatang === null) {
      errors.push(`บรรทัดที่ ${row}: ราคาหรือยอดรวมสูงเกินกว่าระบบจะคำนวณได้อย่างปลอดภัย`);
      return;
    }
    const vatSatang = priceCondition === "VAT"
      ? addVatExclusive(baseSatang, ratePercent / 100, "NEAREST").vat
      : 0;
    items.push({
      category,
      description,
      quantity: quantity.normalized,
      unitPriceDecimal: priceCondition === "FREE" ? "0" : parsedUnitPrice?.normalized ?? "0",
      unitPriceSubSatang,
      unitPriceSatang,
      lineTotalOverridden,
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

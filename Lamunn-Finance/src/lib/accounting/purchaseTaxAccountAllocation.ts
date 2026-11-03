import { fmtSatang, signedInputToSatang } from "./money";

export interface PurchaseTaxAccountAllocationInput {
  accountId?: string | null;
  amount?: string | number | null;
}

export interface PurchaseTaxAccountAllocation {
  accountId: string;
  amountSatang: number;
}

export class PurchaseTaxAccountAllocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PurchaseTaxAccountAllocationError";
  }
}

/** แบ่งฐานก่อน VAT ไปหลายบัญชีโดยคิดเป็นสตางค์ทั้งหมด เพื่อไม่ให้ใบสำคัญต่างกันจากเศษ float */
export function resolvePurchaseTaxAccountAllocations(
  lines: PurchaseTaxAccountAllocationInput[] | null | undefined,
  baseSatang: number,
  legacyAccountId?: string | null,
): PurchaseTaxAccountAllocation[] {
  const expected = Math.abs(baseSatang);
  const entered = Array.isArray(lines)
    ? lines.filter((line) => String(line.accountId ?? "").trim() || String(line.amount ?? "").trim())
    : [];

  // รองรับหน้ารุ่นก่อนที่ส่งบัญชีเดียวมา โดยให้บัญชีนั้นรับฐานก่อน VAT ทั้งจำนวน
  if (entered.length === 0 && legacyAccountId) {
    return [{ accountId: legacyAccountId, amountSatang: expected }];
  }
  if (entered.length === 0) return [];
  if (expected <= 0) throw new PurchaseTaxAccountAllocationError("ฐานก่อน VAT ต้องมากกว่า 0");

  const accountIds = new Set<string>();
  const allocations = entered.map((line, index) => {
    const accountId = String(line.accountId ?? "").trim();
    if (!accountId) {
      throw new PurchaseTaxAccountAllocationError(`บรรทัดบัญชีที่ ${index + 1} ยังไม่ได้เลือกบัญชี`);
    }
    if (accountIds.has(accountId)) {
      throw new PurchaseTaxAccountAllocationError(`บัญชีบรรทัดที่ ${index + 1} ซ้ำกับบรรทัดก่อนหน้า`);
    }
    accountIds.add(accountId);

    const rawAmount = String(line.amount ?? "").trim();
    const amountSatang = entered.length === 1 && !rawAmount ? expected : signedInputToSatang(rawAmount);
    if (amountSatang <= 0) {
      throw new PurchaseTaxAccountAllocationError(`ยอดบรรทัดบัญชีที่ ${index + 1} ต้องมากกว่า 0`);
    }
    return { accountId, amountSatang };
  });

  const allocated = allocations.reduce((sum, line) => sum + line.amountSatang, 0);
  if (allocated !== expected) {
    const difference = expected - allocated;
    const direction = difference > 0 ? "ยังขาด" : "เกิน";
    throw new PurchaseTaxAccountAllocationError(
      `ยอดแบ่งบัญชีรวมต้องเท่ากับฐานก่อน VAT ${fmtSatang(expected, { zeroDash: false })} บาท (${direction} ${fmtSatang(Math.abs(difference), { zeroDash: false })} บาท)`,
    );
  }

  return allocations;
}

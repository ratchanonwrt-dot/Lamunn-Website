import { SYSTEM_ACCOUNTS } from "./chartOfAccounts";

export type PartnerAccountType = "DEBTOR" | "CREDITOR";

export const PARTNER_ACCOUNT_BY_TYPE: Record<PartnerAccountType, { code: string; nameTh: string }> = {
  CREDITOR: { code: SYSTEM_ACCOUNTS.TRADE_PAYABLE, nameTh: "เจ้าหนี้การค้า" },
  DEBTOR: { code: SYSTEM_ACCOUNTS.TRADE_RECEIVABLE, nameTh: "ลูกหนี้การค้า" },
};

/** ประเภทคู่ค้าเป็นตัวกำหนดบัญชีเดียวกันทั้งระบบ เพื่อไม่ให้แต่ละหน้าตีความลูกหนี้/เจ้าหนี้ต่างกัน */
export function partnerAccountForType(type: PartnerAccountType) {
  return PARTNER_ACCOUNT_BY_TYPE[type];
}

export function resolvePartnerAccountId(
  type: PartnerAccountType,
  accounts: { id: string; code: string }[],
) {
  const code = partnerAccountForType(type).code;
  return accounts.find((account) => account.code === code)?.id ?? null;
}

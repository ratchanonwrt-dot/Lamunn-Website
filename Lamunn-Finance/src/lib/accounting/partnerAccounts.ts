export type PartnerAccountType = "DEBTOR" | "CREDITOR";

export const PARTNER_ACCOUNT_BY_TYPE: Record<PartnerAccountType, { code: string; nameTh: string }> = {
  CREDITOR: { code: "2110", nameTh: "เจ้าหนี้การค้า" },
  DEBTOR: { code: "11310", nameTh: "ลูกหนี้การค้า" },
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

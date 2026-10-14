import { AccountingError } from "./post";

const CLAIM_PERIOD_PATTERN = /^(\d{4})-(\d{2})$/;

export function invoiceMonth(invoiceDate: Date) {
  return new Date(Date.UTC(invoiceDate.getUTCFullYear(), invoiceDate.getUTCMonth(), 1));
}

/** เก็บเป็นวันที่ 1 ของเดือนเสมอ เพื่อไม่ให้ timezone ทำให้งวดภาษีเลื่อนไปเดือนข้างเคียง */
export function parsePurchaseTaxClaimPeriod(value: unknown, invoiceDate: Date) {
  const raw = String(value ?? "").trim();
  const match = CLAIM_PERIOD_PATTERN.exec(raw);
  if (!match) throw new AccountingError("กรุณาเลือกงวดที่นำภาษีซื้อไปเคลม");

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new AccountingError("งวดเคลมภาษีซื้อไม่ถูกต้อง");

  const claimPeriod = new Date(Date.UTC(year, month - 1, 1));
  if (claimPeriod.getTime() < invoiceMonth(invoiceDate).getTime()) {
    throw new AccountingError("งวดเคลมต้องเป็นเดือนเดียวกับหรือหลังเดือนของใบกำกับภาษี");
  }
  return claimPeriod;
}

// ยอดเงินมัดจำที่ "คาดว่าจะได้คืนจริง" บนฐานไม่รวม VAT — ใช้สูตรเดียวกันทุกหน้า (หน้าเงินมัดจำ + สถานะการเงินบริษัท)
// ยอดที่กรอกแบบรวม VAT ถอด VAT 7% ออก (÷1.07), ยอดไม่รวม VAT / ไม่มี VAT ใช้ตรงๆ,
// แถวที่ยังไม่ระบุ VAT ไม่ถูกนับ (ไม่รู้ฐาน) — คืนยอดนั้นแยกให้ผู้เรียกเอาไปแสดงเตือน
// แถวสถานะ "ได้คืนแล้ว" ไม่นับเลย — เงินกลับเข้าบริษัทแล้ว ถ้ายังนับจะซ้ำกับเงินสด/เงินในบัญชีที่ได้คืนมา
export const DEPOSIT_RETURNED = "RETURNED";

export function isStillHeld(d: { status?: string | null }) {
  return d.status !== DEPOSIT_RETURNED;
}

export function refundableDepositTotal(all: { amount: number; vatType: string | null; status?: string | null }[]): {
  refundExVat: number;
  sumIncVat: number;
  sumExVat: number;
  sumNoVat: number;
  sumUnspecified: number;
} {
  const deposits = all.filter(isStillHeld);
  const sumIncVat = deposits.filter((d) => d.vatType === "INCLUDES_VAT").reduce((a, d) => a + d.amount, 0);
  const sumExVat = deposits.filter((d) => d.vatType === "EXCLUDES_VAT").reduce((a, d) => a + d.amount, 0);
  const sumNoVat = deposits.filter((d) => d.vatType === "NO_VAT").reduce((a, d) => a + d.amount, 0);
  const sumUnspecified = deposits.filter((d) => !d.vatType).reduce((a, d) => a + d.amount, 0);
  return { refundExVat: sumIncVat / 1.07 + sumExVat + sumNoVat, sumIncVat, sumExVat, sumNoVat, sumUnspecified };
}

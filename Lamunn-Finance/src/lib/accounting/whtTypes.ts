import { formatPartnerDisplayName } from "./partnerDisplay";

/** ประเภทเงินได้ที่หักภาษี ณ ที่จ่ายบ่อยในธุรกิจร้านอาหาร/ค้าปลีก พร้อมอัตราที่ใช้กันทั่วไป
 *
 * แยกไฟล์จาก taxReports.ts เพราะฟอร์มฝั่ง client ต้องใช้รายการนี้
 * (ถ้าอยู่รวมกันจะลาก Prisma client เข้า bundle ฝั่งเบราว์เซอร์)
 *
 * อัตราเป็นค่าตั้งต้นให้กดเลือกเร็ว ๆ — แก้เป็นตัวเลขอื่นได้ในฟอร์มเสมอ
 * เพราะอัตราจริงขึ้นกับประเภทผู้รับเงินและเงื่อนไขเฉพาะราย ควรให้ผู้ทำบัญชียืนยัน
 */

export interface WhtIncomeType {
  label: string;
  rate: number;
  /** ปกติจ่ายให้ใคร — ใช้เดาแบบที่ต้องยื่นให้อัตโนมัติ (ผู้ใช้เปลี่ยนเองได้) */
  common: "PND3" | "PND53" | "BOTH";
}

export const WHT_INCOME_TYPES: WhtIncomeType[] = [
  { label: "ค่าจ้างทำของ / ค่าบริการ ม.40(2)", rate: 0.03, common: "BOTH" },
  { label: "ค่าเช่าอสังหาริมทรัพย์ ม.40(5)", rate: 0.05, common: "BOTH" },
  { label: "ค่าวิชาชีพอิสระ ม.40(6)", rate: 0.03, common: "BOTH" },
  { label: "ค่ารับเหมา ม.40(7)", rate: 0.03, common: "BOTH" },
  { label: "ค่าโฆษณา ม.40(8)", rate: 0.02, common: "BOTH" },
  { label: "ค่าขนส่ง ม.40(8)", rate: 0.01, common: "BOTH" },
  { label: "ค่าบริการอื่น ๆ ม.40(8)", rate: 0.03, common: "BOTH" },
  { label: "ดอกเบี้ย ม.40(4)(ก)", rate: 0.01, common: "PND53" },
  { label: "เงินปันผล ม.40(4)(ข)", rate: 0.1, common: "PND53" },
];

export const WHT_FORM_LABELS: Record<string, string> = {
  PND3: "ภ.ง.ด.3 (จ่ายให้บุคคลธรรมดา)",
  PND53: "ภ.ง.ด.53 (จ่ายให้นิติบุคคล)",
};

export const WHT_FORM_SHORT: Record<string, string> = {
  PND3: "ภ.ง.ด.3",
  PND53: "ภ.ง.ด.53",
};

/** ภ.ง.ด.53 ต้องระบุสาขาของนิติบุคคล ส่วน ภ.ง.ด.3 แสดงชื่อบุคคลโดยไม่เติมข้อความสาขา */
export function formatWhtPayeeDisplayName(formType: string, name: string, branchTag: string | null | undefined) {
  return formType === "PND53" ? formatPartnerDisplayName(name, branchTag) : name.trim();
}

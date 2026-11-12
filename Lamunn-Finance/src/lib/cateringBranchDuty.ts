/** หมวดงานนอกเหนืองานจัดเลี้ยงของพนักงาน Catering — ได้ค่าข้าวเหมาต่อวัน (ไม่ผูกกับจำนวนชั่วโมง)
 *
 * ไฟล์นี้ไม่ import prisma — ใช้ได้ทั้งฝั่งเซิร์ฟเวอร์และ client (ฟอร์มเลือกหมวด) */

export type BranchDutyKind = "TRAINING" | "COVER";

export const BRANCH_DUTY_KINDS: BranchDutyKind[] = ["TRAINING", "COVER"];

export const BRANCH_DUTY_LABEL: Record<BranchDutyKind, string> = {
  TRAINING: "สอนงานหน้าสาขา",
  COVER: "แทนสาขา",
};

/** ค่าข้าวต่อวันของแต่ละหมวด (บาท) — เก็บ snapshot ลงแถวตอนบันทึก เปลี่ยนตรงนี้ไม่กระทบรายการเก่า */
export const BRANCH_DUTY_AMOUNT: Record<BranchDutyKind, number> = {
  TRAINING: 50,
  COVER: 100,
};

export function isBranchDutyKind(v: unknown): v is BranchDutyKind {
  return v === "TRAINING" || v === "COVER";
}

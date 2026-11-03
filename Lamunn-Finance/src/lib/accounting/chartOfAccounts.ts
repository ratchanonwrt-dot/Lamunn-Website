import type { AccountType, VatRole } from "@lamunn/db-finance";

/** ผังบัญชีเริ่มต้นสำหรับธุรกิจร้านอาหาร/เบเกอรี่หลายสาขา
 *
 * ติดตั้งครั้งเดียวจากปุ่มในหน้า "ผังบัญชี" แล้วแก้ไข/เพิ่ม/ปิดใช้งานได้ทั้งหมด
 * (ทีมบัญชีปรับเองได้ภายหลัง — ไม่ต้องแก้โค้ด)
 *
 * บัญชี "หัวข้อรวม" (isPostable = false) ลงรายการตรงๆ ไม่ได้ มีไว้จัดกลุ่มตอนออกงบ
 * โครงกลุ่มนี้คือสิ่งที่งบกำไรขาดทุน/งบแสดงฐานะการเงินใช้จัดบรรทัด (ดู reports.ts)
 */

export interface SeedAccount {
  code: string;
  nameTh: string;
  type: AccountType;
  parentCode?: string;
  isPostable?: boolean;
  vatRole?: VatRole;
}

/** รหัสกลุ่มหลักที่งบการเงินอ้างอิง — ห้ามเปลี่ยนโดยไม่แก้ reports.ts ตาม */
export const GROUP = {
  CURRENT_ASSET: "1100",
  NON_CURRENT_ASSET: "1600",
  CURRENT_LIABILITY: "2100",
  NON_CURRENT_LIABILITY: "2500",
  EQUITY: "3000",
  REVENUE: "4000",
  OTHER_INCOME: "4900",
  COGS: "5100",
  SELLING_EXPENSE: "5300",
  ADMIN_EXPENSE: "5400",
  FINANCE_TAX: "5900",
} as const;

/** บัญชีที่ระบบใช้ลงรายการอัตโนมัติ — ถ้าลบ/เปลี่ยนรหัส การลงบัญชีอัตโนมัติจะเตือนว่าหาบัญชีไม่เจอ */
export const SYSTEM_ACCOUNTS = {
  CASH: "1110",
  BANK: "1120",
  AR_MALL: "1140",
  AR_GRAB: "1141",
  AR_LINEMAN: "1142",
  AR_ONLINE: "1143",
  INPUT_VAT: "1155",
  WHT_RECEIVABLE: "1160",
  OUTPUT_VAT: "2103",
  WHT_PAYABLE: "2130",
  WHT_PND53_PAYABLE: "27124",
  RETAINED_EARNINGS: "3210",
  REV_STOREFRONT: "4110",
  REV_DELIVERY: "4120",
  REV_ONLINE: "4130",
  REV_CATERING: "4140",
  REV_EVENT: "4150",
  GP_EXPENSE: "5310",
  DELIVERY_FEE: "5320",
  RENT_EXPENSE: "5410",
  DEPRECIATION: "5810",
} as const;

export const DEFAULT_CHART: SeedAccount[] = [
  // ── 1 สินทรัพย์ ────────────────────────────────────────────────
  { code: "1100", nameTh: "สินทรัพย์หมุนเวียน", type: "ASSET", isPostable: false },
  { code: "1110", nameTh: "เงินสดในมือ", type: "ASSET", parentCode: "1100" },
  { code: "1111", nameTh: "เงินสดย่อย", type: "ASSET", parentCode: "1100" },
  { code: "1120", nameTh: "เงินฝากธนาคาร - กระแสรายวัน", type: "ASSET", parentCode: "1100" },
  { code: "1121", nameTh: "เงินฝากธนาคาร - ออมทรัพย์", type: "ASSET", parentCode: "1100" },
  { code: "1140", nameTh: "ลูกหนี้การค้า - ห้างสรรพสินค้า", type: "ASSET", parentCode: "1100" },
  { code: "1141", nameTh: "ลูกหนี้การค้า - Grab", type: "ASSET", parentCode: "1100" },
  { code: "1142", nameTh: "ลูกหนี้การค้า - Lineman", type: "ASSET", parentCode: "1100" },
  { code: "1143", nameTh: "ลูกหนี้การค้า - ช่องทางออนไลน์", type: "ASSET", parentCode: "1100" },
  { code: "1149", nameTh: "ลูกหนี้การค้า - อื่นๆ", type: "ASSET", parentCode: "1100" },
  { code: "1155", nameTh: "ภาษีซื้อ", type: "ASSET", parentCode: "1100", vatRole: "INPUT" },
  { code: "1156", nameTh: "ภาษีซื้อยังไม่ถึงกำหนด", type: "ASSET", parentCode: "1100" },
  { code: "1160", nameTh: "ภาษีถูกหัก ณ ที่จ่าย", type: "ASSET", parentCode: "1100", vatRole: "WHT" },
  { code: "1310", nameTh: "สินค้าคงเหลือ", type: "ASSET", parentCode: "1100" },
  { code: "1320", nameTh: "วัตถุดิบคงเหลือ", type: "ASSET", parentCode: "1100" },
  { code: "1410", nameTh: "ค่าใช้จ่ายจ่ายล่วงหน้า", type: "ASSET", parentCode: "1100" },
  { code: "1420", nameTh: "เงินมัดจำจ่าย", type: "ASSET", parentCode: "1100" },

  { code: "1600", nameTh: "สินทรัพย์ไม่หมุนเวียน", type: "ASSET", isPostable: false },
  { code: "1610", nameTh: "อุปกรณ์และเครื่องใช้ในร้าน", type: "ASSET", parentCode: "1600" },
  { code: "1620", nameTh: "เครื่องตกแต่งและติดตั้ง", type: "ASSET", parentCode: "1600" },
  { code: "1630", nameTh: "ยานพาหนะ", type: "ASSET", parentCode: "1600" },
  { code: "1640", nameTh: "คอมพิวเตอร์และอุปกรณ์สำนักงาน", type: "ASSET", parentCode: "1600" },
  { code: "1650", nameTh: "ที่ดิน", type: "ASSET", parentCode: "1600" },
  { code: "1660", nameTh: "อาคาร", type: "ASSET", parentCode: "1600" },
  { code: "1670", nameTh: "ซอฟต์แวร์คอมพิวเตอร์", type: "ASSET", parentCode: "1600" },
  { code: "1680", nameTh: "เครื่องจักรและอุปกรณ์ในโรงงาน", type: "ASSET", parentCode: "1600" },
  { code: "1690", nameTh: "ค่าเสื่อมราคาสะสม", type: "ASSET", parentCode: "1600" },

  // ── 2 หนี้สิน ──────────────────────────────────────────────────
  { code: "2100", nameTh: "หนี้สินหมุนเวียน", type: "LIABILITY", isPostable: false },
  { code: "2110", nameTh: "เจ้าหนี้การค้า", type: "LIABILITY", parentCode: "2100" },
  { code: "2120", nameTh: "เจ้าหนี้อื่น", type: "LIABILITY", parentCode: "2100" },
  { code: "2103", nameTh: "ภาษีขาย", type: "LIABILITY", parentCode: "2100", vatRole: "OUTPUT" },
  { code: "2104", nameTh: "ภาษีขายยังไม่ถึงกำหนด", type: "LIABILITY", parentCode: "2100" },
  { code: "2130", nameTh: "ภาษีหัก ณ ที่จ่ายค้างนำส่ง", type: "LIABILITY", parentCode: "2100", vatRole: "WHT" },
  { code: "2140", nameTh: "ภาษีมูลค่าเพิ่มค้างชำระ", type: "LIABILITY", parentCode: "2100" },
  { code: "2150", nameTh: "ค่าใช้จ่ายค้างจ่าย", type: "LIABILITY", parentCode: "2100" },
  { code: "2160", nameTh: "เงินมัดจำรับ", type: "LIABILITY", parentCode: "2100" },
  { code: "2170", nameTh: "เงินเดือนค้างจ่าย", type: "LIABILITY", parentCode: "2100" },

  { code: "2500", nameTh: "หนี้สินไม่หมุนเวียน", type: "LIABILITY", isPostable: false },
  { code: "2510", nameTh: "เงินกู้ยืมระยะยาว", type: "LIABILITY", parentCode: "2500" },
  { code: "2520", nameTh: "เงินกู้ยืมจากกรรมการ", type: "LIABILITY", parentCode: "2500" },

  // ── 3 ส่วนของผู้ถือหุ้น ────────────────────────────────────────
  { code: "3000", nameTh: "ส่วนของผู้ถือหุ้น", type: "EQUITY", isPostable: false },
  { code: "3010", nameTh: "ทุนจดทะเบียนที่ชำระแล้ว", type: "EQUITY", parentCode: "3000" },
  { code: "3210", nameTh: "กำไรสะสมยกมา", type: "EQUITY", parentCode: "3000" },
  { code: "3310", nameTh: "เงินปันผลจ่าย", type: "EQUITY", parentCode: "3000" },

  // ── 4 รายได้ ──────────────────────────────────────────────────
  { code: "4000", nameTh: "รายได้จากการขายและบริการ", type: "REVENUE", isPostable: false },
  { code: "4110", nameTh: "รายได้ขายหน้าร้าน", type: "REVENUE", parentCode: "4000" },
  { code: "4120", nameTh: "รายได้ขายเดลิเวอรี", type: "REVENUE", parentCode: "4000" },
  { code: "4130", nameTh: "รายได้ขายออนไลน์", type: "REVENUE", parentCode: "4000" },
  { code: "4140", nameTh: "รายได้จัดเลี้ยง (Catering)", type: "REVENUE", parentCode: "4000" },
  { code: "4150", nameTh: "รายได้อีเวนต์/ออกบูธ", type: "REVENUE", parentCode: "4000" },
  { code: "4190", nameTh: "ส่วนลดจ่ายและรับคืนสินค้า", type: "REVENUE", parentCode: "4000" },

  { code: "4900", nameTh: "รายได้อื่น", type: "REVENUE", isPostable: false },
  { code: "4910", nameTh: "ดอกเบี้ยรับ", type: "REVENUE", parentCode: "4900" },
  { code: "4990", nameTh: "รายได้เบ็ดเตล็ด", type: "REVENUE", parentCode: "4900" },

  // ── 5 ต้นทุนและค่าใช้จ่าย ─────────────────────────────────────
  { code: "5100", nameTh: "ต้นทุนขาย", type: "EXPENSE", isPostable: false },
  { code: "5110", nameTh: "ต้นทุนขาย", type: "EXPENSE", parentCode: "5100" },
  { code: "5120", nameTh: "ต้นทุนวัตถุดิบ", type: "EXPENSE", parentCode: "5100" },
  { code: "5130", nameTh: "ค่าแรงในการผลิต", type: "EXPENSE", parentCode: "5100" },

  { code: "5300", nameTh: "ค่าใช้จ่ายในการขาย", type: "EXPENSE", isPostable: false },
  { code: "5310", nameTh: "ค่า GP ห้างสรรพสินค้า", type: "EXPENSE", parentCode: "5300" },
  { code: "5320", nameTh: "ค่าธรรมเนียมเดลิเวอรี (Grab/Lineman)", type: "EXPENSE", parentCode: "5300" },
  { code: "5330", nameTh: "ค่าธรรมเนียมธนาคาร/บัตรเครดิต", type: "EXPENSE", parentCode: "5300" },
  { code: "5340", nameTh: "ค่าการตลาดและโฆษณา", type: "EXPENSE", parentCode: "5300" },
  { code: "5350", nameTh: "ค่าบรรจุภัณฑ์", type: "EXPENSE", parentCode: "5300" },
  { code: "5360", nameTh: "ค่าขนส่ง", type: "EXPENSE", parentCode: "5300" },

  { code: "5400", nameTh: "ค่าใช้จ่ายในการบริหาร", type: "EXPENSE", isPostable: false },
  { code: "5410", nameTh: "ค่าเช่า", type: "EXPENSE", parentCode: "5400" },
  { code: "5420", nameTh: "เงินเดือนและค่าแรง", type: "EXPENSE", parentCode: "5400" },
  { code: "5430", nameTh: "ค่าสวัสดิการและประกันสังคม", type: "EXPENSE", parentCode: "5400" },
  { code: "5440", nameTh: "ค่าไฟฟ้าและน้ำประปา", type: "EXPENSE", parentCode: "5400" },
  { code: "5450", nameTh: "ค่าโทรศัพท์และอินเทอร์เน็ต", type: "EXPENSE", parentCode: "5400" },
  { code: "5460", nameTh: "ค่าวัสดุสิ้นเปลืองสำนักงาน", type: "EXPENSE", parentCode: "5400" },
  { code: "5470", nameTh: "ค่าซ่อมแซมและบำรุงรักษา", type: "EXPENSE", parentCode: "5400" },
  { code: "5480", nameTh: "ค่าธรรมเนียมวิชาชีพ (บัญชี/กฎหมาย)", type: "EXPENSE", parentCode: "5400" },
  { code: "5490", nameTh: "ค่าใช้จ่ายเบ็ดเตล็ด", type: "EXPENSE", parentCode: "5400" },
  { code: "5810", nameTh: "ค่าเสื่อมราคา", type: "EXPENSE", parentCode: "5400" },

  { code: "5900", nameTh: "ต้นทุนทางการเงินและภาษี", type: "EXPENSE", isPostable: false },
  { code: "5910", nameTh: "ดอกเบี้ยจ่าย", type: "EXPENSE", parentCode: "5900" },
  { code: "5920", nameTh: "ภาษีเงินได้นิติบุคคล", type: "EXPENSE", parentCode: "5900" },
];

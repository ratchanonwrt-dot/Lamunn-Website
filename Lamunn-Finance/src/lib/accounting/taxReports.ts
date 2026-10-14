import { prisma } from "@lamunn/db-finance";
import type { AccWhtFormType } from "@lamunn/db-finance";
import { toSatang } from "./money";
import { journalOutputVatRows, journalInputVatRows, journalWhtRows, type JournalWhtRow } from "./journalTaxLines";

/** ตัวสร้างรายงานภาษีทั้งชุด — ภาษีขาย, ภาษีซื้อ, ภ.พ.30, ภ.ง.ด.3, ภ.ง.ด.53
 *
 * หลักการเดียวกับงบการเงิน: นับเฉพาะเอกสารที่ไม่ถูกยกเลิก และรายการที่ผ่านรายการแล้ว
 * ตัวเลขทั้งหมดเป็นสตางค์ (จำนวนเต็ม) แล้วแปลงตอนแสดงผล */

// ───────────────────────────── รายงานภาษีขาย ─────────────────────────────

export interface OutputVatRow {
  /** DAILY = ใบกำกับอย่างย่อรวมทั้งวัน, FULL = ใบกำกับเต็มรูปรายใบ, JOURNAL = คีย์เองในสมุดรายวัน */
  kind: "DAILY" | "FULL" | "JOURNAL";
  date: Date;
  docNo: string;
  customerName: string;
  taxId: string | null;
  branchTag: string | null;
  base: number;
  vat: number;
  total: number;
}

export interface OutputVatReport {
  rows: OutputVatRow[];
  totalBase: number;
  totalVat: number;
  totalAll: number;
  fullCount: number;
  dailyCount: number;
  journalCount: number;
}

/** รายงานภาษีขาย — ใบกำกับเต็มรูปแสดงรายใบ ส่วนที่เหลือของแต่ละวันสรุปเป็นใบกำกับอย่างย่อ 1 บรรทัด
 *
 * ยอดขายรายวันถูกลงบัญชีเป็นก้อนเดียว (ดู dailySales.ts) และใบกำกับเต็มรูปที่ออกจากบิลวันนั้น
 * ก็รวมอยู่ในก้อนนั้นแล้ว — ที่นี่จึงต้อง "หักออก" เพื่อไม่ให้ยอดขายในรายงานภาษีถูกนับซ้ำ
 * บรรทัด DAILY = ยอดทั้งวัน ลบด้วยใบกำกับเต็มรูปของวันนั้น */
export async function buildOutputVatReport(start: Date, end: Date): Promise<OutputVatReport> {
  const [dailyEntries, invoices, journalRows] = await Promise.all([
    // ใบสำคัญขายประจำวันที่ผ่านรายการแล้ว พร้อมบรรทัดภาษีขายและบรรทัดรายได้
    prisma.accJournalEntry.findMany({
      where: { sourceType: "DAILY_SALES", status: "POSTED", date: { gte: start, lte: end } },
      select: {
        entryNo: true,
        date: true,
        lines: { select: { debit: true, credit: true, account: { select: { vatRole: true, type: true } } } },
      },
      orderBy: { date: "asc" },
    }),
    prisma.accTaxInvoice.findMany({
      where: { issueDate: { gte: start, lte: end }, voided: false },
      orderBy: { docNo: "asc" },
    }),
    // ใบสำคัญที่บัญชีคีย์เองแล้วแตะบัญชีภาษีขาย — ต้องอยู่ในรายงานด้วย ไม่งั้นยอดขาดไป
    journalOutputVatRows(start, end),
  ]);

  // ใบกำกับเต็มรูปที่ยอดอยู่ในยอดขายรวมของวันไหน — เอาไว้หักออกจากบรรทัดสรุปรายวัน
  const deductByDate = new Map<string, { base: number; vat: number }>();
  for (const inv of invoices) {
    if (!inv.deductFromBulk) continue;
    const key = inv.saleDate.toISOString().slice(0, 10);
    const cur = deductByDate.get(key) ?? { base: 0, vat: 0 };
    cur.base += toSatang(inv.baseAmount);
    cur.vat += toSatang(inv.vatAmount);
    deductByDate.set(key, cur);
  }

  const rows: OutputVatRow[] = [];

  for (const e of dailyEntries) {
    let vat = 0;
    let revenue = 0;
    for (const l of e.lines) {
      if (l.account.vatRole === "OUTPUT") vat += toSatang(l.credit) - toSatang(l.debit);
      else if (l.account.type === "REVENUE") revenue += toSatang(l.credit) - toSatang(l.debit);
    }
    const key = e.date.toISOString().slice(0, 10);
    const deduct = deductByDate.get(key) ?? { base: 0, vat: 0 };
    const base = revenue - deduct.base;
    const netVat = vat - deduct.vat;
    if (base === 0 && netVat === 0) continue;
    rows.push({
      kind: "DAILY",
      date: e.date,
      docNo: `ใบกำกับอย่างย่อรวมทั้งวัน (${e.entryNo})`,
      customerName: "ลูกค้าทั่วไป",
      taxId: null,
      branchTag: null,
      base,
      vat: netVat,
      total: base + netVat,
    });
  }

  for (const inv of invoices) {
    rows.push({
      kind: "FULL",
      date: inv.issueDate,
      docNo: inv.docNo,
      customerName: inv.customerName,
      taxId: inv.taxId,
      branchTag: inv.branchTag,
      base: toSatang(inv.baseAmount),
      vat: toSatang(inv.vatAmount),
      total: toSatang(inv.totalAmount),
    });
  }

  for (const j of journalRows) {
    rows.push({
      kind: "JOURNAL",
      date: j.date,
      docNo: j.docNo ?? j.entryNo,
      customerName: j.partnerName ?? j.description,
      taxId: j.partnerTaxId,
      branchTag: null,
      base: j.base,
      vat: j.vat,
      total: j.base + j.vat,
    });
  }

  rows.sort((a, b) => a.date.getTime() - b.date.getTime() || a.docNo.localeCompare(b.docNo));

  return {
    rows,
    totalBase: rows.reduce((s, r) => s + r.base, 0),
    totalVat: rows.reduce((s, r) => s + r.vat, 0),
    totalAll: rows.reduce((s, r) => s + r.total, 0),
    fullCount: rows.filter((r) => r.kind === "FULL").length,
    dailyCount: rows.filter((r) => r.kind === "DAILY").length,
    journalCount: rows.filter((r) => r.kind === "JOURNAL").length,
  };
}

// ───────────────────────────── รายงานภาษีซื้อ ─────────────────────────────

export interface InputVatRow {
  id: string;
  /** แยกต้นทางให้ชัด เพราะใบสำคัญที่คนคีย์เองต้องไม่เป็นแหล่งของรายงานภาษีซื้อ */
  kind: "DOC" | "AI_AUTOKEY";
  date: Date;
  /** เลขที่ใบกำกับตามใบของผู้ขาย — แถว AI จะไม่เข้ารายงานจนกว่าจะกรอกที่บรรทัด (ไม่ใช้เลขที่ใบสำคัญแทน) */
  invoiceNo: string;
  /** เลขที่รายการต้นทางของ AI — ใช้ย้อนกลับไปตรวจ ไม่ใช่เลขที่ใบกำกับ */
  entryNo: string | null;
  vendorName: string;
  taxId: string | null;
  branchTag: string | null;
  description: string;
  base: number;
  vat: number;
  total: number;
  isClaimable: boolean;
}

export interface InputVatReport {
  rows: InputVatRow[];
  totalBase: number;
  totalVat: number;
  /** ภาษีซื้อที่ขอเครดิตได้จริง — ไม่รวมภาษีซื้อต้องห้าม */
  claimableVat: number;
  nonClaimableVat: number;
  docCount: number;
  aiAutokeyCount: number;
}

export async function buildInputVatReport(start: Date, end: Date): Promise<InputVatReport> {
  const [invoices, journalRows] = await Promise.all([
    prisma.accPurchaseTaxInvoice.findMany({
      where: {
        voided: false,
        OR: [
          { claimPeriod: { gte: start, lte: end } },
          // ข้อมูลก่อนเพิ่มงวดเคลมยังคงอิงวันที่ใบกำกับ รายการเก่าจึงไม่หายจากรายงาน
          { claimPeriod: null, invoiceDate: { gte: start, lte: end } },
        ],
      },
      orderBy: [{ invoiceDate: "asc" }, { invoiceNo: "asc" }],
    }),
    // AI Autokey ที่คนตรวจและผ่านรายการแล้ว — ใบสำคัญคีย์เองไม่ใช่ทะเบียนภาษีซื้อ
    journalInputVatRows(start, end),
  ]);

  const rows: InputVatRow[] = invoices.map((i) => ({
    id: i.id,
    kind: "DOC" as const,
    date: i.invoiceDate,
    invoiceNo: i.invoiceNo,
    entryNo: null,
    vendorName: i.vendorName,
    taxId: i.vendorTaxId,
    branchTag: i.vendorBranchTag,
    description: i.description,
    base: toSatang(i.baseAmount),
    vat: toSatang(i.vatAmount),
    total: toSatang(i.totalAmount),
    isClaimable: i.isClaimable,
  }));

  for (const j of journalRows) {
    rows.push({
      id: j.lineId,
      kind: "AI_AUTOKEY",
      date: j.date,
      invoiceNo: j.docNo ?? "",
      entryNo: j.entryNo,
      vendorName: j.partnerName ?? j.description,
      taxId: j.partnerTaxId,
      branchTag: null,
      description: j.description,
      base: j.base,
      vat: j.vat,
      total: j.base + j.vat,
      isClaimable: true,
    });
  }

  rows.sort((a, b) => a.date.getTime() - b.date.getTime() || a.invoiceNo.localeCompare(b.invoiceNo));

  return {
    rows,
    totalBase: rows.reduce((s, r) => s + r.base, 0),
    totalVat: rows.reduce((s, r) => s + r.vat, 0),
    claimableVat: rows.filter((r) => r.isClaimable).reduce((s, r) => s + r.vat, 0),
    nonClaimableVat: rows.filter((r) => !r.isClaimable).reduce((s, r) => s + r.vat, 0),
    docCount: rows.filter((r) => r.kind === "DOC").length,
    aiAutokeyCount: rows.filter((r) => r.kind === "AI_AUTOKEY").length,
  };
}

// ───────────────────────────────── ภ.พ.30 ─────────────────────────────────

export interface Pp30 {
  outputBase: number;
  outputVat: number;
  inputBase: number;
  inputVat: number; // เฉพาะที่ขอเครดิตได้ (ตัวที่เอาไปหักใน ภ.พ.30)
  inputVatTotal: number; // ภาษีซื้อทั้งหมดตามเอกสาร รวมที่ขอเครดิตไม่ได้
  nonClaimableVat: number; // ภาษีซื้อต้องห้าม — อยู่ในรายงานภาษีซื้อ แต่ไม่หักในแบบ
  /** ภาษีขาย - ภาษีซื้อ : บวก = ต้องชำระ, ลบ = ขอคืน/ยกไปเดือนหน้า */
  netVat: number;
  /** ยอดในบัญชีแยกประเภท (บัญชีที่ตั้ง vatRole ไว้) ใช้กระทบยอดกับเอกสาร */
  glOutputVat: number;
  glInputVat: number;
  outputDiff: number; // เอกสาร - บัญชี : ต้องเป็น 0
  inputDiff: number;
  reconciled: boolean;
}

/** ภ.พ.30 พร้อมกระทบยอดกับบัญชีแยกประเภท
 *
 * ยอดในแบบต้องเท่ากับยอดในบัญชีภาษีขาย/ภาษีซื้อเสมอ ถ้าไม่เท่าแปลว่ามีเอกสารที่ยังไม่ได้ลงบัญชี
 * หรือมีรายการที่ลงบัญชีแต่ไม่มีเอกสารรองรับ — ต้องเคลียร์ให้ตรงก่อนยื่น */
export async function buildPp30(start: Date, end: Date): Promise<Pp30> {
  const [output, input, glVat] = await Promise.all([
    buildOutputVatReport(start, end),
    buildInputVatReport(start, end),
    prisma.accJournalLine.groupBy({
      by: ["accountId"],
      where: { status: "POSTED", date: { gte: start, lte: end }, account: { vatRole: { in: ["OUTPUT", "INPUT"] } } },
      _sum: { debit: true, credit: true },
    }),
  ]);

  const accounts = await prisma.accAccount.findMany({
    where: { id: { in: glVat.map((g) => g.accountId) } },
    select: { id: true, vatRole: true },
  });
  const roleById = new Map(accounts.map((a) => [a.id, a.vatRole]));

  let glOutputVat = 0;
  let glInputVat = 0;
  for (const g of glVat) {
    const role = roleById.get(g.accountId);
    const debit = toSatang(g._sum.debit);
    const credit = toSatang(g._sum.credit);
    if (role === "OUTPUT") glOutputVat += credit - debit; // หนี้สิน ยอดปกติด้านเครดิต
    else if (role === "INPUT") glInputVat += debit - credit; // สินทรัพย์ ยอดปกติด้านเดบิต
  }

  // กระทบยอดภาษีซื้อด้วย "ยอดที่ขอเครดิตได้" เพราะภาษีซื้อต้องห้ามตามปกติจะไม่ถูกลงในบัญชีภาษีซื้อ
  // (บันทึกรวมเป็นค่าใช้จ่ายไปเลย) ถ้ากิจการลงคนละแบบ ตัวเลขจะไม่ตรงและระบบจะเตือนให้เห็น
  const outputDiff = output.totalVat - glOutputVat;
  const inputDiff = input.claimableVat - glInputVat;

  return {
    outputBase: output.totalBase,
    outputVat: output.totalVat,
    inputBase: input.totalBase,
    inputVat: input.claimableVat,
    inputVatTotal: input.totalVat,
    nonClaimableVat: input.nonClaimableVat,
    netVat: output.totalVat - input.claimableVat,
    glOutputVat,
    glInputVat,
    outputDiff,
    inputDiff,
    reconciled: outputDiff === 0 && inputDiff === 0,
  };
}

// ──────────────────────────── ภ.ง.ด.3 / ภ.ง.ด.53 ────────────────────────────

export interface WhtRow {
  id: string;
  docNo: string;
  payDate: Date;
  payeeName: string;
  payeeTaxId: string | null;
  payeeBranchTag: string | null;
  incomeType: string;
  base: number;
  rate: number;
  wht: number;
}

export interface WhtReport {
  formType: AccWhtFormType;
  rows: WhtRow[];
  totalBase: number;
  totalWht: number;
  payeeCount: number;
  /** ยอดในบัญชี "ภาษีหัก ณ ที่จ่ายค้างนำส่ง" ในงวดเดียวกัน ใช้กระทบยอด */
  glWhtPayable: number;
  /** รายการหัก ณ ที่จ่ายที่คีย์ไว้ในสมุดรายวันแต่ยังไม่ได้ออกหนังสือรับรอง
   * ไม่รวมในยอดของแบบ เพราะระบบไม่รู้แน่ชัดว่าผู้รับเงินเป็นบุคคลธรรมดาหรือนิติบุคคล */
  journalRows: JournalWhtRow[];
  journalTotal: number;
}

/** สรุปการหักภาษี ณ ที่จ่ายของงวด แยกตามแบบที่ต้องยื่น
 * ภ.ง.ด.3 = จ่ายให้บุคคลธรรมดา, ภ.ง.ด.53 = จ่ายให้นิติบุคคล
 * ทั้งคู่ต้องยื่นภายในวันที่ 7 ของเดือนถัดไป (ยื่นออนไลน์ได้ขยายเวลาเพิ่ม) */
export async function buildWhtReport(start: Date, end: Date, formType: AccWhtFormType): Promise<WhtReport> {
  const [certs, glLines, journalRows] = await Promise.all([
    prisma.accWhtCertificate.findMany({
      where: { payDate: { gte: start, lte: end }, formType, voided: false },
      orderBy: [{ payDate: "asc" }, { docNo: "asc" }],
    }),
    prisma.accJournalLine.groupBy({
      by: ["accountId"],
      where: { status: "POSTED", date: { gte: start, lte: end }, account: { vatRole: "WHT", type: "LIABILITY" } },
      _sum: { debit: true, credit: true },
    }),
    journalWhtRows(start, end),
  ]);

  const rows: WhtRow[] = certs.map((c) => ({
    id: c.id,
    docNo: c.docNo,
    payDate: c.payDate,
    payeeName: c.payeeName,
    payeeTaxId: c.payeeTaxId,
    payeeBranchTag: c.payeeBranchTag,
    incomeType: c.incomeType,
    base: toSatang(c.baseAmount),
    rate: c.whtRate,
    wht: toSatang(c.whtAmount),
  }));

  let glWhtPayable = 0;
  for (const g of glLines) glWhtPayable += toSatang(g._sum.credit) - toSatang(g._sum.debit);

  return {
    formType,
    rows,
    totalBase: rows.reduce((s, r) => s + r.base, 0),
    totalWht: rows.reduce((s, r) => s + r.wht, 0),
    payeeCount: new Set(rows.map((r) => r.payeeTaxId ?? r.payeeName)).size,
    glWhtPayable,
    journalRows,
    journalTotal: journalRows.reduce((s, r) => s + r.vat, 0),
  };
}

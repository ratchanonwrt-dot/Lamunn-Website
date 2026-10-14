import { prisma } from "@lamunn/db-finance";
import type { Prisma } from "@lamunn/db-finance";
import { toSatang } from "./money";

/** ดึงรายการภาษีที่บัญชีคีย์เองในสมุดรายวัน (หน้าใบสำคัญ) เข้ามาแสดงในรายงานภาษีด้วย
 *
 * เดิมรายงานภาษีอ่านจากตารางเอกสารอย่างเดียว (ใบกำกับขาย/ใบกำกับซื้อ/หนังสือรับรอง)
 * แต่งานจริงบัญชีคีย์ใบสำคัญเองเยอะ เช่น ซื้อของมี VAT หรือจ่ายค่าบริการแล้วหัก ณ ที่จ่าย
 * รายการพวกนั้นเข้าบัญชีแยกประเภทแล้วแต่ไม่โผล่ในรายงานภาษี — เห็นแค่ตอนที่แบบเตือนว่ายอดไม่ตรง
 *
 * ไฟล์นี้แปลงใบสำคัญให้อยู่ในรูปแบบเดียวกับเอกสาร โดยอ่านจากบทบาททางภาษีของบัญชี (vatRole)
 * ที่ตั้งไว้ในผังบัญชี:
 *   - บรรทัดที่ลงบัญชี vatRole = OUTPUT -> ภาษีขาย (ฐาน = ยอดบัญชีหมวดรายได้ในใบเดียวกัน)
 *   - บรรทัดที่ลงบัญชี vatRole = INPUT  -> ภาษีซื้อ (ฐาน = ยอดเดบิตบัญชีอื่นที่ไม่ใช่บัญชีภาษี)
 *   - บรรทัดที่ลงบัญชี vatRole = WHT หมวดหนี้สิน -> ภาษีหัก ณ ที่จ่าย
 */

export interface JournalTaxRow {
  entryId: string;
  entryNo: string;
  /** บรรทัดภาษีที่แถวนี้มาจาก — ภาษีซื้อแยกแถวต่อบรรทัด (ใบสำคัญใบเดียวมีใบกำกับหลายใบได้) */
  lineId: string;
  /** เลขที่ใบกำกับที่กรอกไว้ที่บรรทัด — null ถ้ายังไม่ได้ใส่ (ห้ามเอาเลขที่ใบสำคัญมาแทน) */
  docNo: string | null;
  date: Date;
  description: string;
  /** ชื่อคู่ค้าจากบรรทัดในใบสำคัญ ถ้าระบุไว้ */
  partnerName: string | null;
  partnerTaxId: string | null;
  base: number;
  vat: number;
}

interface EntryWithLines {
  id: string;
  entryNo: string;
  date: Date;
  description: string;
  sourceType: string | null;
  lines: {
    id: string;
    docNo: string | null;
    debit: Prisma.Decimal;
    credit: Prisma.Decimal;
    account: { vatRole: string | null; type: string };
    partner: { name: string; taxId: string | null } | null;
  }[];
}

/** ดึงใบสำคัญที่ผ่านรายการแล้วในงวด ซึ่งมีบรรทัดแตะบัญชีภาษีตามบทบาทที่ระบุ */
async function fetchEntriesTouching(start: Date, end: Date, roles: ("OUTPUT" | "INPUT" | "WHT")[]): Promise<EntryWithLines[]> {
  return prisma.accJournalEntry.findMany({
    where: {
      status: "POSTED",
      date: { gte: start, lte: end },
      lines: { some: { account: { vatRole: { in: roles } } } },
    },
    orderBy: [{ date: "asc" }, { entryNo: "asc" }],
    select: {
      id: true,
      entryNo: true,
      date: true,
      description: true,
      sourceType: true,
      lines: {
        select: {
          id: true,
          docNo: true,
          debit: true,
          credit: true,
          account: { select: { vatRole: true, type: true } },
          partner: { select: { name: true, taxId: true } },
        },
      },
    },
  });
}

/** คู่ค้ารายแรกที่ระบุไว้ในใบสำคัญ — ใช้เป็นชื่อผู้ขาย/ผู้รับเงินในรายงาน */
function partnerOf(entry: EntryWithLines) {
  for (const l of entry.lines) if (l.partner) return l.partner;
  return null;
}

function normalizedDocumentNo(value: string) {
  return value.trim().toLocaleUpperCase("th-TH").replace(/\s+/g, "");
}

function normalizedTaxId(value: string | null | undefined) {
  return value?.replace(/\D/g, "") || null;
}

function normalizedVendorName(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase("th-TH").replace(/\s+/g, " ") || null;
}

/** ภาษีขายที่มาจากใบสำคัญที่คีย์เอง — ไม่รวมใบขายประจำวันและใบที่สร้างจากใบกำกับภาษี
 * (สองอย่างนั้นถูกนับผ่านตารางเอกสารอยู่แล้ว ถ้านับซ้ำยอดจะเบิ้ล) */
export async function journalOutputVatRows(start: Date, end: Date): Promise<JournalTaxRow[]> {
  const entries = await fetchEntriesTouching(start, end, ["OUTPUT"]);
  const rows: JournalTaxRow[] = [];

  for (const e of entries) {
    if (e.sourceType === "DAILY_SALES" || e.sourceType === "TAX_INVOICE") continue;

    let vat = 0;
    let base = 0;
    for (const l of e.lines) {
      const amount = toSatang(l.credit) - toSatang(l.debit);
      if (l.account.vatRole === "OUTPUT") vat += amount;
      else if (l.account.type === "REVENUE") base += amount;
    }
    if (vat === 0 && base === 0) continue;

    const p = partnerOf(e);
    const vatLine = e.lines.find((l) => l.account.vatRole === "OUTPUT");
    rows.push({
      entryId: e.id,
      entryNo: e.entryNo,
      lineId: vatLine?.id ?? e.id,
      docNo: vatLine?.docNo ?? null,
      date: e.date,
      description: e.description,
      partnerName: p?.name ?? null,
      partnerTaxId: p?.taxId ?? null,
      base,
      vat,
    });
  }
  return rows;
}

/** ภาษีซื้อที่มาจาก AI Autokey — ไม่รวมใบที่คนบันทึกในทะเบียนภาษีซื้อไว้แล้ว
 *
 * ออกมา "หนึ่งแถวต่อหนึ่งบรรทัดภาษีซื้อ" ไม่ใช่ต่อใบสำคัญ — ใบสำคัญจ่ายเงินใบเดียวมักรวมใบกำกับ
 * หลายใบ (ค่าเช่า + ค่าบริการ + ค่าที่ดิน) ซึ่งรายงานภาษีซื้อต้องแสดงเลขที่ใบกำกับแยกกันทุกใบ
 * เลขที่ใบกำกับอ่านจาก docNo ของบรรทัดนั้น และยังไม่ส่งเข้ารายงานจนกว่าจะกรอกเลขนี้
 * เพื่อให้ตรวจรายการซ้ำกับทะเบียนภาษีซื้อได้แน่นอน (ไม่เอาเลขที่ใบสำคัญมาแทน)
 *
 * ฐานภาษี = ยอดเดบิตของบัญชีอื่นในใบเดียวกันที่ไม่ใช่บัญชีภาษี (ค่าใช้จ่าย/สินทรัพย์ที่ซื้อมา)
 * ถ้ามีบรรทัดภาษีซื้อหลายบรรทัด ฐานจะถูกแบ่งตามสัดส่วนยอดภาษีของแต่ละบรรทัด (เศษปัดให้บรรทัดสุดท้าย
 * ผลรวมจึงเท่าฐานทั้งใบเป๊ะ) — ถูกต้องเมื่อทุกใบใช้อัตราเดียวกัน ซึ่งเป็นกรณีปกติ 7% */
export async function journalInputVatRows(start: Date, end: Date): Promise<JournalTaxRow[]> {
  const [entries, linkedInvoices] = await Promise.all([
    fetchEntriesTouching(start, end, ["INPUT"]),
    prisma.accPurchaseTaxInvoice.findMany({
      where: { voided: false },
      select: { entryId: true, invoiceNo: true, invoiceDate: true, vendorTaxId: true, vendorName: true, baseAmount: true, vatAmount: true },
    }),
  ]);
  const linked = new Set(linkedInvoices.map((i) => i.entryId));
  const invoicesByNo = new Map<string, typeof linkedInvoices>();
  for (const invoice of linkedInvoices) {
    const key = normalizedDocumentNo(invoice.invoiceNo);
    invoicesByNo.set(key, [...(invoicesByNo.get(key) ?? []), invoice]);
  }
  const rows: JournalTaxRow[] = [];

  for (const e of entries) {
    // ใบสำคัญที่คนคีย์เองเป็นเพียงรายการบัญชี ไม่ใช่ทะเบียนภาษีซื้อ
    // จึงรับเข้ารายงานอัตโนมัติเฉพาะเอกสารที่ผ่านขั้นตรวจของ AI Autokey เท่านั้น
    if (e.sourceType !== "AI_AUTOKEY" || linked.has(e.id)) continue;

    const vatLines = e.lines
      .map((l) => ({ line: l, vat: toSatang(l.debit) - toSatang(l.credit) }))
      .filter((x) => x.line.account.vatRole === "INPUT" && x.vat !== 0 && Boolean(x.line.docNo?.trim()));
    if (vatLines.length === 0) continue;

    let base = 0;
    for (const l of e.lines) {
      const debitSide = toSatang(l.debit) - toSatang(l.credit);
      if (l.account.vatRole === null && debitSide > 0 && (l.account.type === "EXPENSE" || l.account.type === "ASSET")) {
        base += debitSide;
      }
    }
    const totalVat = vatLines.reduce((s, x) => s + x.vat, 0);

    const fallback = partnerOf(e);
    let allocated = 0;
    vatLines.forEach(({ line, vat }, idx) => {
      const lineBase =
        idx === vatLines.length - 1 ? base - allocated : totalVat === 0 ? 0 : Math.round((base * vat) / totalVat);
      allocated += lineBase;
      const p = line.partner ?? fallback;
      const sameNumber = invoicesByNo.get(normalizedDocumentNo(line.docNo!)) ?? [];
      const partnerTaxId = normalizedTaxId(p?.taxId);
      const partnerName = normalizedVendorName(p?.name);
      const isAlreadyRecorded = sameNumber.some((invoice) => {
        const invoiceTaxId = normalizedTaxId(invoice.vendorTaxId);
        if (partnerTaxId && invoiceTaxId) return partnerTaxId === invoiceTaxId;
        const invoiceName = normalizedVendorName(invoice.vendorName);
        if (partnerName && invoiceName && partnerName === invoiceName) return true;
        if (invoice.invoiceDate.getTime() === e.date.getTime() && toSatang(invoice.vatAmount) === vat && toSatang(invoice.baseAmount) === lineBase) return true;
        // ถ้าใบสำคัญไม่มีข้อมูลคู่ค้า เลขที่ตรงกันต้องถือว่าคนบันทึกทะเบียนไว้แล้ว
        return !p;
      });
      if (isAlreadyRecorded) return;
      rows.push({
        entryId: e.id,
        entryNo: e.entryNo,
        lineId: line.id,
        docNo: line.docNo?.trim() || null,
        date: e.date,
        description: e.description,
        partnerName: p?.name ?? null,
        partnerTaxId: p?.taxId ?? null,
        base: lineBase,
        vat,
      });
    });
  }
  return rows;
}

export interface JournalWhtRow extends JournalTaxRow {
  /** แบบที่ "น่าจะ" ต้องยื่น เดาจากเลขประจำตัวผู้เสียภาษี — ไม่ใช่ข้อสรุป ดู suggestFormType */
  suggestedForm: "PND3" | "PND53" | null;
}

/** เดาแบบที่ต้องยื่นจากเลขประจำตัวผู้เสียภาษี 13 หลัก
 *
 * เลขทะเบียนนิติบุคคลขึ้นต้นด้วย 0 ส่วนเลขบัตรประชาชนบุคคลธรรมดาขึ้นต้นด้วย 1-8
 * เป็นแค่การเดาเพื่อช่วยกรอก ไม่ใช้ตัดสินยอดในแบบ — ผู้ทำบัญชีต้องยืนยันเองเสมอ */
export function suggestFormType(taxId: string | null): "PND3" | "PND53" | null {
  const digits = (taxId ?? "").replace(/\D/g, "");
  if (digits.length !== 13) return null;
  return digits.startsWith("0") ? "PND53" : "PND3";
}

/** ภาษีหัก ณ ที่จ่ายที่มาจากใบสำคัญที่คีย์เอง และยังไม่ได้ออกหนังสือรับรอง
 *
 * ไม่ถูกนำไปรวมเป็นยอดในแบบ ภ.ง.ด. โดยอัตโนมัติ เพราะจากใบสำคัญอย่างเดียวระบบไม่รู้แน่ชัดว่า
 * ผู้รับเงินเป็นบุคคลธรรมดา (ภ.ง.ด.3) หรือนิติบุคคล (ภ.ง.ด.53) — ถ้าเดาผิดคือยื่นผิดแบบ
 * จึงแสดงแยกไว้ให้เห็นครบ พร้อมแบบที่คาดว่าใช่ เพื่อให้ไปออกหนังสือรับรองให้ถูกต้อง */
export async function journalWhtRows(start: Date, end: Date): Promise<JournalWhtRow[]> {
  const [entries, linkedCerts] = await Promise.all([
    fetchEntriesTouching(start, end, ["WHT"]),
    prisma.accWhtCertificate.findMany({ where: { entryId: { not: null }, voided: false }, select: { entryId: true } }),
  ]);
  const linked = new Set(linkedCerts.map((c) => c.entryId));
  const rows: JournalWhtRow[] = [];

  for (const e of entries) {
    if (linked.has(e.id)) continue;

    let wht = 0;
    let base = 0;
    for (const l of e.lines) {
      const creditSide = toSatang(l.credit) - toSatang(l.debit);
      const debitSide = -creditSide;
      // เฉพาะบัญชีภาษีหัก ณ ที่จ่ายฝั่งหนี้สิน (ค้างนำส่ง) — ไม่ใช่บัญชีภาษีถูกหักที่เป็นสินทรัพย์
      if (l.account.vatRole === "WHT" && l.account.type === "LIABILITY") wht += creditSide;
      else if (l.account.vatRole === null && l.account.type === "EXPENSE" && debitSide > 0) base += debitSide;
    }
    if (wht <= 0) continue;

    const p = partnerOf(e);
    const whtLine = e.lines.find((l) => l.account.vatRole === "WHT");
    rows.push({
      entryId: e.id,
      entryNo: e.entryNo,
      lineId: whtLine?.id ?? e.id,
      docNo: whtLine?.docNo ?? null,
      date: e.date,
      description: e.description,
      partnerName: p?.name ?? null,
      partnerTaxId: p?.taxId ?? null,
      base,
      vat: wht,
      suggestedForm: suggestFormType(p?.taxId ?? null),
    });
  }
  return rows;
}

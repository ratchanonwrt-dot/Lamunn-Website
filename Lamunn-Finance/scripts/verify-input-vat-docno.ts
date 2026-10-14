/** พิสูจน์ว่ารายงานภาษีซื้อแยกแถวตามใบกำกับ (docNo ที่บรรทัด) ไม่ใช่ตามใบสำคัญ และ Excel ออกตรงแบบฟอร์ม
 *
 * ข้อมูลปี ค.ศ. 2090 เท่านั้น ลบเฉพาะของตัวเองใน finally
 * รัน: npx tsx scripts/verify-input-vat-docno.ts   (จากโฟลเดอร์ Lamunn-Finance)
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const P = "ZZDOCNO";
const YEAR = 2090;
let fails = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${ok ? "ผ่าน  " : "ไม่ผ่าน ❌"}  ${label}${ok ? "" : `  (ได้ ${JSON.stringify(actual)} ควรเป็น ${JSON.stringify(expected)})`}`);
  if (!ok) fails++;
}

async function main() {
  const [{ prisma }, { createEntry }, { buildInputVatReport }, { buildInputVatWorkbook }, { SYSTEM_ACCOUNTS }, { monthRange }] = await Promise.all([
    import("@lamunn/db-finance"),
    import("../src/lib/accounting/post"),
    import("../src/lib/accounting/taxReports"),
    import("../src/lib/accounting/inputVatExcel"),
    import("../src/lib/accounting/chartOfAccounts"),
    import("../src/lib/dates"),
  ]);
  const entryIds: string[] = [];
  const partnerIds: string[] = [];
  const accountIds: string[] = [];
  const invoiceIds: string[] = [];
  const existingPeriod = await prisma.accPeriod.findFirst({ where: { year: YEAR }, select: { id: true } });
  let createdPeriodId: string | null = null;
  try {
    const inputVat = await prisma.accAccount.findUnique({ where: { code: SYSTEM_ACCOUNTS.INPUT_VAT } });
    if (!inputVat) throw new Error("ไม่พบบัญชีภาษีซื้อในผัง");
    const rent = await prisma.accAccount.create({ data: { code: `${P}-5301`, nameTh: "[test] ค่าเช่า", type: "EXPENSE" } });
    const bank = await prisma.accAccount.create({ data: { code: `${P}-1120`, nameTh: "[test] ธนาคาร", type: "ASSET" } });
    accountIds.push(rent.id, bank.id);
    const cpn = await prisma.accPartner.create({ data: { name: "[test] เซ็นทรัลพัฒนา", type: "CREDITOR", taxId: "0107537002443" } });
    partnerIds.push(cpn.id);

    // ใบสำคัญจ่ายเงินใบเดียว รวมใบกำกับ 3 ใบ: ฐาน 659.28+307.98+4224.95 = 5192.21, VAT 46.15+21.56+295.75 = 363.46
    const multi = await createEntry({
      date: new Date(Date.UTC(YEAR, 8, 8)),
      journalType: "PAYMENT",
      description: "[test] จ่ายค่าเช่า CPN 3 ใบ",
      status: "POSTED",
      sourceType: "AI_AUTOKEY",
      sourceKey: `${P}-AI-MULTI`,
      lines: [
        { accountId: rent.id, debit: 5192.21, partnerId: cpn.id },
        { accountId: inputVat.id, debit: 46.15, partnerId: cpn.id, docNo: "202-10900640" },
        { accountId: inputVat.id, debit: 21.56, partnerId: cpn.id, docNo: "2026-10900638" },
        { accountId: inputVat.id, debit: 295.75, partnerId: cpn.id, docNo: "2026-10900639" },
        { accountId: bank.id, credit: 5555.67 },
      ],
    });
    entryIds.push(multi.id);

    // ใบสำคัญที่ลืมใส่เลขที่ใบกำกับ — ต้องออกมาเป็นช่องว่าง ไม่ใช่เลขที่ใบสำคัญ
    const noDoc = await createEntry({
      date: new Date(Date.UTC(YEAR, 8, 9)),
      journalType: "PAYMENT",
      description: "[test] ซื้อของไม่ได้ใส่เลข",
      status: "POSTED",
      sourceType: "AI_AUTOKEY",
      sourceKey: `${P}-AI-NODOC`,
      lines: [
        { accountId: rent.id, debit: 1000, partnerId: cpn.id },
        { accountId: inputVat.id, debit: 70 },
        { accountId: bank.id, credit: 1070 },
      ],
    });
    entryIds.push(noDoc.id);

    const manual = await createEntry({
      date: new Date(Date.UTC(YEAR, 8, 10)),
      journalType: "PAYMENT",
      description: "[test] คนคีย์ใบสำคัญเอง",
      status: "POSTED",
      lines: [
        { accountId: rent.id, debit: 1000, partnerId: cpn.id },
        { accountId: inputVat.id, debit: 70, partnerId: cpn.id, docNo: `${P}-MANUAL-001` },
        { accountId: bank.id, credit: 1070 },
      ],
    });
    entryIds.push(manual.id);
    if (!existingPeriod) createdPeriodId = (await prisma.accPeriod.findFirst({ where: { year: YEAR }, select: { id: true } }))?.id ?? null;

    const { start, end } = monthRange(YEAR, 8);
    const report = await buildInputVatReport(start, end);
    const rows = report.rows.filter((r) => r.kind === "AI_AUTOKEY");

    console.log("\n=== ใบสำคัญ 1 ใบ มีภาษีซื้อ 3 บรรทัด ===");
    const multiRows = rows.filter((r) => r.entryNo === multi.entryNo);
    check("แยกเป็น 3 แถว", multiRows.length, 3);
    check("เลขที่ใบกำกับของแต่ละแถว", multiRows.map((r) => r.invoiceNo).sort(), ["202-10900640", "2026-10900638", "2026-10900639"]);
    check("ไม่มีแถวไหนใช้เลขที่ใบสำคัญเป็นเลขที่ใบกำกับ", multiRows.some((r) => r.invoiceNo === multi.entryNo), false);
    check("VAT แต่ละแถวตามบรรทัด", multiRows.map((r) => r.vat).sort((a, b) => a - b), [2156, 4615, 29575]);
    check("ฐานรวม 3 แถว = ฐานทั้งใบเป๊ะ (สตางค์)", multiRows.reduce((s, r) => s + r.base, 0), 519221);
    const r640 = multiRows.find((r) => r.invoiceNo === "202-10900640")!;
    check("ฐานแบ่งตามสัดส่วน VAT (46.15/363.46 ของ 5192.21 ≈ 659.28)", Math.abs(r640.base - 65928) <= 2, true);
    check("ชื่อผู้ขาย/เลขผู้เสียภาษีจากคู่ค้าที่บรรทัด", [r640.vendorName, r640.taxId], ["[test] เซ็นทรัลพัฒนา", "0107537002443"]);
    check("แถวแต่ละแถวมี id ไม่ซ้ำกัน (ไม่ชนกันตอน render)", new Set(multiRows.map((r) => r.id)).size, 3);

    console.log("\n=== เงื่อนไขแหล่งข้อมูลรายงาน ===");
    check("รายงานระบุแหล่ง AI แยกจากใบสำคัญที่คนคีย์เอง", rows.every((r) => r.kind === "AI_AUTOKEY"), true);
    check("AI Autokey ที่ไม่มีเลขใบกำกับยังไม่เข้ารายงาน", rows.some((r) => r.entryNo === noDoc.entryNo), false);
    check("ใบสำคัญที่คนคีย์เองไม่เข้ารายงาน แม้มีบัญชีภาษีซื้อและเลขใบกำกับ", rows.some((r) => r.entryNo === manual.entryNo), false);

    const recordedInvoice = await prisma.accPurchaseTaxInvoice.create({
      data: {
        invoiceNo: "202-10900640",
        invoiceDate: new Date(Date.UTC(YEAR, 8, 8)),
        partnerId: cpn.id,
        vendorName: cpn.name,
        vendorTaxId: cpn.taxId,
        description: "[test] คนบันทึกทะเบียนภาษีซื้อเอง",
        baseAmount: 659.28,
        vatAmount: 46.15,
        totalAmount: 705.43,
      },
    });
    invoiceIds.push(recordedInvoice.id);
    const dedupReport = await buildInputVatReport(start, end);
    const sameInvoiceRows = dedupReport.rows.filter((r) => r.invoiceNo === "202-10900640");
    check("เลขใบกำกับเดียวกันของผู้ขายเดียวกันแสดงเพียงครั้งเดียว", sameInvoiceRows.length, 1);
    check("รายการที่คนบันทึกเองเป็นตัวหลักแทนแถวจาก AI", sameInvoiceRows[0]?.kind, "DOC");
    check("เลขใบกำกับอื่นจาก AI ยังอยู่ครบ", ["2026-10900638", "2026-10900639"].every((docNo) => dedupReport.rows.some((r) => r.invoiceNo === docNo)), true);

    console.log("\n=== Excel ===");
    const wb = buildInputVatWorkbook(dedupReport, { companyName: "[test] บริษัท", companyTaxId: "0105568147638", companyAddress: "ที่อยู่ทดสอบ", year: YEAR, month: 9 });
    const ws = wb.getWorksheet("PurchaseTaxReport")!;
    check("หัวรายงานบรรทัด 1", ws.getCell("A1").value, "รายงานภาษีซื้อตามเอกสาร");
    check("งวดภาษี", ws.getCell("A2").value, `สำหรับงวดภาษี เดือน กันยายน ปี ${YEAR}`);
    check("หัวตารางบรรทัด 6 ครบ 8 คอลัมน์", [1, 2, 3, 4, 5, 6, 7, 8].map((c) => ws.getRow(6).getCell(c).value), ["ลำดับที่", "วัน/เดือน/ปี", "เลขที่ใบกำกับ", "ชื่อผู้จำหน่าย", "เลขผู้เสียภาษี", "สำนักงานใหญ่/สาขา", "มูลค่า", "ภาษีมูลค่าเพิ่ม"]);
    const n = dedupReport.rows.length;
    check("จำนวนแถวข้อมูล = จำนวนแถวในรายงาน", ws.getRow(7 + n - 1).getCell(1).value, n);
    const totalRow = ws.getRow(7 + n);
    check("แถวรวมใช้สูตร SUM", (totalRow.getCell(7).value as { formula?: string }).formula, `SUM(G7:G${6 + n})`);
    check("ป้ายแถวรวม", totalRow.getCell(6).value, "ยอดรวมทั้งหมด");
    check("ยอดเป็นตัวเลขบาท ไม่ใช่ข้อความ", typeof ws.getRow(7).getCell(8).value, "number");
    const excelDocNos = Array.from({ length: n }, (_, i) => String(ws.getRow(7 + i).getCell(3).value ?? ""));
    check("Excel มีเลขที่ใบกำกับทั้ง 3 ใบของใบสำคัญเดียวกัน", ["202-10900640", "2026-10900638", "2026-10900639"].every((d) => excelDocNos.includes(d)), true);
    check("Excel ไม่มีเลขที่ใบสำคัญในคอลัมน์เลขที่ใบกำกับ", excelDocNos.some((d) => d === multi.entryNo || d === noDoc.entryNo), false);
  } finally {
    for (const id of invoiceIds) await prisma.accPurchaseTaxInvoice.delete({ where: { id } }).catch(() => undefined);
    for (const id of entryIds) await prisma.accJournalEntry.delete({ where: { id } }).catch(() => undefined);
    for (const id of partnerIds) await prisma.accPartner.delete({ where: { id } }).catch(() => undefined);
    for (const id of accountIds) await prisma.accAccount.delete({ where: { id } }).catch(() => undefined);
    if (createdPeriodId) await prisma.accPeriod.delete({ where: { id: createdPeriodId } }).catch(() => undefined);
    console.log(`\n  ข้อมูลทดสอบที่เหลือ: ${await prisma.accJournalEntry.count({ where: { description: { startsWith: "[test]" }, date: { gte: new Date(Date.UTC(YEAR, 0, 1)), lte: new Date(Date.UTC(YEAR, 11, 31)) } } })}`);
  }
  console.log(fails === 0 ? "\n✅ ผ่านทั้งหมด\n" : `\n❌ ไม่ผ่าน ${fails} ข้อ\n`);
  process.exit(fails === 0 ? 0 : 1);
}
main();

/** พิสูจน์ว่ารายงานภาษีขายไม่นับยอดซ้ำ และ ภ.พ.30 กระทบยอดกับบัญชีได้ถูกต้อง
 *
 * สร้างสถานการณ์จำลองในปี พ.ศ. 2640 (ค.ศ. 2097) ซึ่งไม่มีทางชนข้อมูลจริง แล้วลบทิ้งทั้งหมดใน finally
 * รัน: npx tsx scripts/verify-tax-reports.ts   (จากโฟลเดอร์ Lamunn-Finance)
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const P = "TAXTEST";
const YEAR = 2097;
const start = new Date(Date.UTC(YEAR, 0, 1));
const end = new Date(Date.UTC(YEAR, 0, 31));
const day = new Date(Date.UTC(YEAR, 0, 10));

let fails = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${ok ? "ผ่าน  " : "ไม่ผ่าน ❌"}  ${label}${ok ? "" : `  (ได้ ${JSON.stringify(actual)} ควรเป็น ${JSON.stringify(expected)})`}`);
  if (!ok) fails++;
}
const baht = (satang: number) => satang / 100;

async function main() {
  // โหลดโมดูลฐานข้อมูลหลัง .env เท่านั้น เพราะ ESM จะยก static import ขึ้นก่อนคำสั่ง loadEnvConfig
  const [{ prisma }, { createEntry }, { buildOutputVatReport, buildInputVatReport, buildPp30, buildWhtReport }] = await Promise.all([
    import("@lamunn/db-finance"),
    import("../src/lib/accounting/post"),
    import("../src/lib/accounting/taxReports"),
  ]);
  const created: string[] = [];
  try {
    const accounts = await Promise.all([
      prisma.accAccount.create({ data: { code: `${P}-1110`, nameTh: "[test] เงินสด", type: "ASSET", parentCode: "1100" } }),
      prisma.accAccount.create({ data: { code: `${P}-2103`, nameTh: "[test] ภาษีขาย", type: "LIABILITY", parentCode: "2100", vatRole: "OUTPUT" } }),
      prisma.accAccount.create({ data: { code: `${P}-1155`, nameTh: "[test] ภาษีซื้อ", type: "ASSET", parentCode: "1100", vatRole: "INPUT" } }),
      prisma.accAccount.create({ data: { code: `${P}-4110`, nameTh: "[test] รายได้ขาย", type: "REVENUE", parentCode: "4000" } }),
      prisma.accAccount.create({ data: { code: `${P}-5410`, nameTh: "[test] ค่าเช่า", type: "EXPENSE", parentCode: "5400" } }),
      prisma.accAccount.create({ data: { code: `${P}-2130`, nameTh: "[test] ภาษีหัก ณ ที่จ่ายค้างนำส่ง", type: "LIABILITY", parentCode: "2100", vatRole: "WHT" } }),
    ]);
    const [cash, outVat, inVat, revenue, rent, whtPayable] = accounts;

    console.log("\n=== สถานการณ์: ขายทั้งวัน 10,700 (รวม VAT) แล้วมีลูกค้าขอใบกำกับเต็มรูป 1,070 ===");

    // ใบสำคัญขายประจำวัน — ลงรายได้ทั้งก้อนครั้งเดียว
    const dailyEntry = await createEntry({
      date: day,
      journalType: "SALES",
      description: "[test] ขายประจำวัน",
      sourceType: "DAILY_SALES",
      sourceKey: `${P}-${day.toISOString().slice(0, 10)}`,
      status: "POSTED",
      lines: [
        { accountId: cash.id, debit: 10700 },
        { accountId: revenue.id, credit: 10000 },
        { accountId: outVat.id, credit: 700 },
      ],
    });
    created.push(dailyEntry.id);

    // ใบกำกับเต็มรูปที่ออกจากบิลของวันเดียวกัน — ยอดนี้อยู่ในก้อนด้านบนแล้ว
    const fullInvoice = await prisma.accTaxInvoice.create({
      data: {
        docNo: `${P}-INV-0001`,
        issueDate: day,
        saleDate: day,
        customerName: "[test] บริษัทลูกค้า จำกัด",
        taxId: "0105500000001",
        branchTag: "สำนักงานใหญ่",
        baseAmount: 1000,
        vatAmount: 70,
        totalAmount: 1070,
        deductFromBulk: true,
      },
    });

    const out = await buildOutputVatReport(start, end);
    // งวดปี 2097 ไม่มีข้อมูลอื่นอยู่แล้ว ใช้ทุกแถวได้เลย — กรองด้วยชื่อเอกสารไม่ได้
    // เพราะแถว "อย่างย่อรวมทั้งวัน" ใช้เลขที่ใบสำคัญที่ระบบรันให้เอง ไม่มีคำนำหน้าของเทสต์
    const rows = out.rows;
    const daily = rows.find((r) => r.kind === "DAILY");
    const full = rows.find((r) => r.kind === "FULL");

    check("มี 2 บรรทัด: อย่างย่อรวมวัน + เต็มรูป 1 ใบ", rows.length, 2);
    check("บรรทัดอย่างย่อ = ยอดทั้งวันหักใบเต็มรูปแล้ว (9,000)", baht(daily?.base ?? 0), 9000);
    check("ภาษีขายของบรรทัดอย่างย่อ = 630", baht(daily?.vat ?? 0), 630);
    check("บรรทัดใบเต็มรูป = 1,000", baht(full?.base ?? 0), 1000);
    check("ภาษีขายของใบเต็มรูป = 70", baht(full?.vat ?? 0), 70);
    check("ยอดขายรวมในรายงาน = 10,000 (ไม่ใช่ 11,000 = ไม่นับซ้ำ)", baht(out.totalBase), 10000);
    check("ภาษีขายรวมในรายงาน = 700 (ไม่ใช่ 770)", baht(out.totalVat), 700);

    console.log("\n=== ภาษีซื้อ + ภ.พ.30 ===");
    const purchaseEntry = await createEntry({
      date: day,
      journalType: "PURCHASE",
      description: "[test] ซื้อของ",
      status: "POSTED",
      lines: [
        { accountId: rent.id, debit: 2000 },
        { accountId: inVat.id, debit: 140 },
        { accountId: cash.id, credit: 2140 },
      ],
    });
    created.push(purchaseEntry.id);

    // ฟอร์มจริงสร้างใบสำคัญแล้วผูก entryId ไว้ — เทสต์ต้องทำแบบเดียวกัน ไม่งั้นจะนับซ้ำ
    const pInv = await prisma.accPurchaseTaxInvoice.create({
      data: {
        invoiceNo: `${P}-PUR-0001`,
        invoiceDate: day,
        vendorName: "[test] ซัพพลายเออร์",
        vendorTaxId: "0105500000002",
        baseAmount: 2000,
        vatAmount: 140,
        totalAmount: 2140,
        entryId: purchaseEntry.id,
      },
    });

    const inp = await buildInputVatReport(start, end);
    check("ภาษีซื้อในรายงาน = 140", baht(inp.totalVat), 140);

    const pp30 = await buildPp30(start, end);
    check("ภ.พ.30 ภาษีขาย = 700", baht(pp30.outputVat), 700);
    check("ภ.พ.30 ภาษีซื้อ = 140", baht(pp30.inputVat), 140);
    check("ภ.พ.30 ภาษีที่ต้องชำระ = 560", baht(pp30.netVat), 560);
    check("ภ.พ.30 กระทบยอดกับบัญชีแยกประเภทตรงกัน", pp30.reconciled, true);

    console.log("\n=== ภ.ง.ด.3 / ภ.ง.ด.53 ===");
    const whtEntry = await createEntry({
      date: day,
      journalType: "PAYMENT",
      description: "[test] จ่ายค่าเช่า หัก ณ ที่จ่าย 5%",
      status: "POSTED",
      lines: [
        { accountId: rent.id, debit: 50000 },
        { accountId: cash.id, credit: 47500 },
        { accountId: whtPayable.id, credit: 2500 },
      ],
    });
    created.push(whtEntry.id);

    const wht = await prisma.accWhtCertificate.create({
      data: {
        docNo: `${P}-WHT-0001`,
        payDate: day,
        formType: "PND53",
        payeeName: "[test] บริษัทผู้ให้เช่า",
        payeeTaxId: "0105500000003",
        incomeType: "ค่าเช่าอสังหาริมทรัพย์ ม.40(5)",
        baseAmount: 50000,
        whtRate: 0.05,
        whtAmount: 2500,
        entryId: whtEntry.id,
      },
    });

    const pnd53 = await buildWhtReport(start, end, "PND53");
    const pnd3 = await buildWhtReport(start, end, "PND3");
    check("ภ.ง.ด.53 มี 1 รายการ", pnd53.rows.length, 1);
    check("ภ.ง.ด.53 ภาษีที่หักรวม = 2,500", baht(pnd53.totalWht), 2500);
    check("ภ.ง.ด.53 ตรงกับบัญชีภาษีหัก ณ ที่จ่ายค้างนำส่ง", baht(pnd53.glWhtPayable), 2500);
    check("ภ.ง.ด.3 ไม่มีรายการ (จ่ายให้นิติบุคคล ไม่เข้าแบบนี้)", pnd3.rows.length, 0);

    console.log("\n=== แยกใบสำคัญที่คนคีย์เองออกจากรายงานภาษีซื้อ ===");

    // แม้คนคีย์เลขใบกำกับไว้ในบรรทัด บัญชีก็ยังไม่ใช่ทะเบียนภาษีซื้อ
    const journalPurchase = await createEntry({
      date: day,
      journalType: "PURCHASE",
      description: "[test] ซื้อของคีย์เอง ไม่มีใบกำกับในระบบ",
      status: "POSTED",
      lines: [
        { accountId: rent.id, debit: 1000 },
        { accountId: inVat.id, debit: 70, docNo: `${P}-MANUAL-PURCHASE` },
        { accountId: cash.id, credit: 1070 },
      ],
    });
    created.push(journalPurchase.id);

    // ขายที่คีย์เอง (ไม่ใช่ยอดขายรายวัน ไม่ใช่ใบกำกับ) — ต้องโผล่ในรายงานภาษีขาย
    const journalSale = await createEntry({
      date: day,
      journalType: "SALES",
      description: "[test] ขายคีย์เอง",
      status: "POSTED",
      lines: [
        { accountId: cash.id, debit: 2140 },
        { accountId: revenue.id, credit: 2000 },
        { accountId: outVat.id, credit: 140 },
      ],
    });
    created.push(journalSale.id);

    const inp2 = await buildInputVatReport(start, end);
    const aiInputRows = inp2.rows.filter((r) => r.kind === "AI_AUTOKEY");
    check("ภาษีซื้อ: ใบสำคัญที่คนคีย์เองไม่เข้ารายงาน แม้มีเลขใบกำกับ", aiInputRows.length, 0);
    check("ภาษีซื้อรวมยังมาจากทะเบียนใบกำกับเท่านั้น", baht(inp2.totalVat), 140);

    const out2 = await buildOutputVatReport(start, end);
    const jOut = out2.rows.filter((r) => r.kind === "JOURNAL");
    check("ภาษีขาย: มีแถวจากสมุดรายวัน 1 แถว", jOut.length, 1);
    check("ภาษีขาย: ฐานภาษีจากสมุดรายวัน = 2,000", baht(jOut[0]?.base ?? 0), 2000);
    check("ภาษีขายรวม = 840 (700 เดิม + 140 จากสมุดรายวัน)", baht(out2.totalVat), 840);

    const pp30b = await buildPp30(start, end);
    check("ภ.พ.30 เตือนยอดไม่ตรงเมื่อคนลงบัญชีภาษีซื้อแต่ยังไม่บันทึกทะเบียน", pp30b.reconciled, false);
    check("ผลต่างภาษีซื้อเท่ากับรายการคนคีย์เอง 70 บาท", baht(pp30b.inputDiff), -70);

    // หัก ณ ที่จ่ายที่คีย์เองโดยไม่ออกหนังสือรับรอง — ต้องขึ้นในส่วนแยก ไม่รวมในยอดของแบบ
    const journalWht = await createEntry({
      date: day,
      journalType: "PAYMENT",
      description: "[test] จ่ายค่าบริการ หัก 3% ไม่ได้ออกหนังสือรับรอง",
      status: "POSTED",
      lines: [
        { accountId: rent.id, debit: 10000 },
        { accountId: cash.id, credit: 9700 },
        { accountId: whtPayable.id, credit: 300 },
      ],
    });
    created.push(journalWht.id);

    const pnd53b = await buildWhtReport(start, end, "PND53");
    check("ภ.ง.ด.53: มีรายการจากสมุดรายวันที่ยังไม่ออกหนังสือรับรอง 1 รายการ", pnd53b.journalRows.length, 1);
    check("ภ.ง.ด.53: ยอดจากสมุดรายวัน = 300", baht(pnd53b.journalTotal), 300);
    check("ภ.ง.ด.53: ยอดในแบบยังเป็น 2,500 (ไม่รวมรายการที่ยังไม่มีหนังสือรับรอง)", baht(pnd53b.totalWht), 2500);

    await prisma.accTaxInvoice.delete({ where: { id: fullInvoice.id } });
    await prisma.accPurchaseTaxInvoice.delete({ where: { id: pInv.id } });
    await prisma.accWhtCertificate.delete({ where: { id: wht.id } });
  } finally {
    console.log("\n=== ลบข้อมูลทดสอบ ===");
    await prisma.accJournalEntry.deleteMany({ where: { id: { in: created } } });
    await prisma.accJournalEntry.deleteMany({ where: { description: { startsWith: "[test]" } } });
    await prisma.accTaxInvoice.deleteMany({ where: { docNo: { startsWith: P } } });
    await prisma.accPurchaseTaxInvoice.deleteMany({ where: { invoiceNo: { startsWith: P } } });
    await prisma.accWhtCertificate.deleteMany({ where: { docNo: { startsWith: P } } });
    await prisma.accAccount.deleteMany({ where: { code: { startsWith: P } } });
    await prisma.accPeriod.deleteMany({ where: { year: YEAR } });
    const left =
      (await prisma.accAccount.count({ where: { code: { startsWith: P } } })) +
      (await prisma.accTaxInvoice.count({ where: { docNo: { startsWith: P } } })) +
      (await prisma.accPurchaseTaxInvoice.count({ where: { invoiceNo: { startsWith: P } } })) +
      (await prisma.accWhtCertificate.count({ where: { docNo: { startsWith: P } } }));
    console.log(`  ข้อมูลทดสอบที่เหลือ: ${left}`);
  }

  console.log(fails === 0 ? "\n✅ ผ่านทั้งหมด\n" : `\n❌ ไม่ผ่าน ${fails} ข้อ\n`);
  process.exit(fails === 0 ? 0 : 1);
}

main();

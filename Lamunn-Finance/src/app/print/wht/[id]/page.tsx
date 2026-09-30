import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@lamunn/db-finance";
import { requireSectionPage } from "@/lib/permissions";
import { getAllSettings } from "@/lib/settings";
import { bahtTextFromSatang } from "@/lib/accounting/bahtText";
import { fmtSatang, toSatang } from "@/lib/accounting/money";
import { resolveWhtPayeeAddress } from "@/lib/accounting/withholding";
import PrintButton from "@/components/accounting/PrintButton";

export const dynamic = "force-dynamic";

const FORM_OPTIONS = [
  ["1", "ภ.ง.ด.1ก"],
  ["2", "ภ.ง.ด.1ก พิเศษ"],
  ["3", "ภ.ง.ด.2"],
  ["4", "ภ.ง.ด.3"],
  ["5", "ภ.ง.ด.2ก"],
  ["6", "ภ.ง.ด.3ก"],
  ["7", "ภ.ง.ด.53"],
] as const;

const DIVIDEND_ROWS = [
  "(1.1) อัตราร้อยละ 30 ของกำไรสุทธิ",
  "(1.2) อัตราร้อยละ 25 ของกำไรสุทธิ",
  "(1.3) อัตราร้อยละ 20 ของกำไรสุทธิ",
  "(1.4) อัตราอื่น ๆ (ระบุ) ............ ของกำไรสุทธิ",
  "(2.1) กำไรสุทธิของกิจการที่ได้รับยกเว้นภาษีเงินได้นิติบุคคล",
  "(2.2) เงินปันผลหรือส่วนแบ่งกำไรที่ได้รับยกเว้นไม่ต้องนำมารวมคำนวณ",
  "(2.3) กำไรสุทธิที่ได้หักผลขาดทุนสุทธิยกมาไม่เกิน 5 ปี",
  "(2.4) กำไรที่รับรู้ทางบัญชีโดยวิธีส่วนได้เสีย (equity method)",
  "(2.5) อื่น ๆ (ระบุ) ........................................................",
];

// หนังสือรับรองต้องใช้ข้อมูลผู้หักภาษีตามทะเบียน แม้ค่าตั้งค่าบริษัทส่วนกลางยังไม่ครบ
const WHT_PAYER_ADDRESS = "457/2 ถนนประชาราษฎร์ 2 แขวงบางซื่อ เขตบางซื่อ กรุงเทพมหานคร 10800";
const WHT_PAYER_TAX_ID = "0105568147638";

function dateSlash(date: Date) {
  return `${String(date.getUTCDate()).padStart(2, "0")}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}`;
}

function incomeRow(incomeType: string): "2" | "4a" | "4b" | "6" {
  if (incomeType.includes("40(2)")) return "2";
  if (incomeType.includes("40(4)(ก)")) return "4a";
  if (incomeType.includes("40(4)(ข)")) return "4b";
  // ค่าบริการ/เช่า/โฆษณามีเงื่อนไขย่อยต่างกัน จึงแสดงชื่อที่ผู้ทำบัญชียืนยันไว้ในช่อง “อื่น ๆ” ตามแบบอ้างอิง
  return "6";
}

export default async function WhtPrintPage({ params }: { params: { id: string } }) {
  await requireSectionPage("ACCOUNTING");
  const [settings, certificate] = await Promise.all([
    getAllSettings(),
    prisma.accWhtCertificate.findUnique({
      where: { id: params.id },
      include: { partner: { select: { address: true } } },
    }),
  ]);
  if (!certificate) notFound();

  const base = toSatang(certificate.baseAmount);
  const wht = toSatang(certificate.whtAmount);
  const year = certificate.payDate.getUTCFullYear();
  const month = certificate.payDate.getUTCMonth() + 1;
  const row = incomeRow(certificate.incomeType);
  const values = {
    date: dateSlash(certificate.payDate),
    base: fmtSatang(base, { zeroDash: false }),
    wht: fmtSatang(wht, { zeroDash: false }),
  };
  const reportPath = certificate.formType === "PND3" ? "pnd3" : "pnd53";

  return (
    <div>
      <style>{`@page { size: A4 portrait; margin: 7mm; } @media print { html, body { background: white !important; } }`}</style>
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-3 print:hidden">
        <Link href={`/accounting/tax-reports/${reportPath}?year=${year}&month=${month}`} className="text-sm text-gray-500 hover:text-brand-700 hover:underline">
          ← กลับไป {certificate.formType === "PND3" ? "ภ.ง.ด.3" : "ภ.ง.ด.53"}
        </Link>
        <PrintButton label="พิมพ์หนังสือรับรอง 50 ทวิ" />
      </div>

      <main className="mx-auto w-full max-w-[210mm] bg-white p-4 text-[9px] leading-[1.25] text-black shadow-sm print:max-w-none print:p-0 print:shadow-none">
        {certificate.voided && <div className="mb-2 border-4 border-black py-1 text-center text-xl font-bold">ยกเลิกแล้ว</div>}

        <div className="mb-1 font-semibold">
          <p>ฉบับที่ 1　(สำหรับผู้ถูกหักภาษี ณ ที่จ่าย ใช้แนบพร้อมกับแบบแสดงรายการภาษี)</p>
          <p>ฉบับที่ 2　(สำหรับผู้ถูกหักภาษี ณ ที่จ่าย เก็บไว้เป็นหลักฐาน)</p>
        </div>

        <div className="border-2 border-black px-2 py-1.5">
          <header className="grid grid-cols-[1fr_2fr_1fr] items-start border-b border-black pb-1">
            <div />
            <div className="text-center">
              <h1 className="whitespace-nowrap text-[16px] font-bold">หนังสือรับรองการหักภาษี ณ ที่จ่าย</h1>
              <p className="text-[11px] font-semibold">ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร</p>
            </div>
            <div className="min-w-0 pl-2 text-left text-[8px]">
              <p>เล่มที่　........................................</p>
              <p className="flex gap-1"><span className="shrink-0">เลขที่</span><span className="min-w-0 break-all font-mono font-semibold">{certificate.docNo}</span></p>
            </div>
          </header>

          <PartyBox
            title="ผู้มีหน้าที่หักภาษี ณ ที่จ่าย"
            name={settings.companyName || "(ยังไม่ได้ตั้งชื่อบริษัท)"}
            address={WHT_PAYER_ADDRESS}
            taxId={WHT_PAYER_TAX_ID}
          />
          <PartyBox title="ผู้ถูกหักภาษี ณ ที่จ่าย" name={`${certificate.payeeName}${certificate.payeeBranchTag ? ` (${certificate.payeeBranchTag})` : ""}`} address={resolveWhtPayeeAddress(certificate)} taxId={certificate.payeeTaxId || ""} />

          <section className="flex items-center gap-2 border-b border-black px-1 py-1">
            <div className="w-48">
              <b>ลำดับที่</b> <span className="inline-block w-24 border-b border-dotted border-black">　</span>
              <p className="text-[7px]">(ให้อ้างอิงหรือสอบยันกันได้ระหว่างหนังสือรับรองฯ กับแบบยื่นรายการ)</p>
            </div>
            <b>ในแบบ</b>
            <div className="flex flex-1 flex-wrap gap-x-4 gap-y-1">
              {FORM_OPTIONS.map(([no, label]) => (
                <label key={no} className="flex items-center gap-1 whitespace-nowrap">
                  <span className="flex h-4 w-4 items-center justify-center border border-black text-[12px] font-bold">
                    {(certificate.formType === "PND53" && no === "7") || (certificate.formType === "PND3" && no === "4") ? "✓" : ""}
                  </span>
                  ({no}) {label}
                </label>
              ))}
            </div>
          </section>

          <table className="w-full table-fixed border-collapse">
            <thead>
              <tr className="border-b border-black text-[10px]">
                <th className="w-[52%] border-r border-black py-1">ประเภทเงินได้พึงประเมินที่จ่าย</th>
                <th className="w-[15%] border-r border-black py-1">วัน เดือน<br />หรือปีภาษี ที่จ่าย</th>
                <th className="w-[17%] border-r border-black py-1">จำนวนเงินที่จ่าย</th>
                <th className="w-[16%] py-1">ภาษีที่หัก<br />และนำส่งไว้</th>
              </tr>
            </thead>
            <tbody className="align-top">
              <IncomeLine label="1. เงินเดือน ค่าจ้าง เบี้ยเลี้ยง โบนัส ฯลฯ ตามมาตรา 40 (1)" />
              <IncomeLine label="2. ค่าธรรมเนียม ค่านายหน้า ฯลฯ ตามมาตรา 40 (2)" value={row === "2" ? values : undefined} />
              <IncomeLine label="3. ค่าแห่งลิขสิทธิ์ ฯลฯ ตามมาตรา 40 (3)" />
              <IncomeLine label="4. (ก) ดอกเบี้ย ฯลฯ ตามมาตรา 40 (4)(ก)" value={row === "4a" ? values : undefined} />
              <IncomeLine label="　 (ข) เงินปันผล เงินส่วนแบ่งกำไร ฯลฯ ตามมาตรา 40 (4)(ข)" value={row === "4b" ? values : undefined} />
              <tr>
                <td className="border-r border-black px-1 pb-0.5 pl-6 text-[8px]">
                  <p>(1) กรณีผู้ได้รับเงินปันผลได้รับเครดิตภาษี โดยจ่ายจากกำไรสุทธิของกิจการ ดังนี้</p>
                  {DIVIDEND_ROWS.map((text) => <p key={text} className="pl-3">{text}</p>)}
                </td>
                <td className="border-r border-black" />
                <td className="border-r border-black" />
                <td />
              </tr>
              <IncomeLine label="5. การจ่ายเงินได้ที่ต้องหักภาษี ณ ที่จ่ายตามคำสั่งกรมสรรพากรที่ออกตามมาตรา 3 เตรส เช่น รางวัล ส่วนลด ค่าจ้างทำของ ค่าโฆษณา ค่าเช่า ค่าขนส่ง ค่าบริการ ค่าเบี้ยประกันวินาศภัย ฯลฯ" tall />
              <IncomeLine label={`6. อื่น ๆ (ระบุ) ${row === "6" ? certificate.incomeType : "................................................"}`} value={row === "6" ? values : undefined} />
            </tbody>
            <tfoot>
              <tr className="border-y border-black font-bold">
                <td colSpan={2} className="border-r border-black py-1 pr-2 text-right">รวมเงินที่จ่ายและภาษีที่หักนำส่ง</td>
                <td className="border-r border-black px-1 text-right tabular-nums">{values.base}</td>
                <td className="px-1 text-right tabular-nums">{values.wht}</td>
              </tr>
            </tfoot>
          </table>

          <div className="border-b border-black px-1 py-1 text-[10px]"><b>รวมเงินภาษีที่หักนำส่ง (ตัวอักษร)</b>　({bahtTextFromSatang(wht)})</div>
          <div className="border-b border-black px-1 py-1 text-[8px]"><b>เงินที่จ่ายเข้า</b> กบข./กสจ./กองทุนสงเคราะห์ครูโรงเรียนเอกชน......................บาท　กองทุนประกันสังคม......................บาท　กองทุนสำรองเลี้ยงชีพ......................บาท</div>
          <div className="flex items-center gap-4 border-b border-black px-1 py-1 text-[9px]">
            <b>ผู้จ่ายเงิน</b>
            {[["✓", "(1) หัก ณ ที่จ่าย"], ["", "(2) ออกให้ตลอดไป"], ["", "(3) ออกให้ครั้งเดียว"], ["", "(4) อื่น ๆ (ระบุ) ..............................."]].map(([mark, label]) => <Check key={label} mark={mark} label={label} />)}
          </div>

          <div className="grid grid-cols-[28%_72%] text-[8px]">
            <div className="border-r border-black p-2 text-center leading-relaxed"><b className="text-[10px]">คำเตือน</b>　ผู้มีหน้าที่ออกหนังสือรับรองการหักภาษี ณ ที่จ่าย ฝ่าฝืนไม่ปฏิบัติตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร ต้องรับโทษทางอาญาตามมาตรา 35 แห่งประมวลรัษฎากร</div>
            <div className="p-2 text-center">
              <p>ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความจริงทุกประการ</p>
              <div className="mt-8">ลงชื่อ ................................................................................ ผู้จ่ายเงิน</div>
              <div className="mt-2">วันที่ออกหนังสือรับรองฯ　{values.date}</div>
            </div>
          </div>
        </div>

        <div className="mt-1 flex gap-2 text-[7px] leading-tight"><b>หมายเหตุ</b><p>เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)* หมายถึง 1. กรณีบุคคลธรรมดาไทย ให้ใช้เลขประจำตัวประชาชนของกรมการปกครอง　2. กรณีนิติบุคคล ให้ใช้เลขทะเบียนนิติบุคคลของกรมพัฒนาธุรกิจการค้า　3. กรณีอื่น ๆ ให้ใช้เลขประจำตัวผู้เสียภาษีอากรของกรมสรรพากร</p></div>
      </main>
    </div>
  );
}

function PartyBox({ title, name, address, taxId }: { title: string; name: string; address: string; taxId: string }) {
  return (
    <section className="border-b border-black px-1 py-1">
      <div className="flex items-center justify-between gap-3"><b className="text-[10px]">{title} :-</b><TaxIdBoxes taxId={taxId} /></div>
      <p><b>ชื่อ</b>　{name}</p>
      <p className="pl-8 text-[7px]">(ให้ระบุว่าเป็น บุคคล นิติบุคคล บริษัท สมาคม หรือคณะบุคคล)</p>
      <p><b>ที่อยู่</b>　{address}</p>
      <p className="pl-8 text-[7px]">(ให้ระบุ ชื่ออาคาร/หมู่บ้าน ห้องเลขที่ ชั้นที่ เลขที่ ตรอก/ซอย หมู่ที่ ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด)</p>
    </section>
  );
}

function TaxIdBoxes({ taxId }: { taxId: string }) {
  const digits = taxId.replace(/\D/g, "").padEnd(13, " ").slice(0, 13).split("");
  return (
    <div className="flex items-center gap-1 whitespace-nowrap"><b>เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)*</b><span className="flex">{digits.map((digit, index) => <span key={index} className={`flex h-4 w-4 items-center justify-center border-y border-r border-black font-mono text-[8px] ${index === 0 ? "border-l" : ""}`}>{digit}</span>)}</span></div>
  );
}

function IncomeLine({ label, value, tall }: { label: string; value?: { date: string; base: string; wht: string }; tall?: boolean }) {
  return (
    <tr className="border-b border-dotted border-gray-500">
      <td className={`border-r border-black px-1 ${tall ? "py-1.5" : "py-0.5"}`}>{label}</td>
      <td className="border-r border-black px-1 text-center tabular-nums">{value?.date}</td>
      <td className="border-r border-black px-1 text-right tabular-nums">{value?.base}</td>
      <td className="px-1 text-right tabular-nums">{value?.wht}</td>
    </tr>
  );
}

function Check({ mark, label }: { mark: string; label: string }) {
  return <span className="flex items-center gap-1 whitespace-nowrap"><span className="flex h-4 w-4 items-center justify-center border border-black text-[12px] font-bold">{mark}</span>{label}</span>;
}

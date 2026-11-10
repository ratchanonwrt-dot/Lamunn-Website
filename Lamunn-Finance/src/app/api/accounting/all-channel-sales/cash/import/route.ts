import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireSectionApi } from "@/lib/permissions";
import { cellText } from "@/lib/excelImport";
import { parseAllChannelCashGrid, replaceAllChannelCashReport } from "@/lib/accounting/allChannelCash";

export const dynamic = "force-dynamic";

async function workbookGrid(file: File) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()) as unknown as ExcelJS.Buffer);
  const worksheet = workbook.worksheets.find((sheet) => sheet.name.trim().toLowerCase() === "cash") ?? workbook.worksheets[0];
  if (!worksheet) return [];
  const grid: string[][] = [];
  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    const cells: string[] = [];
    // ไฟล์ Cash มีสาขามากกว่า 20 คอลัมน์ จึงต้องอ่านครบตามจำนวนคอลัมน์จริงของ sheet
    for (let column = 1; column <= worksheet.columnCount; column++) cells.push(cellText(row.getCell(column).value));
    grid.push(cells);
  }
  return grid;
}

export async function POST(req: NextRequest) {
  const staff = await requireSectionApi("ACCOUNTING", "edit");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file");
  const year = Number(form.get("year"));
  const month = Number(form.get("month"));
  if (!(file instanceof File)) return NextResponse.json({ error: "กรุณาเลือกไฟล์ Cash.xlsx" }, { status: 400 });
  if (!/\.xlsx$/i.test(file.name)) return NextResponse.json({ error: "รองรับไฟล์ .xlsx เท่านั้น" }, { status: 400 });
  if (file.size > 8 * 1024 * 1024) return NextResponse.json({ error: "ไฟล์ใหญ่เกิน 8MB" }, { status: 400 });
  if (!Number.isInteger(year) || year < 2000 || year > 2200 || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "เดือนหรือปีไม่ถูกต้อง" }, { status: 400 });
  }
  try {
    const parsed = parseAllChannelCashGrid(await workbookGrid(file));
    const report = await replaceAllChannelCashReport({
      year,
      month,
      sourceFile: file.name.slice(0, 255),
      createdBy: staff.staffId,
      parsed,
    });
    return NextResponse.json({ report });
  } catch (error) {
    const message = error instanceof Error ? error.message : "อ่านไฟล์ Cash ไม่สำเร็จ";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

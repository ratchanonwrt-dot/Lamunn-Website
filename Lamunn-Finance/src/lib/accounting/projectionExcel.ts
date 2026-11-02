import ExcelJS from "exceljs";
import type { ProjectionReport } from "./projection";

const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

type MonthKey = "estimatedRevenue" | "actualRevenue" | "estimatedExpense" | "actualExpense" | "estimatedBalance" | "actualBalance";

export function buildProjectionWorkbook(report: ProjectionReport, companyName: string) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Lamunn Finance";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("ประมาณการเทียบผลจริง", {
    pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    properties: { defaultRowHeight: 20 },
  });
  sheet.views = [{ state: "frozen", xSplit: 1, ySplit: 5 }];
  sheet.pageSetup.margins = { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.15, footer: 0.15 };

  const lastColumn = 27;
  sheet.mergeCells(1, 1, 1, lastColumn);
  sheet.getCell(1, 1).value = companyName || "ชื่อบริษัท";
  sheet.getCell(1, 1).font = { bold: true, size: 16 };
  sheet.getCell(1, 1).alignment = { horizontal: "center" };

  sheet.mergeCells(2, 1, 2, lastColumn);
  sheet.getCell(2, 1).value = "ประมาณการเปรียบเทียบผลที่เกิดขึ้นจริง";
  sheet.getCell(2, 1).font = { bold: true, size: 14 };
  sheet.getCell(2, 1).alignment = { horizontal: "center" };

  sheet.mergeCells(3, 1, 3, lastColumn);
  sheet.getCell(3, 1).value = `สำหรับรอบระยะเวลาบัญชี ปี ${report.year + 543} (${report.year}) — หน่วย: บาท`;
  sheet.getCell(3, 1).alignment = { horizontal: "center" };

  sheet.mergeCells(4, 1, 5, 1);
  sheet.getCell(4, 1).value = "รายการ";
  MONTHS.forEach((month, index) => {
    const startColumn = 2 + index * 2;
    sheet.mergeCells(4, startColumn, 4, startColumn + 1);
    sheet.getCell(4, startColumn).value = month;
    sheet.getCell(5, startColumn).value = "ประมาณการ";
    sheet.getCell(5, startColumn + 1).value = "เกิดขึ้นจริง";
  });
  sheet.mergeCells(4, 26, 4, 27);
  sheet.getCell(4, 26).value = "รวมทั้งปี";
  sheet.getCell(5, 26).value = "ประมาณการ";
  sheet.getCell(5, 27).value = "เกิดขึ้นจริง";

  addMonthRow(sheet, 6, "รายได้", report, "estimatedRevenue", "actualRevenue", report.totals.estimatedRevenue, report.totals.actualRevenue);
  addMonthRow(sheet, 7, "หัก ค่าใช้จ่าย", report, "estimatedExpense", "actualExpense", report.totals.estimatedExpense, report.totals.actualExpense);
  addMonthRow(sheet, 8, "คงเหลือ", report, "estimatedBalance", "actualBalance", report.totals.estimatedBalance, report.totals.actualBalance);
  addAnnualRow(sheet, 9, "หัก ขาดทุนสุทธิยกมาไม่เกิน 5 ปี", report.totals.estimatedLossDeducted, report.totals.actualLossDeducted);
  addAnnualRow(sheet, 10, "คงเหลือหลังหักขาดทุนสุทธิยกมา", report.totals.estimatedAfterLoss, report.totals.actualAfterLoss);

  sheet.getColumn(1).width = 39;
  for (let column = 2; column <= lastColumn; column++) sheet.getColumn(column).width = 14;
  sheet.getRow(4).height = 25;
  sheet.getRow(5).height = 32;

  for (let row = 4; row <= 10; row++) {
    for (let column = 1; column <= lastColumn; column++) {
      const cell = sheet.getCell(row, column);
      cell.border = {
        top: { style: "thin", color: { argb: "FF9CA3AF" } },
        left: { style: "thin", color: { argb: "FF9CA3AF" } },
        bottom: { style: "thin", color: { argb: "FF9CA3AF" } },
        right: { style: "thin", color: { argb: "FF9CA3AF" } },
      };
      cell.alignment = { vertical: "middle", horizontal: column === 1 ? "left" : row <= 5 ? "center" : "right", wrapText: true };
      if (row >= 6 && column >= 2) cell.numFmt = "#,##0.00;[Red](#,##0.00);-";
    }
  }
  [4, 5].forEach((row) => {
    sheet.getRow(row).font = { bold: true, color: { argb: "FF1F2937" } };
    sheet.getRow(row).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
  });
  [8, 10].forEach((row) => { sheet.getRow(row).font = { bold: true }; });
  sheet.getRow(10).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } };

  const lossStartRow = 13;
  sheet.getCell(lossStartRow - 1, 1).value = "รายละเอียดขาดทุนสุทธิทางภาษียกมา";
  sheet.getCell(lossStartRow - 1, 1).font = { bold: true };
  report.losses.forEach((loss, index) => {
    const row = lossStartRow + index;
    sheet.getCell(row, 1).value = `ปี ${loss.lossYear + 543} (${loss.lossYear})`;
    sheet.getCell(row, 2).value = loss.amount / 100;
    sheet.getCell(row, 2).numFmt = "#,##0.00;[Red](#,##0.00);-";
  });

  sheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: 10, column: lastColumn } };
  return workbook;
}

function addMonthRow(
  sheet: ExcelJS.Worksheet,
  row: number,
  label: string,
  report: ProjectionReport,
  estimatedKey: MonthKey,
  actualKey: MonthKey,
  estimatedTotal: number,
  actualTotal: number,
) {
  sheet.getCell(row, 1).value = label;
  report.months.forEach((month, index) => {
    sheet.getCell(row, 2 + index * 2).value = month[estimatedKey] / 100;
    sheet.getCell(row, 3 + index * 2).value = month[actualKey] / 100;
  });
  sheet.getCell(row, 26).value = estimatedTotal / 100;
  sheet.getCell(row, 27).value = actualTotal / 100;
}

function addAnnualRow(sheet: ExcelJS.Worksheet, row: number, label: string, estimated: number, actual: number) {
  sheet.getCell(row, 1).value = label;
  for (let column = 2; column <= 25; column++) sheet.getCell(row, column).value = null;
  sheet.getCell(row, 26).value = estimated / 100;
  sheet.getCell(row, 27).value = actual / 100;
}

export const projectionExcelFilename = (year: number) => `projection-vs-actual-${year}.xlsx`;

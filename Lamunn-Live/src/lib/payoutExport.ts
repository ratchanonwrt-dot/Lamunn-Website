import type { PayoutRow } from "@/lib/payouts";

/** แถวในไฟล์ส่งให้บัญชี/ธนาคารโอน: ชื่อ · เลขบัญชี · ธนาคาร · ยอดที่ต้องจ่าย */
export interface PayoutListItem {
  name: string;
  accountNo: string;
  bank: string;
  amount: number;
}

/**
 * รายการที่ต้องจ่าย = อนุมัติแล้วแต่บัญชียังไม่ทำจ่าย (ใช้ยอดที่อนุมัติ ไม่ใช่ยอดคำนวณสด)
 * — ยอดที่ยังไม่อนุมัติไม่ควรถูกโอน จึงไม่ใส่ในไฟล์
 * รวมหลายวันเป็นแถวเดียวต่อบัญชีผู้รับ เพื่อโอนครั้งเดียวต่อคน
 */
export function payoutList(rows: PayoutRow[]): PayoutListItem[] {
  const byPayee = new Map<string, PayoutListItem>();
  for (const r of rows) {
    if (r.status !== "APPROVED" || r.approvedAmount === null) continue;
    const name = r.bankAccountName?.trim() || r.streamerName;
    const accountNo = r.bankAccountNo?.trim() ?? "";
    const bank = r.bankName?.trim() ?? "";
    // คนเดียวกันแต่ยังไม่มีเลขบัญชี ให้รวมด้วยรหัสคนไลฟ์ ไม่งั้นทุกคนที่ไม่มีเลขบัญชีจะถูกรวมเป็นแถวเดียว
    const key = accountNo ? `${bank}|${accountNo}` : `streamer|${r.streamerId}`;
    const item = byPayee.get(key) ?? { name, accountNo, bank, amount: 0 };
    item.amount = Math.round((item.amount + r.approvedAmount) * 100) / 100;
    byPayee.set(key, item);
  }
  return Array.from(byPayee.values()).sort((a, b) => a.name.localeCompare(b.name, "th"));
}

const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;

/**
 * CSV (UTF-8 + BOM ให้ Excel อ่านภาษาไทยถูก)
 * เลขบัญชีเขียนเป็น ="..." เพื่อให้ Excel เก็บเป็นข้อความ — ไม่งั้นเลข 0 นำหน้าหาย/กลายเป็น 1.23E+09
 * ยอดเงินเป็นตัวเลขล้วนไม่มีจุลภาค ให้บวกต่อใน Excel ได้
 */
export function payoutCsv(items: PayoutListItem[]): string {
  const lines = [["ชื่อ", "เลขบัญชี", "ธนาคาร", "ยอดที่ต้องจ่าย"].map(cell).join(",")];
  for (const it of items) {
    lines.push([cell(it.name), it.accountNo ? `=${cell(it.accountNo)}` : cell(""), cell(it.bank), it.amount.toFixed(2)].join(","));
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}

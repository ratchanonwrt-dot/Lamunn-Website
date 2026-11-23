import { signedInputToSatang } from "./money";
import type { LivePayout } from "./livePayouts";

export interface LivePayoutWorkItem {
  id: string;
  sourceId: string | null;
  liveDate: string;
  payeeName: string;
  hours: number;
  amount: number;
  note: string | null;
  transferQueued: boolean;
  createdBy: string | null;
  createdAt: string;
}

export interface DisplayLivePayout extends LivePayout {
  source: "LIVE" | "MANUAL";
  workItemId: string | null;
  transferQueued: boolean;
}

export interface ManualLivePayoutInput {
  liveDate?: unknown;
  payeeName?: unknown;
  hours?: unknown;
  amount?: unknown;
  note?: unknown;
  transferQueued?: unknown;
}

export type ValidManualLivePayoutInput = {
  liveDate: string;
  payeeName: string;
  hours: string;
  amountSatang: number;
  note: string | null;
  transferQueued: boolean;
};

function validIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** ตรวจข้อมูลก่อนบันทึก เพื่อไม่ให้ยอดเงินหรือชั่วโมงที่พิมพ์ผิดหลุดเข้ารายการทำจ่าย */
export function parseManualLivePayoutInput(input: ManualLivePayoutInput): { data?: ValidManualLivePayoutInput; error?: string } {
  const liveDate = String(input.liveDate ?? "").trim();
  if (!validIsoDate(liveDate)) return { error: "กรุณาเลือกวันที่ไลฟ์" };

  const payeeName = String(input.payeeName ?? "").trim().slice(0, 160);
  if (!payeeName) return { error: "กรุณากรอกชื่อผู้รับเงิน" };

  const hours = String(input.hours ?? "").trim().replace(/,/g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(hours) || Number(hours) <= 0 || Number(hours) > 24) {
    return { error: "จำนวนชั่วโมงต้องมากกว่า 0 และไม่เกิน 24 ชั่วโมง" };
  }

  const amountSatang = signedInputToSatang(input.amount as string | number | null | undefined);
  if (amountSatang <= 0) return { error: "จำนวนเงินต้องมากกว่า 0 บาท" };

  const noteText = String(input.note ?? "").trim().slice(0, 500);
  return {
    data: {
      liveDate,
      payeeName,
      hours,
      amountSatang,
      note: noteText || null,
      transferQueued: input.transferQueued === true,
    },
  };
}

/** รวมรายการจากเว็บ Live กับรายการเพิ่มเอง โดยเก็บสถานะขึ้นระบบโอนไว้ฝั่งบัญชี */
export function mergeLivePayoutWorkItems(
  liveRows: LivePayout[],
  workItems: LivePayoutWorkItem[],
  status: "ALL" | "APPROVED" | "PAID",
): DisplayLivePayout[] {
  const stateBySourceId = new Map(workItems.filter((row) => row.sourceId).map((row) => [row.sourceId!, row]));
  const live: DisplayLivePayout[] = liveRows.map((row) => {
    const state = stateBySourceId.get(row.id);
    return {
      ...row,
      source: "LIVE",
      workItemId: state?.id ?? null,
      transferQueued: state?.transferQueued ?? row.status === "PAID",
    };
  });

  const manual: DisplayLivePayout[] = workItems
    .filter((row) => row.sourceId === null)
    .filter((row) => status === "ALL" || (status === "PAID" ? row.transferQueued : !row.transferQueued))
    .map((row) => ({
      id: `manual:${row.id}`,
      date: row.liveDate,
      streamerName: row.payeeName,
      nickname: null,
      hrEmployeeId: null,
      payeeName: row.payeeName,
      bankName: null,
      bankAccountNo: null,
      hours: row.hours,
      sales: 0,
      shiftCount: 0,
      amount: row.amount,
      note: row.note,
      status: row.transferQueued ? "PAID" : "APPROVED",
      approvedBy: row.createdBy,
      approvedAt: row.createdAt,
      paidAt: null,
      paidBy: null,
      paidRef: null,
      stale: false,
      source: "MANUAL",
      workItemId: row.id,
      transferQueued: row.transferQueued,
    }));

  return [...live, ...manual].sort((a, b) => b.date.localeCompare(a.date) || a.payeeName.localeCompare(b.payeeName, "th"));
}

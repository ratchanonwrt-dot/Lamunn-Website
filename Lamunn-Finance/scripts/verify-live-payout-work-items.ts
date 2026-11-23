/** พิสูจน์รายการเพิ่มเองและสถานะขึ้นระบบโอน โดยไม่แตะฐานข้อมูล */
import assert from "node:assert/strict";
import type { LivePayout } from "../src/lib/accounting/livePayouts";
import {
  mergeLivePayoutWorkItems,
  parseManualLivePayoutInput,
  type LivePayoutWorkItem,
} from "../src/lib/accounting/livePayoutWorkItemLogic";

const parsed = parseManualLivePayoutInput({
  liveDate: "2091-11-23",
  payeeName: "[test] ผู้รับเงิน",
  hours: "3.50",
  amount: "1,234.56",
  note: "[test] รอบเย็น",
  transferQueued: true,
});
assert.equal(parsed.error, undefined);
assert.equal(parsed.data?.amountSatang, 123_456, "จำนวนเงินต้องเก็บเป็นสตางค์โดยไม่คลาดเคลื่อน");
assert.equal(parsed.data?.hours, "3.50");
assert.equal(parseManualLivePayoutInput({ liveDate: "2091-02-30", payeeName: "[test]", hours: 2, amount: 100 }).error, "กรุณาเลือกวันที่ไลฟ์");
assert.equal(parseManualLivePayoutInput({ liveDate: "2091-11-23", payeeName: "", hours: 2, amount: 100 }).error, "กรุณากรอกชื่อผู้รับเงิน");
assert.equal(parseManualLivePayoutInput({ liveDate: "2091-11-23", payeeName: "[test]", hours: 25, amount: 100 }).error, "จำนวนชั่วโมงต้องมากกว่า 0 และไม่เกิน 24 ชั่วโมง");
assert.equal(parseManualLivePayoutInput({ liveDate: "2091-11-23", payeeName: "[test]", hours: 2, amount: 0 }).error, "จำนวนเงินต้องมากกว่า 0 บาท");

const liveRow: LivePayout = {
  id: "live-1",
  date: "2091-11-22",
  streamerName: "[test] คนไลฟ์",
  nickname: null,
  hrEmployeeId: null,
  payeeName: "[test] คนไลฟ์",
  bankName: "ธนาคารทดสอบ",
  bankAccountNo: "0000000000",
  hours: 2,
  sales: 5_000,
  shiftCount: 1,
  amount: 500,
  note: null,
  status: "APPROVED",
  approvedBy: "[test] ผู้อนุมัติ",
  approvedAt: "2091-11-22T10:00:00.000Z",
  paidAt: null,
  paidBy: null,
  paidRef: null,
  stale: false,
};

const workItems: LivePayoutWorkItem[] = [
  {
    id: "state-1",
    sourceId: "live-1",
    liveDate: "2091-11-22",
    payeeName: "[test] คนไลฟ์",
    hours: 2,
    amount: 500,
    note: null,
    transferQueued: true,
    createdBy: "[test] บัญชี",
    createdAt: "2091-11-22T11:00:00.000Z",
  },
  {
    id: "manual-1",
    sourceId: null,
    liveDate: "2091-11-23",
    payeeName: "[test] เพิ่มเอง",
    hours: 3.5,
    amount: 1_234.56,
    note: "[test] หมายเหตุ",
    transferQueued: false,
    createdBy: "[test] บัญชี",
    createdAt: "2091-11-23T11:00:00.000Z",
  },
];

const all = mergeLivePayoutWorkItems([liveRow], workItems, "ALL");
assert.equal(all.length, 2);
assert.equal(all.find((row) => row.source === "LIVE")?.transferQueued, true, "สถานะของรายการ Live ต้องอ่านจากรายการติดตามฝั่งบัญชี");
assert.equal(all.find((row) => row.source === "MANUAL")?.note, "[test] หมายเหตุ");
assert.equal(mergeLivePayoutWorkItems([], workItems, "APPROVED").length, 1, "รอจ่ายต้องเห็นรายการเพิ่มเองที่ยังไม่ขึ้นระบบโอน");
assert.equal(mergeLivePayoutWorkItems([], workItems, "PAID").length, 0, "ขึ้นระบบโอนแล้วต้องไม่รวมรายการเพิ่มเองที่ยังไม่ติ๊ก");

console.log("✅ verify-live-payout-work-items ผ่านทั้งหมด");

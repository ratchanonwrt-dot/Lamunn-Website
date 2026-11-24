import { prisma } from "@lamunn/db-finance";
import { signedInputToSatang, toBaht, toSatang } from "./money";
import type { LivePayout } from "./livePayouts";
import { parseManualLivePayoutInput, type LivePayoutWorkItem, type ValidManualLivePayoutInput } from "./livePayoutWorkItemLogic";

export * from "./livePayoutWorkItemLogic";

function mapWorkItem(row: {
  id: string;
  sourceId: string | null;
  liveDate: Date;
  payeeName: string;
  hours: { toString(): string };
  amount: { toString(): string };
  note: string | null;
  transferQueued: boolean;
  createdBy: string | null;
  createdAt: Date;
}): LivePayoutWorkItem {
  return {
    id: row.id,
    sourceId: row.sourceId,
    liveDate: row.liveDate.toISOString().slice(0, 10),
    payeeName: row.payeeName,
    hours: Number(row.hours.toString()),
    amount: toBaht(toSatang(row.amount.toString())),
    note: row.note,
    transferQueued: row.transferQueued,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function fetchLivePayoutWorkItems(from: string, to: string, sourceIds: string[]): Promise<LivePayoutWorkItem[]> {
  const rows = await prisma.accLivePayoutWorkItem.findMany({
    where: {
      OR: [
        { sourceId: null, liveDate: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T00:00:00.000Z`) } },
        ...(sourceIds.length ? [{ sourceId: { in: sourceIds } }] : []),
      ],
    },
    orderBy: [{ liveDate: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(mapWorkItem);
}

export async function createManualLivePayout(input: ValidManualLivePayoutInput, createdBy: string | null) {
  const row = await prisma.accLivePayoutWorkItem.create({
    data: {
      liveDate: new Date(`${input.liveDate}T00:00:00.000Z`),
      payeeName: input.payeeName,
      hours: input.hours,
      amount: toBaht(input.amountSatang),
      note: input.note,
      transferQueued: input.transferQueued,
      createdBy,
    },
  });
  return mapWorkItem(row);
}

export async function setManualLivePayoutTransferQueued(id: string, transferQueued: boolean) {
  const result = await prisma.accLivePayoutWorkItem.updateMany({
    where: { id, sourceId: null },
    data: { transferQueued },
  });
  return result.count === 1;
}

export async function setManualLivePayoutNote(id: string, note: string | null) {
  const result = await prisma.accLivePayoutWorkItem.updateMany({
    where: { id, sourceId: null },
    data: { note },
  });
  return result.count === 1;
}

export async function setExternalLivePayoutTransferQueued(
  payout: Pick<LivePayout, "id" | "date" | "payeeName" | "hours" | "amount" | "note">,
  transferQueued: boolean,
  createdBy: string | null,
) {
  const amountSatang = signedInputToSatang(payout.amount);
  const parsed = parseManualLivePayoutInput({
    liveDate: payout.date,
    payeeName: payout.payeeName,
    hours: payout.hours,
    amount: toBaht(amountSatang),
    note: payout.note,
    transferQueued,
  });
  if (!parsed.data) throw new Error(parsed.error ?? "ข้อมูลรายการไม่ถูกต้อง");

  const row = await prisma.accLivePayoutWorkItem.upsert({
    where: { sourceId: payout.id },
    update: {
      liveDate: new Date(`${parsed.data.liveDate}T00:00:00.000Z`),
      payeeName: parsed.data.payeeName,
      hours: parsed.data.hours,
      amount: toBaht(parsed.data.amountSatang),
      note: parsed.data.note,
      transferQueued,
    },
    create: {
      sourceId: payout.id,
      liveDate: new Date(`${parsed.data.liveDate}T00:00:00.000Z`),
      payeeName: parsed.data.payeeName,
      hours: parsed.data.hours,
      amount: toBaht(parsed.data.amountSatang),
      note: parsed.data.note,
      transferQueued,
      createdBy,
    },
  });
  return mapWorkItem(row);
}

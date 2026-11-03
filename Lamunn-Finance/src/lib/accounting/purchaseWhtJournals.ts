import { AccountingError, type DraftLine } from "./post";
import { toBaht } from "./money";

export const purchasePaymentEntryDescriptionFor = (vendorName: string, invoiceNo: string) =>
  `จ่าย ${vendorName} ใบกำกับ ${invoiceNo}`;

export function buildPurchaseWhtJournalLines(input: {
  allocations: { accountId: string; amountSatang: number }[];
  inputVatAccountId: string;
  tradePayableAccountId: string;
  paymentAccountId: string;
  whtPayableAccountId: string;
  baseSatang: number;
  vatSatang: number;
  whtSatang: number;
  partnerId?: string | null;
  description?: string | null;
  invoiceNo: string;
}): { purchaseLines: DraftLine[]; paymentLines: DraftLine[] } {
  const totalSatang = input.baseSatang + input.vatSatang;
  const netPaymentSatang = totalSatang - input.whtSatang;
  if (input.baseSatang <= 0 || input.vatSatang < 0 || input.whtSatang <= 0 || netPaymentSatang <= 0) {
    throw new AccountingError("ยอดซื้อ ภาษีซื้อ หรือภาษีหัก ณ ที่จ่ายไม่ถูกต้อง");
  }

  return {
    purchaseLines: [
      ...input.allocations.map((line) => ({
        accountId: line.accountId,
        debit: toBaht(line.amountSatang),
        partnerId: input.partnerId ?? null,
        memo: input.description || undefined,
      })),
      { accountId: input.inputVatAccountId, debit: toBaht(input.vatSatang), memo: "ภาษีซื้อ", docNo: input.invoiceNo },
      {
        accountId: input.tradePayableAccountId,
        credit: toBaht(totalSatang),
        partnerId: input.partnerId ?? null,
        memo: "ตั้งเจ้าหนี้การค้า",
      },
    ],
    paymentLines: [
      {
        accountId: input.tradePayableAccountId,
        debit: toBaht(totalSatang),
        partnerId: input.partnerId ?? null,
        memo: "ตัดเจ้าหนี้การค้า",
      },
      {
        accountId: input.paymentAccountId,
        credit: toBaht(netPaymentSatang),
        partnerId: input.partnerId ?? null,
        memo: "จ่ายสุทธิหลังหักภาษี ณ ที่จ่าย",
      },
      {
        accountId: input.whtPayableAccountId,
        credit: toBaht(input.whtSatang),
        partnerId: input.partnerId ?? null,
        memo: "ภาษีหัก ณ ที่จ่าย - ภ.ง.ด.53",
      },
    ],
  };
}

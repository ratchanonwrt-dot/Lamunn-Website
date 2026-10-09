import AiAutokeyUploader from "@/components/accounting/AiAutokeyUploader";
import { requireSectionPage } from "@/lib/permissions";
import { getBranchOptions, getPartnerOptions, getPostableAccounts } from "@/lib/accounting/refData";

export const dynamic = "force-dynamic";

export default async function AiAutokeyPage() {
  await requireSectionPage("ACCOUNTING", "edit");
  const [accounts, branches, partners] = await Promise.all([getPostableAccounts(), getBranchOptions(), getPartnerOptions()]);

  return <AiAutokeyUploader accounts={accounts.map((account) => ({ id: account.id, code: account.code, nameTh: account.nameTh, vatRole: account.vatRole }))} branches={branches} partners={partners.filter((partner) => partner.isActive)} />;
}

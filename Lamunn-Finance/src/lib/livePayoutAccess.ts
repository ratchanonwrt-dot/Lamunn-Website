import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { requireStaff, type Role } from "@/lib/requireStaff";

export const LIVE_PAYOUT_PAGE_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "STAFF", "MARKETING"];
export const LIVE_PAYOUT_TRANSFER_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "STAFF"];

export function canQueueLivePayoutTransfer(role: Role) {
  return LIVE_PAYOUT_TRANSFER_ROLES.includes(role);
}

export async function requireLivePayoutPage() {
  const session = await getSession();
  if (!session?.user?.staffId) redirect("/login");
  const role = session.user.role as Role;
  if (!LIVE_PAYOUT_PAGE_ROLES.includes(role)) redirect("/dashboard");
  return {
    staffId: session.user.staffId,
    staffName: session.user.name ?? "",
    role,
    canQueueTransfer: canQueueLivePayoutTransfer(role),
  };
}

export async function requireLivePayoutApi() {
  return requireStaff(LIVE_PAYOUT_PAGE_ROLES);
}

export async function requireLivePayoutTransferApi() {
  return requireStaff(LIVE_PAYOUT_TRANSFER_ROLES);
}

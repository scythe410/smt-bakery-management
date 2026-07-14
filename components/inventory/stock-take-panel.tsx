// Stock-take panel (server) — loads the live session for the date and gates the
// revenue figures by role (owner sees money; manager and staff run the counts
// only, CLAUDE.md §5). Hands off to the client StockTake for the interactive
// Open/Close.

import { requireProfile, canAccess } from "@/lib/auth";
import { getStockTakeSession } from "@/lib/db/selectors/stock";
import { StockTake } from "@/components/inventory/stock-take";

export async function StockTakePanel({ date }: { date: string }) {
  const profile = await requireProfile();
  const session = await getStockTakeSession(date);
  // "manager/owner see revenue" — same gate as Reports (owner/manager).
  const canSeeRevenue = canAccess(profile.role, "reports");
  return <StockTake session={session} canSeeRevenue={canSeeRevenue} />;
}

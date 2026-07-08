// Finance › Expenses (SPEC §3.2). Server component — loads the period's ledger
// (entries + reconciling total) and hands it to the client ledger, which does
// the filtering, add-expense form, and rendering.

import { getExpenseLedger } from "@/lib/db/selectors/expenses";
import { ExpensesLedger } from "@/components/finance/expenses-ledger";
import type { PeriodInput } from "@/lib/db/period";

export async function ExpensesTab({ period }: { period: PeriodInput }) {
  const ledger = await getExpenseLedger(period);
  return (
    <ExpensesLedger
      entries={ledger.entries}
      totalCents={ledger.totalCents}
      categories={ledger.categories}
    />
  );
}

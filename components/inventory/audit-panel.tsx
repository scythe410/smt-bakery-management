// Ingredient-audit panel (server) — loads this tenant's ingredient items (reusing
// the cached inventory selector) and hands the spot-count form the id/name/unit/
// on-hand it needs. Merchandise is excluded here: it's reconciled by the daily
// count, not the audit (CLAUDE.md §4).

import { requireProfile } from "@/lib/auth";
import { getInventoryList } from "@/lib/db/selectors/inventory";
import { IngredientAudit, type AuditItem } from "@/components/inventory/ingredient-audit";

export async function AuditPanel() {
  await requireProfile();
  const { items } = await getInventoryList();
  const ingredients: AuditItem[] = items
    .filter((it) => it.kind === "ingredient")
    .map((it) => ({
      id: it.id,
      name: it.name,
      unit: it.unit,
      barcode: it.barcode,
      qtyOnHand: it.qtyOnHand ?? 0,
    }));
  return <IngredientAudit items={ingredients} />;
}

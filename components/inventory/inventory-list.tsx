// Inventory list (SPEC §3.3). Async server component — loads the tenant's derived
// list (items + low-stock count + present categories) and hands it to the client
// browser, which does the filtering, search, add form, and rendering. Kept behind
// a Suspense boundary in the page so the toolbar/rows stream in after a skeleton.

import { getInventoryList } from "@/lib/db/selectors/inventory";
import { InventoryBrowser } from "@/components/inventory/inventory-browser";

export async function InventoryList() {
  const { items, lowStockCount, categories } = await getInventoryList();
  return <InventoryBrowser items={items} lowStockCount={lowStockCount} categories={categories} />;
}

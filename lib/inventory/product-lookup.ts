import "server-only";

// Product lookup for scan-to-add (SPEC §5.1). Given a scanned GTIN, ask a public
// product database (Open Food Facts — free, no key, good coverage of packaged
// food/beverage retail goods) for a name and a rough category, to PREFILL the
// add-item form. It never blocks the add: any miss, timeout, or network error
// resolves to `found: false`, and the UI falls back to a blank form.
//
// This runs server-side (called from a server action), so the browser only ever
// talks to our own origin — the CSP connect-src stays tight (no third-party
// origin), and the external call has one controlled place to evolve.

import type { InventoryCategory, InventoryKind } from "@/lib/inventory-config";

export type ProductLookupResult =
  | { found: false }
  | { found: true; name: string; category: InventoryCategory; kind: InventoryKind };

const ENDPOINT = "https://world.openfoodfacts.org/api/v2/product";
const TIMEOUT_MS = 5000;

/** Map Open Food Facts category tags onto our fixed inventory categories. */
function categoryFromTags(tags: string[]): InventoryCategory {
  const hay = tags.join(" ").toLowerCase();
  if (/beverage|drink|water|juice|soda|tea|coffee/.test(hay)) return "beverages";
  if (/syrup|topping|sauce|sweetener|honey|jam/.test(hay)) return "syrups_toppings";
  if (/flour|sugar|baking|yeast|cocoa|chocolate/.test(hay)) return "baking";
  return "merch";
}

/**
 * Look a GTIN up against Open Food Facts. A scanned barcode is a packaged retail
 * product, so the kind is always `merchandise` (the user can change it before
 * saving). Returns `found: false` on any miss/error so the caller can fall back.
 */
export async function lookupProduct(barcode: string): Promise<ProductLookupResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const url = `${ENDPOINT}/${encodeURIComponent(barcode)}.json?fields=product_name,brands,categories_tags`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "SamanthasBakery-BizCore/1.0 (demo)", Accept: "application/json" },
      // Product data changes rarely; let the platform cache identical lookups.
      cache: "force-cache",
    });
    if (!res.ok) return { found: false };

    const body = (await res.json()) as {
      status?: number;
      product?: { product_name?: string; brands?: string; categories_tags?: string[] };
    };
    const product = body.product;
    if (body.status !== 1 || !product) return { found: false };

    const name = (product.product_name || product.brands || "").trim();
    if (!name) return { found: false };

    return {
      found: true,
      name: name.slice(0, 120),
      category: categoryFromTags(product.categories_tags ?? []),
      kind: "merchandise",
    };
  } catch {
    // AbortError (timeout) or any network/parse failure → let the UI fall back.
    return { found: false };
  } finally {
    clearTimeout(timer);
  }
}

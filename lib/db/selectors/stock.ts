// selectors/stock.ts — the daily merchandise stock-take, shaped three ways:
//
//   * getStockTakeSession(date)  — LIVE (RLS, uncached): the interactive Open/Close
//     screen. Reflects a just-opened / just-closed day immediately.
//   * getEndOfDayReport(date)    — CACHED (stock + orders + inventory tags): the
//     End-of-Day report (Reports) + the source for the Dashboard summary.
//   * getStockDaySummary()       — today's headline for the Dashboard card (derived
//     from getEndOfDayReport, so it shares that cache entry).
//
// Derivation (one place, so the report / dashboard / screen reconcile):
//   units_out    = opening_qty + received_qty − closing_qty   (only once closed)
//   revenue_cents = round(units_out × unit_price_cents)        (integer cents)
//   left          = closing_qty
// The billing cross-check compares physical units_out to the units BILLED through
// orders (summed `sale` movements) for the same item/day → variance flags
// shrinkage. When no merchandise is billed through orders, those columns are
// hidden (the caller reads `billed`).
//
// All money stays integer cents; nothing is formatted here (format.ts does that).

import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import {
  getStockDayByDate,
  listStockCountLines,
  listMerchandiseItems,
  listMerchandiseSalePrices,
  listSaleMovements,
  type StockCountLineWithItem,
} from "@/lib/db/queries/stock";
import { resolveTenantPeriod, resolveTenantPeriodScope, periodCacheKey } from "@/lib/db/selectors/context";
import { singleDayPeriod } from "@/lib/reports/report-params";
import type { Period } from "@/lib/db/period";
import { createServiceClient } from "@/lib/supabase/service";
import { businessTags, type DbScope } from "@/lib/db/cache";
import { add, sum } from "@/lib/money";

/** Whether a day has been opened for the date, and its state. */
export type StockDayStatus = "none" | "open" | "closed";

function toNum(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Revenue = round(out × price). `out` may be fractional (a numeric unit). */
function revenueCents(unitsOut: number, unitPriceCents: number): number {
  return Math.round(unitsOut * unitPriceCents);
}

// --- End-of-Day report ------------------------------------------------------

export type EndOfDayRow = {
  itemId: string;
  /** Business data (item name), shown as entered — not translated. */
  name: string;
  unit: string;
  openingQty: number;
  receivedQty: number;
  /** Null until the day is closed. */
  closingQty: number | null;
  /** opening + received − closing; null until closed. */
  unitsOut: number | null;
  /** Closing quantity (what's left); null until closed. */
  leftQty: number | null;
  unitPriceCents: number;
  /** round(unitsOut × price); null until closed. */
  revenueCents: number | null;
  /** Units billed through orders (summed `sale` movements) for this item today. */
  billedUnits: number;
  /** Physical out − billed out; null until closed. Positive ⇒ shrinkage. */
  varianceUnits: number | null;
};

export type EndOfDayReport = {
  date: string;
  status: StockDayStatus;
  rows: EndOfDayRow[];
  /** Σ over rows (closed only; 0 while open). */
  totalUnitsOut: number;
  totalLeftQty: number;
  totalRevenueCents: number;
  /** True when any merchandise item was billed through orders today (show cross-check). */
  billed: boolean;
};

/** Units billed per merchandise item = Σ −delta of its `sale` movements. */
function billedUnitsMap(
  saleMovements: Awaited<ReturnType<typeof listSaleMovements>>,
  merchIds: Set<string>,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const m of saleMovements) {
    if (!merchIds.has(m.inventory_item_id)) continue;
    map.set(m.inventory_item_id, (map.get(m.inventory_item_id) ?? 0) - m.delta);
  }
  return map;
}

// Pure derivation (no I/O) — reused by the fetched path and the empty guard.
function summarizeEndOfDay(
  date: string,
  lines: StockCountLineWithItem[],
  saleMovements: Awaited<ReturnType<typeof listSaleMovements>>,
  status: StockDayStatus,
): EndOfDayReport {
  const merchIds = new Set(lines.map((l) => l.inventory_item_id));
  const billed = billedUnitsMap(saleMovements, merchIds);

  const rows: EndOfDayRow[] = lines
    .map((l) => {
      const openingQty = toNum(l.opening_qty);
      const receivedQty = toNum(l.received_qty);
      const closingQty = l.closing_qty === null ? null : toNum(l.closing_qty);
      const unitsOut = closingQty === null ? null : openingQty + receivedQty - closingQty;
      const unitPriceCents = toNum(l.unit_price_cents);
      const billedUnits = billed.get(l.inventory_item_id) ?? 0;
      return {
        itemId: l.inventory_item_id,
        name: l.inventory_item?.name ?? "",
        unit: l.inventory_item?.unit ?? "",
        openingQty,
        receivedQty,
        closingQty,
        unitsOut,
        leftQty: closingQty,
        unitPriceCents,
        revenueCents: unitsOut === null ? null : revenueCents(unitsOut, unitPriceCents),
        billedUnits,
        varianceUnits: unitsOut === null ? null : unitsOut - billedUnits,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    date,
    status,
    rows,
    totalUnitsOut: rows.reduce((n, r) => n + (r.unitsOut ?? 0), 0),
    totalLeftQty: rows.reduce((n, r) => n + (r.leftQty ?? 0), 0),
    totalRevenueCents: sum(rows.map((r) => r.revenueCents ?? 0)),
    billed: [...billed.values()].some((u) => u !== 0),
  };
}

async function computeEndOfDay(
  date: string,
  period: Period,
  businessId: string,
): Promise<EndOfDayReport> {
  const scope: DbScope = { client: createServiceClient(), businessId };
  const day = await getStockDayByDate(date, scope);
  if (!day) return summarizeEndOfDay(date, [], [], "none");

  const [lines, saleMovements] = await Promise.all([
    listStockCountLines(day.id, scope),
    listSaleMovements(period, scope),
  ]);
  return summarizeEndOfDay(date, lines, saleMovements, day.status);
}

async function loadEndOfDayReport(date: string): Promise<EndOfDayReport> {
  const { period, businessId } = await resolveTenantPeriodScope(singleDayPeriod(date));
  if (!businessId) return summarizeEndOfDay(date, [], [], "none");

  return unstable_cache(
    () => computeEndOfDay(date, period, businessId),
    ["end-of-day", businessId, periodCacheKey(period)],
    {
      tags: [
        businessTags.stock(businessId),
        businessTags.orders(businessId),
        businessTags.inventory(businessId),
      ],
      revalidate: 3600,
    },
  )();
}

/** End-of-Day merchandise report for the date (default: today). React-`cache()`d. */
export const getEndOfDayReport = cache(
  async (date?: string): Promise<EndOfDayReport> => {
    const day = date ?? (await resolveTenantPeriod({ kind: "today" })).startDate;
    return loadEndOfDayReport(day);
  },
);

// --- Dashboard summary (today) ----------------------------------------------

export type StockDaySummary = {
  date: string;
  status: StockDayStatus;
  itemCount: number;
  totalUnitsOut: number;
  totalLeftQty: number;
  totalRevenueCents: number;
};

/** Today's stock-take headline for the Dashboard card (reuses the report cache). */
export const getStockDaySummary = cache(async (): Promise<StockDaySummary> => {
  const report = await getEndOfDayReport();
  return {
    date: report.date,
    status: report.status,
    itemCount: report.rows.length,
    totalUnitsOut: report.totalUnitsOut,
    totalLeftQty: report.totalLeftQty,
    totalRevenueCents: report.totalRevenueCents,
  };
});

// --- Interactive stock-take session (LIVE, uncached) ------------------------

export type StockTakeLine = {
  lineId: string;
  itemId: string;
  name: string;
  unit: string;
  /** Stored barcode (GTIN), or null — lets a hardware scan jump to this line. */
  barcode: string | null;
  openingQty: number;
  receivedQty: number;
  closingQty: number | null;
  unitPriceCents: number;
  unitsOut: number | null;
  revenueCents: number | null;
};

/** A merchandise item ready to seed an Open-day form (opening = current on-hand). */
export type StockTakeDefault = {
  itemId: string;
  name: string;
  unit: string;
  /** Stored barcode (GTIN), or null — lets a hardware scan jump to this item. */
  barcode: string | null;
  openingQty: number;
  suggestedPriceCents: number;
};

export type StockTakeSession = {
  date: string;
  status: StockDayStatus;
  stockDayId: string | null;
  lines: StockTakeLine[];
  /** Merchandise items to seed an Open-day (used only when status is "none"). */
  defaults: StockTakeDefault[];
  totalRevenueCents: number;
};

function shapeSessionLines(lines: StockCountLineWithItem[]): StockTakeLine[] {
  return lines
    .map((l) => {
      const openingQty = toNum(l.opening_qty);
      const receivedQty = toNum(l.received_qty);
      const closingQty = l.closing_qty === null ? null : toNum(l.closing_qty);
      const unitsOut = closingQty === null ? null : openingQty + receivedQty - closingQty;
      const unitPriceCents = toNum(l.unit_price_cents);
      return {
        lineId: l.id,
        itemId: l.inventory_item_id,
        name: l.inventory_item?.name ?? "",
        unit: l.inventory_item?.unit ?? "",
        barcode: l.inventory_item?.barcode ?? null,
        openingQty,
        receivedQty,
        closingQty,
        unitPriceCents,
        unitsOut,
        revenueCents: unitsOut === null ? null : revenueCents(unitsOut, unitPriceCents),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function loadStockTakeSession(date: string): Promise<StockTakeSession> {
  // LIVE reads (RLS server client): the screen must reflect the caller's own
  // just-committed Open/Close, so no service cache here.
  const [day, merchItems, priceMap] = await Promise.all([
    getStockDayByDate(date),
    listMerchandiseItems(),
    listMerchandiseSalePrices(),
  ]);

  const defaults: StockTakeDefault[] = merchItems
    .map((it) => ({
      itemId: it.id,
      name: it.name,
      unit: it.unit,
      barcode: it.barcode,
      openingQty: toNum(it.qty_on_hand),
      suggestedPriceCents: priceMap.get(it.id) ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!day) {
    return {
      date,
      status: "none",
      stockDayId: null,
      lines: [],
      defaults,
      totalRevenueCents: 0,
    };
  }

  const lines = shapeSessionLines(await listStockCountLines(day.id));
  return {
    date,
    status: day.status,
    stockDayId: day.id,
    lines,
    defaults,
    totalRevenueCents: lines.reduce((acc, l) => add(acc, l.revenueCents ?? 0), 0),
  };
}

/** The interactive stock-take session for the date (default: today). React-`cache()`d. */
export const getStockTakeSession = cache(async (date?: string): Promise<StockTakeSession> => {
  const day = date ?? (await resolveTenantPeriod({ kind: "today" })).startDate;
  return loadStockTakeSession(day);
});

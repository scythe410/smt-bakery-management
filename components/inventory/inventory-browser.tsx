"use client";

// Inventory browser (SPEC §3.3, §5.1). Client component over the already-fetched
// tenant list: the "Low Stock" pill (live count, toggles the list to low-stock
// items only), a "Search ingredients…" box, a category filter (All + the
// categories actually present), the "+ Add Item" primary action, and the
// "Scan to Add" camera flow. Rows render as stacked list-rows (DESIGN.md §4
// tables→mobile), never a wide table. Filtering is client-side over the fetched
// rows; the Low-Stock count stays the true tenant count so it matches the nav
// badge. Item names are business data, shown as entered — not translated
// (CLAUDE.md §3).

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  Plus,
  PackagePlus,
  AlertTriangle,
  ClipboardList,
  ClipboardCheck,
  Croissant,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { AddItemForm } from "@/components/inventory/add-item-form";
import { ScanReceive, type ReceiveTarget } from "@/components/inventory/scan-receive";
import { setSalePrice } from "@/app/(app)/inventory/actions";
import { formatLKR } from "@/lib/format";
import type { InventoryListItem } from "@/lib/db/selectors/inventory";
import type { InventoryCategory } from "@/lib/inventory-config";

function formatQty(qty: number): string {
  return qty.toLocaleString("en-US", { maximumFractionDigits: 3 });
}

// Inline retail-price editor for sold-from-stock rows (AUDIT 1.1: the master
// price the scan-to-bill flow sells at previously had no write path in the UI).
// Unset price renders as a warn-toned "Set price" prompt — an unpriced sellable
// item can't be sold by scan, so the gap is surfaced where it's fixed.
function RowPriceEditor({ item }: { item: InventoryListItem }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState("");
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  function open() {
    setRaw(item.salePriceCents !== null ? (item.salePriceCents / 100).toFixed(2) : "");
    setFailed(false);
    setEditing(true);
  }

  function commit() {
    const major = Number(raw);
    if (!isFinite(major) || major < 0) {
      setEditing(false);
      return;
    }
    startTransition(async () => {
      const res = await setSalePrice({ inventoryItemId: item.id, salePriceMajor: major });
      setFailed(!res.ok);
      if (res.ok) setEditing(false);
    });
  }

  if (editing) {
    return (
      <div className="mt-1 flex flex-col items-end gap-1">
        <div className="flex items-center justify-end gap-1">
        <input
          type="text"
          inputMode="decimal"
          value={raw}
          autoFocus
          onChange={(e) => setRaw(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
            if (e.key === "Escape") setEditing(false);
          }}
          aria-label={t("inventory.price.inputLabel", { name: item.name })}
          className={`border-border focus-visible:ring-brand/40 text-caption text-ink h-7 w-20 rounded border bg-surface px-1.5 text-right tabular-nums outline-none focus-visible:ring-2 ${
            failed ? "border-danger" : ""
          }`}
        />
        <button
          type="button"
          onClick={commit}
          disabled={pending}
          className="text-caption text-brand h-7 rounded px-1.5 font-medium disabled:opacity-40"
        >
          {pending ? t("inventory.price.saving") : t("inventory.price.save")}
        </button>
        </div>
        {failed ? (
          <p role="alert" className="text-caption text-danger">
            {t("inventory.price.error")}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={open}
      className={`text-caption mt-1 block w-full text-right tabular-nums transition-colors ${
        item.salePriceCents === null
          ? "text-danger font-medium"
          : "text-muted hover:text-ink"
      }`}
    >
      {item.salePriceCents === null
        ? t("inventory.price.notSet")
        : t("inventory.price.at", { price: formatLKR(item.salePriceCents) })}
    </button>
  );
}

export function InventoryBrowser({
  items,
  lowStockCount,
  categories,
}: {
  items: InventoryListItem[];
  lowStockCount: number;
  categories: InventoryCategory[];
}) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [category, setCategory] = useState<InventoryCategory | "">("");
  const [query, setQuery] = useState("");
  const [lowOnly, setLowOnly] = useState(false);

  // code → the existing item to restock on a receive scan; an unknown code falls
  // through to the create flow.
  const barcodeIndex = useMemo(() => {
    const map = new Map<string, ReceiveTarget>();
    for (const it of items)
      if (it.barcode)
        map.set(it.barcode, { id: it.id, name: it.name, unit: it.unit, qtyOnHand: it.qtyOnHand });
    return map;
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (lowOnly && !it.isLowStock) return false;
      if (category && it.category !== category) return false;
      if (q && !it.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, lowOnly, category, query]);

  const isFiltered = lowOnly || category !== "" || query.trim() !== "";

  return (
    <div className="flex flex-col gap-3">
      {/* Low Stock pill — live count, toggles the low-stock-only filter */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setLowOnly((v) => !v)}
          aria-pressed={lowOnly}
          disabled={lowStockCount === 0}
          className={`rounded-pill text-label focus-visible:ring-brand/40 inline-flex h-8 items-center gap-1.5 border px-3 font-medium transition-colors outline-none focus-visible:ring-2 disabled:opacity-50 ${
            lowOnly
              ? "border-brand text-brand bg-[var(--red-tint)]"
              : "border-border-strong text-ink hover:bg-surface-2"
          }`}
        >
          <AlertTriangle className="size-4" aria-hidden />
          {t("inventory.lowStock")}
          <span
            className={`rounded-pill inline-flex min-w-5 items-center justify-center px-1.5 text-[11px] font-semibold tabular-nums ${
              lowOnly ? "bg-brand text-brand-white" : "bg-danger-bg text-danger"
            }`}
          >
            {lowStockCount}
          </span>
        </button>
      </div>

      {/* Primary + scan actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setScanning(false);
            setAdding((v) => !v);
          }}
          aria-expanded={adding}
          className="bg-brand text-brand-white text-label hover:bg-brand-ember flex h-10 flex-1 items-center justify-center gap-1 rounded-[var(--radius)] font-semibold transition-colors"
        >
          <Plus className="size-4" aria-hidden />
          {t("inventory.add.action")}
        </button>
        <button
          type="button"
          onClick={() => {
            setAdding(false);
            setScanning((v) => !v);
          }}
          aria-expanded={scanning}
          className="border-border-strong text-ink text-label hover:bg-surface-2 flex h-10 items-center gap-1 rounded-[var(--radius)] border px-3 font-medium transition-colors"
        >
          <PackagePlus className="size-4" aria-hidden />
          {t("inventory.receive.action")}
        </button>
      </div>

      {/* Reconciliation flows: daily merchandise count + periodic ingredient audit */}
      <div className="flex gap-2">
        <Link
          href="/inventory/stock-take"
          className="border-border-strong text-ink text-label hover:bg-surface-2 focus-visible:ring-brand/40 flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[var(--radius)] border font-medium transition-colors outline-none focus-visible:ring-2"
        >
          <ClipboardList className="size-4" aria-hidden />
          {t("stock.nav.stockTake")}
        </Link>
        <Link
          href="/inventory/audit"
          className="border-border-strong text-ink text-label hover:bg-surface-2 focus-visible:ring-brand/40 flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[var(--radius)] border font-medium transition-colors outline-none focus-visible:ring-2"
        >
          <ClipboardCheck className="size-4" aria-hidden />
          {t("stock.nav.audit")}
        </Link>
      </div>

      {/* Finished-good production lane: produce batches + reorder alerts (FT3) */}
      <Link
        href="/inventory/production"
        className="border-border-strong text-ink text-label hover:bg-surface-2 focus-visible:ring-brand/40 flex h-10 items-center justify-center gap-1.5 rounded-[var(--radius)] border font-medium transition-colors outline-none focus-visible:ring-2"
      >
        <Croissant className="size-4" aria-hidden />
        {t("production.nav")}
      </Link>

      {scanning ? (
        <Card>
          <ScanReceive barcodeIndex={barcodeIndex} onClose={() => setScanning(false)} />
        </Card>
      ) : null}

      {adding ? (
        <Card>
          <AddItemForm onDone={() => setAdding(false)} />
        </Card>
      ) : null}

      {/* Category filter + search */}
      <div className="flex gap-2">
        <select
          aria-label={t("inventory.filter.category")}
          value={category}
          onChange={(e) => setCategory(e.target.value as InventoryCategory | "")}
          className="border-border text-label text-ink focus-visible:ring-brand/40 bg-surface h-9 rounded-[var(--radius)] border px-2 outline-none focus-visible:ring-2"
        >
          <option value="">{t("inventory.filter.allCategories")}</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {t(`inventory.category.${c}`)}
            </option>
          ))}
        </select>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("inventory.searchPlaceholder")}
          className="border-border text-label text-ink focus-visible:ring-brand/40 bg-surface h-9 min-w-0 flex-1 rounded-[var(--radius)] border px-2 outline-none focus-visible:ring-2"
        />
      </div>

      {/* List */}
      <Card className="flex flex-col gap-3">
        {items.length === 0 ? (
          <p className="text-body text-muted py-2">{t("inventory.empty")}</p>
        ) : filtered.length === 0 ? (
          <p className="text-body text-muted py-2">{t("inventory.noMatch")}</p>
        ) : (
          <>
            <ul className="flex flex-col">
              {filtered.map((it) => (
                <li
                  key={it.id}
                  className="border-border flex items-start justify-between gap-3 border-b py-3 last:border-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-label text-ink truncate font-semibold">{it.name}</span>
                      {it.isLowStock ? (
                        <StatusPill tone="danger" label={t("inventory.lowBadge")} />
                      ) : null}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="text-caption text-muted">
                        {t(`inventory.category.${it.category}`)}
                      </span>
                      <span className="text-faint" aria-hidden>
                        ·
                      </span>
                      <StatusPill
                        tone={it.kind === "merchandise" ? "info" : "neutral"}
                        label={t(`inventory.kind.${it.kind}`)}
                      />
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    {it.qtyOnHand === null ? (
                      <span className="text-caption text-faint italic">
                        {t("inventory.notSet")}
                      </span>
                    ) : (
                      <>
                        <span className="text-label text-ink font-semibold tabular-nums">
                          {formatQty(it.qtyOnHand)}
                        </span>{" "}
                        <span className="text-caption text-muted">{it.unit}</span>
                      </>
                    )}
                    {it.kind === "merchandise" || it.kind === "finished_good" ? (
                      <RowPriceEditor item={it} />
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
            {isFiltered ? (
              <p className="text-caption text-faint">
                {t("inventory.showing", { shown: filtered.length, total: items.length })}
              </p>
            ) : null}
          </>
        )}
      </Card>
    </div>
  );
}

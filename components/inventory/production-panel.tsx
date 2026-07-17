"use client";

// Production panel (CLAUDE.md §4 FT3) — the finished-good lane. Three parts:
//   * Production Alerts: finished goods at/below their reorder threshold
//     ("Hot Dogs: 8 left — make another batch"). The same items feed the header
//     bell alert count.
//   * Produce-batch list: every finished good with its current stock and an inline
//     "Produce" control that adds N units (the morning "make 20" step) via the
//     produce_batch RPC (server-validated, RLS-scoped).
//   * End-of-day leftovers: daily-renewal finished goods don't carry over, so the
//     leftover report shows what's left per item (qty, optional cash value) and a
//     "Return" control that pulls it from stock via the return_finished_good RPC —
//     honest waste tracking, NOT a sale (no revenue posted, CLAUDE.md §8). Returned
//     quantities for today show per item so the next day opens fresh.
//
// Rows render as stacked list-rows (DESIGN.md §4 tables→mobile). Item names are
// business data, shown as entered — not translated (CLAUDE.md §3). Only the leftover
// cash VALUE is money and is gated to owner (canSeeValue); everything else is
// operational stock, open to owner/manager/staff.

import { useState, useTransition } from "react";
import { AlertTriangle, Croissant, Undo2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { formatLKR } from "@/lib/format";
import { produceBatch, returnFinishedGood } from "@/app/(app)/inventory/actions";
import type { FinishedGood, ProductionView } from "@/lib/db/selectors/inventory";

function formatQty(qty: number): string {
  return qty.toLocaleString("en-US", { maximumFractionDigits: 3 });
}

export function ProductionPanel({
  view,
  canSeeValue,
}: {
  view: ProductionView;
  canSeeValue: boolean;
}) {
  const { t } = useTranslation();
  const { items, alerts, totalLeftoverQty, totalLeftoverValueCents, totalReturnedTodayQty } = view;
  const [qtyById, setQtyById] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [returnBusyId, setReturnBusyId] = useState<string | null>(null);
  const [returnErrorId, setReturnErrorId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleProduce(id: string) {
    const raw = (qtyById[id] ?? "").trim();
    const qty = Number(raw);
    if (!Number.isFinite(qty) || qty <= 0) {
      setErrorId(id);
      return;
    }
    setErrorId(null);
    setBusyId(id);
    startTransition(async () => {
      const res = await produceBatch({ inventoryItemId: id, qty });
      setBusyId(null);
      if (res.error) {
        setErrorId(id);
      } else {
        setQtyById((prev) => ({ ...prev, [id]: "" }));
      }
    });
  }

  // Return the item's full leftover (qty on hand) — the daily end-of-day sweep.
  function handleReturn(item: FinishedGood) {
    if (item.leftoverQty <= 0) return;
    setReturnErrorId(null);
    setReturnBusyId(item.id);
    startTransition(async () => {
      const res = await returnFinishedGood({ inventoryItemId: item.id, qty: item.leftoverQty });
      setReturnBusyId(null);
      if (res.error) setReturnErrorId(item.id);
    });
  }

  // The leftover report lists items with something still on hand OR already
  // returned today (so the day's returns stay visible after the sweep).
  const leftoverRows = items.filter((i) => i.leftoverQty > 0 || i.returnedTodayQty > 0);

  return (
    <div className="flex flex-col gap-3">
      {/* Production alerts */}
      {alerts.length > 0 ? (
        <Card className="border-danger/40 flex flex-col gap-2">
          <div className="text-danger flex items-center gap-1.5">
            <AlertTriangle className="size-4" aria-hidden />
            <span className="text-label font-semibold">
              {t("production.alerts.title", { count: alerts.length })}
            </span>
          </div>
          <ul className="flex flex-col gap-1.5">
            {alerts.map((a) => (
              <li key={a.id} className="text-label text-ink flex items-baseline justify-between gap-2">
                <span className="truncate font-medium">{a.name}</span>
                <span className="text-caption text-danger shrink-0 tabular-nums">
                  {t("production.alerts.left", {
                    qty: formatQty(a.qtyOnHand),
                    unit: a.unit,
                  })}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-caption text-muted">{t("production.alerts.hint")}</p>
        </Card>
      ) : items.length > 0 ? (
        <Card className="text-body text-muted">{t("production.alerts.none")}</Card>
      ) : null}

      {/* Finished-good list with produce controls */}
      {items.length === 0 ? (
        <Card className="flex flex-col items-start gap-1 py-4">
          <p className="text-body text-ink">{t("production.empty.title")}</p>
          <p className="text-caption text-muted">{t("production.empty.body")}</p>
        </Card>
      ) : (
        <Card className="flex flex-col">
          <ul className="flex flex-col">
            {items.map((it) => (
              <li
                key={it.id}
                className="border-border flex items-center justify-between gap-3 border-b py-3 last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Croissant className="text-muted size-4 shrink-0" aria-hidden />
                    <span className="text-label text-ink truncate font-semibold">{it.name}</span>
                    {it.needsBatch ? (
                      <AlertTriangle className="text-danger size-3.5 shrink-0" aria-hidden />
                    ) : null}
                  </div>
                  <div className="mt-1">
                    <span
                      className={`text-caption tabular-nums ${
                        it.needsBatch ? "text-danger font-semibold" : "text-muted"
                      }`}
                    >
                      {t("production.inStock", { qty: formatQty(it.qtyOnHand), unit: it.unit })}
                    </span>
                  </div>
                  {errorId === it.id ? (
                    <p role="alert" className="text-caption text-danger mt-1">
                      {t("production.error")}
                    </p>
                  ) : null}
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <label className="sr-only" htmlFor={`produce-${it.id}`}>
                    {t("production.qtyLabel", { name: it.name })}
                  </label>
                  <input
                    id={`produce-${it.id}`}
                    type="text"
                    inputMode="decimal"
                    value={qtyById[it.id] ?? ""}
                    onChange={(e) =>
                      setQtyById((prev) => ({ ...prev, [it.id]: e.target.value }))
                    }
                    placeholder={t("production.qtyPlaceholder")}
                    className="border-border text-label text-ink focus-visible:ring-brand/40 h-9 w-16 rounded-[var(--radius)] border bg-surface px-2 text-center tabular-nums outline-none focus-visible:ring-2"
                  />
                  <button
                    type="button"
                    onClick={() => handleProduce(it.id)}
                    disabled={busyId === it.id}
                    className="bg-brand text-brand-white text-caption hover:bg-brand-ember focus-visible:ring-brand/40 h-9 rounded-[var(--radius)] px-3 font-semibold outline-none transition-colors focus-visible:ring-2 disabled:opacity-50"
                  >
                    {busyId === it.id ? t("production.producing") : t("production.produce")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* End-of-day leftover report + Return controls (daily-renewal finished goods) */}
      {items.length > 0 ? (
        <Card className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-h2 text-ink">{t("production.leftovers.title")}</span>
            <span className="text-caption text-muted tabular-nums">
              {t("production.leftovers.totalLeft", { qty: formatQty(totalLeftoverQty) })}
              {canSeeValue && totalLeftoverValueCents > 0
                ? ` · ${formatLKR(totalLeftoverValueCents)}`
                : ""}
            </span>
          </div>
          <p className="text-caption text-muted">{t("production.leftovers.hint")}</p>

          {leftoverRows.length === 0 ? (
            <p className="text-body text-muted py-2">{t("production.leftovers.empty")}</p>
          ) : (
            <ul className="flex flex-col">
              {leftoverRows.map((it) => (
                <li
                  key={it.id}
                  className="border-border flex items-center justify-between gap-3 border-b py-3 last:border-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <span className="text-label text-ink truncate font-semibold">{it.name}</span>
                    <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                      <span className="text-caption text-muted tabular-nums">
                        {t("production.leftovers.left", {
                          qty: formatQty(it.leftoverQty),
                          unit: it.unit,
                        })}
                      </span>
                      {canSeeValue && it.leftoverValueCents > 0 ? (
                        <>
                          <span className="text-faint" aria-hidden>
                            ·
                          </span>
                          <span className="text-caption text-muted tabular-nums">
                            {formatLKR(it.leftoverValueCents)}
                          </span>
                        </>
                      ) : null}
                      {it.returnedTodayQty > 0 ? (
                        <>
                          <span className="text-faint" aria-hidden>
                            ·
                          </span>
                          <span className="text-caption text-warning tabular-nums">
                            {t("production.leftovers.returnedToday", {
                              qty: formatQty(it.returnedTodayQty),
                              unit: it.unit,
                            })}
                          </span>
                        </>
                      ) : null}
                    </div>
                    {returnErrorId === it.id ? (
                      <p role="alert" className="text-caption text-danger mt-1">
                        {t("production.leftovers.error")}
                      </p>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleReturn(it)}
                    disabled={returnBusyId === it.id || it.leftoverQty <= 0}
                    className="border-border-strong text-ink text-caption hover:bg-surface-2 focus-visible:ring-brand/40 flex h-9 shrink-0 items-center gap-1.5 rounded-[var(--radius)] border px-3 font-medium outline-none transition-colors focus-visible:ring-2 disabled:opacity-50"
                  >
                    <Undo2 className="size-3.5" aria-hidden />
                    {returnBusyId === it.id
                      ? t("production.leftovers.returning")
                      : t("production.leftovers.return")}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {totalReturnedTodayQty > 0 ? (
            <p className="text-caption text-faint tabular-nums">
              {t("production.leftovers.totalReturned", {
                qty: formatQty(totalReturnedTodayQty),
              })}
            </p>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}

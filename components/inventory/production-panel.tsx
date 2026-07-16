"use client";

// Production panel (CLAUDE.md §4 FT3) — the finished-good lane. Two parts:
//   * Production Alerts: finished goods at/below their reorder threshold
//     ("Hot Dogs: 8 left — make another batch"). The same items feed the header
//     bell alert count.
//   * Produce-batch list: every finished good with its current stock and an inline
//     "Produce" control that adds N units (the morning "make 20" step) via the
//     produce_batch RPC (server-validated, RLS-scoped).
//
// Rows render as stacked list-rows (DESIGN.md §4 tables→mobile). Item names are
// business data, shown as entered — not translated (CLAUDE.md §3). No revenue is
// shown here — this is operational stock, open to owner/manager/staff.

import { useState, useTransition } from "react";
import { AlertTriangle, Croissant } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { produceBatch } from "@/app/(app)/inventory/actions";
import type { FinishedGood } from "@/lib/db/selectors/inventory";

function formatQty(qty: number): string {
  return qty.toLocaleString("en-US", { maximumFractionDigits: 3 });
}

export function ProductionPanel({
  items,
  alerts,
}: {
  items: FinishedGood[];
  alerts: FinishedGood[];
}) {
  const { t } = useTranslation();
  const [qtyById, setQtyById] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
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
    </div>
  );
}

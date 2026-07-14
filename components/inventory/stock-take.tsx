"use client";

// Daily merchandise stock-take (open → close). One client component over the
// already-loaded session; it renders one of three states:
//   * none   — "Open day": seed opening counts (prefilled from on-hand) + a
//              selling-price snapshot per merchandise item, then open.
//   * open   — "Close day": enter the evening closing count (+ any mid-day
//              received) per item; units out + revenue update live.
//   * closed — read-only summary (opening / received / out / left / revenue) with
//              a link to the End-of-Day report.
// Revenue figures render only for owner/manager (canSeeRevenue); staff run the
// counts but don't see money (CLAUDE.md §5). Item names are business data, shown
// as entered — not translated (§3). All money is pre-integer cents; formatLKR is
// render-time only. Loading/empty/error states per DESIGN.md §6.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PackageOpen, Lock, FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { formatLKR } from "@/lib/format";
import { openStockDay, closeStockDay } from "@/app/(app)/inventory/stock-take/actions";
import type { StockTakeSession } from "@/lib/db/selectors/stock";

const FIELD =
  "border-border text-label text-ink focus-visible:ring-brand/40 bg-surface h-9 w-24 rounded-[var(--radius)] border px-2 text-right tabular-nums outline-none focus-visible:ring-2";

function fmtQty(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 3 });
}

export function StockTake({
  session,
  canSeeRevenue,
}: {
  session: StockTakeSession;
  canSeeRevenue: boolean;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // --- Open-day form state (status "none") ---
  const [openInputs, setOpenInputs] = useState<Record<string, { opening: string; price: string }>>(
    () =>
      Object.fromEntries(
        session.defaults.map((d) => [
          d.itemId,
          { opening: String(d.openingQty), price: (d.suggestedPriceCents / 100).toFixed(2) },
        ]),
      ),
  );

  // --- Close-day form state (status "open") ---
  const [closeInputs, setCloseInputs] = useState<Record<string, { closing: string; received: string }>>(
    () =>
      Object.fromEntries(
        session.lines.map((l) => [l.lineId, { closing: "", received: String(l.receivedQty) }]),
      ),
  );

  function submitOpen() {
    setError(null);
    const lines = session.defaults.map((d) => ({
      inventoryItemId: d.itemId,
      openingQty: Number(openInputs[d.itemId]?.opening || 0),
      unitPriceMajor: Number(openInputs[d.itemId]?.price || 0),
    }));
    startTransition(async () => {
      const res = await openStockDay({ date: session.date, lines });
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  function submitClose() {
    if (!session.stockDayId) return;
    setError(null);
    const lines = session.lines.map((l) => ({
      lineId: l.lineId,
      closingQty: Number(closeInputs[l.lineId]?.closing || 0),
      receivedQty: Number(closeInputs[l.lineId]?.received || 0),
    }));
    startTransition(async () => {
      const res = await closeStockDay({ stockDayId: session.stockDayId!, lines });
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  const errorBlock = error ? (
    <p role="alert" className="text-caption text-danger">
      {t(error)}
    </p>
  ) : null;

  // === CLOSED — read-only summary ===========================================
  if (session.status === "closed") {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <StatusPill tone="success" label={t("stock.status.closed")} />
          <Link
            href={`/reports?type=end_of_day&date=${session.date}`}
            className="border-border-strong text-label text-ink hover:bg-surface-2 focus-visible:ring-brand/40 flex h-9 items-center gap-1.5 rounded-[var(--radius)] border px-3 font-medium outline-none transition-colors focus-visible:ring-2"
          >
            <FileText className="size-4" aria-hidden />
            {t("stock.viewReport")}
          </Link>
        </div>
        <Card className="flex flex-col gap-3">
          {session.lines.length === 0 ? (
            <p className="text-body text-muted py-2">{t("stock.empty")}</p>
          ) : (
            <ul className="flex flex-col">
              {session.lines.map((l) => (
                <li key={l.lineId} className="border-border flex flex-col gap-1 border-b py-3 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-label text-ink truncate font-semibold">{l.name}</span>
                    {canSeeRevenue ? (
                      <span className="text-label text-success font-semibold tabular-nums">
                        {formatLKR(l.revenueCents ?? 0)}
                      </span>
                    ) : null}
                  </div>
                  <div className="text-caption text-muted flex flex-wrap gap-x-3 gap-y-0.5 tabular-nums">
                    <span>{t("stock.col.opening")}: {fmtQty(l.openingQty)}</span>
                    <span>{t("stock.col.received")}: {fmtQty(l.receivedQty)}</span>
                    <span>{t("stock.col.out")}: {l.unitsOut === null ? "—" : fmtQty(l.unitsOut)}</span>
                    <span>{t("stock.col.left")}: {l.closingQty === null ? "—" : fmtQty(l.closingQty)} {l.unit}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {canSeeRevenue && session.lines.length > 0 ? (
            <div className="border-border flex items-center justify-between border-t pt-3">
              <span className="text-label text-ink font-semibold">{t("stock.totalRevenue")}</span>
              <span className="text-label text-success font-semibold tabular-nums">
                {formatLKR(session.totalRevenueCents)}
              </span>
            </div>
          ) : null}
        </Card>
      </div>
    );
  }

  // === OPEN — close-day form ================================================
  if (session.status === "open") {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <StatusPill tone="warning" label={t("stock.status.open")} />
          <span className="text-caption text-muted">{t("stock.close.hint")}</span>
        </div>
        <Card className="flex flex-col gap-3">
          {session.lines.length === 0 ? (
            <p className="text-body text-muted py-2">{t("stock.empty")}</p>
          ) : (
            <ul className="flex flex-col">
              {session.lines.map((l) => {
                const received = Number(closeInputs[l.lineId]?.received || 0);
                const closingStr = closeInputs[l.lineId]?.closing ?? "";
                const closing = Number(closingStr || 0);
                const out = closingStr === "" ? null : l.openingQty + received - closing;
                const rev = out === null ? null : Math.round(out * l.unitPriceCents);
                return (
                  <li key={l.lineId} className="border-border flex flex-col gap-2 border-b py-3 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-label text-ink truncate font-semibold">{l.name}</span>
                      <span className="text-caption text-muted tabular-nums">
                        {t("stock.col.opening")} {fmtQty(l.openingQty)} {l.unit}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="flex flex-col gap-1">
                        <span className="text-caption text-muted">{t("stock.col.received")}</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.001"
                          min="0"
                          value={closeInputs[l.lineId]?.received ?? ""}
                          onChange={(e) =>
                            setCloseInputs((s) => ({
                              ...s,
                              [l.lineId]: { ...s[l.lineId], received: e.target.value },
                            }))
                          }
                          className={FIELD}
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-caption text-muted">{t("stock.col.closing")}</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.001"
                          min="0"
                          placeholder={t("stock.close.countPlaceholder")}
                          value={closeInputs[l.lineId]?.closing ?? ""}
                          onChange={(e) =>
                            setCloseInputs((s) => ({
                              ...s,
                              [l.lineId]: { ...s[l.lineId], closing: e.target.value },
                            }))
                          }
                          className={FIELD}
                        />
                      </label>
                      <div className="text-caption text-muted flex flex-col gap-0.5 tabular-nums">
                        <span>{t("stock.col.out")}: {out === null ? "—" : fmtQty(out)}</span>
                        {canSeeRevenue ? (
                          <span className="text-success">{rev === null ? "—" : formatLKR(rev)}</span>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {errorBlock}
          <button
            type="button"
            onClick={submitClose}
            disabled={pending || session.lines.length === 0}
            className="bg-brand text-brand-white text-label hover:bg-brand-ember flex h-11 items-center justify-center gap-1.5 rounded-[var(--radius)] font-semibold transition-colors disabled:opacity-50"
          >
            <Lock className="size-4" aria-hidden />
            {pending ? t("stock.close.saving") : t("stock.close.action")}
          </button>
        </Card>
      </div>
    );
  }

  // === NONE — open-day form =================================================
  return (
    <div className="flex flex-col gap-3">
      <span className="text-caption text-muted">{t("stock.open.hint")}</span>
      <Card className="flex flex-col gap-3">
        {session.defaults.length === 0 ? (
          <p className="text-body text-muted py-2">{t("stock.noMerchandise")}</p>
        ) : (
          <ul className="flex flex-col">
            {session.defaults.map((d) => (
              <li key={d.itemId} className="border-border flex flex-col gap-2 border-b py-3 last:border-0 last:pb-0">
                <span className="text-label text-ink truncate font-semibold">{d.name}</span>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-caption text-muted">
                      {t("stock.col.opening")} ({d.unit})
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.001"
                      min="0"
                      value={openInputs[d.itemId]?.opening ?? ""}
                      onChange={(e) =>
                        setOpenInputs((s) => ({
                          ...s,
                          [d.itemId]: { ...s[d.itemId], opening: e.target.value },
                        }))
                      }
                      className={FIELD}
                    />
                  </label>
                  {canSeeRevenue ? (
                    <label className="flex flex-col gap-1">
                      <span className="text-caption text-muted">{t("stock.col.price")} (LKR)</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        value={openInputs[d.itemId]?.price ?? ""}
                        onChange={(e) =>
                          setOpenInputs((s) => ({
                            ...s,
                            [d.itemId]: { ...s[d.itemId], price: e.target.value },
                          }))
                        }
                        className={FIELD}
                      />
                    </label>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        {errorBlock}
        <button
          type="button"
          onClick={submitOpen}
          disabled={pending || session.defaults.length === 0}
          className="bg-brand text-brand-white text-label hover:bg-brand-ember flex h-11 items-center justify-center gap-1.5 rounded-[var(--radius)] font-semibold transition-colors disabled:opacity-50"
        >
          <PackageOpen className="size-4" aria-hidden />
          {pending ? t("stock.open.saving") : t("stock.open.action")}
        </button>
      </Card>
    </div>
  );
}

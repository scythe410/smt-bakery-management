"use client";

// New-order form (SPEC §3.4). The client picks a source, optional customer,
// payment method/status, and menu lines with quantities — and sends ONLY the
// menu item ids + quantities (a JSON `items` field). It never sends a price or a
// total: the server looks up stored prices and recomputes subtotal, commission,
// and total (CLAUDE.md §7.7). The figure shown here is an on-screen ESTIMATE from
// the same stored prices for UX; it is explicitly labelled as such, and the saved
// order uses the server's recomputation. Item names/prices are business data,
// shown as entered/stored — not translated (CLAUDE.md §3).

import { useActionState, useEffect, useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { createOrder, type CreateOrderState } from "@/app/(app)/orders/actions";
import { formatLKR } from "@/lib/format";
import {
  ORDER_SOURCES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
} from "@/lib/orders/order-config";
import type { NewOrderMenuItem } from "@/lib/db/selectors/orders";

const FIELD_CLASS =
  "border-border text-label text-ink focus-visible:ring-brand/40 h-10 rounded-[var(--radius)] border bg-surface px-2 outline-none focus-visible:ring-2";

export function NewOrderForm({
  menu,
  onDone,
}: {
  menu: NewOrderMenuItem[];
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [qtyById, setQtyById] = useState<Record<string, number>>({});
  const [state, formAction, pending] = useActionState<CreateOrderState, FormData>(createOrder, {});

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  function bump(id: string, delta: number) {
    setQtyById((prev) => {
      const next = Math.max(0, (prev[id] ?? 0) + delta);
      const copy = { ...prev };
      if (next === 0) delete copy[id];
      else copy[id] = next;
      return copy;
    });
  }

  const lines = useMemo(
    () => Object.entries(qtyById).map(([menuItemId, qty]) => ({ menuItemId, qty })),
    [qtyById],
  );

  // On-screen estimate only — the server recomputes the authoritative total.
  const estimatedCents = useMemo(() => {
    const priceById = new Map(menu.map((m) => [m.id, m.priceCents]));
    return lines.reduce((sum, l) => sum + (priceById.get(l.menuItemId) ?? 0) * l.qty, 0);
  }, [lines, menu]);

  const itemsJson = JSON.stringify(lines);
  const totalQty = lines.reduce((n, l) => n + l.qty, 0);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-caption text-muted">{t("orders.new.source")}</span>
          <select name="source" defaultValue={ORDER_SOURCES[0]} className={FIELD_CLASS}>
            {ORDER_SOURCES.map((s) => (
              <option key={s} value={s}>
                {t(`source.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-caption text-muted">{t("orders.new.customer")}</span>
          <input
            type="text"
            name="customerName"
            maxLength={120}
            placeholder={t("orders.new.customerPlaceholder")}
            className={FIELD_CLASS}
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-caption text-muted">{t("orders.new.paymentMethod")}</span>
          <select name="paymentMethod" defaultValue={PAYMENT_METHODS[0]} className={FIELD_CLASS}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {t(`orders.payment.${m}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-caption text-muted">{t("orders.new.paymentStatus")}</span>
          <select name="paymentStatus" defaultValue={PAYMENT_STATUSES[0]} className={FIELD_CLASS}>
            {PAYMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`orders.paymentStatus.${s}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Menu line picker */}
      <div className="flex flex-col gap-1">
        <span className="text-caption text-muted">{t("orders.new.items")}</span>
        {menu.length === 0 ? (
          <p className="text-caption text-muted py-2">{t("orders.new.noMenu")}</p>
        ) : (
          <ul className="border-border max-h-64 divide-y overflow-y-auto rounded-[var(--radius)] border">
            {menu.map((m) => {
              const qty = qtyById[m.id] ?? 0;
              return (
                <li key={m.id} className="flex items-center justify-between gap-2 px-2 py-2">
                  <div className="min-w-0">
                    <p className="text-label text-ink truncate">{m.name}</p>
                    <p className="text-caption text-muted tabular-nums">{formatLKR(m.priceCents)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => bump(m.id, -1)}
                      disabled={qty === 0}
                      aria-label={t("orders.new.decrease", { name: m.name })}
                      className="border-border-strong text-ink hover:bg-surface-2 flex size-8 items-center justify-center rounded-[var(--radius)] border disabled:opacity-40"
                    >
                      <Minus className="size-4" aria-hidden />
                    </button>
                    <span className="text-label w-5 text-center tabular-nums" aria-live="polite">
                      {qty}
                    </span>
                    <button
                      type="button"
                      onClick={() => bump(m.id, 1)}
                      aria-label={t("orders.new.increase", { name: m.name })}
                      className="border-border-strong text-ink hover:bg-surface-2 flex size-8 items-center justify-center rounded-[var(--radius)] border"
                    >
                      <Plus className="size-4" aria-hidden />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Estimated total — server recomputes the authoritative figure on save */}
      <div className="bg-surface-2 flex items-center justify-between rounded-[var(--radius)] px-3 py-2">
        <span className="text-caption text-muted">
          {t("orders.new.estTotal")} · {t("orders.new.itemsCount", { count: totalQty })}
        </span>
        <span className="text-label text-ink font-semibold tabular-nums">
          {formatLKR(estimatedCents)}
        </span>
      </div>

      <input type="hidden" name="items" value={itemsJson} readOnly />

      {state.error ? (
        <p role="alert" className="text-caption text-danger">
          {t(state.error)}
        </p>
      ) : null}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending || lines.length === 0}
          className="bg-brand text-brand-white text-label hover:bg-brand-ember h-10 flex-1 rounded-[var(--radius)] font-semibold transition-colors disabled:opacity-50"
        >
          {pending ? t("orders.new.saving") : t("orders.new.save")}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="border-border-strong text-ink text-label hover:bg-surface-2 h-10 rounded-[var(--radius)] border px-4 font-medium transition-colors"
        >
          {t("orders.new.cancel")}
        </button>
      </div>
    </form>
  );
}

"use client";

// New-order form (SPEC §3.4). The client picks a source, optional customer,
// payment method/status, and menu lines with quantities — and sends ONLY the
// menu item ids + quantities (a JSON `items` field). It never sends a price or a
// total: the server looks up stored prices and recomputes subtotal, commission,
// and total (CLAUDE.md §7.7). The figure shown here is an on-screen ESTIMATE from
// the same stored prices for UX; it is explicitly labelled as such, and the saved
// order uses the server's recomputation. Item names/prices are business data,
// shown as entered/stored — not translated (CLAUDE.md §3).
//
// Quick-add: cashier types an item code (integer) and presses Enter — the item is
// added with qty 1. Falls back to name-substring search if no code matches.
// Qty for in-cart items is directly editable (CF2 pattern: type="text").

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, Search, X } from "lucide-react";
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
  const searchRef = useRef<HTMLInputElement>(null);

  // Canonical integer qty per menu item (0 = not in order).
  const [qtyById, setQtyById] = useState<Record<string, number>>({});
  // Raw string values for the editable qty text inputs (CF2: never sanitize mid-type).
  const [qtyRaw, setQtyRaw] = useState<Record<string, string>>({});
  // Quick-add / search query.
  const [quickAdd, setQuickAdd] = useState("");

  const [state, formAction, pending] = useActionState<CreateOrderState, FormData>(createOrder, {});

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  // Filter menu by quick-add query: pure integer → code lookup (with name fallback),
  // anything else → name substring.
  const filteredMenu = useMemo(() => {
    const q = quickAdd.trim();
    if (!q) return menu;
    const asInt = parseInt(q, 10);
    if (!isNaN(asInt) && asInt > 0 && String(asInt) === q) {
      const byCode = menu.filter((m) => m.itemCode === asInt);
      if (byCode.length > 0) return byCode;
    }
    const lower = q.toLowerCase();
    return menu.filter((m) => m.name.toLowerCase().includes(lower));
  }, [menu, quickAdd]);

  function addItem(id: string) {
    const next = (qtyById[id] ?? 0) + 1;
    setQtyById((prev) => ({ ...prev, [id]: next }));
    setQtyRaw((prev) => ({ ...prev, [id]: String(next) }));
    setQuickAdd("");
    searchRef.current?.focus();
  }

  function bump(id: string, delta: number) {
    const next = Math.max(0, (qtyById[id] ?? 0) + delta);
    setQtyById((prev) => {
      const copy = { ...prev };
      if (next === 0) delete copy[id];
      else copy[id] = next;
      return copy;
    });
    setQtyRaw((prev) => {
      const copy = { ...prev };
      if (next === 0) delete copy[id];
      else copy[id] = String(next);
      return copy;
    });
  }

  function handleQtyChange(id: string, raw: string) {
    setQtyRaw((prev) => ({ ...prev, [id]: raw }));
  }

  function commitQty(id: string) {
    const parsed = parseInt(qtyRaw[id] ?? "", 10);
    if (!isFinite(parsed) || parsed <= 0) {
      setQtyById((prev) => { const c = { ...prev }; delete c[id]; return c; });
      setQtyRaw((prev) => { const c = { ...prev }; delete c[id]; return c; });
    } else {
      setQtyById((prev) => ({ ...prev, [id]: parsed }));
      setQtyRaw((prev) => ({ ...prev, [id]: String(parsed) }));
    }
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
      {/* Source + customer */}
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

      {/* Quick-add / item picker */}
      <div className="flex flex-col gap-1.5">
        <span className="text-caption text-muted">{t("orders.new.items")}</span>

        {menu.length === 0 ? (
          <p className="text-caption text-muted py-1">{t("orders.new.noMenu")}</p>
        ) : (
          <>
            {/* Code / name search bar */}
            <div className="relative">
              <Search
                className="text-muted absolute left-2.5 top-1/2 size-4 -translate-y-1/2"
                aria-hidden
              />
              <input
                ref={searchRef}
                type="text"
                value={quickAdd}
                onChange={(e) => setQuickAdd(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const first = filteredMenu[0];
                    if (first) addItem(first.id);
                  }
                }}
                placeholder={t("orders.new.searchPlaceholder")}
                className={`${FIELD_CLASS} pl-8 ${quickAdd ? "pr-8" : ""}`}
              />
              {quickAdd ? (
                <button
                  type="button"
                  onClick={() => { setQuickAdd(""); searchRef.current?.focus(); }}
                  aria-label={t("orders.new.clearSearch")}
                  className="text-muted hover:text-ink absolute right-2.5 top-1/2 -translate-y-1/2 transition-colors"
                >
                  <X className="size-4" aria-hidden />
                </button>
              ) : null}
            </div>

            {/* Item list — no max-h, page scroll handles overflow */}
            {filteredMenu.length === 0 ? (
              <p className="text-caption text-muted py-1">
                {t("orders.new.noMatch", { query: quickAdd.trim() })}
              </p>
            ) : (
              <ul className="border-border divide-border divide-y rounded-[var(--radius)] border">
                {filteredMenu.map((m) => {
                  const qty = qtyById[m.id] ?? 0;
                  const inCart = qty > 0;
                  return (
                    <li
                      key={m.id}
                      className={`flex items-center gap-2 px-2 py-1.5 transition-colors ${
                        inCart ? "bg-[var(--red-tint)]" : ""
                      }`}
                    >
                      {/* Item code chip */}
                      <span className="text-caption text-muted w-7 shrink-0 text-right tabular-nums">
                        #{m.itemCode}
                      </span>

                      {/* Name + price — tap to add 1 */}
                      <button
                        type="button"
                        onClick={() => addItem(m.id)}
                        className="flex min-w-0 flex-1 flex-col text-left"
                      >
                        <span
                          className={`text-label truncate ${
                            inCart ? "text-ink font-semibold" : "text-ink"
                          }`}
                        >
                          {m.name}
                        </span>
                        <span className="text-caption text-muted tabular-nums">
                          {formatLKR(m.priceCents)}
                        </span>
                      </button>

                      {/* Stepper — shows qty input when in cart */}
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => bump(m.id, -1)}
                          disabled={!inCart}
                          aria-label={t("orders.new.decrease", { name: m.name })}
                          className="border-border-strong text-ink hover:bg-surface-2 flex size-7 items-center justify-center rounded-[var(--radius)] border disabled:opacity-30"
                        >
                          <Minus className="size-3.5" aria-hidden />
                        </button>

                        {inCart ? (
                          <input
                            type="text"
                            inputMode="numeric"
                            value={qtyRaw[m.id] ?? String(qty)}
                            onChange={(e) => handleQtyChange(m.id, e.target.value)}
                            onBlur={() => commitQty(m.id)}
                            aria-label={t("orders.new.qtyFor", { name: m.name })}
                            className="border-border focus-visible:ring-brand/40 text-label text-ink h-7 w-9 rounded border text-center tabular-nums outline-none focus-visible:ring-2"
                          />
                        ) : (
                          <span className="text-faint w-9 text-center text-sm tabular-nums">
                            —
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => bump(m.id, 1)}
                          aria-label={t("orders.new.increase", { name: m.name })}
                          className="border-border-strong text-ink hover:bg-surface-2 flex size-7 items-center justify-center rounded-[var(--radius)] border"
                        >
                          <Plus className="size-3.5" aria-hidden />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
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

      {/* Payment method + status (below items — cashier picks items first) */}
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

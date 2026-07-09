"use client";

// Orders browser (SPEC §3.4). Client component over the tenant's fetched orders:
// Active/Archived tabs (driven by order.status via the shared tab map), a
// "Search by ID or customer" box, a filter row (All Sources / All Statuses /
// All Payments + a date), the "+ New Order" flow, and stacked list-rows
// (DESIGN.md §4 tables→mobile) showing order no, source, customer (or —), item
// count, total, and payment + status pills. Filtering is client-side over the
// fetched set; order numbers/customer names are business data, shown as entered
// (not translated, CLAUDE.md §3).

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { StatusPill, type Tone } from "@/components/ui/status-pill";
import { NewOrderForm } from "@/components/orders/new-order-form";
import { formatLKR } from "@/lib/format";
import {
  ORDER_SOURCES,
  ORDER_STATUSES,
  PAYMENT_METHODS,
} from "@/lib/orders/order-config";
import type {
  OrderSource,
  OrderStatus,
  OrderTab,
  PaymentMethod,
} from "@/lib/orders/order-config";
import type { OrderListItem, NewOrderMenuItem } from "@/lib/db/selectors/orders";

const STATUS_TONE: Record<OrderStatus, Tone> = {
  pending: "warning",
  completed: "success",
  cancelled: "danger",
};

const PAYMENT_STATUS_TONE: Record<string, Tone> = {
  paid: "success",
  unpaid: "warning",
  refunded: "danger",
};

const TABS: OrderTab[] = ["active", "archived"];

export function OrdersBrowser({
  orders,
  menu,
}: {
  orders: OrderListItem[];
  menu: NewOrderMenuItem[];
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<OrderTab>("active");
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<OrderSource | "">("");
  const [status, setStatus] = useState<OrderStatus | "">("");
  const [payment, setPayment] = useState<PaymentMethod | "">("");
  const [date, setDate] = useState("");

  const counts = useMemo(() => {
    let active = 0;
    let archived = 0;
    for (const o of orders) {
      if (o.tab === "active") active += 1;
      else archived += 1;
    }
    return { active, archived };
  }, [orders]);

  const inTab = useMemo(() => orders.filter((o) => o.tab === tab), [orders, tab]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inTab.filter((o) => {
      if (source && o.source !== source) return false;
      if (status && o.status !== status) return false;
      if (payment && o.paymentMethod !== payment) return false;
      if (date && o.dateKey !== date) return false;
      if (q) {
        const hay = `${o.orderNo} ${o.customerName ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [inTab, source, status, payment, date, query]);

  const isFiltered =
    query.trim() !== "" || source !== "" || status !== "" || payment !== "" || date !== "";

  const selectClass =
    "border-border text-label text-ink focus-visible:ring-brand/40 bg-surface h-9 min-w-0 rounded-[var(--radius)] border px-2 outline-none focus-visible:ring-2";

  return (
    <div className="flex flex-col gap-3">
      {/* Active / Archived tabs */}
      <div role="tablist" className="border-border flex gap-1 border-b">
        {TABS.map((key) => {
          const isActive = tab === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setTab(key)}
              className={`text-label flex min-h-11 items-center gap-1.5 border-b-2 px-3 font-medium transition-colors ${
                isActive ? "border-brand text-brand" : "text-muted hover:text-ink border-transparent"
              }`}
            >
              {t(`orders.tabs.${key}`)}
              <span className="text-caption text-faint tabular-nums">
                {key === "active" ? counts.active : counts.archived}
              </span>
            </button>
          );
        })}
      </div>

      {/* New order */}
      <button
        type="button"
        onClick={() => setCreating((v) => !v)}
        aria-expanded={creating}
        className="bg-brand text-brand-white text-label hover:bg-brand-ember flex h-10 items-center justify-center gap-1 rounded-[var(--radius)] font-semibold transition-colors"
      >
        <Plus className="size-4" aria-hidden />
        {t("orders.new.action")}
      </button>

      {creating ? (
        <Card>
          <NewOrderForm menu={menu} onDone={() => setCreating(false)} />
        </Card>
      ) : null}

      {/* Search */}
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("orders.searchPlaceholder")}
        className="border-border text-label text-ink focus-visible:ring-brand/40 bg-surface h-9 w-full rounded-[var(--radius)] border px-2 outline-none focus-visible:ring-2"
      />

      {/* Filter row */}
      <div className="grid grid-cols-2 gap-2">
        <select
          aria-label={t("orders.filter.source")}
          value={source}
          onChange={(e) => setSource(e.target.value as OrderSource | "")}
          className={selectClass}
        >
          <option value="">{t("orders.filter.allSources")}</option>
          {ORDER_SOURCES.map((s) => (
            <option key={s} value={s}>
              {t(`source.${s}`)}
            </option>
          ))}
        </select>
        <select
          aria-label={t("orders.filter.status")}
          value={status}
          onChange={(e) => setStatus(e.target.value as OrderStatus | "")}
          className={selectClass}
        >
          <option value="">{t("orders.filter.allStatuses")}</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`orders.status.${s}`)}
            </option>
          ))}
        </select>
        <select
          aria-label={t("orders.filter.payment")}
          value={payment}
          onChange={(e) => setPayment(e.target.value as PaymentMethod | "")}
          className={selectClass}
        >
          <option value="">{t("orders.filter.allPayments")}</option>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {t(`orders.payment.${m}`)}
            </option>
          ))}
        </select>
        <input
          type="date"
          aria-label={t("orders.filter.date")}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={selectClass}
        />
      </div>

      {/* List */}
      <Card className="flex flex-col gap-3">
        {inTab.length === 0 ? (
          <p className="text-body text-muted py-2">{t(`orders.empty.${tab}`)}</p>
        ) : filtered.length === 0 ? (
          <p className="text-body text-muted py-2">{t("orders.noMatch")}</p>
        ) : (
          <>
            <ul className="flex flex-col">
              {filtered.map((o) => (
                <li
                  key={o.id}
                  className="border-border flex flex-col gap-1.5 border-b py-3 last:border-0 last:pb-0"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-label text-ink font-semibold tabular-nums">
                      {o.orderNo}
                    </span>
                    <span className="text-label text-ink shrink-0 font-semibold tabular-nums">
                      {formatLKR(o.totalCents)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                    <StatusPill tone="neutral" label={t(`source.${o.source}`)} />
                    <span className="text-caption text-muted truncate">
                      {o.customerName ?? "—"}
                    </span>
                    <span className="text-faint" aria-hidden>
                      ·
                    </span>
                    <span className="text-caption text-muted tabular-nums">
                      {t("orders.itemsCount", { count: o.itemCount })}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {o.paymentMethod ? (
                      <StatusPill tone="neutral" label={t(`orders.payment.${o.paymentMethod}`)} />
                    ) : null}
                    <StatusPill
                      tone={PAYMENT_STATUS_TONE[o.paymentStatus] ?? "neutral"}
                      label={t(`orders.paymentStatus.${o.paymentStatus}`)}
                    />
                    <StatusPill tone={STATUS_TONE[o.status]} label={t(`orders.status.${o.status}`)} />
                  </div>
                </li>
              ))}
            </ul>
            {isFiltered ? (
              <p className="text-caption text-faint">
                {t("orders.showing", { shown: filtered.length, total: inTab.length })}
              </p>
            ) : null}
          </>
        )}
      </Card>
    </div>
  );
}

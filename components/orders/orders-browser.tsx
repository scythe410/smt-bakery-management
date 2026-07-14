"use client";

// Orders browser (SPEC §3.4). Client component over the tenant's orders, but the
// data is now filtered and PAGINATED IN THE DATABASE (Antigravity HIGH-1): it
// holds one page at a time and calls the fetchOrders server action whenever the
// tab / search / filters change (page 0) or "Load more" is pressed (next page).
// The Active/Archived tabs, source/status/payment/date filters, and search are DB
// predicates, not a client scan of the whole history. The first page + tab counts
// are seeded from the server (props) so first paint has data with no round trip.
// Order numbers / customer names are business data, shown as entered (not
// translated, CLAUDE.md §3).

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Plus, Printer } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { StatusPill, type Tone } from "@/components/ui/status-pill";
import { NewOrderForm } from "@/components/orders/new-order-form";
import { fetchOrders } from "@/app/(app)/orders/actions";
import { formatLKR } from "@/lib/format";
import { ORDER_SOURCES, ORDER_STATUSES, PAYMENT_METHODS } from "@/lib/orders/order-config";
import type {
  OrderSource,
  OrderStatus,
  OrderTab,
  PaymentMethod,
} from "@/lib/orders/order-config";
import type {
  OrderListItem,
  OrderTabCounts,
  OrdersPageResult,
  NewOrderMenuItem,
} from "@/lib/db/selectors/orders";

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
  initial,
  counts,
  menu,
}: {
  initial: OrdersPageResult;
  counts: OrderTabCounts;
  menu: NewOrderMenuItem[];
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<OrderTab>("active");
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [source, setSource] = useState<OrderSource | "">("");
  const [status, setStatus] = useState<OrderStatus | "">("");
  const [payment, setPayment] = useState<PaymentMethod | "">("");
  const [date, setDate] = useState("");

  // The current page(s) of results, seeded from the server's first page.
  const [items, setItems] = useState<OrderListItem[]>(initial.items);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  // Bumped after a successful create to reload page 0 (the new order is `pending`
  // → Active tab). The server refresh also refreshes the `counts` prop.
  const [reloadToken, setReloadToken] = useState(0);

  // Monotonic request id: a later fetch supersedes an earlier one, so an
  // out-of-order response (slow filter change, then a faster one) is discarded.
  const reqRef = useRef(0);
  // The seeded first page already matches the default query, so skip the first
  // run of the filter effect (no redundant refetch on mount).
  const firstRun = useRef(true);

  const isFiltered =
    debouncedQuery.trim() !== "" ||
    source !== "" ||
    status !== "" ||
    payment !== "" ||
    date !== "";

  // Debounce the search box so typing doesn't fire a query per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(id);
  }, [query]);

  // Filter/tab change → reload page 0 from the database.
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const reqId = ++reqRef.current;
    setLoading(true);
    fetchOrders({
      tab,
      source: source || null,
      status: status || null,
      payment: payment || null,
      date: date || null,
      search: debouncedQuery.trim() || null,
      page: 0,
    })
      .then((res) => {
        if (reqId !== reqRef.current) return;
        setItems(res.items);
        setHasMore(res.hasMore);
        setPage(0);
        setLoading(false);
      })
      .catch(() => {
        if (reqId === reqRef.current) setLoading(false);
      });
  }, [tab, source, status, payment, date, debouncedQuery, reloadToken]);

  function loadMore() {
    const nextPage = page + 1;
    const reqId = ++reqRef.current;
    setLoading(true);
    fetchOrders({
      tab,
      source: source || null,
      status: status || null,
      payment: payment || null,
      date: date || null,
      search: debouncedQuery.trim() || null,
      page: nextPage,
    })
      .then((res) => {
        if (reqId !== reqRef.current) return;
        setItems((prev) => [...prev, ...res.items]);
        setHasMore(res.hasMore);
        setPage(nextPage);
        setLoading(false);
      })
      .catch(() => {
        if (reqId === reqRef.current) setLoading(false);
      });
  }

  const tabTotal = tab === "active" ? counts.active : counts.archived;

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
          <NewOrderForm
            menu={menu}
            onDone={() => {
              setCreating(false);
              // Reload page 0 so the new (pending) order appears in the Active tab.
              setReloadToken((n) => n + 1);
            }}
          />
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
        {items.length === 0 ? (
          loading ? (
            <p className="text-body text-muted py-2" role="status">
              {t("orders.loading")}
            </p>
          ) : tabTotal === 0 && !isFiltered ? (
            <p className="text-body text-muted py-2">{t(`orders.empty.${tab}`)}</p>
          ) : (
            <p className="text-body text-muted py-2">{t("orders.noMatch")}</p>
          )
        ) : (
          <>
            <ul className="flex flex-col" aria-busy={loading}>
              {items.map((o) => (
                <li
                  key={o.id}
                  className="border-border flex flex-col gap-1.5 border-b py-3 last:border-0 last:pb-0"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-label text-ink font-semibold tabular-nums">
                      {o.orderNo}
                    </span>
                    <div className="flex shrink-0 items-center gap-2">
                      <Link
                        href={`/orders/${o.id}/bill`}
                        aria-label={t("orders.bill.printBillFor", { no: o.orderNo })}
                        className="text-muted hover:text-ink transition-colors"
                      >
                        <Printer className="size-4" aria-hidden />
                      </Link>
                      <span className="text-label text-ink font-semibold tabular-nums">
                        {formatLKR(o.totalCents)}
                      </span>
                    </div>
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
            {hasMore ? (
              <button
                type="button"
                onClick={loadMore}
                disabled={loading}
                className="border-border-strong text-ink text-label hover:bg-surface-2 h-10 rounded-[var(--radius)] border font-medium transition-colors disabled:opacity-50"
              >
                {loading ? t("orders.loading") : t("orders.loadMore")}
              </button>
            ) : null}
          </>
        )}
      </Card>
    </div>
  );
}

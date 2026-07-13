"use client";

// Bookings browser (SPEC §4.2). Client component over the tenant's bookings, but
// the data is now filtered and PAGINATED IN THE DATABASE (Antigravity MED-2): it
// holds one page at a time and calls the fetchBookings server action whenever the
// type segment / search / filters change (page 0) or "Load more" is pressed (next
// page). The type segment, status filter, date filter, and search are DB
// predicates, not a client scan of every booking. The first page + segment counts
// are seeded from the server (props) so first paint has data with no round trip.
// Customer names / item descriptions are business data, shown as entered (not
// translated, CLAUDE.md §3). Money is pre-computed in the selector and only
// formatted here.

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { StatusPill, type Tone } from "@/components/ui/status-pill";
import { NewBookingForm } from "@/components/bookings/new-booking-form";
import { fetchBookings } from "@/app/(app)/bookings/actions";
import { formatLKR } from "@/lib/format";
import { BOOKING_TYPES, BOOKING_STATUSES } from "@/lib/bookings/booking-config";
import type { BookingType, BookingStatus } from "@/lib/bookings/booking-config";
import type {
  BookingListItem,
  BookingTypeCounts,
  BookingsPageResult,
} from "@/lib/db/selectors/bookings";

const STATUS_TONE: Record<BookingStatus, Tone> = {
  pending: "warning",
  confirmed: "info",
  completed: "success",
  cancelled: "danger",
};

function BookingRow({ booking }: { booking: BookingListItem }) {
  const { t } = useTranslation();

  // Secondary line: date · time (· party size for reservations).
  const when = [booking.date ?? t("bookings.unscheduled"), booking.time].filter(Boolean).join(" · ");
  const showBalance =
    booking.type === "custom_order" && booking.balanceCents != null && booking.balanceCents > 0;

  return (
    <li className="border-border flex items-start justify-between gap-3 border-b py-3 last:border-0 last:pb-0">
      <div className="min-w-0 flex flex-col gap-0.5">
        <p className="text-body text-ink truncate font-medium">
          {booking.customerName ?? t("bookings.guest")}
        </p>
        {booking.type === "custom_order" && booking.itemDescription ? (
          <p className="text-caption text-muted truncate">{booking.itemDescription}</p>
        ) : null}
        <p className="text-caption text-muted truncate tabular-nums">
          {booking.type === "custom_order" ? `${t("bookings.pickup")}: ${when}` : when}
          {booking.type === "reservation" && booking.partySize != null
            ? ` · ${t("bookings.partyOf", { count: booking.partySize })}`
            : ""}
        </p>
        {booking.customerPhone ? (
          <p className="text-caption text-faint truncate tabular-nums">{booking.customerPhone}</p>
        ) : null}
        {showBalance ? (
          <p className="text-caption text-muted tabular-nums">
            {t("bookings.balanceDue")} {formatLKR(booking.balanceCents as number)}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <StatusPill
          tone={STATUS_TONE[booking.status]}
          label={t(`bookings.status.${booking.status}`)}
        />
        {booking.source ? <StatusPill tone="neutral" label={t(`source.${booking.source}`)} /> : null}
      </div>
    </li>
  );
}

export function BookingsBrowser({
  initial,
  counts,
}: {
  initial: BookingsPageResult;
  counts: BookingTypeCounts;
}) {
  const { t } = useTranslation();
  const [type, setType] = useState<BookingType>("reservation");
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [status, setStatus] = useState<BookingStatus | "">("");
  const [date, setDate] = useState("");

  const [items, setItems] = useState<BookingListItem[]>(initial.items);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  // A later fetch supersedes an earlier one (discard out-of-order responses).
  const reqRef = useRef(0);
  // The seeded first page already matches the default query → skip the first run.
  const firstRun = useRef(true);

  const isFiltered = debouncedQuery.trim() !== "" || status !== "" || date !== "";

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(id);
  }, [query]);

  // Segment/filter change → reload page 0 from the database.
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const reqId = ++reqRef.current;
    setLoading(true);
    fetchBookings({
      type,
      status: status || null,
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
  }, [type, status, date, debouncedQuery, reloadToken]);

  function loadMore() {
    const nextPage = page + 1;
    const reqId = ++reqRef.current;
    setLoading(true);
    fetchBookings({
      type,
      status: status || null,
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

  const typeTotal = type === "reservation" ? counts.reservation : counts.custom_order;

  const selectClass =
    "border-border text-label text-ink focus-visible:ring-brand/40 bg-surface h-9 min-w-0 rounded-[var(--radius)] border px-2 outline-none focus-visible:ring-2";

  // The create action label follows the active type.
  const newActionLabel =
    type === "custom_order" ? t("bookings.new.customOrderAction") : t("bookings.new.reservationAction");

  return (
    <div className="flex flex-col gap-3">
      {/* Type segment (the on-screen toggle) */}
      <div role="tablist" className="border-border bg-surface-2 flex gap-1 rounded-[var(--radius)] p-1">
        {BOOKING_TYPES.map((key) => {
          const isActive = type === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => {
                setType(key);
                setCreating(false);
              }}
              className={`text-label flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-[calc(var(--radius)-4px)] px-3 font-medium transition-colors ${
                isActive ? "bg-surface text-brand shadow-card" : "text-muted hover:text-ink"
              }`}
            >
              {t(`bookings.segment.${key}`)}
              <span className="text-caption text-faint tabular-nums">
                {key === "reservation" ? counts.reservation : counts.custom_order}
              </span>
            </button>
          );
        })}
      </div>

      {/* New booking */}
      <button
        type="button"
        onClick={() => setCreating((v) => !v)}
        aria-expanded={creating}
        className="bg-brand text-brand-white text-label hover:bg-brand-ember flex h-10 items-center justify-center gap-1 rounded-[var(--radius)] font-semibold transition-colors"
      >
        <Plus className="size-4" aria-hidden />
        {newActionLabel}
      </button>

      {creating ? (
        <Card>
          <NewBookingForm
            type={type}
            onDone={() => {
              setCreating(false);
              // Reload page 0 so the new booking appears in its segment.
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
        placeholder={t("bookings.search")}
        className="border-border text-label text-ink focus-visible:ring-brand/40 bg-surface h-9 w-full rounded-[var(--radius)] border px-2 outline-none focus-visible:ring-2"
      />

      {/* Filter row */}
      <div className="grid grid-cols-2 gap-2">
        <select
          aria-label={t("bookings.filter.status")}
          value={status}
          onChange={(e) => setStatus(e.target.value as BookingStatus | "")}
          className={selectClass}
        >
          <option value="">{t("bookings.filter.allStatuses")}</option>
          {BOOKING_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`bookings.status.${s}`)}
            </option>
          ))}
        </select>
        <input
          type="date"
          aria-label={t("bookings.filter.date")}
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
              {t("bookings.loading")}
            </p>
          ) : typeTotal === 0 && !isFiltered ? (
            <p className="text-body text-muted py-2">{t(`bookings.empty.${type}`)}</p>
          ) : (
            <p className="text-body text-muted py-2">{t("bookings.noMatch")}</p>
          )
        ) : (
          <>
            <ul className="flex flex-col" aria-busy={loading}>
              {items.map((b) => (
                <BookingRow key={b.id} booking={b} />
              ))}
            </ul>
            {hasMore ? (
              <button
                type="button"
                onClick={loadMore}
                disabled={loading}
                className="border-border-strong text-ink text-label hover:bg-surface-2 h-10 rounded-[var(--radius)] border font-medium transition-colors disabled:opacity-50"
              >
                {loading ? t("bookings.loading") : t("bookings.loadMore")}
              </button>
            ) : null}
          </>
        )}
      </Card>
    </div>
  );
}

"use client";

// Bookings browser (SPEC §4.2). Client component over the tenant's fetched
// bookings: a TYPE SEGMENT (Reservations / Custom Orders — the on-screen toggle,
// CLAUDE.md §4), a "Search by customer or phone" box, a status filter and a date
// filter, the "+ New Booking" flow (which opens the form for the active type),
// and stacked list-rows (DESIGN.md §4 tables→mobile). Filtering is client-side
// over the fetched set; customer names / item descriptions are business data,
// shown as entered (not translated, CLAUDE.md §3). Money is pre-computed in the
// selector and only formatted here.

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { StatusPill, type Tone } from "@/components/ui/status-pill";
import { NewBookingForm } from "@/components/bookings/new-booking-form";
import { formatLKR } from "@/lib/format";
import { BOOKING_TYPES, BOOKING_STATUSES } from "@/lib/bookings/booking-config";
import type { BookingType, BookingStatus } from "@/lib/bookings/booking-config";
import type { BookingListItem } from "@/lib/db/selectors/bookings";

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

export function BookingsBrowser({ bookings }: { bookings: BookingListItem[] }) {
  const { t } = useTranslation();
  const [type, setType] = useState<BookingType>("reservation");
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<BookingStatus | "">("");
  const [date, setDate] = useState("");

  const counts = useMemo(() => {
    const c: Record<BookingType, number> = { reservation: 0, custom_order: 0 };
    for (const b of bookings) c[b.type] += 1;
    return c;
  }, [bookings]);

  const inType = useMemo(() => bookings.filter((b) => b.type === type), [bookings, type]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inType.filter((b) => {
      if (status && b.status !== status) return false;
      if (date && b.date !== date) return false;
      if (q) {
        const hay = `${b.customerName ?? ""} ${b.customerPhone ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [inType, status, date, query]);

  const isFiltered = query.trim() !== "" || status !== "" || date !== "";

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
              <span className="text-caption text-faint tabular-nums">{counts[key]}</span>
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
          <NewBookingForm type={type} onDone={() => setCreating(false)} />
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
        {inType.length === 0 ? (
          <p className="text-body text-muted py-2">{t(`bookings.empty.${type}`)}</p>
        ) : filtered.length === 0 ? (
          <p className="text-body text-muted py-2">{t("bookings.noMatch")}</p>
        ) : (
          <>
            <ul className="flex flex-col">
              {filtered.map((b) => (
                <BookingRow key={b.id} booking={b} />
              ))}
            </ul>
            {isFiltered ? (
              <p className="text-caption text-faint">
                {t("bookings.showing", { shown: filtered.length, total: inType.length })}
              </p>
            ) : null}
          </>
        )}
      </Card>
    </div>
  );
}

"use client";

// Today's Bookings list (SPEC §3.1). Renders the section title and either the
// day's bookings as stacked list-rows (DESIGN.md §4 tables→mobile) or an
// active-voice empty state (DESIGN.md §6). Customer names and item descriptions
// are dynamic content — shown as entered, never translated (CLAUDE.md §3). Money
// is pre-computed in the selector and only formatted here.

import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { StatusPill, type Tone } from "@/components/ui/status-pill";
import { formatLKR } from "@/lib/format";
import type { TodaysBooking } from "@/lib/db/selectors/bookings";

const STATUS_TONE: Record<TodaysBooking["status"], Tone> = {
  pending: "warning",
  confirmed: "info",
  completed: "success",
  cancelled: "danger",
};

function BookingRow({ booking }: { booking: TodaysBooking }) {
  const { t } = useTranslation();

  const typeLabel =
    booking.type === "reservation"
      ? t("dashboard.bookings.reservation")
      : t("dashboard.bookings.customOrder");

  // Secondary line: type · time · (party size for reservations).
  const meta = [typeLabel, booking.time];
  if (booking.type === "reservation" && booking.partySize != null) {
    meta.push(t("dashboard.bookings.partyOf", { count: booking.partySize }));
  }
  const secondary = meta.filter(Boolean).join(" · ");

  const showBalance =
    booking.type === "custom_order" && booking.balanceCents != null && booking.balanceCents > 0;

  return (
    <li className="border-border flex items-start justify-between gap-3 border-b py-3 last:border-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-body text-ink truncate font-medium">
          {booking.customerName ?? t("dashboard.bookings.guest")}
        </p>
        <p className="text-caption text-muted truncate">{secondary}</p>
        {booking.type === "custom_order" && booking.itemDescription ? (
          <p className="text-caption text-muted mt-0.5 truncate">{booking.itemDescription}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <StatusPill
          tone={STATUS_TONE[booking.status]}
          label={t(`dashboard.bookings.status.${booking.status}`)}
        />
        {showBalance ? (
          <span className="text-caption text-muted tabular-nums">
            {t("dashboard.bookings.balanceDue")} {formatLKR(booking.balanceCents as number)}
          </span>
        ) : null}
      </div>
    </li>
  );
}

export function BookingsList({ bookings }: { bookings: TodaysBooking[] }) {
  const { t } = useTranslation();

  return (
    <section className="animate-rise flex flex-col gap-2">
      <h2 className="text-h2 text-ink px-1">{t("dashboard.bookings.title")}</h2>
      {bookings.length === 0 ? (
        <Card>
          <p className="text-body text-muted">{t("dashboard.bookings.empty")}</p>
        </Card>
      ) : (
        <Card>
          <ul className="flex flex-col">
            {bookings.map((booking) => (
              <BookingRow key={booking.id} booking={booking} />
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

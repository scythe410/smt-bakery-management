"use client";

// New-booking form (SPEC §4.2). Adapts to the active type segment: a RESERVATION
// captures date/time + party size; a CUSTOM ORDER captures an item description,
// pickup date/time, and the order total + deposit. It posts to the createBooking
// server action, which re-checks the session, Zod-validates the shape for the
// type, sets business_id server-side, and COMPUTES the outstanding balance
// (total − deposit) itself (CLAUDE.md §7). Money is entered in rupees and
// converted to integer cents server-side — no float money is stored (CLAUDE.md
// §3). Customer names / item descriptions are business data, shown as entered.

import { useActionState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { createBooking, type CreateBookingState } from "@/app/(app)/bookings/actions";
import { BOOKING_SOURCES, BOOKING_STATUSES } from "@/lib/bookings/booking-config";
import type { BookingType } from "@/lib/bookings/booking-config";

const FIELD_CLASS =
  "border-border text-label text-ink focus-visible:ring-brand/40 h-10 rounded-[var(--radius)] border bg-surface px-2 outline-none focus-visible:ring-2";

/** Client-local `YYYY-MM-DD` — a friendly default for the date inputs. */
function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function NewBookingForm({
  type,
  onDone,
}: {
  type: BookingType;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<CreateBookingState, FormData>(
    createBooking,
    {},
  );

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      onDone();
    }
  }, [state.ok, onDone]);

  const isCustom = type === "custom_order";
  const today = todayStr();

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="type" value={type} />

      {/* Customer */}
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-caption text-muted">{t("bookings.new.customer")}</span>
          <input
            type="text"
            name="customerName"
            maxLength={120}
            placeholder={t("bookings.new.customerPlaceholder")}
            className={FIELD_CLASS}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-caption text-muted">{t("bookings.new.phone")}</span>
          <input
            type="tel"
            name="customerPhone"
            maxLength={40}
            placeholder={t("bookings.new.phonePlaceholder")}
            className={FIELD_CLASS}
          />
        </label>
      </div>

      {isCustom ? (
        <>
          {/* Custom order: what's being made */}
          <label className="flex flex-col gap-1">
            <span className="text-caption text-muted">{t("bookings.new.itemDescription")}</span>
            <textarea
              name="itemDescription"
              required
              maxLength={500}
              rows={2}
              placeholder={t("bookings.new.itemDescriptionPlaceholder")}
              className="border-border text-label text-ink focus-visible:ring-brand/40 bg-surface rounded-[var(--radius)] border px-2 py-2 outline-none focus-visible:ring-2"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-caption text-muted">{t("bookings.new.pickupDate")}</span>
              <input
                type="date"
                name="pickupDate"
                required
                defaultValue={today}
                className={`${FIELD_CLASS} tabular-nums`}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-caption text-muted">{t("bookings.new.pickupTime")}</span>
              <input type="time" name="pickupTime" className={`${FIELD_CLASS} tabular-nums`} />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-caption text-muted">{t("bookings.new.total")} (LKR)</span>
              <input
                type="number"
                name="total"
                inputMode="decimal"
                step="0.01"
                min="0"
                defaultValue="0"
                required
                className={`${FIELD_CLASS} tabular-nums`}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-caption text-muted">{t("bookings.new.deposit")} (LKR)</span>
              <input
                type="number"
                name="deposit"
                inputMode="decimal"
                step="0.01"
                min="0"
                defaultValue="0"
                required
                className={`${FIELD_CLASS} tabular-nums`}
              />
            </label>
          </div>
          <p className="text-caption text-faint">{t("bookings.new.balanceHint")}</p>
        </>
      ) : (
        <>
          {/* Reservation: date/time + party size */}
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-caption text-muted">{t("bookings.new.date")}</span>
              <input
                type="date"
                name="date"
                required
                defaultValue={today}
                className={`${FIELD_CLASS} tabular-nums`}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-caption text-muted">{t("bookings.new.time")}</span>
              <input type="time" name="time" className={`${FIELD_CLASS} tabular-nums`} />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-caption text-muted">{t("bookings.new.partySize")}</span>
            <input
              type="number"
              name="partySize"
              inputMode="numeric"
              step="1"
              min="1"
              defaultValue="2"
              required
              className={`${FIELD_CLASS} tabular-nums`}
            />
          </label>
        </>
      )}

      {/* Source + status (shared) */}
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-caption text-muted">{t("bookings.new.source")}</span>
          <select name="source" defaultValue={BOOKING_SOURCES[0]} className={FIELD_CLASS}>
            {BOOKING_SOURCES.map((s) => (
              <option key={s} value={s}>
                {t(`source.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-caption text-muted">{t("bookings.new.status")}</span>
          <select name="status" defaultValue={BOOKING_STATUSES[0]} className={FIELD_CLASS}>
            {BOOKING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`bookings.status.${s}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {state.error ? (
        <p role="alert" className="text-caption text-danger">
          {t(state.error)}
        </p>
      ) : null}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="bg-brand text-brand-white text-label hover:bg-brand-ember h-10 flex-1 rounded-[var(--radius)] font-semibold transition-colors disabled:opacity-50"
        >
          {pending ? t("bookings.new.saving") : t("bookings.new.save")}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="border-border-strong text-ink text-label hover:bg-surface-2 h-10 rounded-[var(--radius)] border px-4 font-medium transition-colors"
        >
          {t("bookings.new.cancel")}
        </button>
      </div>
    </form>
  );
}

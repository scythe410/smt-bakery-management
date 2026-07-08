// period.ts — the shared time window every figure is computed over.
//
// Dashboard / Finance / Reports all slice the same rows by a period (Today /
// This Week / This Month / custom). For those figures to reconcile they must
// agree on EXACTLY where a day starts and ends — and that boundary is the
// business's own wall clock, not the server's. A sale at 00:30 Colombo time is
// "today" for the shop even though it may be "yesterday" in UTC.
//
// So this module resolves a period in the tenant's timezone and exposes it two
// ways, because the schema stores time two ways:
//   * startUtc / endUtc  — a half-open [start, end) instant range, for
//     `timestamptz` columns (order.created_at): `.gte(startUtc).lt(endUtc)`.
//   * startDate / endDate — inclusive local `YYYY-MM-DD` bounds, for `date`
//     columns (expense.date, booking.date): `.gte(startDate).lte(endDate)`.
//   * days — every local day in the window, so a chart can fill zero-days.
//
// Pure and `now`-injectable so it unit-tests without a clock or a database.
// No timezone library: Intl.DateTimeFormat knows every zone the platform does.

/** Week starts Monday (ISO 8601). One constant so a client can flip it. */
const WEEK_STARTS_ON = 1; // 0 = Sunday, 1 = Monday

export type PeriodKind = "today" | "week" | "month" | "custom";

/** What a caller asks for. Custom carries inclusive local `YYYY-MM-DD` bounds. */
export type PeriodInput =
  { kind: "today" | "week" | "month" } | { kind: "custom"; from: string; to: string };

export type Period = {
  kind: PeriodKind;
  timezone: string;
  /** Inclusive start instant (ISO), for timestamptz `.gte()`. */
  startUtc: string;
  /** Exclusive end instant (ISO), for timestamptz `.lt()`. */
  endUtc: string;
  /** Inclusive local calendar start `YYYY-MM-DD`, for date-column `.gte()`. */
  startDate: string;
  /** Inclusive local calendar end `YYYY-MM-DD`, for date-column `.lte()`. */
  endDate: string;
  /** Every local `YYYY-MM-DD` from startDate..endDate inclusive. */
  days: string[];
};

// --- Timezone primitives ----------------------------------------------------

type Parts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

// Reused per (timezone) formatter; constructing Intl.DateTimeFormat is costly.
const partFormatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = partFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partFormatters.set(timeZone, f);
  }
  return f;
}

/** The wall-clock parts an observer in `timeZone` reads off `instant`. */
function partsInZone(instant: Date, timeZone: string): Parts {
  const map: Record<string, string> = {};
  for (const p of formatterFor(timeZone).formatToParts(instant)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    // h23 still emits "24" at midnight in some engines — normalise to 0.
    hour: map.hour === "24" ? 0 : Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

/** Zone offset (ms) such that utc = wallAsUtc - offset, at a given instant. */
function offsetMs(instant: Date, timeZone: string): number {
  const p = partsInZone(instant, timeZone);
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wallAsUtc - instant.getTime();
}

/**
 * The UTC instant at which the wall clock in `timeZone` reads the given local
 * time. Two passes so it stays correct across DST offset changes (Asia/Colombo
 * has none, but this keeps the util general and honest).
 */
function zonedWallTimeToUtc(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  s: number,
  timeZone: string,
): Date {
  const guessMs = Date.UTC(y, mo - 1, d, h, mi, s);
  let off = offsetMs(new Date(guessMs), timeZone);
  let result = new Date(guessMs - off);
  // Re-check with the resolved offset; correct if the first guess landed on the
  // wrong side of a transition.
  off = offsetMs(result, timeZone);
  result = new Date(guessMs - off);
  return result;
}

/** The local calendar day (`YYYY-MM-DD`) that `instant` falls on in `timeZone`. */
export function zonedDateKey(instant: Date | string, timeZone: string): string {
  const p = partsInZone(typeof instant === "string" ? new Date(instant) : instant, timeZone);
  return toDateStr(p.year, p.month, p.day);
}

// --- Local-date string helpers (labels only; no timezone involved) ----------

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toDateStr(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

function parseDateStr(str: string): { y: number; m: number; d: number } {
  const [y, m, d] = str.split("-").map(Number);
  if (!y || !m || !d) throw new RangeError(`period: invalid date '${str}', expected YYYY-MM-DD`);
  return { y, m, d };
}

/** Shift a `YYYY-MM-DD` by whole days (UTC math — pure label arithmetic). */
function addDays(dateStr: string, delta: number): string {
  const { y, m, d } = parseDateStr(dateStr);
  const t = new Date(Date.UTC(y, m - 1, d + delta));
  return toDateStr(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Day-of-week (0=Sun..6=Sat) for a local date label. */
function dayOfWeek(dateStr: string): number {
  const { y, m, d } = parseDateStr(dateStr);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Every `YYYY-MM-DD` from start..end inclusive. */
function daysBetween(startDate: string, endDate: string): string[] {
  const out: string[] = [];
  let cur = startDate;
  // Guard against a reversed range producing an infinite loop.
  for (let i = 0; i < 400 && cur <= endDate; i++) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

// --- Resolution -------------------------------------------------------------

/**
 * Resolve a requested period into concrete UTC + local-date bounds in the
 * tenant's timezone. `now` is injectable for tests; defaults to the real clock.
 */
export function resolvePeriod(
  input: PeriodInput,
  timeZone: string,
  now: Date = new Date(),
): Period {
  const todayLocal = zonedDateKey(now, timeZone);

  let startDate: string;
  let endDate: string;

  switch (input.kind) {
    case "today":
      startDate = todayLocal;
      endDate = todayLocal;
      break;
    case "week": {
      // Days to step back from today to reach the week's start weekday.
      const back = (dayOfWeek(todayLocal) - WEEK_STARTS_ON + 7) % 7;
      startDate = addDays(todayLocal, -back);
      endDate = addDays(startDate, 6);
      break;
    }
    case "month": {
      const { y, m } = parseDateStr(todayLocal);
      startDate = toDateStr(y, m, 1);
      // Day 0 of the next month is the last day of this one.
      const last = new Date(Date.UTC(y, m, 0));
      endDate = toDateStr(last.getUTCFullYear(), last.getUTCMonth() + 1, last.getUTCDate());
      break;
    }
    case "custom":
      // Normalise so a reversed range still yields a sane forward window.
      startDate = input.from <= input.to ? input.from : input.to;
      endDate = input.from <= input.to ? input.to : input.from;
      break;
  }

  const start = parseDateStr(startDate);
  const startUtc = zonedWallTimeToUtc(start.y, start.m, start.d, 0, 0, 0, timeZone);
  // Exclusive upper bound: midnight opening the day AFTER endDate.
  const afterEnd = parseDateStr(addDays(endDate, 1));
  const endUtc = zonedWallTimeToUtc(afterEnd.y, afterEnd.m, afterEnd.d, 0, 0, 0, timeZone);

  return {
    kind: input.kind,
    timezone: timeZone,
    startUtc: startUtc.toISOString(),
    endUtc: endUtc.toISOString(),
    startDate,
    endDate,
    days: daysBetween(startDate, endDate),
  };
}

// employee-config.ts — client-safe shared config for the Employees screen
// (SPEC §4.3). Pure config + parsers, no DB/server imports, so the page, the
// list component, and the selector can all share ONE source of truth for how a
// shift schedule and a permission set are shaped and ordered.
//
// employee.role (a free-text job title like "Head Baker") is DISTINCT from the
// app_role login role (owner/manager/staff). shift_schedule and permissions are
// jsonb, so both arrive as untyped values and are normalised defensively here.

/** The seven weekdays, in display order (Mon-first, matching shift jsonb keys). */
export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** One day of a shift schedule: the weekday key + its "HH:MM-HH:MM" hours. */
export type ShiftDay = { day: Weekday; hours: string };

/**
 * Normalise a shift_schedule jsonb ({"mon":"08:00-17:00", …}) into an ordered
 * list of the days actually worked. Unknown keys and non-string values are
 * dropped; ordering follows WEEKDAYS so every card reads Mon→Sun.
 */
export function parseShiftSchedule(value: unknown): ShiftDay[] {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  return WEEKDAYS.flatMap((day) => {
    const hours = record[day];
    return typeof hours === "string" && hours.trim() !== "" ? [{ day, hours: hours.trim() }] : [];
  });
}

/**
 * Normalise a permissions jsonb into the list of granted permission keys.
 * `{"all": true}` collapses to the single sentinel "all" (full access);
 * otherwise every key whose value is truthy is included, in insertion order.
 */
export function parsePermissions(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  if (record.all === true) return ["all"];
  return Object.keys(record).filter((key) => record[key] === true);
}

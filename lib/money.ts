// money.ts — integer minor-unit (cents) arithmetic. CLAUDE.md §3.
//
// ALL money in this app is an integer number of LKR cents. Floats never touch
// money: 0.1 + 0.2 !== 0.3 in IEEE-754, and rounding drift compounds across a
// day of orders. These helpers keep every intermediate value an integer.
//
// Rules:
//   * A "cents" value is a whole number (safe-integer) of LKR minor units.
//   * Only toCents() crosses the float boundary, and it rounds exactly once.
//   * Everything downstream (add/subtract/multiply/sum) stays in integers.
//   * Formatting for humans lives in format.ts — never format here.

/** Guard: a money value must be a whole, finite, safe integer number of cents. */
export function assertCents(value: number): number {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`money: expected an integer cents value, got ${value}`);
  }
  return value;
}

/**
 * Convert a major-unit amount (e.g. rupees a human typed) to integer cents.
 * This is the ONLY place a float legitimately becomes money, so it rounds
 * exactly once, here, using round-half-away-from-zero (commercial rounding).
 */
export function toCents(amountMajor: number): number {
  if (!Number.isFinite(amountMajor)) {
    throw new RangeError(`money: cannot convert non-finite amount ${amountMajor}`);
  }
  const sign = amountMajor < 0 ? -1 : 1;
  // Scale in the major unit, then round; avoids trailing-float artefacts like
  // 12.34 * 100 === 1233.9999999999998.
  return sign * Math.round(Math.abs(amountMajor) * 100);
}

/** Integer cents -> major-unit number, for display/formatting only. */
export function toMajor(cents: number): number {
  return assertCents(cents) / 100;
}

/** Sum of two cents values (both must already be integer cents). */
export function add(a: number, b: number): number {
  return assertCents(a) + assertCents(b);
}

/** Difference a - b (both integer cents). */
export function subtract(a: number, b: number): number {
  return assertCents(a) - assertCents(b);
}

/**
 * Multiply a cents value by a whole quantity (e.g. line item qty). Quantity
 * must be an integer so the result is exact; fractional pricing is modelled by
 * choosing the unit price, not by fractional multiplication of cents.
 */
export function multiply(cents: number, quantity: number): number {
  assertCents(cents);
  if (!Number.isInteger(quantity)) {
    throw new RangeError(`money: quantity must be an integer, got ${quantity}`);
  }
  return assertCents(cents * quantity);
}

/**
 * Apply a basis-points rate (1 bp = 0.01%) to a cents amount and round to whole
 * cents — used for platform commission (commission_rule.rate_bps). Rounding is
 * round-half-up, matching the seed's commission derivation so figures reconcile.
 */
export function applyRateBps(cents: number, rateBps: number): number {
  assertCents(cents);
  if (!Number.isInteger(rateBps)) {
    throw new RangeError(`money: rate_bps must be an integer, got ${rateBps}`);
  }
  return Math.round((cents * rateBps) / 10_000);
}

/** Sum an array of integer-cents values (empty -> 0). */
export function sum(values: readonly number[]): number {
  return values.reduce((total, v) => total + assertCents(v), 0);
}

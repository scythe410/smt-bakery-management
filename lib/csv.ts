// csv.ts — safe CSV cell encoding for every export path.
//
// Client-safe (no server-only): exports build the file in the browser from
// already-derived rows. Two concerns, both handled here so no call site can
// forget one:
//
//   1. CSV FORMULA INJECTION. Spreadsheet apps (Excel, Sheets, LibreOffice)
//      evaluate a cell whose text begins with =, +, -, @, or a leading TAB/CR as
//      a FORMULA. A value like `=CMD()`/`=HYPERLINK(...)` sourced from
//      user-entered data (e.g. a customer name) could then execute or exfiltrate
//      on open. Neutralise by prefixing such a value with a single apostrophe,
//      which forces the app to treat the whole cell as literal text.
//
//   2. CSV STRUCTURE (RFC 4180). Wrap every value in double quotes and double
//      any embedded quote, so commas, quotes, and newlines inside a value can
//      never break out of the cell.
//
// Order matters: neutralise the formula on the raw value FIRST, then quote — the
// apostrophe must land inside the quoted cell, before the original leading char.

/** Characters that make a spreadsheet treat the cell as a formula on open. */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/** Encode one value as a safe, RFC-4180-quoted, injection-neutralised CSV cell. */
export function csvCell(value: string | number | null | undefined): string {
  let s = value == null ? "" : String(value);
  if (FORMULA_LEAD.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** Join a row of values into a single CSV line (each cell encoded via csvCell). */
export function csvRow(values: ReadonlyArray<string | number | null | undefined>): string {
  return values.map(csvCell).join(",");
}

// Expense categories — the suggested set for the add-expense form and filter.
// Client-safe (no server-only) so both the form (client) and the Zod schema can
// import it. `category` is free text in the DB (CLAUDE.md §4), so these are
// suggestions, not an enum — a value outside this list is still valid. They are
// business data shown as entered, not translated (CLAUDE.md §3).

export const EXPENSE_CATEGORIES = [
  "Rent",
  "Salaries",
  "Ingredients",
  "Utilities",
  "Packaging",
  "Marketing",
  "Equipment",
  "Other",
] as const;

"use client";

// Recipe (BOM) editor (SPEC §4.1). Links INGREDIENT-kind inventory items to a
// menu item with a quantity in the item's stocking unit. The server enforces:
//   * Only ingredient-kind items are accepted (non-ingredients → error).
//   * recipe_line.unit is copied from inventory_item.unit server-side — no
//     client-supplied unit, no runtime conversion (CLAUDE.md §4 "No unit
//     conversion").
//
// The editor is a local-state list: add/remove rows client-side, then submit
// the whole set as one JSON payload → upsertRecipeLines server action
// (replaces all lines atomically). No partial saves.

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { upsertRecipeLines, type RecipeActionState } from "@/app/(app)/menu/actions";
import type { IngredientOption } from "@/lib/db/selectors/menu";

type Line = {
  inventoryItemId: string;
  qty: string; // string while editing
};

export function RecipeEditor({
  menuItemId,
  initialLines,
  ingredients,
  onSaved,
}: {
  menuItemId: string;
  initialLines: { inventoryItemId: string; qty: number; unit: string }[];
  ingredients: IngredientOption[];
  onSaved?: () => void;
}) {
  const { t } = useTranslation();
  const formRef = useRef<HTMLFormElement>(null);
  const [lines, setLines] = useState<Line[]>(
    initialLines.map((l) => ({ inventoryItemId: l.inventoryItemId, qty: String(l.qty) })),
  );

  const [state, formAction, pending] = useActionState<RecipeActionState, FormData>(
    upsertRecipeLines,
    {},
  );

  useEffect(() => {
    if (state.ok) onSaved?.();
  }, [state.ok, onSaved]);

  const ingredientMap = new Map(ingredients.map((i) => [i.id, i]));

  // Ids already chosen — prevent the same ingredient twice.
  const chosen = new Set(lines.map((l) => l.inventoryItemId));
  const available = ingredients.filter((i) => !chosen.has(i.id));

  function addLine() {
    if (available.length === 0) return;
    setLines((prev) => [...prev, { inventoryItemId: available[0].id, qty: "" }]);
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateIngredient(idx: number, id: string) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, inventoryItemId: id } : l)));
  }

  function updateQty(idx: number, val: string) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, qty: val } : l)));
  }

  const FIELD =
    "border-border text-label text-ink focus-visible:ring-brand/40 h-9 rounded-[var(--radius)] border bg-surface px-2 outline-none focus-visible:ring-2";

  return (
    <form
      ref={formRef}
      action={(fd) => {
        // Encode validated lines as JSON into a hidden field.
        const linesPayload = lines
          .map((l) => ({ inventoryItemId: l.inventoryItemId, qty: Number(l.qty) }))
          .filter((l) => l.qty > 0);
        fd.set("lines", JSON.stringify(linesPayload));
        fd.set("menuItemId", menuItemId);
        formAction(fd);
      }}
      className="flex flex-col gap-3"
    >
      {/* Hidden fields are set dynamically above; we still need menuItemId accessible. */}
      <input type="hidden" name="menuItemId" value={menuItemId} />

      {lines.length === 0 ? (
        <p className="text-caption text-muted py-1">
          {t("menu.recipe.empty")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {lines.map((line, idx) => {
            const ingredient = ingredientMap.get(line.inventoryItemId);
            // Options for this row: the current ingredient + all unchosen ones.
            const rowOptions = [
              ...(ingredient ? [ingredient] : []),
              ...ingredients.filter(
                (i) => !chosen.has(i.id) || i.id === line.inventoryItemId,
              ),
            ];
            const uniqueOptions = [...new Map(rowOptions.map((o) => [o.id, o])).values()];

            return (
              <div key={idx} className="flex items-center gap-2">
                <select
                  value={line.inventoryItemId}
                  onChange={(e) => updateIngredient(idx, e.target.value)}
                  className={`${FIELD} flex-1`}
                  aria-label={t("menu.recipe.ingredient")}
                >
                  {uniqueOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  inputMode="decimal"
                  value={line.qty}
                  onChange={(e) => updateQty(idx, e.target.value)}
                  className={`${FIELD} w-20 tabular-nums`}
                  aria-label={t("menu.recipe.qty")}
                  placeholder="0"
                />
                <span className="text-caption text-muted w-10 truncate text-right">
                  {ingredient?.unit ?? ""}
                </span>
                <button
                  type="button"
                  onClick={() => removeLine(idx)}
                  aria-label={t("menu.recipe.remove")}
                  className="text-muted hover:text-danger transition-colors"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {ingredients.length === 0 ? (
        <p className="text-caption text-muted">{t("menu.recipe.noIngredients")}</p>
      ) : (
        <button
          type="button"
          onClick={addLine}
          disabled={available.length === 0}
          className="border-border-strong text-ink text-caption hover:bg-surface-2 flex h-8 items-center gap-1.5 self-start rounded-[var(--radius)] border px-3 font-medium transition-colors disabled:opacity-40"
        >
          <Plus className="size-3.5" aria-hidden />
          {t("menu.recipe.add")}
        </button>
      )}

      {state.error ? (
        <p role="alert" className="text-caption text-danger">
          {t(state.error)}
        </p>
      ) : null}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="bg-brand text-brand-white text-label hover:bg-brand-ember h-10 flex-1 rounded-[var(--radius)] font-semibold transition-colors disabled:opacity-50"
        >
          {pending ? t("menu.recipe.saving") : t("menu.recipe.save")}
        </button>
      </div>
    </form>
  );
}

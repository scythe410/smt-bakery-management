"use client";

// Menu item create/edit form (SPEC §4.1). Covers:
//   * name, price (LKR major units), category, item_code, is_available
//   * optional image upload (item-images bucket)
//   * inline recipe (BOM) editor shown after the item exists (edit mode)
//
// On CREATE the form is bound to `createMenuItemBound` (no id arg needed).
// On EDIT the form is bound to `updateMenuItemBound` via updateMenuItem.bind(id).
// Both share this component; the `mode` prop drives which action fires and
// whether the recipe editor is shown.

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Image as ImageIcon } from "lucide-react";
import {
  createMenuItem,
  updateMenuItem,
  type MenuActionState,
} from "@/app/(app)/menu/actions";
import { RecipeEditor } from "@/components/menu/recipe-editor";
import type { IngredientOption, FinishedGoodOption } from "@/lib/db/selectors/menu";
import type { RecipeLineRow } from "@/lib/db/queries/menu";

const FIELD =
  "border-border text-label text-ink focus-visible:ring-brand/40 h-10 rounded-[var(--radius)] border bg-surface px-2 outline-none focus-visible:ring-2";

export type MenuItemFormMode =
  | { kind: "create"; finishedGoods: FinishedGoodOption[] }
  | {
      kind: "edit";
      id: string;
      initialName: string;
      initialPriceCents: number;
      initialCategory: string | null;
      initialIsAvailable: boolean;
      initialItemCode: number;
      initialImageUrl: string | null;
      initialTrackedInventoryItemId: string | null;
      recipeLines: RecipeLineRow[];
      ingredients: IngredientOption[];
      finishedGoods: FinishedGoodOption[];
    };

export function MenuItemForm({
  mode,
  onDone,
}: {
  mode: MenuItemFormMode;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const formRef = useRef<HTMLFormElement>(null);
  const [tab, setTab] = useState<"details" | "recipe">("details");
  const [pickedName, setPickedName] = useState<string | null>(null);

  // Sold-from-stock link. A menu item is EITHER made-to-order (recipe) OR
  // sold-from-stock (tracked finished good), never both (CLAUDE.md §4 FT3). We gate
  // the two surfaces against each other in the UI; the DB triggers are the real
  // guard. `hasRecipe` disables the tracked-good picker; a chosen good disables the
  // Recipe tab.
  const finishedGoods = mode.finishedGoods;
  const hasRecipe = mode.kind === "edit" && mode.recipeLines.length > 0;
  const [trackedId, setTrackedId] = useState(
    mode.kind === "edit" ? (mode.initialTrackedInventoryItemId ?? "") : "",
  );
  const soldFromStock = trackedId !== "";

  const boundAction =
    mode.kind === "edit"
      ? updateMenuItem.bind(null, mode.id)
      : createMenuItem;

  const [state, formAction, pending] = useActionState<MenuActionState, FormData>(
    boundAction,
    {},
  );

  // Derive: once the action succeeds the label shows reset without setState in effect.
  const imageName = state.ok ? null : pickedName;

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      onDone();
    }
  }, [state.ok, onDone]);

  const defaultPrice =
    mode.kind === "edit" ? (mode.initialPriceCents / 100).toFixed(2) : "";

  const isEdit = mode.kind === "edit";

  return (
    <div className="flex flex-col gap-4">
      {/* Tab bar — only show Recipe tab in edit mode (item must exist first). The
          Recipe tab is disabled while the item is sold-from-stock (mutually
          exclusive with a recipe). */}
      {isEdit && (
        <div className="border-border flex gap-0 rounded-[var(--radius)] border p-0.5">
          {(["details", "recipe"] as const).map((t2) => {
            const disabled = t2 === "recipe" && soldFromStock;
            return (
              <button
                key={t2}
                type="button"
                disabled={disabled}
                title={disabled ? t("menu.form.recipeDisabledHint") : undefined}
                onClick={() => setTab(t2)}
                className={`text-label flex-1 rounded-[calc(var(--radius)-2px)] py-1.5 font-medium transition-colors disabled:opacity-40 ${
                  tab === t2
                    ? "bg-brand text-brand-white"
                    : "text-muted hover:text-ink"
                }`}
              >
                {t(`menu.form.tab.${t2}`)}
              </button>
            );
          })}
        </div>
      )}

      {tab === "details" ? (
        <form ref={formRef} action={formAction} className="flex flex-col gap-3">
          {/* Name */}
          <label className="flex flex-col gap-1">
            <span className="text-caption text-muted">{t("menu.form.name")}</span>
            <input
              type="text"
              name="name"
              required
              maxLength={120}
              defaultValue={isEdit ? mode.initialName : ""}
              className={FIELD}
            />
          </label>

          {/* Price + Item code */}
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-caption text-muted">{t("menu.form.price")} (LKR)</span>
              <input
                type="text"
                name="priceMajor"
                inputMode="decimal"
                required
                defaultValue={defaultPrice}
                onFocus={(e) => e.currentTarget.select()}
                className={`${FIELD} tabular-nums`}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-caption text-muted">{t("menu.form.code")}</span>
              <input
                type="text"
                name="itemCode"
                inputMode="numeric"
                defaultValue={isEdit && mode.initialItemCode ? mode.initialItemCode : ""}
                placeholder={t("menu.form.codeAuto")}
                className={`${FIELD} tabular-nums`}
              />
            </label>
          </div>

          {/* Category */}
          <label className="flex flex-col gap-1">
            <span className="text-caption text-muted">{t("menu.form.category")}</span>
            <input
              type="text"
              name="category"
              maxLength={60}
              defaultValue={isEdit ? (mode.initialCategory ?? "") : ""}
              placeholder={t("menu.form.categoryPlaceholder")}
              className={FIELD}
              list="menu-category-suggestions"
            />
            <datalist id="menu-category-suggestions">
              {["Bakery", "Beverages", "Snacks", "Cakes", "Pastries", "Custom"].map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>

          {/* Availability */}
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              name="isAvailable"
              value="true"
              defaultChecked={isEdit ? mode.initialIsAvailable : true}
              className="text-brand focus-visible:ring-brand/40 size-4 rounded outline-none focus-visible:ring-2"
            />
            <span className="text-label text-ink">{t("menu.form.available")}</span>
          </label>

          {/* Sold-from-stock (finished good) link. Setting this makes the item
              sold-from-stock — each sale decrements the finished good — instead of
              made-to-order. Mutually exclusive with a recipe. */}
          <label className="flex flex-col gap-1">
            <span className="text-caption text-muted">{t("menu.form.trackedGood")}</span>
            <select
              name="trackedInventoryItemId"
              value={trackedId}
              disabled={hasRecipe}
              onChange={(e) => setTrackedId(e.target.value)}
              className={`${FIELD} disabled:opacity-50`}
            >
              <option value="">{t("menu.form.trackedGoodNone")}</option>
              {finishedGoods.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <span className="text-caption text-faint">
              {hasRecipe ? t("menu.form.trackedGoodHasRecipeHint") : t("menu.form.trackedGoodHint")}
            </span>
          </label>

          {/* Image upload */}
          <label className="flex flex-col gap-1">
            <span className="text-caption text-muted">{t("menu.form.image")}</span>
            <label className="border-border hover:bg-surface-2 flex h-10 cursor-pointer items-center gap-2 rounded-[var(--radius)] border px-3 transition-colors">
              <ImageIcon className="text-muted size-4" aria-hidden />
              <span className="text-label text-muted truncate">
                {imageName ?? (isEdit && mode.initialImageUrl
                  ? t("menu.form.imageChange")
                  : t("menu.form.imageChoose"))}
              </span>
              <input
                type="file"
                name="image"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={(e) => setPickedName(e.target.files?.[0]?.name ?? null)}
              />
            </label>
            <span className="text-caption text-faint">{t("menu.form.imageHint")}</span>
          </label>

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
              {pending
                ? t("menu.form.saving")
                : isEdit
                  ? t("menu.form.saveChanges")
                  : t("menu.form.create")}
            </button>
            <button
              type="button"
              onClick={onDone}
              className="border-border-strong text-ink text-label hover:bg-surface-2 h-10 rounded-[var(--radius)] border px-4 font-medium transition-colors"
            >
              {t("menu.form.cancel")}
            </button>
          </div>
        </form>
      ) : (
        /* Recipe tab — only rendered in edit mode */
        isEdit && (
          <RecipeEditor
            menuItemId={mode.id}
            initialLines={mode.recipeLines.map((l) => ({
              inventoryItemId: l.inventory_item_id,
              qty: Number(l.qty),
              unit: l.unit,
            }))}
            ingredients={mode.ingredients}
            onSaved={onDone}
          />
        )
      )}
    </div>
  );
}

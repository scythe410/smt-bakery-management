"use client";

// Menu browser (SPEC §4.1). Client component over the server-fetched list.
// Features: search by name/code/category; filter by category or availability;
// inline create form; per-row edit/delete/availability toggle; recipe editor
// accessible from the edit sheet.
//
// Rows render as stacked list-rows (DESIGN.md §4): code chip (left), name +
// category (body), price (right), availability pill. The Menu nav badge shows
// the count of unavailable items — confirmed meaning noted in LOG.md.

import { useMemo, useState, useTransition } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { MenuItemForm, type MenuItemFormMode } from "@/components/menu/menu-item-form";
import {
  deleteMenuItem,
  toggleMenuItemAvailability,
  loadRecipeLinesForItem,
} from "@/app/(app)/menu/actions";
import { formatLKR } from "@/lib/format";
import type { MenuItem, IngredientOption } from "@/lib/db/selectors/menu";

export function MenuBrowser({
  items,
  unavailableCount,
  categories,
  ingredients,
}: {
  items: MenuItem[];
  unavailableCount: number;
  categories: string[];
  ingredients: IngredientOption[];
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [showUnavailable, setShowUnavailable] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [editMode, setEditMode] = useState<MenuItemFormMode | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (!showUnavailable && !item.isAvailable) return false;
      if (filterCategory && item.category !== filterCategory) return false;
      if (q) {
        const matchName = item.name.toLowerCase().includes(q);
        const matchCode = String(item.itemCode).includes(q);
        const matchCat = (item.category ?? "").toLowerCase().includes(q);
        if (!matchName && !matchCode && !matchCat) return false;
      }
      return true;
    });
  }, [items, query, filterCategory, showUnavailable]);

  const isFiltered = query.trim() !== "" || filterCategory !== "" || !showUnavailable;

  async function openEdit(item: MenuItem) {
    setEditingItem(item);
    const lines = await loadRecipeLinesForItem(item.id);
    const mode: MenuItemFormMode = {
      kind: "edit",
      id: item.id,
      initialName: item.name,
      initialPriceCents: item.priceCents,
      initialCategory: item.category,
      initialIsAvailable: item.isAvailable,
      initialItemCode: item.itemCode,
      initialImageUrl: item.imageUrl,
      recipeLines: lines,
      ingredients,
    };
    setEditMode(mode);
  }

  function closeEdit() {
    setEditingItem(null);
    setEditMode(null);
  }

  function closeCreate() {
    setCreating(false);
  }

  function handleDelete(id: string) {
    if (!confirm(t("menu.deleteConfirm"))) return;
    setDeletingId(id);
    startTransition(async () => {
      await deleteMenuItem(id);
      setDeletingId(null);
    });
  }

  function handleToggle(id: string, current: boolean) {
    setToggling(id);
    startTransition(async () => {
      await toggleMenuItemAvailability(id, !current);
      setToggling(null);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("menu.searchPlaceholder")}
          className="border-border text-label focus-visible:ring-brand/40 h-9 flex-1 rounded-[var(--radius)] border bg-surface px-3 outline-none focus-visible:ring-2"
        />
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="bg-brand text-brand-white text-label hover:bg-brand-ember flex h-9 shrink-0 items-center gap-1.5 rounded-[var(--radius)] px-3 font-semibold transition-colors"
        >
          <Plus className="size-4" aria-hidden />
          {t("menu.addItem")}
        </button>
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Category filter */}
        {categories.length > 0 && (
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="border-border text-caption text-ink focus-visible:ring-brand/40 h-8 rounded-[var(--radius)] border bg-surface px-2 outline-none focus-visible:ring-2"
          >
            <option value="">{t("menu.filter.allCategories")}</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}

        {/* Unavailable toggle */}
        <button
          type="button"
          onClick={() => setShowUnavailable((v) => !v)}
          aria-pressed={!showUnavailable}
          className={`text-caption flex h-8 items-center gap-1.5 rounded-[var(--radius-pill)] border px-3 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${
            !showUnavailable
              ? "border-brand bg-[var(--red-tint)] text-brand"
              : "border-border-strong text-ink hover:bg-surface-2"
          }`}
        >
          {unavailableCount > 0 && (
            <span className="bg-danger text-brand-white flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold">
              {unavailableCount}
            </span>
          )}
          {t("menu.filter.unavailable")}
        </button>
      </div>

      {/* Create form (inline) */}
      {creating && (
        <Card className="p-4">
          <h2 className="text-h2 text-ink mb-3 font-semibold">{t("menu.form.titleCreate")}</h2>
          <MenuItemForm mode={{ kind: "create" }} onDone={closeCreate} />
        </Card>
      )}

      {/* Edit sheet (inline) */}
      {editMode && editingItem && (
        <Card className="p-4">
          <div className="mb-3 flex items-start justify-between gap-2">
            <h2 className="text-h2 text-ink font-semibold">
              {t("menu.form.titleEdit", { name: editingItem.name })}
            </h2>
            <button
              type="button"
              onClick={closeEdit}
              className="text-muted hover:text-ink text-caption transition-colors"
            >
              {t("menu.form.close")}
            </button>
          </div>
          <MenuItemForm mode={editMode} onDone={closeEdit} />
        </Card>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <p className="text-body text-muted py-4 text-center">
          {isFiltered ? t("menu.noMatch") : t("menu.empty")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((item) => (
            <div
              key={item.id}
              className={`border-border bg-surface rounded-[var(--radius)] border shadow-[var(--shadow-card)] transition-opacity ${
                deletingId === item.id ? "opacity-40" : ""
              }`}
            >
              {/* Main row */}
              <div className="flex items-center gap-3 p-3">
                {/* Code chip */}
                <span className="border-border text-caption text-muted tabular-nums flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius)] border font-medium">
                  {item.itemCode}
                </span>

                {/* Name + category */}
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-label text-ink truncate font-medium">{item.name}</span>
                  {item.category ? (
                    <span className="text-caption text-muted truncate">{item.category}</span>
                  ) : null}
                  {item.recipeLineCount > 0 ? (
                    <span className="text-caption text-muted">
                      {t("menu.recipeCount", { count: item.recipeLineCount })}
                    </span>
                  ) : null}
                </div>

                {/* Price */}
                <span className="text-label text-ink tabular-nums shrink-0 font-semibold">
                  {formatLKR(item.priceCents)}
                </span>

                {/* Availability pill */}
                <StatusPill
                  tone={item.isAvailable ? "success" : "danger"}
                  label={
                    item.isAvailable ? t("menu.status.available") : t("menu.status.unavailable")
                  }
                />
              </div>

              {/* Action bar */}
              <div className="border-border flex border-t">
                {/* Toggle availability */}
                <button
                  type="button"
                  onClick={() => handleToggle(item.id, item.isAvailable)}
                  disabled={toggling === item.id}
                  className="text-caption text-muted hover:text-ink flex-1 py-2 transition-colors disabled:opacity-40"
                >
                  {item.isAvailable ? t("menu.action.markUnavailable") : t("menu.action.markAvailable")}
                </button>
                {/* Edit */}
                <button
                  type="button"
                  onClick={() => openEdit(item)}
                  aria-label={t("menu.action.edit")}
                  className="text-muted hover:text-ink border-border flex items-center justify-center border-l px-4 py-2 transition-colors"
                >
                  <Pencil className="size-4" />
                </button>
                {/* Delete */}
                <button
                  type="button"
                  onClick={() => handleDelete(item.id)}
                  disabled={deletingId === item.id}
                  aria-label={t("menu.action.delete")}
                  className="text-muted hover:text-danger border-border flex items-center justify-center border-l px-4 py-2 transition-colors disabled:opacity-40"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Count footer */}
      {items.length > 0 && (
        <p className="text-caption text-muted text-center">
          {isFiltered
            ? t("menu.showing", { shown: filtered.length, total: items.length })
            : t("menu.total", { count: items.length })}
        </p>
      )}
    </div>
  );
}

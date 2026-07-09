"use client";

// Add-item form (SPEC §3.3). Posts to the addInventoryItem server action, which
// re-checks the session, validates with Zod, and sets business_id server-side
// (CLAUDE.md §7). Unit cost is entered in rupees and converted to integer cents
// server-side — no float money is stored. Category/kind are the fixed enum sets
// from lib/inventory-config; their labels come from i18n. On success the action
// revalidates /inventory (the new row, low-stock counts, and nav badge update)
// and we close the form.

import { useActionState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { addInventoryItem, type AddInventoryItemState } from "@/app/(app)/inventory/actions";
import { INVENTORY_CATEGORIES, INVENTORY_KINDS } from "@/lib/inventory-config";
import type { InventoryCategory, InventoryKind } from "@/lib/inventory-config";

const FIELD_CLASS =
  "border-border text-label text-ink focus-visible:ring-brand/40 h-10 rounded-[var(--radius)] border bg-surface px-2 outline-none focus-visible:ring-2";

/** Prefill from a barcode scan (SPEC §5.1). Any field may be absent → blank. */
export type AddItemPrefill = {
  name?: string;
  category?: InventoryCategory;
  kind?: InventoryKind;
  barcode?: string;
};

export function AddItemForm({ onDone, prefill }: { onDone: () => void; prefill?: AddItemPrefill }) {
  const { t } = useTranslation();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<AddInventoryItemState, FormData>(
    addInventoryItem,
    {},
  );

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      onDone();
    }
  }, [state.ok, onDone]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      {/* Carries the scanned code through to the insert so re-scans match it. */}
      {prefill?.barcode ? <input type="hidden" name="barcode" value={prefill.barcode} /> : null}

      {prefill?.barcode ? (
        <div className="bg-surface-2 border-border flex items-center justify-between gap-2 rounded-[var(--radius)] border px-3 py-2">
          <span className="text-caption text-muted">{t("inventory.add.barcode")}</span>
          <span className="text-label text-ink font-medium tabular-nums">{prefill.barcode}</span>
        </div>
      ) : null}

      <label className="flex flex-col gap-1">
        <span className="text-caption text-muted">{t("inventory.add.name")}</span>
        <input
          type="text"
          name="name"
          required
          maxLength={120}
          defaultValue={prefill?.name ?? ""}
          className={FIELD_CLASS}
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-caption text-muted">{t("inventory.add.kind")}</span>
          <select
            name="kind"
            defaultValue={prefill?.kind ?? INVENTORY_KINDS[0]}
            className={FIELD_CLASS}
          >
            {INVENTORY_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`inventory.kind.${k}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-caption text-muted">{t("inventory.add.category")}</span>
          <select
            name="category"
            defaultValue={prefill?.category ?? INVENTORY_CATEGORIES[0]}
            className={FIELD_CLASS}
          >
            {INVENTORY_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`inventory.category.${c}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-caption text-muted">{t("inventory.add.qty")}</span>
          <input
            type="number"
            name="qtyOnHand"
            inputMode="decimal"
            step="0.001"
            min="0"
            defaultValue="0"
            required
            className={`${FIELD_CLASS} tabular-nums`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-caption text-muted">{t("inventory.add.unit")}</span>
          <input
            type="text"
            name="unit"
            defaultValue="unit"
            required
            maxLength={20}
            className={FIELD_CLASS}
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-caption text-muted">{t("inventory.add.unitCost")} (LKR)</span>
          <input
            type="number"
            name="unitCost"
            inputMode="decimal"
            step="0.01"
            min="0"
            defaultValue="0"
            required
            className={`${FIELD_CLASS} tabular-nums`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-caption text-muted">{t("inventory.add.lowStockThreshold")}</span>
          <input
            type="number"
            name="lowStockThreshold"
            inputMode="decimal"
            step="0.001"
            min="0"
            defaultValue="0"
            required
            className={`${FIELD_CLASS} tabular-nums`}
          />
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
          {pending ? t("inventory.add.saving") : t("inventory.add.save")}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="border-border-strong text-ink text-label hover:bg-surface-2 h-10 rounded-[var(--radius)] border px-4 font-medium transition-colors"
        >
          {t("inventory.add.cancel")}
        </button>
      </div>
    </form>
  );
}

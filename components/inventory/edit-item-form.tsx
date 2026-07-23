"use client";

// Edit-item form (SPEC §3.3 follow-up; client request). Edits an existing
// inventory item's descriptive/pricing fields — crucially the BARCODE, so a
// manually-added item (no barcode) can be made scannable, and a wrong one (e.g.
// a QR-code URL) can be corrected. Posts to editInventoryItem, which re-checks
// the session, validates with Zod, guards kind changes against the model
// invariants, and enforces barcode uniqueness. Quantity is deliberately absent —
// stock is a movement-ledger running total, adjusted via receive/produce/audit.

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { editInventoryItem, type EditInventoryItemState } from "@/app/(app)/inventory/actions";
import { INVENTORY_CATEGORIES, INVENTORY_KINDS } from "@/lib/inventory-config";
import type { InventoryKind } from "@/lib/inventory-config";
import type { InventoryListItem } from "@/lib/db/selectors/inventory";

const FIELD_CLASS =
  "border-border text-label text-ink focus-visible:ring-brand/40 h-10 rounded-[var(--radius)] border bg-surface px-2 outline-none focus-visible:ring-2";

function toMajor(cents: number | null): string {
  return cents == null ? "" : (cents / 100).toFixed(2);
}

export function EditItemForm({ item, onDone }: { item: InventoryListItem; onDone: () => void }) {
  const { t } = useTranslation();
  const formRef = useRef<HTMLFormElement>(null);
  const editBound = editInventoryItem.bind(null, item.id);
  const [state, formAction, pending] = useActionState<EditInventoryItemState, FormData>(
    editBound,
    {},
  );

  // Controlled so the retail-price field follows the kind (sellable kinds only).
  const [kind, setKind] = useState<InventoryKind>(item.kind);
  const sellable = kind === "merchandise" || kind === "finished_good";

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-h2 text-ink font-semibold">{t("inventory.edit.title")}</h2>
        <button
          type="button"
          onClick={onDone}
          className="text-muted hover:text-ink text-caption transition-colors"
        >
          {t("inventory.edit.close")}
        </button>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-caption text-muted">{t("inventory.add.name")}</span>
        <input
          type="text"
          name="name"
          required
          maxLength={120}
          defaultValue={item.name}
          className={FIELD_CLASS}
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-caption text-muted">{t("inventory.add.kind")}</span>
          <select
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as InventoryKind)}
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
          <select name="category" defaultValue={item.category} className={FIELD_CLASS}>
            {INVENTORY_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`inventory.category.${c}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Barcode — the key edit: set one so scanning recognises the item, or fix
          a wrong/URL value. Blank clears it (→ NULL, unscannable). */}
      <label className="flex flex-col gap-1">
        <span className="text-caption text-muted">{t("inventory.add.barcode")}</span>
        <input
          type="text"
          name="barcode"
          inputMode="text"
          maxLength={64}
          defaultValue={item.barcode ?? ""}
          placeholder={t("inventory.edit.barcodePlaceholder")}
          className={`${FIELD_CLASS} tabular-nums`}
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-caption text-muted">{t("inventory.add.unit")}</span>
          <input
            type="text"
            name="unit"
            required
            maxLength={20}
            defaultValue={item.unit}
            className={FIELD_CLASS}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-caption text-muted">{t("inventory.add.lowStockThreshold")}</span>
          <input
            type="text"
            name="lowStockThreshold"
            inputMode="decimal"
            defaultValue={String(item.lowStockThreshold)}
            required
            onFocus={(e) => e.currentTarget.select()}
            className={`${FIELD_CLASS} tabular-nums`}
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-caption text-muted">{t("inventory.add.unitCost")} (LKR)</span>
          <input
            type="text"
            name="unitCost"
            inputMode="decimal"
            defaultValue={toMajor(item.unitCostCents)}
            required
            onFocus={(e) => e.currentTarget.select()}
            className={`${FIELD_CLASS} tabular-nums`}
          />
        </label>
        {sellable ? (
          <label className="flex flex-col gap-1">
            <span className="text-caption text-muted">{t("inventory.add.salePrice")} (LKR)</span>
            <input
              type="text"
              name="salePrice"
              inputMode="decimal"
              defaultValue={toMajor(item.salePriceCents)}
              onFocus={(e) => e.currentTarget.select()}
              placeholder={t("inventory.add.salePricePlaceholder")}
              className={`${FIELD_CLASS} tabular-nums`}
            />
          </label>
        ) : null}
      </div>

      <p className="text-caption text-faint">{t("inventory.edit.qtyNote")}</p>

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
          {pending ? t("inventory.edit.saving") : t("inventory.edit.save")}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="border-border-strong text-ink text-label hover:bg-surface-2 h-10 rounded-[var(--radius)] border px-4 font-medium transition-colors"
        >
          {t("inventory.edit.cancel")}
        </button>
      </div>
    </form>
  );
}

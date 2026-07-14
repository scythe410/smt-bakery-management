"use client";

// Periodic ingredient audit (spot-count) — the ingredient lane's reconciliation,
// separate from the daily merchandise count. Pick an ingredient, enter its
// physical counted quantity; the counted value is compared to the system
// qty_on_hand and the difference posts a `count_adjust` movement (recordStockAudit)
// that surfaces as spoilage/variance. The variance previews live as you type and
// is confirmed from the server result after recording. Item names are business
// data, shown as entered — not translated (CLAUDE.md §3).
//
// A hardware keyboard-wedge scan (useBarcodeScanner) resolves the code against
// this tenant's own ingredient catalog and, on a match, selects that ingredient
// and focuses its counted-qty field so the operator can key the count straight in
// — announced through an aria-live region for consecutive scans.

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { useBarcodeScanner } from "@/lib/hooks/use-barcode-scanner";
import { recordStockAudit, type StockAuditState } from "@/app/(app)/inventory/audit/actions";

const FIELD =
  "border-border text-label text-ink focus-visible:ring-brand/40 bg-surface h-10 rounded-[var(--radius)] border px-2 outline-none focus-visible:ring-2";

export type AuditItem = {
  id: string;
  name: string;
  unit: string;
  /** Stored barcode (GTIN), or null — lets a hardware scan select this item. */
  barcode: string | null;
  qtyOnHand: number;
};

function fmtQty(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 3 });
}

export function IngredientAudit({ items }: { items: AuditItem[] }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [selectedId, setSelectedId] = useState<string>(items[0]?.id ?? "");
  const [counted, setCounted] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<NonNullable<StockAuditState["result"]> | null>(null);
  const [announce, setAnnounce] = useState("");
  const countedRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => items.find((it) => it.id === selectedId) ?? null, [items, selectedId]);

  // code → ingredient id, so a hardware scan can select the item directly.
  const byBarcode = useMemo(() => {
    const map = new Map<string, string>();
    for (const it of items) if (it.barcode) map.set(it.barcode, it.id);
    return map;
  }, [items]);

  useBarcodeScanner({
    enabled: items.length > 0,
    onScan: (code) => {
      const id = byBarcode.get(code);
      if (!id) {
        setAnnounce(t("stock.scan.notFound", { code }));
        return;
      }
      const item = items.find((it) => it.id === id);
      setSelectedId(id);
      setResult(null);
      setError(null);
      setCounted("");
      setAnnounce(t("stock.scan.jumped", { name: item?.name ?? "" }));
      // Let the select re-render with the new value, then focus the count field.
      requestAnimationFrame(() => countedRef.current?.focus());
    },
  });

  // Live preview of the variance (confirmed against the server on submit).
  const preview = useMemo(() => {
    if (!selected || counted.trim() === "") return null;
    return Number(counted) - selected.qtyOnHand;
  }, [selected, counted]);

  function submit() {
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      const res = await recordStockAudit({
        inventoryItemId: selected.id,
        countedQty: Number(counted || 0),
      });
      if (res.error) {
        setError(res.error);
      } else if (res.result) {
        setResult(res.result);
        setCounted("");
        router.refresh();
      }
    });
  }

  if (items.length === 0) {
    return (
      <Card>
        <p className="text-body text-muted py-2">{t("stock.audit.noIngredients")}</p>
      </Card>
    );
  }

  const variance = result?.varianceUnits ?? null;
  const varianceTone = variance === null ? "neutral" : variance === 0 ? "success" : "danger";

  return (
    <div className="flex flex-col gap-3">
      <span className="text-caption text-muted">{t("stock.audit.hint")}</span>
      <span className="text-caption text-faint">{t("stock.scan.hint")}</span>
      {/* Announce a hardware scan (jumped/not-found) to assistive tech. */}
      <span className="sr-only" role="status" aria-live="polite">
        {announce}
      </span>
      <Card className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-caption text-muted">{t("stock.audit.item")}</span>
          <select
            value={selectedId}
            onChange={(e) => {
              setSelectedId(e.target.value);
              setResult(null);
              setError(null);
            }}
            className={FIELD}
          >
            {items.map((it) => (
              <option key={it.id} value={it.id}>
                {it.name}
              </option>
            ))}
          </select>
        </label>

        {selected ? (
          <div className="bg-surface-2 border-border flex items-center justify-between gap-2 rounded-[var(--radius)] border px-3 py-2">
            <span className="text-caption text-muted">{t("stock.audit.systemQty")}</span>
            <span className="text-label text-ink font-medium tabular-nums">
              {fmtQty(selected.qtyOnHand)} {selected.unit}
            </span>
          </div>
        ) : null}

        <label className="flex flex-col gap-1">
          <span className="text-caption text-muted">
            {t("stock.audit.countedQty")} {selected ? `(${selected.unit})` : ""}
          </span>
          <input
            ref={countedRef}
            type="text"
            inputMode="decimal"
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
            placeholder={t("stock.audit.countPlaceholder")}
            className={`${FIELD} tabular-nums`}
          />
        </label>

        {preview !== null && result === null ? (
          <p className="text-caption text-muted tabular-nums">
            {t("stock.audit.previewVariance")}: {preview > 0 ? "+" : ""}
            {fmtQty(preview)} {selected?.unit}
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="text-caption text-danger">
            {t(error)}
          </p>
        ) : null}

        <button
          type="button"
          onClick={submit}
          disabled={pending || !selected || counted.trim() === ""}
          className="bg-brand text-brand-white text-label hover:bg-brand-ember flex h-11 items-center justify-center gap-1.5 rounded-[var(--radius)] font-semibold transition-colors disabled:opacity-50"
        >
          <ClipboardCheck className="size-4" aria-hidden />
          {pending ? t("stock.audit.saving") : t("stock.audit.action")}
        </button>
      </Card>

      {result ? (
        <Card className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2" role="status">
            <span className="text-label text-ink font-semibold">{t("stock.audit.recorded")}</span>
            <StatusPill
              tone={varianceTone}
              label={variance === 0 ? t("stock.audit.noVariance") : t("stock.audit.varianceFlag")}
            />
          </div>
          <div className="text-caption text-muted flex flex-wrap gap-x-3 gap-y-0.5 tabular-nums">
            <span>{t("stock.audit.systemQty")}: {fmtQty(result.systemQty)}</span>
            <span>{t("stock.audit.countedQty")}: {fmtQty(result.countedQty)}</span>
            <span>
              {t("stock.audit.variance")}: {result.varianceUnits > 0 ? "+" : ""}
              {fmtQty(result.varianceUnits)} {result.unit}
            </span>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

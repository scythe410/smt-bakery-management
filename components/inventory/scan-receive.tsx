"use client";

// Receive Stock (scan-on-receipt). The inbound counterpart of billing: when goods
// are brought into the store, the operator SCANS each barcode and the item's stock
// increments (a `restock` movement, +qty; default 1, editable) — "update into
// inventory when goods are brought in" (CLAUDE.md §4).
//
//   * Known barcode → the Receive panel: shows the item + current stock and a qty
//     stepper; confirming posts a restock via the receiveStock action (RLS-scoped,
//     server-validated). Repeatable — scan the next item without leaving.
//   * Unknown barcode → the own-catalog create flow (AddItemForm), prefilled from a
//     public product lookup and defaulting to `merchandise` (a scanned barcode is a
//     packaged resale good). Saving with an opening qty stocks it in one step.
//
// Capture is shared: the camera (useCameraScanner — needs permission; optional at a
// fixed counter) AND a USB/Bluetooth keyboard-wedge scanner (useBarcodeScanner —
// no permission, the primary mode) both funnel into the SAME handleCode pipeline.
// Manual entry covers unreadable codes / a denied camera. Item names are business
// data, shown as entered — not translated (CLAUDE.md §3).

import { useCallback, useRef, useState } from "react";
import { Camera, Check, Keyboard, Minus, Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AddItemForm, type AddItemPrefill } from "@/components/inventory/add-item-form";
import { lookupBarcode, receiveStock } from "@/app/(app)/inventory/actions";
import { useBarcodeScanner } from "@/lib/hooks/use-barcode-scanner";
import { useCameraScanner, type CameraScannerError } from "@/lib/hooks/use-camera-scanner";

/** What the barcode index resolves a known code to. */
export type ReceiveTarget = {
  id: string;
  name: string;
  unit: string;
  qtyOnHand: number | null;
};

type Phase = "scanning" | "looking_up" | "receiving" | "form";

function formatQty(qty: number): string {
  return qty.toLocaleString("en-US", { maximumFractionDigits: 3 });
}

export function ScanReceive({
  onClose,
  barcodeIndex,
}: {
  onClose: () => void;
  /** code → the existing item to restock, for a known-barcode receive. */
  barcodeIndex: Map<string, ReceiveTarget>;
}) {
  const { t } = useTranslation();

  const [phase, setPhase] = useState<Phase>("scanning");
  const [camError, setCamError] = useState<CameraScannerError | null>(null);
  const [prefill, setPrefill] = useState<AddItemPrefill | null>(null);
  const [target, setTarget] = useState<ReceiveTarget | null>(null);
  const [captured, setCaptured] = useState("");
  const [qty, setQty] = useState("1");
  const [receiving, setReceiving] = useState(false);
  const [receiveError, setReceiveError] = useState(false);
  const [receivedQty, setReceivedQty] = useState<number | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [manual, setManual] = useState("");
  // Bumped to force a camera restart even when the phase is already "scanning"
  // (retrying after a permission-denied on the first attempt).
  const [attempt, setAttempt] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const handledRef = useRef(false);

  // Resolve a code (scan OR manual entry): a known barcode → the receive panel;
  // an unknown one → look it up and fall to the prefilled create form. Guarded so a
  // burst of decode callbacks only fires once.
  const handleCode = useCallback(
    async (raw: string) => {
      const code = raw.trim();
      if (!code || handledRef.current) return;
      handledRef.current = true;
      setCaptured(code);

      const existing = barcodeIndex.get(code);
      if (existing) {
        setTarget(existing);
        setQty("1");
        setReceiveError(false);
        setReceivedQty(null);
        setPhase("receiving");
        return;
      }

      setPhase("looking_up");
      const result = await lookupBarcode(code);
      setPrefill(
        result.found
          ? { name: result.name, category: result.category, kind: result.kind, barcode: code }
          : // No match → blank form, but keep the code and default to merchandise
            // (a scanned barcode is a packaged resale good).
            { barcode: code, kind: "merchandise" },
      );
      setPhase("form");
    },
    [barcodeIndex],
  );

  // Camera decode path — active only while scanning.
  useCameraScanner({
    videoRef,
    enabled: phase === "scanning",
    restartKey: attempt,
    onDecode: (code) => void handleCode(code),
    onError: (e) => setCamError(e),
  });

  // Hardware keyboard-wedge scanner — same handleCode pipeline, works with the
  // camera denied. Default focus mode (bail while typing in the manual field).
  useBarcodeScanner({ onScan: (code) => void handleCode(code), enabled: phase === "scanning" });

  function backToScanning() {
    handledRef.current = false;
    setPrefill(null);
    setTarget(null);
    setCaptured("");
    setQty("1");
    setReceiveError(false);
    setReceivedQty(null);
    setManual("");
    setShowManual(false);
    setCamError(null);
    setAttempt((a) => a + 1);
    setPhase("scanning");
  }

  function submitManual() {
    const code = manual.trim();
    if (code) void handleCode(code);
  }

  function bumpQty(delta: number) {
    const next = Math.max(1, (parseInt(qty, 10) || 0) + delta);
    setQty(String(next));
  }

  function confirmReceive() {
    if (!target) return;
    const parsed = Number(qty);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setReceiveError(true);
      return;
    }
    setReceiveError(false);
    setReceiving(true);
    void receiveStock({ inventoryItemId: target.id, qty: parsed }).then((res) => {
      setReceiving(false);
      if (res.error || res.qtyOnHand === undefined) {
        setReceiveError(true);
      } else {
        setReceivedQty(res.qtyOnHand);
      }
    });
  }

  const heading = (
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-h2 text-ink">{t("inventory.receive.title")}</h2>
      <button
        type="button"
        onClick={onClose}
        aria-label={t("inventory.scan.close")}
        className="text-muted hover:bg-surface-2 hover:text-ink flex size-8 items-center justify-center rounded-[var(--radius)] transition-colors"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );

  // Known barcode → receive N units into stock.
  if (phase === "receiving" && target) {
    const done = receivedQty !== null;
    return (
      <div className="flex flex-col gap-3">
        {heading}
        <div className="border-border bg-surface-2 flex flex-col gap-1 rounded-[var(--radius)] border p-3">
          <span className="text-caption text-muted tabular-nums">{captured}</span>
          <span className="text-label text-ink font-semibold">{target.name}</span>
          <span className="text-caption text-muted tabular-nums">
            {t("inventory.receive.inStock", {
              qty: formatQty(done ? receivedQty! : (target.qtyOnHand ?? 0)),
              unit: target.unit,
            })}
          </span>
        </div>

        {done ? (
          <>
            <div
              role="status"
              className="border-border bg-success-bg/40 text-success flex items-center gap-2 rounded-[var(--radius)] border p-3"
            >
              <Check className="size-4" aria-hidden />
              <span className="text-label font-semibold">{t("inventory.receive.added")}</span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={backToScanning}
                className="bg-brand text-brand-white text-label hover:bg-brand-ember h-10 flex-1 rounded-[var(--radius)] font-semibold transition-colors"
              >
                {t("inventory.receive.scanAgain")}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="border-border-strong text-ink text-label hover:bg-surface-2 h-10 rounded-[var(--radius)] border px-4 font-medium transition-colors"
              >
                {t("inventory.receive.done")}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <span className="text-caption text-muted">{t("inventory.receive.qtyLabel")}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => bumpQty(-1)}
                  aria-label={t("inventory.receive.decrease")}
                  className="border-border-strong text-ink hover:bg-surface-2 flex size-10 shrink-0 items-center justify-center rounded-[var(--radius)] border"
                >
                  <Minus className="size-4" aria-hidden />
                </button>
                <input
                  type="text"
                  inputMode="numeric"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label={t("inventory.receive.qtyLabel")}
                  className="border-border text-label text-ink focus-visible:ring-brand/40 bg-surface h-10 min-w-0 flex-1 rounded-[var(--radius)] border px-2 text-center tabular-nums outline-none focus-visible:ring-2"
                />
                <button
                  type="button"
                  onClick={() => bumpQty(1)}
                  aria-label={t("inventory.receive.increase")}
                  className="border-border-strong text-ink hover:bg-surface-2 flex size-10 shrink-0 items-center justify-center rounded-[var(--radius)] border"
                >
                  <Plus className="size-4" aria-hidden />
                </button>
              </div>
            </div>

            {receiveError ? (
              <p role="alert" className="text-caption text-danger">
                {t("inventory.receive.error")}
              </p>
            ) : null}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={confirmReceive}
                disabled={receiving}
                className="bg-brand text-brand-white text-label hover:bg-brand-ember h-10 flex-1 rounded-[var(--radius)] font-semibold transition-colors disabled:opacity-50"
              >
                {receiving ? t("inventory.receive.adding") : t("inventory.receive.add")}
              </button>
              <button
                type="button"
                onClick={backToScanning}
                className="border-border-strong text-ink text-label hover:bg-surface-2 h-10 rounded-[var(--radius)] border px-4 font-medium transition-colors"
              >
                {t("inventory.receive.scanAgain")}
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  // Unknown barcode → create it in the own catalog, then it is stocked.
  if (phase === "form" && prefill) {
    return (
      <div className="flex flex-col gap-3">
        {heading}
        <p className="text-caption text-muted" role="status">
          {prefill.name ? t("inventory.scan.matched") : t("inventory.receive.unknown")}
        </p>
        <AddItemForm prefill={prefill} onDone={onClose} />
      </div>
    );
  }

  // Looking the code up against the product API.
  if (phase === "looking_up") {
    return (
      <div className="flex flex-col gap-3">
        {heading}
        <div className="border-border bg-surface-2 flex items-center gap-3 rounded-[var(--radius)] border p-4">
          <span
            className="border-brand size-4 animate-spin rounded-full border-2 border-t-transparent"
            aria-hidden
          />
          <p className="text-body text-muted" role="status">
            {t("inventory.scan.lookingUp")}
          </p>
        </div>
      </div>
    );
  }

  // Scanning (camera live) or a camera error — both keep manual entry available.
  return (
    <div className="flex flex-col gap-3">
      {heading}
      <p className="text-caption text-muted">{t("inventory.receive.hint")}</p>

      {camError ? (
        <div
          role="alert"
          className="border-border bg-danger-bg/40 flex flex-col gap-1 rounded-[var(--radius)] border p-3"
        >
          <p className="text-label text-ink font-semibold">
            {t(`inventory.scan.error.${camError}`)}
          </p>
          <p className="text-caption text-muted">{t("inventory.scan.error.useManual")}</p>
        </div>
      ) : (
        <>
          <div className="border-border relative aspect-square overflow-hidden rounded-[var(--radius)] border bg-black">
            <video
              ref={videoRef}
              className="size-full object-cover"
              playsInline
              muted
              aria-label={t("inventory.scan.viewfinderLabel")}
            />
            <div
              className="border-brand-white/80 pointer-events-none absolute inset-8 rounded-[var(--radius)] border-2"
              aria-hidden
            />
          </div>
        </>
      )}

      <p className="text-caption text-faint text-center">{t("inventory.scan.hardwareHint")}</p>

      <span className="sr-only" role="status" aria-live="polite">
        {captured ? t("inventory.scan.announce", { code: captured }) : ""}
      </span>

      {/* Manual entry — fallback for unreadable codes or a denied camera. */}
      {showManual || camError ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="manual-receive-barcode" className="text-caption text-muted">
            {t("inventory.scan.manualLabel")}
          </label>
          <div className="flex gap-2">
            <input
              id="manual-receive-barcode"
              type="text"
              inputMode="numeric"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitManual();
                }
              }}
              maxLength={64}
              placeholder={t("inventory.scan.manualPlaceholder")}
              className="border-border text-label text-ink focus-visible:ring-brand/40 bg-surface h-10 min-w-0 flex-1 rounded-[var(--radius)] border px-2 tabular-nums outline-none focus-visible:ring-2"
            />
            <button
              type="button"
              onClick={submitManual}
              disabled={manual.trim() === ""}
              className="bg-brand text-brand-white text-label hover:bg-brand-ember h-10 rounded-[var(--radius)] px-4 font-semibold transition-colors disabled:opacity-50"
            >
              {t("inventory.scan.lookup")}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowManual(true)}
          className="border-border-strong text-ink text-label hover:bg-surface-2 flex h-10 items-center justify-center gap-1.5 rounded-[var(--radius)] border font-medium transition-colors"
        >
          <Keyboard className="size-4" aria-hidden />
          {t("inventory.scan.enterManually")}
        </button>
      )}

      {camError ? (
        <button
          type="button"
          onClick={backToScanning}
          className="border-border-strong text-ink text-label hover:bg-surface-2 flex h-10 items-center justify-center gap-1.5 rounded-[var(--radius)] border font-medium transition-colors"
        >
          <Camera className="size-4" aria-hidden />
          {t("inventory.scan.retryCamera")}
        </button>
      ) : null}
    </div>
  );
}

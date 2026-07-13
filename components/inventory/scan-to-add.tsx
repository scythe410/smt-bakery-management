"use client";

// Scan to Add (SPEC §5.1). Opens the device camera via getUserMedia (through
// @zxing/browser) and decodes EAN/UPC/QR. On a read it looks the code up against
// a public product API — server-side, via the lookupBarcode action — to prefill
// the add-item form, falling back to a blank form (barcode kept) on any miss.
// Manual entry covers unreadable codes; camera-permission-denied is handled
// gracefully with a clear message and the manual path still available. The
// scanned code rides through to the insert, so a later re-scan of the same
// product is recognised as already stocked.
//
// Camera lifecycle: the stream is started by an effect while `phase === "scanning"`
// and always torn down (controls.stop()) on cleanup — leaving the screen, reading
// a code, or an error all stop the camera; nothing keeps it live in the
// background.

import { useCallback, useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import { Camera, Keyboard, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AddItemForm, type AddItemPrefill } from "@/components/inventory/add-item-form";
import { lookupBarcode } from "@/app/(app)/inventory/actions";

type Phase = "scanning" | "looking_up" | "form" | "duplicate";
type CamError = "denied" | "no_camera" | "insecure" | "generic";

function classifyError(err: unknown): CamError {
  const name = err instanceof Error ? err.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") return "denied";
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError")
    return "no_camera";
  return "generic";
}

export function ScanToAdd({
  onClose,
  barcodeIndex,
}: {
  onClose: () => void;
  /** code → existing item name, for re-scan detection. */
  barcodeIndex: Map<string, string>;
}) {
  const { t } = useTranslation();

  const [phase, setPhase] = useState<Phase>("scanning");
  const [camError, setCamError] = useState<CamError | null>(null);
  const [prefill, setPrefill] = useState<AddItemPrefill | null>(null);
  const [dupName, setDupName] = useState<string | null>(null);
  const [captured, setCaptured] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [manual, setManual] = useState("");
  // Bumped to force a camera restart even when the phase is already "scanning"
  // (e.g. retrying after a permission-denied on the first attempt).
  const [attempt, setAttempt] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const handledRef = useRef(false);

  const stopCamera = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
  }, []);

  // Resolve a code (from a scan OR manual entry): recognise a re-scan, else look
  // it up and move to the prefilled form. Guarded so a burst of decode callbacks
  // only fires once.
  const handleCode = useCallback(
    async (raw: string) => {
      const code = raw.trim();
      if (!code || handledRef.current) return;
      handledRef.current = true;
      stopCamera();
      setCaptured(code);

      const existing = barcodeIndex.get(code);
      if (existing) {
        setDupName(existing);
        setPhase("duplicate");
        return;
      }

      setPhase("looking_up");
      const result = await lookupBarcode(code);
      setPrefill(
        result.found
          ? { name: result.name, category: result.category, kind: result.kind, barcode: code }
          : // No match → blank form, but keep the code and default to merchandise
            // (a scanned barcode is a packaged retail good).
            { barcode: code, kind: "merchandise" },
      );
      setPhase("form");
    },
    [barcodeIndex, stopCamera],
  );

  // Start/stop the camera for the scanning phase. All state changes happen inside
  // the async continuation (never synchronously in the effect body), so entering
  // "scanning" doesn't cascade renders.
  useEffect(() => {
    if (phase !== "scanning") return;
    handledRef.current = false;
    let cancelled = false;

    const start = async () => {
      // getUserMedia needs a secure context (https / localhost); without it the
      // API is absent — surface that specifically rather than as a generic fault.
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        if (!cancelled) setCamError("insecure");
        return;
      }
      // @zxing (~195 KB) is loaded here, inside the scan effect, so it ships as a
      // separate chunk fetched only when a scan actually starts — never on
      // Inventory page load (Antigravity HIGH-3).
      const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
        import("@zxing/browser"),
        import("@zxing/library"),
      ]);
      if (cancelled) return;

      // Restrict decoding to the retail formats we care about (SPEC §5.1) — fewer
      // formats means faster, steadier reads.
      const hints = new Map([
        [
          DecodeHintType.POSSIBLE_FORMATS,
          [
            BarcodeFormat.EAN_13,
            BarcodeFormat.EAN_8,
            BarcodeFormat.UPC_A,
            BarcodeFormat.UPC_E,
            BarcodeFormat.QR_CODE,
            BarcodeFormat.CODE_128,
          ],
        ],
      ]);
      const reader = new BrowserMultiFormatReader(hints);

      try {
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: "environment" } },
          videoRef.current!,
          (result) => {
            if (result) void handleCode(result.getText());
          },
        );
        if (cancelled) controls.stop();
        else controlsRef.current = controls;
      } catch (err) {
        if (!cancelled) setCamError(classifyError(err));
      }
    };
    void start();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [phase, attempt, handleCode]);

  function rescan() {
    handledRef.current = false;
    setPrefill(null);
    setDupName(null);
    setCaptured("");
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

  const heading = (
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-h2 text-ink">{t("inventory.scan.title")}</h2>
      <button
        type="button"
        onClick={() => {
          stopCamera();
          onClose();
        }}
        aria-label={t("inventory.scan.close")}
        className="text-muted hover:bg-surface-2 hover:text-ink flex size-8 items-center justify-center rounded-[var(--radius)] transition-colors"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );

  // Prefilled form after a read (found or blank fallback).
  if (phase === "form" && prefill) {
    return (
      <div className="flex flex-col gap-3">
        {heading}
        <p className="text-caption text-muted" role="status">
          {prefill.name ? t("inventory.scan.matched") : t("inventory.scan.noMatch")}
        </p>
        <AddItemForm prefill={prefill} onDone={onClose} />
      </div>
    );
  }

  // Re-scan of an already-stocked product.
  if (phase === "duplicate") {
    return (
      <div className="flex flex-col gap-3">
        {heading}
        <div className="border-border bg-surface-2 flex flex-col gap-1 rounded-[var(--radius)] border p-3">
          <span className="text-caption text-muted tabular-nums">{captured}</span>
          <p className="text-body text-ink">
            {t("inventory.scan.duplicateNamed", { name: dupName ?? "" })}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={rescan}
            className="bg-brand text-brand-white text-label hover:bg-brand-ember h-10 flex-1 rounded-[var(--radius)] font-semibold transition-colors"
          >
            {t("inventory.scan.scanAgain")}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="border-border-strong text-ink text-label hover:bg-surface-2 h-10 rounded-[var(--radius)] border px-4 font-medium transition-colors"
          >
            {t("inventory.scan.done")}
          </button>
        </div>
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

      {camError ? (
        <div
          role="alert"
          className="border-border bg-danger-bg/40 flex flex-col gap-1 rounded-[var(--radius)] border p-3"
        >
          <p className="text-label text-ink font-semibold">{t(`inventory.scan.error.${camError}`)}</p>
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
            {/* Framing guide (decorative). */}
            <div
              className="border-brand-white/80 pointer-events-none absolute inset-8 rounded-[var(--radius)] border-2"
              aria-hidden
            />
          </div>
          <p className="text-caption text-muted text-center">{t("inventory.scan.hint")}</p>
        </>
      )}

      {/* Manual entry — fallback for unreadable codes or a denied camera. */}
      {showManual || camError ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="manual-barcode" className="text-caption text-muted">
            {t("inventory.scan.manualLabel")}
          </label>
          <div className="flex gap-2">
            <input
              id="manual-barcode"
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
          onClick={rescan}
          className="border-border-strong text-ink text-label hover:bg-surface-2 flex h-10 items-center justify-center gap-1.5 rounded-[var(--radius)] border font-medium transition-colors"
        >
          <Camera className="size-4" aria-hidden />
          {t("inventory.scan.retryCamera")}
        </button>
      ) : null}
    </div>
  );
}

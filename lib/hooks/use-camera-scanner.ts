"use client";

// useCameraScanner — the camera decode path, shared by every scan surface
// (Inventory receive, billing quick-add). Wraps @zxing/browser: opens the device
// camera via getUserMedia and decodes EAN/UPC/QR, calling `onDecode` for each read.
//
// Focus/decode fixes over the previous inline implementation:
//   * facingMode is `{ ideal: "environment" }`, NOT a hard `"environment"`
//     constraint. On a laptop / single-camera device the hard constraint is
//     UNSATISFIABLE and getUserMedia throws OverconstrainedError → the camera never
//     starts (the #1 reason "the scanner doesn't work" on a demo machine). `ideal`
//     prefers the rear camera but falls back to whatever camera exists.
//   * @zxing (~195 KB) is imported lazily inside the effect, so it ships as a
//     separate chunk fetched only when a scan actually starts.
//   * The stream is always torn down on cleanup (leave the screen, disable, or a
//     decode that ends the scan) — nothing keeps the camera live in the background.
//
// `restartKey` bumps to force a fresh camera start even when `enabled` is
// unchanged (retry after a permission-denied). The caller guards against duplicate
// decodes (a decode callback can fire on consecutive frames).

import { useEffect } from "react";
import type { RefObject } from "react";

export type CameraScannerError = "denied" | "no_camera" | "insecure" | "generic";

export function classifyCameraError(err: unknown): CameraScannerError {
  const name = err instanceof Error ? err.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") return "denied";
  if (
    name === "NotFoundError" ||
    name === "DevicesNotFoundError" ||
    name === "OverconstrainedError"
  )
    return "no_camera";
  return "generic";
}

export function useCameraScanner({
  videoRef,
  enabled,
  onDecode,
  onError,
  restartKey = 0,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  enabled: boolean;
  onDecode: (code: string) => void;
  onError?: (error: CameraScannerError) => void;
  restartKey?: number;
}): void {
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let stop: (() => void) | null = null;

    const start = async () => {
      // getUserMedia needs a secure context (https / localhost); without it the API
      // is absent — surface that specifically rather than as a generic fault.
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        if (!cancelled) onError?.("insecure");
        return;
      }

      const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
        import("@zxing/browser"),
        import("@zxing/library"),
      ]);
      if (cancelled) return;

      // Restrict decoding to the retail formats we care about — fewer formats means
      // faster, steadier reads.
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
          // `ideal`, not a hard constraint — falls back to any camera (laptops).
          { video: { facingMode: { ideal: "environment" } } },
          videoRef.current!,
          (result) => {
            if (result) onDecode(result.getText());
          },
        );
        if (cancelled) controls.stop();
        else stop = () => controls.stop();
      } catch (err) {
        if (!cancelled) onError?.(classifyCameraError(err));
      }
    };
    void start();

    return () => {
      cancelled = true;
      stop?.();
      stop = null;
    };
    // onDecode/onError are read fresh each start; deps intentionally exclude them
    // to avoid restarting the camera on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, restartKey, videoRef]);
}

// useBarcodeScanner — hardware (USB/Bluetooth) barcode-scanner support. These
// scanners are keyboard-wedge devices: a scan "types" the code as a rapid burst
// of keydowns and finishes with Enter. This hook listens at the document (capture
// phase) and recognises that burst without hijacking normal typing:
//
//   * A scan is a run of single printable characters whose inter-key gaps all
//     stay under `interKeyMs` (~human typing is 100–300 ms/char; a scanner is
//     10–30 ms/char), of a plausible code length, terminated by Enter. Any slow
//     gap restarts the buffer, so a human keystroke can never accumulate into a
//     "code" — length-1 buffers never fire.
//   * While an editable field is focused we bail entirely (the operator is
//     typing) — so the hook only captures in the idle fixed-counter state where
//     nothing editable holds focus. That also means the scanned characters never
//     land in / pollute a field: an inert target (body/button) swallows them and
//     we replay the decoded code to `onScan`.
//
// It complements the camera scanner (components/inventory/scan-to-add.tsx) and,
// unlike the camera, needs no permission — it's the primary mode at a fixed
// counter. Reused by the Inventory scan-to-add flow, the daily merchandise count,
// and the ingredient audit.

import { useEffect, useRef } from "react";

export type UseBarcodeScannerOptions = {
  /** Called with the decoded code when a scan burst completes. */
  onScan: (code: string) => void;
  /** Master switch — attach the listener only while true (default true). */
  enabled?: boolean;
  /** Shortest plausible code; shorter buffers are ignored (default 6). */
  minLength?: number;
  /** Longest plausible code; matches the barcode column (default 64). */
  maxLength?: number;
  /** Max gap (ms) between keys to still count as one scan burst (default 50). */
  interKeyMs?: number;
};

/** A focused element the operator is typing into — leave those keys alone. */
function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export function useBarcodeScanner({
  onScan,
  enabled = true,
  minLength = 6,
  maxLength = 64,
  interKeyMs = 50,
}: UseBarcodeScannerOptions): void {
  // Keep the latest callback without re-subscribing the listener every render.
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!enabled) return;

    let buffer = "";
    let lastTime = 0;

    const reset = () => {
      buffer = "";
      lastTime = 0;
    };

    function handleKeydown(e: KeyboardEvent) {
      // Let real keyboard shortcuts and IME composition through untouched.
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing || e.repeat) {
        reset();
        return;
      }
      // Don't fight a human typing into a field — only capture in the idle state.
      if (isEditableTarget(e.target)) {
        reset();
        return;
      }

      const now = e.timeStamp || performance.now();

      if (e.key === "Enter") {
        const code = buffer;
        reset();
        // Only a plausible, burst-fast code counts as a scan; swallow its Enter
        // so it can't double as a submit, then hand the code off.
        if (code.length >= minLength && code.length <= maxLength) {
          e.preventDefault();
          e.stopPropagation();
          onScanRef.current(code);
        }
        return;
      }

      // Only single printable characters extend the code. Ignore Shift/Tab/arrows
      // etc. WITHOUT discarding the in-flight burst (scanners emit Shift before an
      // uppercase char); e.key already carries the resolved character.
      if (e.key.length !== 1) return;

      // A human-speed gap means this isn't part of a scan burst — start over from
      // this key so slow keystrokes can never build up into a code.
      const gap = lastTime === 0 ? 0 : now - lastTime;
      if (gap > interKeyMs) buffer = "";
      buffer += e.key;
      lastTime = now;
    }

    document.addEventListener("keydown", handleKeydown, true);
    return () => document.removeEventListener("keydown", handleKeydown, true);
  }, [enabled, minLength, maxLength, interKeyMs]);
}

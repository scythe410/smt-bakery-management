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
//
// Two focus modes:
//   * DEFAULT (`captureInEditable: false`): while an editable field is focused we
//     bail (the operator is typing). This is the fixed-counter idle mode — nothing
//     editable holds focus, so the scanned characters land on an inert target
//     (body/button) and never pollute a field. Used by the Inventory receive flow.
//   * ALWAYS-ON (`captureInEditable: true`): capture EVEN while an input is
//     focused — the billing counter, where the search box may hold focus but the
//     scanner must still work. We tell a scanner burst from human typing purely by
//     timing: once a burst is going (gap ≤ interKeyMs) we `preventDefault` each key
//     so the burst never enters the field, and swallow the terminating Enter. Only
//     the burst's FIRST character can leak into the field (we can't yet know it is
//     a scan); the caller clears it in `onScan` (e.g. resets the search box). No
//     human sustains sub-50 ms/char, so this never eats real typing.
//
// It complements the camera scanner and, unlike the camera, needs no permission —
// it's the primary mode at a fixed counter.

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
  /**
   * Capture the burst EVEN while an editable field is focused (always-on billing).
   * Burst keys are `preventDefault`ed so they don't enter the field; only the
   * first char can leak (clear it in `onScan`). Default false (bail on editable).
   */
  captureInEditable?: boolean;
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
  captureInEditable = false,
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
      // Default mode: don't fight a human typing into a field — only capture in the
      // idle state. Always-on mode captures regardless (timing tells scan apart).
      if (!captureInEditable && isEditableTarget(e.target)) {
        reset();
        return;
      }

      const now = e.timeStamp || performance.now();

      if (e.key === "Enter") {
        const code = buffer;
        reset();
        // Only a plausible, burst-fast code counts as a scan; swallow its Enter so
        // it can't double as a submit, then hand the code off. A non-qualifying
        // Enter (human, or a short buffer) is left alone to reach the form.
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

      // A human-speed gap means this isn't part of an in-flight burst — start over
      // from this key so slow keystrokes can never build up into a code.
      const gap = lastTime === 0 ? Infinity : now - lastTime;
      const continuesBurst = buffer.length > 0 && gap <= interKeyMs;
      if (gap > interKeyMs) buffer = "";
      buffer += e.key;
      lastTime = now;

      // Always-on mode: keep a fast burst's characters OUT of the focused field.
      // The first char (buffer was empty) is let through — we can't yet know it's a
      // scan — and the caller wipes it in onScan. Every subsequent burst key is
      // suppressed. Human typing (gap > interKeyMs) is never suppressed.
      if (captureInEditable && continuesBurst) {
        e.preventDefault();
      }
    }

    document.addEventListener("keydown", handleKeydown, true);
    return () => document.removeEventListener("keydown", handleKeydown, true);
  }, [enabled, minLength, maxLength, interKeyMs, captureInEditable]);
}

// StatusPill — tinted status/label pill (DESIGN.md §4): pill radius, tinted
// background + matching text, ~22px tall, caption text. Color never carries
// meaning alone — the label text is always present alongside the tone
// (DESIGN.md §2, WCAG). No hooks, so it renders on the server; callers pass an
// already-translated label.

import type { ReactNode } from "react";

export type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted",
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  danger: "bg-danger-bg text-danger",
  info: "bg-info-bg text-info",
};

export function StatusPill({
  label,
  tone = "neutral",
  className = "",
}: {
  label: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={`text-caption rounded-pill inline-flex items-center px-2 py-0.5 font-medium ${TONE_CLASSES[tone]} ${className}`}
    >
      {label}
    </span>
  );
}

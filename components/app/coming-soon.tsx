"use client";

// Placeholder body for screens whose full build lands in a later step. Client
// component so the copy re-translates instantly when the language toggle flips.
// The screen title comes from the header; this is just the "coming soon" line.

import { useTranslation } from "react-i18next";

export function ComingSoon({ messageKey = "shell.comingSoon" }: { messageKey?: string }) {
  const { t } = useTranslation();
  return <p className="text-body text-muted">{t(messageKey)}</p>;
}

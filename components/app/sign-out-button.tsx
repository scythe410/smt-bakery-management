"use client";

// Sign-out control. Posts to the signOut server action (cookie wipe + redirect).
// Compact icon button for the shell header cluster; the label is passed in
// already-translated and used as the accessible name.

import { LogOut } from "lucide-react";
import { signOut } from "@/app/(app)/actions";

export function SignOutButton({ label }: { label: string }) {
  return (
    <form action={signOut}>
      <button
        type="submit"
        aria-label={label}
        title={label}
        className="text-ink hover:bg-surface-2 focus-visible:ring-brand/40 flex size-11 items-center justify-center rounded-[var(--radius)] outline-none transition-colors focus-visible:ring-2"
      >
        <LogOut className="size-5" aria-hidden />
      </button>
    </form>
  );
}

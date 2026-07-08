"use client";

// Sign-out control. Posts to the signOut server action (cookie wipe + redirect).
// Label is passed in already-translated from the server header so this stays a
// thin client wrapper around the action.

import { signOut } from "@/app/(app)/actions";

export function SignOutButton({ label }: { label: string }) {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="text-label text-muted hover:text-ink focus-visible:ring-brand/40 rounded-[var(--radius)] px-2 py-1 outline-none transition-colors focus-visible:ring-2"
      >
        {label}
      </button>
    </form>
  );
}

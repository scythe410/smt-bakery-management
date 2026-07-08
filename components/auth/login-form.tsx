"use client";

// Login form. Email + password → signIn server action via useActionState.
// All copy comes through i18next keys (CLAUDE.md §3); the action returns an
// error KEY which we translate here. Styling per DESIGN.md §4 (inputs, primary
// CTA, active-voice error).

import { useActionState, useId } from "react";
import { useTranslation } from "react-i18next";
import { signIn, type SignInState } from "@/app/(auth)/login/actions";

const initialState: SignInState = {};

export function LoginForm() {
  const { t } = useTranslation();
  const [state, formAction, pending] = useActionState(signIn, initialState);
  const emailId = useId();
  const passwordId = useId();

  return (
    <form action={formAction} className="flex w-full flex-col gap-4" noValidate>
      {state.error ? (
        <p
          role="alert"
          className="bg-danger-bg text-danger rounded-[var(--radius)] px-3 py-2 text-label"
        >
          {t(state.error)}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={emailId} className="text-label text-muted">
          {t("login.email")}
        </label>
        <input
          id={emailId}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder={t("login.emailPlaceholder")}
          className="border-border text-body text-ink placeholder:text-faint focus:ring-brand/40 focus:border-border-strong h-11 rounded-[var(--radius)] border bg-white px-3 outline-none focus:ring-2"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={passwordId} className="text-label text-muted">
          {t("login.password")}
        </label>
        <input
          id={passwordId}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder={t("login.passwordPlaceholder")}
          className="border-border text-body text-ink placeholder:text-faint focus:ring-brand/40 focus:border-border-strong h-11 rounded-[var(--radius)] border bg-white px-3 outline-none focus:ring-2"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="bg-brand text-brand-white text-label hover:bg-brand-ember focus-visible:ring-brand/40 mt-1 flex h-11 items-center justify-center rounded-[var(--radius)] font-semibold transition-colors outline-none focus-visible:ring-2 disabled:opacity-60"
      >
        {pending ? t("login.submitting") : t("login.submit")}
      </button>
    </form>
  );
}

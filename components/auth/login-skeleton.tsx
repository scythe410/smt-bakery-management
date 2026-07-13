// Login loading skeleton (DESIGN.md §6). Shown by app/(auth)/login/loading.tsx
// while the login route resolves its server work (the auth check + redirect), so
// the screen is never blank during that hop. Mirrors the login card's real shape
// — logo, title/subtitle, two fields, primary CTA — as pulse blocks rather than a
// bare spinner. No hooks/i18n (nothing to read yet). `animate-pulse` is disabled
// under prefers-reduced-motion by the global rule in globals.css.

function Bar({ className = "" }: { className?: string }) {
  return <span className={`bg-border block rounded ${className}`} />;
}

export function LoginSkeleton() {
  return (
    <main
      aria-hidden
      className="bg-surface-2 flex min-h-dvh flex-col items-center justify-center px-4 py-10"
    >
      <div className="bg-surface border-border shadow-card flex w-full max-w-[390px] flex-col items-center gap-6 rounded-[var(--radius)] border p-6">
        {/* Logo + title/subtitle */}
        <div className="flex animate-pulse flex-col items-center gap-3">
          <Bar className="h-20 w-40" />
          <div className="flex flex-col items-center gap-1.5">
            <Bar className="h-5 w-32" />
            <Bar className="h-4 w-48" />
          </div>
        </div>

        {/* Email + password fields, primary CTA */}
        <div className="flex w-full animate-pulse flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Bar className="h-3 w-16" />
            <Bar className="h-11 w-full rounded-[var(--radius)]" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Bar className="h-3 w-20" />
            <Bar className="h-11 w-full rounded-[var(--radius)]" />
          </div>
          <Bar className="mt-1 h-11 w-full rounded-[var(--radius)]" />
        </div>
      </div>
    </main>
  );
}

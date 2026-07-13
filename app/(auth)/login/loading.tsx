// Route-level loading UI (DESIGN.md §6, Antigravity MED-6): shown while the login
// route runs its server work (auth check + possible redirect), so the screen
// isn't blank during that hop. Reuses the shape-matched login skeleton.

import { LoginSkeleton } from "@/components/auth/login-skeleton";

export default function LoginLoading() {
  return <LoginSkeleton />;
}

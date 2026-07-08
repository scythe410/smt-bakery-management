// Root middleware — runs on every matched request to keep the Supabase session
// fresh (see lib/supabase/middleware.ts). Auth redirects/role gating are added
// in the auth step; for now this only refreshes the session.

import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Run on all paths EXCEPT static assets and image files — those never carry a
  // session and re-running auth on them wastes work.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

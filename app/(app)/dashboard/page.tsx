// Dashboard — landing screen for every role. The screen title is rendered by
// the shell header; the full build lands in a later step. requireProfile()
// re-asserts the session at the page level (defence in depth beside the layout).

import { requireProfile } from "@/lib/auth";
import { ComingSoon } from "@/components/app/coming-soon";

export default async function DashboardPage() {
  await requireProfile();
  return <ComingSoon messageKey="dashboard.comingSoon" />;
}

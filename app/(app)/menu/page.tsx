// Menu — accessible to all roles. Screen title from the shell header; full build
// lands in a later step.

import { requireProfile } from "@/lib/auth";
import { ComingSoon } from "@/components/app/coming-soon";

export default async function MenuPage() {
  await requireProfile();
  return <ComingSoon />;
}

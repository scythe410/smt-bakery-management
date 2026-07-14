// Menu screen (SPEC §4.1). All roles may access (CLAUDE.md §5 access matrix).
// Suspense boundary streams in the list after a skeleton while the DB query runs.

import { Suspense } from "react";
import { requireProfile } from "@/lib/auth";
import { MenuList } from "@/components/menu/menu-list";
import { MenuSkeleton } from "@/components/menu/menu-skeleton";

export default async function MenuPage() {
  await requireProfile();
  return (
    <Suspense fallback={<MenuSkeleton />}>
      <MenuList />
    </Suspense>
  );
}

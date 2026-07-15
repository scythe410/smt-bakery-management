// Bottom-nav item registry. Order per DESIGN.md §4: Dashboard, Finance,
// Inventory, Menu, Orders, Bookings, Employees, Reports, Settings. Each item
// names its section (drives role filtering via lib/access), its i18n label key
// (chrome — never hardcoded), its lucide icon, and which live badge it carries.

import {
  BookOpen,
  Boxes,
  CalendarDays,
  ChartColumn,
  Coins,
  LayoutDashboard,
  ReceiptText,
  Settings,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Section } from "@/lib/access";
import type { ShellBadges } from "@/lib/db/selectors/shell";

// Which ShellBadges count (if any) this item shows. Keyed to the count fields so
// there's no separate mapping to drift.
export type NavBadgeKey = keyof Pick<ShellBadges, "inventoryLowStock" | "menuAttention">;

export type NavItem = {
  section: Section;
  href: string;
  labelKey: string;
  Icon: LucideIcon;
  badge: NavBadgeKey | null;
};

export const NAV_ITEMS: readonly NavItem[] = [
  { section: "dashboard", href: "/dashboard", labelKey: "nav.dashboard", Icon: LayoutDashboard, badge: null },
  { section: "finance", href: "/finance", labelKey: "nav.finance", Icon: Wallet, badge: null },
  { section: "inventory", href: "/inventory", labelKey: "nav.inventory", Icon: Boxes, badge: "inventoryLowStock" },
  { section: "menu", href: "/menu", labelKey: "nav.menu", Icon: BookOpen, badge: "menuAttention" },
  { section: "orders", href: "/orders", labelKey: "nav.orders", Icon: ReceiptText, badge: null },
  { section: "bookings", href: "/bookings", labelKey: "nav.bookings", Icon: CalendarDays, badge: null },
  // Staff-only surface (role-filtered in bottom-nav): a standalone Expenses
  // ledger. Owner/manager reach expenses via Finance, so they never see this.
  { section: "expenses", href: "/expenses", labelKey: "nav.expenses", Icon: Coins, badge: null },
  { section: "employees", href: "/employees", labelKey: "nav.employees", Icon: Users, badge: null },
  { section: "reports", href: "/reports", labelKey: "nav.reports", Icon: ChartColumn, badge: null },
  { section: "settings", href: "/settings", labelKey: "nav.settings", Icon: Settings, badge: null },
];

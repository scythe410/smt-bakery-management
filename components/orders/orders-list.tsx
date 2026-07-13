// Orders list (SPEC §3.4). Async server component — loads the FIRST page of the
// tenant's orders (Active tab, unfiltered), the Active/Archived tab counts, and
// the available menu (for the new-order picker), and hands them to the client
// browser. The browser drives the tabs, search, filters, and "Load more" by
// calling the fetchOrders server action — every filter is a DB predicate and every
// page is bounded, so no screen ever pulls the whole order history. Kept behind a
// Suspense boundary in the page so it streams in after a skeleton.

import { getOrdersPage, getOrderTabCounts, getNewOrderMenu } from "@/lib/db/selectors/orders";
import { OrdersBrowser } from "@/components/orders/orders-browser";

export async function OrdersList() {
  const [initial, counts, menu] = await Promise.all([
    getOrdersPage({ tab: "active" }),
    getOrderTabCounts(),
    getNewOrderMenu(),
  ]);
  return <OrdersBrowser initial={initial} counts={counts} menu={menu} />;
}

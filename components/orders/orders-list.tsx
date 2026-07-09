// Orders list (SPEC §3.4). Async server component — loads the tenant's derived
// order list and the available menu (for the new-order picker) and hands both to
// the client browser, which does the tabs, search, filters, add flow, and
// rendering. Kept behind a Suspense boundary in the page so it streams in after a
// skeleton.

import { getOrdersList, getNewOrderMenu } from "@/lib/db/selectors/orders";
import { OrdersBrowser } from "@/components/orders/orders-browser";

export async function OrdersList() {
  const [orders, menu] = await Promise.all([getOrdersList(), getNewOrderMenu()]);
  return <OrdersBrowser orders={orders} menu={menu} />;
}

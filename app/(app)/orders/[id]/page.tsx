// /orders/[id] — order detail page (SPEC §3.4).
//
// Shows the full order: metadata, line items, financial breakdown, payment
// status, and a "Reprint Bill" link to the existing /orders/[id]/bill print
// path. Uses the same getOrderBillData selector the bill page does (no extra
// DB call), now that it carries the order status too. RLS-scoped via the
// server client: only rows belonging to the authenticated tenant are returned.

import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { getOrderBillData } from "@/lib/db/selectors/order-bill";
import { getNewOrderMenu } from "@/lib/db/selectors/orders";
import { OrderDetail } from "@/components/orders/order-detail";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getOrderBillData(id);
  return { title: data ? `Order ${data.orderNo}` : "Order" };
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireProfile();
  const data = await getOrderBillData(id);
  if (!data) notFound();

  // The edit form needs the available menu — only pending orders are editable,
  // so skip the fetch entirely for archived ones.
  const menu = data.status === "pending" ? await getNewOrderMenu() : [];

  return <OrderDetail data={data} orderId={id} menu={menu} />;
}

// /orders/[id]/bill — per-order printable bill (SPEC §3.4).
//
// Server component: RLS-scoped fetch (order id from URL, business_id resolved
// from the authenticated session — never from the URL). Auth is handled by the
// parent (app) layout; this page just fetches + renders. The bill component is
// a client component so it can use useTranslation() for labels; the data arrives
// pre-formatted from the selector so the component doesn't need format.ts.
//
// Print path: the Print bill button calls window.print(). App chrome (header +
// nav) is hidden via print:hidden in the (app) layout. @media print in
// globals.css strips card borders/shadows and constrains the receipt width so
// a real bill comes out, not a screenshot of the phone UI.

import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getOrderBillData } from "@/lib/db/selectors/order-bill";
import { OrderBill } from "@/components/orders/order-bill";
import { PrintBillButton } from "@/components/orders/print-bill-button";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getOrderBillData(id);
  return { title: data ? `Bill ${data.orderNo}` : "Bill" };
}

export default async function OrderBillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getOrderBillData(id);
  if (!data) notFound();

  return (
    <div className="flex flex-col gap-4">
      {/* Receipt-sized page when printing — overrides the browser's A4 default */}
      <style>{`@page { size: 80mm auto; margin: 4mm; }`}</style>
      {/* Action bar — hidden when printing so only the receipt appears */}
      <div className="flex items-center gap-2 print:hidden">
        <Link
          href={`/orders/${id}`}
          className="border-border-strong text-ink text-label hover:bg-surface-2 flex h-10 items-center gap-2 rounded-[var(--radius)] border px-3 font-medium transition-colors"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {data.orderNo}
        </Link>
        <PrintBillButton label="Print bill" />
      </div>

      <OrderBill data={data} />
    </div>
  );
}

// Daily Sales PDF document. Receives the derived DailyReport (same selector
// as the screen) plus business metadata, and renders a multi-page PDF:
//   • 4-stat summary (Revenue / Commission / Net Revenue / Orders)
//   • By-Source breakdown table
//   • By-Payment breakdown table
//   • Detail table (every order in the window, chronological)
//
// Money is passed in as pre-formatted strings (LKR …) so this file does no
// money math — CLAUDE.md §3.

import React from "react";
import { View, Text } from "@react-pdf/renderer";
import {
  BrandedDoc,
  SummaryGrid,
  TableHeaderRow,
  s,
  C,
  type ColDef,
} from "./document";
import type { DailyReport, ReportRow } from "@/lib/db/selectors/reports";
import type { SourceBreakdown, PaymentBreakdown } from "@/lib/db/selectors/_shared";

// ── Enriched breakdown types (base + pre-formatted money strings) ─────────────

export type SourceBreakdownFmt = SourceBreakdown & {
  revenueFmt: string;
  commissionFmt: string;
};

export type PaymentBreakdownFmt = PaymentBreakdown & {
  revenueFmt: string;
};

export type ReportRowFmt = ReportRow & {
  totalFmt: string;
};

// ── Source breakdown ──────────────────────────────────────────────────────────

const SOURCE_COLS: ColDef[] = [
  { header: "Source", width: "30%" },
  { header: "Orders", width: "15%", align: "right" },
  { header: "Revenue (LKR)", width: "27.5%", align: "right" },
  { header: "Commission (LKR)", width: "27.5%", align: "right" },
];

function SourceTable({ rows }: { rows: SourceBreakdownFmt[] }) {
  return (
    <>
      <Text style={s.sectionHeading}>By Source</Text>
      <TableHeaderRow cols={SOURCE_COLS} />
      {rows.map((r) => (
        <View key={r.source} style={s.tableRow}>
          <Text style={[s.td, { width: "30%" }]}>{r.source.replace(/_/g, " ")}</Text>
          <Text style={[s.td, { width: "15%", textAlign: "right" }]}>{r.orders}</Text>
          <Text style={[s.td, { width: "27.5%", textAlign: "right" }]}>{r.revenueFmt}</Text>
          <Text style={[s.td, { width: "27.5%", textAlign: "right" }]}>{r.commissionFmt}</Text>
        </View>
      ))}
    </>
  );
}

// ── Payment breakdown ─────────────────────────────────────────────────────────

const PAYMENT_COLS: ColDef[] = [
  { header: "Method", width: "40%" },
  { header: "Orders", width: "20%", align: "right" },
  { header: "Revenue (LKR)", width: "40%", align: "right" },
];

function PaymentTable({ rows }: { rows: PaymentBreakdownFmt[] }) {
  return (
    <>
      <Text style={s.sectionHeading}>By Payment Method</Text>
      <TableHeaderRow cols={PAYMENT_COLS} />
      {rows.map((r) => (
        <View key={r.method ?? "none"} style={s.tableRow}>
          <Text style={[s.td, { width: "40%" }]}>
            {r.method && r.method !== "unknown" ? r.method.replace(/_/g, " ") : "—"}
          </Text>
          <Text style={[s.td, { width: "20%", textAlign: "right" }]}>{r.orders}</Text>
          <Text style={[s.td, { width: "40%", textAlign: "right" }]}>{r.revenueFmt}</Text>
        </View>
      ))}
    </>
  );
}

// ── Order detail table ────────────────────────────────────────────────────────

const ORDER_COLS: ColDef[] = [
  { header: "Time", width: "8%" },
  { header: "Order #", width: "10%" },
  { header: "Source", width: "12%" },
  { header: "Customer", width: "20%" },
  { header: "Items", width: "8%", align: "right" },
  { header: "Total (LKR)", width: "16%", align: "right" },
  { header: "Payment", width: "13%" },
  { header: "Status", width: "13%" },
];

function orderStatusColor(status: ReportRow["status"]): string {
  if (status === "completed") return C.success;
  if (status === "cancelled") return C.danger;
  return C.muted;
}

function paymentStatusColor(ps: ReportRow["paymentStatus"]): string {
  if (ps === "paid") return C.success;
  if (ps === "refunded") return C.danger;
  return C.muted;
}

function OrderDetailTable({
  rows,
  totalRevenue,
}: {
  rows: ReportRowFmt[];
  totalRevenue: string;
}) {
  return (
    <>
      <Text style={s.sectionHeading}>Orders</Text>
      <TableHeaderRow cols={ORDER_COLS} />
      {rows.map((r) => (
        <View key={r.id} style={s.tableRow} wrap={false}>
          <Text style={[s.td, { width: "8%" }]}>{r.time}</Text>
          <Text style={[s.td, { width: "10%" }]}>{r.orderNo}</Text>
          <Text style={[s.td, { width: "12%" }]}>{r.source.replace(/_/g, " ")}</Text>
          <Text style={[s.td, s.tdMuted, { width: "20%" }]}>{r.customerName ?? "—"}</Text>
          <Text style={[s.td, { width: "8%", textAlign: "right" }]}>{r.itemCount}</Text>
          <Text style={[s.td, { width: "16%", textAlign: "right" }]}>{r.totalFmt}</Text>
          <Text style={[s.td, { width: "13%", color: paymentStatusColor(r.paymentStatus) }]}>
            {r.paymentMethod ?? "—"}
          </Text>
          <Text style={[s.td, { width: "13%", color: orderStatusColor(r.status) }]}>
            {r.status}
          </Text>
        </View>
      ))}
      {rows.length > 0 && (
        <View style={s.totalsRow}>
          <Text style={[s.totalsLabel, { width: "58%" }]}>Totals (completed orders)</Text>
          <Text style={[s.totalsValue, { width: "16%", textAlign: "right" }]}>{totalRevenue}</Text>
          <Text style={[s.totalsLabel, { width: "26%" }]} />
        </View>
      )}
    </>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export type DailySalesDocProps = {
  report: Omit<DailyReport, "rows" | "bySource" | "byPayment"> & {
    rows: ReportRowFmt[];
    bySource: SourceBreakdownFmt[];
    byPayment: PaymentBreakdownFmt[];
    revenueFmt: string;
    commissionFmt: string;
    netRevenueFmt: string;
  };
  businessName: string;
  date: string;
  generatedAt: string;
};

export function DailySalesDoc({ report, businessName, date, generatedAt }: DailySalesDocProps) {
  const summary = [
    { label: "Revenue", value: report.revenueFmt },
    { label: "Commission", value: report.commissionFmt, tone: "danger" as const },
    { label: "Net Revenue", value: report.netRevenueFmt, tone: "success" as const },
    { label: "Orders", value: String(report.orders) },
  ];

  return (
    <BrandedDoc
      businessName={businessName}
      reportTitle="Daily Sales"
      period={date}
      generatedAt={generatedAt}
    >
      <SummaryGrid items={summary} />
      {report.bySource.length > 0 && <SourceTable rows={report.bySource} />}
      {report.byPayment.length > 0 && <PaymentTable rows={report.byPayment} />}
      <OrderDetailTable rows={report.rows} totalRevenue={report.revenueFmt} />
      <Text style={[s.td, s.tdMuted, { marginTop: 10, fontSize: 7 }]}>
        Revenue, commission and net revenue count completed orders only.
      </Text>
    </BrandedDoc>
  );
}

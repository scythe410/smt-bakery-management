// End of Day PDF document. Receives the derived EndOfDayReport (same selector as
// the screen) plus formatted money strings. Renders:
//   • 4-stat summary (Merch Revenue / Units Out / Left / Items)
//   • Merchandise item table with opening/received/out/left/price/revenue columns
//     + optional billing cross-check columns (variance flagged positive = shrinkage)
//
// No money math here — all values arrive pre-formatted from the route handler.

import React from "react";
import { View, Text } from "@react-pdf/renderer";
import { BrandedDoc, SummaryGrid, TableHeaderRow, s, C, type ColDef } from "./document";
import type { EndOfDayReport, EndOfDayRow } from "@/lib/db/selectors/stock";

const QTY_FMT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });

function q(n: number | null): string {
  return n === null ? "—" : QTY_FMT.format(n);
}

const COLS_BASE: ColDef[] = [
  { header: "Item", width: "22%" },
  { header: "Unit", width: "8%" },
  { header: "Opening", width: "11%", align: "right" },
  { header: "Received", width: "11%", align: "right" },
  { header: "Out", width: "10%", align: "right" },
  { header: "Left", width: "10%", align: "right" },
  { header: "Price (LKR)", width: "14%", align: "right" },
  { header: "Revenue (LKR)", width: "14%", align: "right" },
];

const COLS_BILLED: ColDef[] = [
  { header: "Item", width: "18%" },
  { header: "Unit", width: "6%" },
  { header: "Opening", width: "9%", align: "right" },
  { header: "Received", width: "9%", align: "right" },
  { header: "Out", width: "8%", align: "right" },
  { header: "Left", width: "8%", align: "right" },
  { header: "Price (LKR)", width: "12%", align: "right" },
  { header: "Revenue (LKR)", width: "12%", align: "right" },
  { header: "Billed", width: "9%", align: "right" },
  { header: "Variance", width: "9%", align: "right" },
];

function ItemTable({
  rows,
  billed,
  totalRevenue,
  priceFmtMap,
  revenueFmtMap,
}: {
  rows: EndOfDayRow[];
  billed: boolean;
  totalRevenue: string;
  priceFmtMap: Map<string, string>;
  revenueFmtMap: Map<string, string>;
}) {
  const cols = billed ? COLS_BILLED : COLS_BASE;

  return (
    <>
      <Text style={s.sectionHeading}>Merchandise Items</Text>
      <TableHeaderRow cols={cols} />
      {rows.map((r) => {
        const shrink = r.varianceUnits !== null && r.varianceUnits > 0;
        return (
          <View key={r.itemId} style={s.tableRow} wrap={false}>
            {billed ? (
              <>
                <Text style={[s.td, { width: "18%" }]}>{r.name}</Text>
                <Text style={[s.td, s.tdMuted, { width: "6%" }]}>{r.unit}</Text>
                <Text style={[s.td, { width: "9%", textAlign: "right" }]}>{q(r.openingQty)}</Text>
                <Text style={[s.td, { width: "9%", textAlign: "right" }]}>{q(r.receivedQty)}</Text>
                <Text style={[s.td, { width: "8%", textAlign: "right" }]}>{q(r.unitsOut)}</Text>
                <Text style={[s.td, { width: "8%", textAlign: "right" }]}>{q(r.leftQty)}</Text>
                <Text style={[s.td, { width: "12%", textAlign: "right" }]}>
                  {priceFmtMap.get(r.itemId) ?? "—"}
                </Text>
                <Text style={[s.td, s.tdSuccess, { width: "12%", textAlign: "right" }]}>
                  {r.revenueCents === null ? "—" : (revenueFmtMap.get(r.itemId) ?? "—")}
                </Text>
                <Text style={[s.td, { width: "9%", textAlign: "right" }]}>
                  {q(r.billedUnits)}
                </Text>
                <Text
                  style={[
                    s.td,
                    { width: "9%", textAlign: "right" },
                    shrink ? { color: C.danger } : {},
                  ]}
                >
                  {r.varianceUnits === null
                    ? "—"
                    : `${r.varianceUnits > 0 ? "+" : ""}${QTY_FMT.format(r.varianceUnits)}`}
                </Text>
              </>
            ) : (
              <>
                <Text style={[s.td, { width: "22%" }]}>{r.name}</Text>
                <Text style={[s.td, s.tdMuted, { width: "8%" }]}>{r.unit}</Text>
                <Text style={[s.td, { width: "11%", textAlign: "right" }]}>{q(r.openingQty)}</Text>
                <Text style={[s.td, { width: "11%", textAlign: "right" }]}>{q(r.receivedQty)}</Text>
                <Text style={[s.td, { width: "10%", textAlign: "right" }]}>{q(r.unitsOut)}</Text>
                <Text style={[s.td, { width: "10%", textAlign: "right" }]}>{q(r.leftQty)}</Text>
                <Text style={[s.td, { width: "14%", textAlign: "right" }]}>
                  {priceFmtMap.get(r.itemId) ?? "—"}
                </Text>
                <Text style={[s.td, s.tdSuccess, { width: "14%", textAlign: "right" }]}>
                  {r.revenueCents === null ? "—" : (revenueFmtMap.get(r.itemId) ?? "—")}
                </Text>
              </>
            )}
          </View>
        );
      })}
      {rows.length > 0 && (
        <View style={s.totalsRow}>
          <Text style={[s.totalsLabel, { width: billed ? "78%" : "78%" }]}>
            Total revenue (closed items)
          </Text>
          <Text style={[s.totalsValue, { width: "22%", textAlign: "right" }]}>{totalRevenue}</Text>
        </View>
      )}
    </>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export type EndOfDayDocProps = {
  report: EndOfDayReport;
  businessName: string;
  date: string;
  generatedAt: string;
  totalRevenueFmt: string;
  priceFmtMap: Map<string, string>;
  revenueFmtMap: Map<string, string>;
};

export function EndOfDayDoc({
  report,
  businessName,
  date,
  generatedAt,
  totalRevenueFmt,
  priceFmtMap,
  revenueFmtMap,
}: EndOfDayDocProps) {
  const summary = [
    {
      label: "Merch Revenue",
      value: totalRevenueFmt,
      tone: "success" as const,
    },
    { label: "Units Out", value: String(report.totalUnitsOut) },
    { label: "Units Left", value: String(report.totalLeftQty) },
    { label: "Items", value: String(report.rows.length) },
  ];

  const statusLabel =
    report.status === "closed"
      ? "Day closed"
      : report.status === "open"
        ? "Day open (preliminary)"
        : "Day not opened";

  return (
    <BrandedDoc
      businessName={businessName}
      reportTitle="End of Day"
      period={date}
      generatedAt={generatedAt}
    >
      <Text style={[s.td, s.tdMuted, { marginBottom: 8, fontSize: 8 }]}>{statusLabel}</Text>
      <SummaryGrid items={summary} />
      {report.rows.length === 0 ? (
        <Text style={[s.td, s.tdMuted, { marginTop: 8 }]}>No merchandise items counted.</Text>
      ) : (
        <ItemTable
          rows={report.rows}
          billed={report.billed}
          totalRevenue={totalRevenueFmt}
          priceFmtMap={priceFmtMap}
          revenueFmtMap={revenueFmtMap}
        />
      )}
      <Text style={[s.td, s.tdMuted, { marginTop: 10, fontSize: 7 }]}>
        Revenue = physical units out × snapshot unit price. Billing cross-check compares to sale
        movements in orders for the same day.
      </Text>
    </BrandedDoc>
  );
}

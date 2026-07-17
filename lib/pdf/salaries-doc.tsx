// Salaries PDF document. Receives the derived SalariesReport (same selector as the
// screen) with all money pre-formatted by the route handler — no money math here.
// Renders:
//   • 4-stat summary (Total Paid / Base / Bonuses / Pending)
//   • Finance reconciliation line (paid vs "Salaries" expenses, linked by expense_id)
//   • Per-employee table (days paid / base / bonus / total paid / pending) + totals

import React from "react";
import { View, Text } from "@react-pdf/renderer";
import { BrandedDoc, SummaryGrid, TableHeaderRow, s, C, type ColDef } from "./document";

export type SalariesDocRow = {
  employeeId: string;
  name: string;
  daysPaid: number;
  baseFmt: string;
  bonusFmt: string;
  totalPaidFmt: string;
  pendingFmt: string;
};

export type SalariesDocProps = {
  businessName: string;
  period: string;
  generatedAt: string;
  summary: { totalPaidFmt: string; baseFmt: string; bonusFmt: string; pendingFmt: string };
  rows: SalariesDocRow[];
  totals: {
    daysPaid: number;
    baseFmt: string;
    bonusFmt: string;
    totalPaidFmt: string;
    pendingFmt: string;
  };
  recon: { paidFmt: string; financeFmt: string; reconciled: boolean };
};

const COLS: ColDef[] = [
  { header: "Employee", width: "30%" },
  { header: "Days", width: "10%", align: "right" },
  { header: "Base (LKR)", width: "15%", align: "right" },
  { header: "Bonus (LKR)", width: "15%", align: "right" },
  { header: "Total Paid (LKR)", width: "15%", align: "right" },
  { header: "Pending (LKR)", width: "15%", align: "right" },
];

export function SalariesDoc({
  businessName,
  period,
  generatedAt,
  summary,
  rows,
  totals,
  recon,
}: SalariesDocProps) {
  const summaryItems = [
    { label: "Total Paid", value: summary.totalPaidFmt },
    { label: "Base Pay", value: summary.baseFmt },
    { label: "Bonuses", value: summary.bonusFmt, tone: "success" as const },
    { label: "Pending", value: summary.pendingFmt },
  ];

  return (
    <BrandedDoc
      businessName={businessName}
      reportTitle="Salaries"
      period={period}
      generatedAt={generatedAt}
    >
      <SummaryGrid items={summaryItems} />

      {/* Finance reconciliation */}
      <View style={{ marginBottom: 8 }}>
        <Text style={[s.td, s.tdMuted, { fontSize: 8 }]}>
          Reconciliation ·{" "}
          {recon.reconciled ? (
            <Text style={s.tdSuccess}>Reconciled with Finance Salaries</Text>
          ) : (
            <Text style={{ color: C.danger }}>Mismatch — review</Text>
          )}
        </Text>
        <Text style={[s.td, s.tdMuted, { fontSize: 7, marginTop: 2 }]}>
          Paid {recon.paidFmt} · Posted to Finance (Salaries) {recon.financeFmt}. Payroll posts one
          expense per pay-day, linked by expense_id — counted once.
        </Text>
      </View>

      <Text style={s.sectionHeading}>By Employee</Text>
      <TableHeaderRow cols={COLS} />
      {rows.length === 0 ? (
        <Text style={[s.td, s.tdMuted, { marginTop: 8 }]}>No payroll in this period.</Text>
      ) : (
        <>
          {rows.map((r) => (
            <View key={r.employeeId} style={s.tableRow} wrap={false}>
              <Text style={[s.td, { width: "30%" }]}>{r.name || "—"}</Text>
              <Text style={[s.td, { width: "10%", textAlign: "right" }]}>{r.daysPaid}</Text>
              <Text style={[s.td, { width: "15%", textAlign: "right" }]}>{r.baseFmt}</Text>
              <Text style={[s.td, { width: "15%", textAlign: "right" }]}>{r.bonusFmt}</Text>
              <Text style={[s.td, { width: "15%", textAlign: "right" }]}>{r.totalPaidFmt}</Text>
              <Text style={[s.td, s.tdMuted, { width: "15%", textAlign: "right" }]}>
                {r.pendingFmt}
              </Text>
            </View>
          ))}
          <View style={s.totalsRow}>
            <Text style={[s.totalsLabel, { width: "30%" }]}>Total</Text>
            <Text style={[s.totalsValue, { width: "10%", textAlign: "right" }]}>
              {totals.daysPaid}
            </Text>
            <Text style={[s.totalsValue, { width: "15%", textAlign: "right" }]}>
              {totals.baseFmt}
            </Text>
            <Text style={[s.totalsValue, { width: "15%", textAlign: "right" }]}>
              {totals.bonusFmt}
            </Text>
            <Text style={[s.totalsValue, { width: "15%", textAlign: "right" }]}>
              {totals.totalPaidFmt}
            </Text>
            <Text style={[s.totalsValue, { width: "15%", textAlign: "right" }]}>
              {totals.pendingFmt}
            </Text>
          </View>
        </>
      )}
    </BrandedDoc>
  );
}

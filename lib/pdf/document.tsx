// Shared branded document primitives for all report PDFs.
//
// Layout: A4, 36pt margins. A `fixed` footer carries "Page X of Y" on every
// page. Column headers in detail tables are included once at the start of each
// table — react-pdf paginates the rows automatically.
//
// Colors match DESIGN.md tokens exactly (CSS vars → hex literals here since
// react-pdf StyleSheet does not read CSS custom properties).

import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  type Styles,
} from "@react-pdf/renderer";
import { registerFonts } from "./fonts";

registerFonts();

// ── Brand colours (DESIGN.md §2) ─────────────────────────────────────────────
const C = {
  red: "#DA1A32",
  text: "#18181B",
  muted: "#71717A",
  border: "#E9E9EC",
  surface2: "#FAFAFA",
  success: "#197C3A",
  danger: "#A00C30",
  white: "#FFFFFF",
} as const;

// ── Shared style sheet ────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    fontFamily: "Inter",
    fontWeight: 400,
    fontSize: 9,
    color: C.text,
    paddingTop: 36,
    paddingBottom: 48, // leave room for the fixed footer
    paddingHorizontal: 36,
    backgroundColor: C.white,
  },

  // ── Header ─────────────────────────────────────────────────────────────────
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingBottom: 12,
    marginBottom: 16,
    borderBottom: `1pt solid ${C.border}`,
  },
  monogram: {
    width: 32,
    height: 32,
    backgroundColor: C.red,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  monogramText: {
    fontFamily: "Archivo",
    fontWeight: 700,
    fontSize: 13,
    color: C.white,
    letterSpacing: 0.5,
  },
  headerRight: { flex: 1 },
  businessName: {
    fontFamily: "Archivo",
    fontWeight: 700,
    fontSize: 12,
    color: C.text,
  },
  reportMeta: { fontSize: 8, color: C.muted, marginTop: 1 },

  // ── Footer ─────────────────────────────────────────────────────────────────
  footer: {
    position: "absolute",
    bottom: 18,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: C.muted,
  },

  // ── Summary grid ───────────────────────────────────────────────────────────
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  summaryCard: {
    flex: 1,
    minWidth: "22%",
    backgroundColor: C.surface2,
    borderRadius: 4,
    padding: 8,
  },
  summaryLabel: { fontSize: 7, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  summaryValue: {
    fontFamily: "Archivo",
    fontWeight: 700,
    fontSize: 14,
    color: C.text,
    marginTop: 2,
  },
  summaryValueSuccess: { color: C.success },
  summaryValueDanger: { color: C.danger },

  // ── Section heading ────────────────────────────────────────────────────────
  sectionHeading: {
    fontFamily: "Inter",
    fontWeight: 600,
    fontSize: 10,
    color: C.text,
    marginBottom: 6,
    marginTop: 14,
  },

  // ── Detail table ───────────────────────────────────────────────────────────
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: C.surface2,
    borderTop: `1pt solid ${C.border}`,
    borderBottom: `1pt solid ${C.border}`,
    paddingVertical: 4,
  },
  tableRow: {
    flexDirection: "row",
    borderBottom: `0.5pt solid ${C.border}`,
    paddingVertical: 4,
    minHeight: 18,
  },
  th: {
    fontFamily: "Inter",
    fontWeight: 600,
    fontSize: 7,
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    paddingHorizontal: 4,
  },
  td: { fontSize: 8, color: C.text, paddingHorizontal: 4 },
  tdMuted: { color: C.muted },
  tdSuccess: { color: C.success, fontWeight: 600 },
  tdDanger: { color: C.danger },

  // ── Totals row ─────────────────────────────────────────────────────────────
  totalsRow: {
    flexDirection: "row",
    borderTop: `1pt solid ${C.border}`,
    paddingVertical: 5,
    marginTop: 1,
  },
  totalsLabel: { fontFamily: "Inter", fontWeight: 600, fontSize: 8, color: C.text, paddingHorizontal: 4 },
  totalsValue: { fontFamily: "Inter", fontWeight: 600, fontSize: 8, color: C.text, paddingHorizontal: 4 },
});

// Re-export so doc files don't need a second import
export { s, C };

// ── Shared primitives ─────────────────────────────────────────────────────────

export function DocHeader({
  businessName,
  reportTitle,
  period,
  generatedAt,
}: {
  businessName: string;
  reportTitle: string;
  period: string;
  generatedAt: string;
}) {
  const initials = businessName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <View style={s.header} fixed>
      <View style={s.monogram}>
        <Text style={s.monogramText}>{initials || "SB"}</Text>
      </View>
      <View style={s.headerRight}>
        <Text style={s.businessName}>{businessName}</Text>
        <Text style={s.reportMeta}>
          {reportTitle} · {period} · Generated {generatedAt}
        </Text>
      </View>
    </View>
  );
}

export function DocFooter() {
  return (
    <View style={s.footer} fixed>
      <Text>Samantha's Bakery · BizCore</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );
}

export type SummaryItem = {
  label: string;
  value: string;
  tone?: "default" | "success" | "danger";
};

export function SummaryGrid({ items }: { items: SummaryItem[] }) {
  return (
    <View style={s.summaryGrid}>
      {items.map((item) => (
        <View key={item.label} style={s.summaryCard}>
          <Text style={s.summaryLabel}>{item.label}</Text>
          <Text
            style={[
              s.summaryValue,
              item.tone === "success" ? s.summaryValueSuccess : {},
              item.tone === "danger" ? s.summaryValueDanger : {},
            ]}
          >
            {item.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

export type ColDef = {
  header: string;
  width: string | number;
  align?: "left" | "right";
};

export function TableHeaderRow({ cols }: { cols: ColDef[] }) {
  return (
    <View style={s.tableHeaderRow}>
      {cols.map((col) => (
        <Text
          key={col.header}
          style={[s.th, { width: col.width, textAlign: col.align ?? "left" }]}
        >
          {col.header}
        </Text>
      ))}
    </View>
  );
}

// ── Branded page wrapper ──────────────────────────────────────────────────────

export function BrandedDoc({
  businessName,
  reportTitle,
  period,
  generatedAt,
  children,
}: {
  businessName: string;
  reportTitle: string;
  period: string;
  generatedAt: string;
  children: React.ReactNode;
}) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <DocHeader
          businessName={businessName}
          reportTitle={reportTitle}
          period={period}
          generatedAt={generatedAt}
        />
        {children}
        <DocFooter />
      </Page>
    </Document>
  );
}

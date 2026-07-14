// GET /api/reports/pdf?type=daily_sales&date=YYYY-MM-DD
//
// Role gate: owner | manager (mirrors the Reports page — CLAUDE.md §5).
// Pulls the SAME derived selectors the report screens use (single source of
// truth), formats money as strings, then streams a server-rendered PDF back as
// `application/pdf`. No Chromium — pure @react-pdf/renderer.
//
// Security: CLAUDE.md §7.
//   • Auth via getProfile (cookie session, SSR pattern) — no client-supplied
//     identity.
//   • business_id resolved from the authenticated profile, never from the URL.
//   • Zod validates the query params; invalid inputs get 400.

import { createElement, type ReactElement } from "react";
import { type NextRequest } from "next/server";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { z } from "zod";
import { getProfile, getBusiness } from "@/lib/auth";
import { rolesFor } from "@/lib/access";
import { getDailyReport } from "@/lib/db/selectors/reports";
import { getEndOfDayReport } from "@/lib/db/selectors/stock";
import { isDateStr, singleDayPeriod, toReportType } from "@/lib/reports/report-params";
import { formatLKR, formatAmount } from "@/lib/format";
import { DailySalesDoc } from "@/lib/pdf/daily-sales-doc";
import { EndOfDayDoc } from "@/lib/pdf/end-of-day-doc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  type: z.string().optional().transform((v) => toReportType(v)),
  date: z
    .string()
    .optional()
    .refine((v) => !v || isDateStr(v), { message: "Invalid date" }),
});

function isoNow(): string {
  return new Date().toLocaleString("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Colombo",
  });
}

export async function GET(request: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const profile = await getProfile();
  if (!profile) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!rolesFor("reports").includes(profile.role)) {
    return new Response("Forbidden", { status: 403 });
  }

  // ── Params ──────────────────────────────────────────────────────────────────
  const sp = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = querySchema.safeParse(sp);
  if (!parsed.success) {
    return new Response("Bad Request", { status: 400 });
  }
  const { type: reportType } = parsed.data;
  const date = (parsed.data.date && isDateStr(parsed.data.date) ? parsed.data.date : null) ??
    (() => {
      const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Colombo" }));
      return d.toISOString().slice(0, 10);
    })();

  // ── Business name ───────────────────────────────────────────────────────────
  const business = await getBusiness();
  const businessName = business?.name ?? "Samantha's Bakery";
  const generatedAt = isoNow();

  // ── Render ──────────────────────────────────────────────────────────────────
  let docElement: ReactElement<DocumentProps>;
  let filename: string;

  if (reportType === "end_of_day") {
    const report = await getEndOfDayReport(date);

    const priceFmtMap = new Map<string, string>(
      report.rows.map((r) => [r.itemId, formatLKR(r.unitPriceCents)]),
    );
    const revenueFmtMap = new Map<string, string>(
      report.rows
        .filter((r) => r.revenueCents !== null)
        .map((r) => [r.itemId, formatLKR(r.revenueCents!)]),
    );

    docElement = createElement(EndOfDayDoc, {
      report,
      businessName,
      date,
      generatedAt,
      totalRevenueFmt: formatLKR(report.totalRevenueCents),
      priceFmtMap,
      revenueFmtMap,
    }) as unknown as ReactElement<DocumentProps>;
    filename = `end-of-day-${date}.pdf`;
  } else {
    const report = await getDailyReport(singleDayPeriod(date));

    const enrichedRows = report.rows.map((r) => ({
      ...r,
      totalFmt: formatLKR(r.totalCents),
    }));
    const enrichedBySource = report.bySource.map((r) => ({
      ...r,
      revenueFmt: formatAmount(r.grossCents),
      commissionFmt: formatAmount(r.commissionCents),
    }));
    const enrichedByPayment = report.byPayment.map((r) => ({
      ...r,
      revenueFmt: formatAmount(r.grossCents),
    }));

    docElement = createElement(DailySalesDoc, {
      report: {
        ...report,
        rows: enrichedRows,
        bySource: enrichedBySource,
        byPayment: enrichedByPayment,
        revenueFmt: formatLKR(report.revenueCents),
        commissionFmt: formatLKR(report.commissionCents),
        netRevenueFmt: formatLKR(report.netRevenueCents),
      },
      businessName,
      date,
      generatedAt,
    }) as unknown as ReactElement<DocumentProps>;
    filename = `daily-sales-${date}.pdf`;
  }

  const pdfBuffer = await renderToBuffer(docElement);

  return new Response(Buffer.from(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

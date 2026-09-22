import type { NextRequest } from "next/server";

import {
  getOwnerMoneyExportRows,
  parseOwnerMoneyQuery,
} from "@/lib/data/money";
import { getTodayInManila } from "@/lib/dates";

const exportDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function csvCell(value: string | number | null) {
  const raw = value === null ? "" : String(value);
  // Quoting alone does not stop spreadsheet apps from evaluating formulas.
  const text =
    typeof value === "string" && /^(?:\s*[=+\-@]|[\t\r\n])/.test(raw)
      ? `'${raw}`
      : raw;
  return `"${text.replaceAll('"', '""')}"`;
}

function csvDate(value: string | null) {
  return value ? exportDateFormatter.format(new Date(value)) : "";
}

export async function GET(request: NextRequest) {
  const rawParams = Object.fromEntries(request.nextUrl.searchParams.entries());
  const query = parseOwnerMoneyQuery(rawParams);
  const result = await getOwnerMoneyExportRows(query);

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 503 });
  }

  const header = [
    "Reference",
    "Booking type",
    "Customer",
    "Email",
    "Mobile",
    "Schedule start",
    "Schedule end",
    "Courts",
    "Reservation status",
    "Payment status",
    "Amount PHP",
    "GCash reference",
    "Payment received",
    "Verified at",
    "Refunded at",
  ];
  const lines = result.rows.map((record) =>
    [
      record.reference,
      record.recordType,
      record.customerName,
      record.customerEmail,
      record.customerPhone,
      csvDate(record.scheduleStart),
      csvDate(record.scheduleEnd),
      record.courtNames,
      record.reservationStatus,
      record.paymentStatus,
      record.amount,
      record.gcashRef,
      csvDate(record.paymentCreatedAt),
      csvDate(record.verifiedAt),
      csvDate(record.refundedAt),
    ]
      .map(csvCell)
      .join(","),
  );
  const csv = [header.map(csvCell).join(","), ...lines].join("\r\n");

  return new Response(`\uFEFF${csv}`, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="tiffany-payments-${getTodayInManila()}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}

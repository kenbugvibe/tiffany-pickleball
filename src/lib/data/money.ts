import "server-only";

import { isIsoDate } from "@/lib/dates";
import { requireOwner } from "@/lib/owner-auth";
import { createClient } from "@/lib/supabase/server";

export const MONEY_PAYMENT_STATUSES = [
  "unverified",
  "verified",
  "rejected",
  "refund_pending",
  "refunded",
] as const;

export const MONEY_RECORD_TYPES = [
  "court_booking",
  "open_play",
  "sunday_unli",
] as const;

export type MoneyPaymentStatus = (typeof MONEY_PAYMENT_STATUSES)[number];
export type MoneyRecordType = (typeof MONEY_RECORD_TYPES)[number];

export type OwnerMoneyFilters = {
  from: string | null;
  to: string | null;
  status: MoneyPaymentStatus | null;
  type: MoneyRecordType | null;
  query: string;
};

export type OwnerMoneyQuery = OwnerMoneyFilters & {
  page: number;
};

export type OwnerMoneyRecord = {
  paymentId: string;
  paymentCreatedAt: string;
  paymentStatus: MoneyPaymentStatus;
  amount: number;
  gcashRef: string;
  verifiedAt: string | null;
  refundedAt: string | null;
  reference: string;
  recordType: MoneyRecordType;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  scheduleStart: string;
  scheduleEnd: string;
  courtNames: string;
  reservationStatus: string;
};

export type OwnerMoneySummary = {
  verifiedRevenue: number;
  unverifiedCount: number;
  refundPendingAmount: number;
  refundedAmount: number;
  recordCount: number;
};

type RawSearchParams = Record<string, string | string[] | undefined>;

type MoneyRecordRpcRow = {
  payment_id: string;
  payment_created_at: string;
  payment_status: MoneyPaymentStatus;
  amount: number;
  gcash_ref: string;
  verified_at: string | null;
  refunded_at: string | null;
  reference: string;
  record_type: MoneyRecordType;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  schedule_start: string;
  schedule_end: string;
  court_names: string;
  reservation_status: string;
  total_count: number | string;
};

type MoneySummaryRpcRow = {
  verified_revenue: number | string;
  unverified_count: number | string;
  refund_pending_amount: number | string;
  refunded_amount: number | string;
  record_count: number | string;
};

const PAGE_SIZE = 25;
const EXPORT_PAGE_SIZE = 500;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function includesValue<T extends readonly string[]>(
  values: T,
  value: string | undefined,
): value is T[number] {
  return typeof value === "string" && values.includes(value);
}

export function parseOwnerMoneyQuery(params: RawSearchParams): OwnerMoneyQuery {
  const requestedFrom = first(params.from);
  const requestedTo = first(params.to);
  const requestedStatus = first(params.status);
  const requestedType = first(params.type);
  const requestedPage = Number.parseInt(first(params.page) ?? "1", 10);

  return {
    from: isIsoDate(requestedFrom) ? requestedFrom : null,
    to: isIsoDate(requestedTo) ? requestedTo : null,
    status: includesValue(MONEY_PAYMENT_STATUSES, requestedStatus)
      ? requestedStatus
      : null,
    type: includesValue(MONEY_RECORD_TYPES, requestedType)
      ? requestedType
      : null,
    query: (first(params.q) ?? "").trim().slice(0, 100),
    page:
      Number.isSafeInteger(requestedPage) && requestedPage > 0
        ? requestedPage
        : 1,
  };
}

function rpcFilters(filters: OwnerMoneyFilters) {
  return {
    p_from_date: filters.from,
    p_to_date: filters.to,
    p_record_type: filters.type,
    p_search_query: filters.query || null,
  };
}

function mapRecord(row: MoneyRecordRpcRow): OwnerMoneyRecord {
  return {
    paymentId: row.payment_id,
    paymentCreatedAt: row.payment_created_at,
    paymentStatus: row.payment_status,
    amount: Number(row.amount),
    gcashRef: row.gcash_ref,
    verifiedAt: row.verified_at,
    refundedAt: row.refunded_at,
    reference: row.reference,
    recordType: row.record_type,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    scheduleStart: row.schedule_start,
    scheduleEnd: row.schedule_end,
    courtNames: row.court_names,
    reservationStatus: row.reservation_status,
  };
}

export async function getOwnerMoneyData(query: OwnerMoneyQuery) {
  await requireOwner();

  const supabase = await createClient();
  const offset = (query.page - 1) * PAGE_SIZE;
  const filters = rpcFilters(query);
  const [recordsResult, summaryResult] = await Promise.all([
    supabase.rpc("get_owner_money_records", {
      ...filters,
      p_payment_status: query.status,
      p_page_size: PAGE_SIZE,
      p_page_offset: offset,
    }),
    supabase.rpc("get_owner_money_summary", filters),
  ]);

  if (recordsResult.error || summaryResult.error) {
    return {
      ok: false as const,
      error:
        "Money records are unavailable. Apply the Phase 7 Owner Money migration, then refresh this page.",
    };
  }

  const recordRows = (recordsResult.data ?? []) as MoneyRecordRpcRow[];
  const summaryRows = (summaryResult.data ?? []) as MoneySummaryRpcRow[];
  const summaryRow = summaryRows[0];
  const totalRecords = Number(recordRows[0]?.total_count ?? 0);

  return {
    ok: true as const,
    records: recordRows.map(mapRecord),
    totalRecords,
    totalPages: Math.max(1, Math.ceil(totalRecords / PAGE_SIZE)),
    pageSize: PAGE_SIZE,
    summary: {
      verifiedRevenue: Number(summaryRow?.verified_revenue ?? 0),
      unverifiedCount: Number(summaryRow?.unverified_count ?? 0),
      refundPendingAmount: Number(summaryRow?.refund_pending_amount ?? 0),
      refundedAmount: Number(summaryRow?.refunded_amount ?? 0),
      recordCount: Number(summaryRow?.record_count ?? 0),
    } satisfies OwnerMoneySummary,
  };
}

export async function getOwnerMoneyExportRows(filters: OwnerMoneyFilters) {
  await requireOwner();

  const supabase = await createClient();
  const rows: OwnerMoneyRecord[] = [];
  let totalRecords = 0;

  do {
    const { data, error } = await supabase.rpc("get_owner_money_records", {
      ...rpcFilters(filters),
      p_payment_status: filters.status,
      p_page_size: EXPORT_PAGE_SIZE,
      p_page_offset: rows.length,
    });

    if (error) {
      return {
        ok: false as const,
        error:
          "Money records are unavailable. Apply the Phase 7 Owner Money migration, then try again.",
      };
    }

    const batch = (data ?? []) as MoneyRecordRpcRow[];
    totalRecords = Number(batch[0]?.total_count ?? totalRecords);
    rows.push(...batch.map(mapRecord));

    if (batch.length < EXPORT_PAGE_SIZE) break;
  } while (rows.length < totalRecords);

  return { ok: true as const, rows };
}

export function ownerMoneyQueryString(
  query: OwnerMoneyQuery,
  options?: { page?: number; includePage?: boolean },
) {
  const params = new URLSearchParams();

  if (query.query) params.set("q", query.query);
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (query.type) params.set("type", query.type);
  if (query.status) params.set("status", query.status);

  const page = options?.page ?? query.page;
  if (options?.includePage !== false && page > 1) {
    params.set("page", String(page));
  }

  return params.toString();
}

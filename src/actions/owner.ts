"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  courtBlockReturnPath,
  parseCourtBlockSelection,
  UUID_PATTERN,
  manilaHourToIso,
} from "@/lib/court-blocks";
import type { CourtBlockSelection } from "@/lib/court-blocks";
import { getCourtBlockPreview } from "@/lib/data/owner";
import { getTodayInManila, isIsoDate } from "@/lib/dates";
import { sendCourtBlockedNotification } from "@/lib/notifications/court-blocked";
import {
  openPlayReturnPath,
  openPlayTimes,
  parseOpenPlaySelection,
} from "@/lib/open-play";
import { requireOwner } from "@/lib/owner-auth";
import { createClient } from "@/lib/supabase/server";
import {
  isSundayIsoDate,
  sundayUnliReturnPath,
} from "@/lib/sunday-unli";

export async function reviewPaymentAction(formData: FormData) {
  await requireOwner();

  const paymentId = String(formData.get("paymentId") ?? "");
  const decision = String(formData.get("decision") ?? "");

  if (!UUID_PATTERN.test(paymentId) || !["approve", "reject"].includes(decision)) {
    redirect("/owner/today?error=invalid-review");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("review_payment", {
    p_payment_id: paymentId,
    p_decision: decision,
  });

  if (error) {
    redirect("/owner/today?error=review-failed");
  }

  revalidatePath("/owner/today");
  redirect(`/owner/today?reviewed=${decision === "approve" ? "approved" : "rejected"}`);
}

function blockPreviewPath(
  selection: CourtBlockSelection,
  error: string,
) {
  const params = new URLSearchParams({
    week: selection.date,
    day: selection.date,
    blockDate: selection.date,
    blockStart: String(selection.startHour),
    blockEnd: String(selection.endHour),
    blockReason: selection.reason,
    error,
  });
  selection.courtIds.forEach((courtId) => {
    params.append("blockCourt", String(courtId));
  });

  return `/owner/calendar?${params.toString()}`;
}

export async function createCourtBlockAction(formData: FormData) {
  await requireOwner();

  const parsed = parseCourtBlockSelection({
    courtIds: formData.getAll("courtId").map(String),
    date: String(formData.get("blockDate") ?? ""),
    startHour: String(formData.get("startHour") ?? ""),
    endHour: String(formData.get("endHour") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  });

  if (!parsed.ok) {
    redirect("/owner/calendar?error=invalid-block");
  }

  const selection = parsed.value;

  if (formData.get("confirmed") !== "yes") {
    redirect(blockPreviewPath(selection, "confirmation-required"));
  }

  const expectedIds = Array.from(
    new Set(
      formData
        .getAll("expectedBookingId")
        .map((value) => String(value))
        .filter((value) => UUID_PATTERN.test(value)),
    ),
  ).sort();
  const submittedIds = formData
    .getAll("expectedBookingId")
    .map((value) => String(value));

  if (
    expectedIds.length !== submittedIds.length ||
    submittedIds.some((value) => !UUID_PATTERN.test(value))
  ) {
    redirect(blockPreviewPath(selection, "invalid-block"));
  }

  const preview = await getCourtBlockPreview(selection);
  const currentIds = preview.affectedBookings
    .map((booking) => booking.id)
    .sort();

  if (preview.error) {
    redirect(blockPreviewPath(selection, "invalid-block"));
  }

  if (preview.specialConflicts.length > 0) {
    redirect(blockPreviewPath(selection, "special-conflict"));
  }

  if (JSON.stringify(expectedIds) !== JSON.stringify(currentIds)) {
    redirect(blockPreviewPath(selection, "schedule-changed"));
  }

  if (currentIds.length > 0 && !preview.emailConfigured) {
    redirect(blockPreviewPath(selection, "email-not-configured"));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_court_block", {
    p_court_ids: selection.courtIds,
    p_starts_at: manilaHourToIso(selection.date, selection.startHour),
    p_ends_at: manilaHourToIso(selection.date, selection.endHour),
    p_reason: selection.reason,
    p_expected_booking_ids: expectedIds,
  });

  if (error || !data || typeof data !== "object") {
    const errorCode = error?.message
      ?.toLowerCase()
      .includes("schedule changed")
      ? "schedule-changed"
      : "block-failed";
    redirect(blockPreviewPath(selection, errorCode));
  }

  const result = data as {
    block_references?: unknown;
    block_count?: unknown;
    cancelled_count?: unknown;
    notification_ids?: unknown;
  };
  const blockReferences = Array.isArray(result.block_references)
    ? result.block_references.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  const blockReference = blockReferences.join(", ") || "created";
  const blockCount =
    typeof result.block_count === "number"
      ? result.block_count
      : selection.courtIds.length;
  const cancelledCount =
    typeof result.cancelled_count === "number"
      ? result.cancelled_count
      : currentIds.length;
  const notificationIds = Array.isArray(result.notification_ids)
    ? result.notification_ids.filter(
        (value): value is string =>
          typeof value === "string" && UUID_PATTERN.test(value),
      )
    : [];

  let failedEmails = 0;

  if (notificationIds.length > 0) {
    const { data: notifications, error: notificationsError } = await supabase
      .from("customer_notifications")
      .select(
        "id, recipient_name, recipient_email, booking_reference, court_name, starts_at, ends_at, reason, refund_amount",
      )
      .in("id", notificationIds);

    if (notificationsError || !notifications) {
      failedEmails = notificationIds.length;
    } else {
      const deliveryResults = await Promise.all(
        notifications.map(async (notification) => {
          let delivery:
            | { ok: true }
            | { ok: false; error: string };

          try {
            delivery = await sendCourtBlockedNotification({
              ...notification,
              refund_amount: Number(notification.refund_amount),
            });
          } catch {
            delivery = {
              ok: false,
              error: "The email provider could not be reached.",
            };
          }

          const { error: updateError } = await supabase
            .from("customer_notifications")
            .update(
              delivery.ok
                ? {
                    status: "sent",
                    sent_at: new Date().toISOString(),
                    last_error: null,
                  }
                : {
                    status: "failed",
                    sent_at: null,
                    last_error: delivery.error.slice(0, 1000),
                  },
            )
            .eq("id", notification.id);

          return delivery.ok && !updateError;
        }),
      );

      failedEmails =
        notificationIds.length - notifications.length +
        deliveryResults.filter((delivered) => !delivered).length;
    }
  }

  revalidatePath("/owner/calendar");
  revalidatePath("/owner/today");

  const successParams = new URLSearchParams({
    blocked: blockReference,
    blockedCount: String(blockCount),
    cancelled: String(cancelledCount),
  });

  if (failedEmails > 0) {
    successParams.set("emailFailed", String(failedEmails));
  }

  redirect(`${courtBlockReturnPath(selection.date)}&${successParams.toString()}`);
}

export async function removeCourtBlockAction(formData: FormData) {
  await requireOwner();

  const blockId = String(formData.get("blockId") ?? "");
  const submittedDate = String(formData.get("returnDate") ?? "");
  const returnDate = isIsoDate(submittedDate)
    ? submittedDate
    : getTodayInManila();

  if (!UUID_PATTERN.test(blockId)) {
    redirect(`${courtBlockReturnPath(returnDate)}&error=invalid-remove-block`);
  }

  if (formData.get("confirmed") !== "yes") {
    redirect(`${courtBlockReturnPath(returnDate)}&error=remove-confirmation-required`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("remove_court_block", {
    p_block_id: blockId,
  });

  if (error || typeof data !== "string") {
    redirect(`${courtBlockReturnPath(returnDate)}&error=remove-block-failed`);
  }

  revalidatePath("/owner/calendar");
  revalidatePath("/owner/today");

  redirect(
    `${courtBlockReturnPath(returnDate)}&unblocked=${encodeURIComponent(data)}`,
  );
}

export async function createOpenPlaySessionAction(formData: FormData) {
  await requireOwner();

  const submittedDate = String(formData.get("openPlayDate") ?? "");
  const returnDate = isIsoDate(submittedDate)
    ? submittedDate
    : getTodayInManila();
  const parsed = parseOpenPlaySelection({
    courtIds: formData.getAll("courtId").map(String),
    date: submittedDate,
    startHour: String(formData.get("startHour") ?? ""),
    endHour: String(formData.get("endHour") ?? ""),
    title: String(formData.get("title") ?? ""),
    customerNote: String(formData.get("customerNote") ?? ""),
  });

  if (!parsed.ok) {
    redirect(`${openPlayReturnPath(returnDate)}&error=invalid-open-play`);
  }

  const selection = parsed.value;
  const { startsAt, endsAt } = openPlayTimes(selection);

  if (new Date(startsAt).getTime() <= Date.now()) {
    redirect(`${openPlayReturnPath(returnDate)}&error=open-play-in-past`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_open_play_session", {
    p_court_ids: selection.courtIds,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
    p_title: selection.title,
    p_customer_note: selection.customerNote || null,
  });

  if (error || !data || typeof data !== "object") {
    const message = error?.message.toLowerCase() ?? "";
    const errorCode = message.includes("no longer available")
      ? "open-play-conflict"
      : "open-play-publish-failed";
    redirect(`${openPlayReturnPath(returnDate)}&error=${errorCode}`);
  }

  const result = data as { session_reference?: unknown };
  const reference =
    typeof result.session_reference === "string"
      ? result.session_reference
      : "created";

  revalidatePath("/");
  revalidatePath("/owner/calendar");
  revalidatePath("/owner/today");

  redirect(
    `${openPlayReturnPath(returnDate)}&publishedOpenPlay=${encodeURIComponent(reference)}`,
  );
}

export async function removeOpenPlaySessionAction(formData: FormData) {
  await requireOwner();

  const sessionId = String(formData.get("sessionId") ?? "");
  const submittedDate = String(formData.get("returnDate") ?? "");
  const returnDate = isIsoDate(submittedDate)
    ? submittedDate
    : getTodayInManila();

  if (!UUID_PATTERN.test(sessionId)) {
    redirect(`${openPlayReturnPath(returnDate)}&error=invalid-remove-open-play`);
  }

  if (formData.get("confirmed") !== "yes") {
    redirect(
      `${openPlayReturnPath(returnDate)}&error=remove-open-play-confirmation-required`,
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("remove_open_play_session", {
    p_session_id: sessionId,
  });

  if (error || typeof data !== "string") {
    const message = error?.message.toLowerCase() ?? "";
    const errorCode = message.includes("active participants")
      ? "open-play-has-participants"
      : "remove-open-play-failed";
    redirect(`${openPlayReturnPath(returnDate)}&error=${errorCode}`);
  }

  revalidatePath("/");
  revalidatePath("/owner/calendar");
  revalidatePath("/owner/today");

  redirect(
    `${openPlayReturnPath(returnDate)}&removedOpenPlay=${encodeURIComponent(data)}`,
  );
}

export async function createSundayUnliSessionAction(formData: FormData) {
  await requireOwner();

  const submittedDate = String(formData.get("sundayUnliDate") ?? "");
  const returnDate = isIsoDate(submittedDate)
    ? submittedDate
    : getTodayInManila();
  const customerNote = String(formData.get("customerNote") ?? "").trim();

  if (!isSundayIsoDate(submittedDate) || customerNote.length > 500) {
    redirect(`${sundayUnliReturnPath(returnDate)}&error=invalid-sunday-unli`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_sunday_unli_session", {
    p_session_date: submittedDate,
    p_customer_note: customerNote || null,
  });

  if (error || !data || typeof data !== "object") {
    console.error("[sunday-unli] publish failed", {
      code: error?.code ?? null,
      message: error?.message ?? "No result returned",
      details: error?.details ?? null,
      hint: error?.hint ?? null,
    });
    const message = error?.message.toLowerCase() ?? "";
    const errorCode = message.includes("future sunday")
      ? "sunday-unli-in-past"
      : message.includes("no longer available")
        ? "sunday-unli-conflict"
        : "sunday-unli-publish-failed";
    redirect(`${sundayUnliReturnPath(returnDate)}&error=${errorCode}`);
  }

  const result = data as { session_reference?: unknown };
  const reference =
    typeof result.session_reference === "string"
      ? result.session_reference
      : "created";

  revalidatePath("/");
  revalidatePath("/owner/calendar");
  revalidatePath("/owner/today");

  redirect(
    `${sundayUnliReturnPath(returnDate)}&publishedSundayUnli=${encodeURIComponent(reference)}`,
  );
}

export async function removeSundayUnliSessionAction(formData: FormData) {
  await requireOwner();

  const sessionId = String(formData.get("sessionId") ?? "");
  const submittedDate = String(formData.get("returnDate") ?? "");
  const returnDate = isIsoDate(submittedDate)
    ? submittedDate
    : getTodayInManila();

  if (!UUID_PATTERN.test(sessionId)) {
    redirect(
      `${sundayUnliReturnPath(returnDate)}&error=invalid-remove-sunday-unli`,
    );
  }

  if (formData.get("confirmed") !== "yes") {
    redirect(
      `${sundayUnliReturnPath(returnDate)}&error=remove-sunday-unli-confirmation-required`,
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("remove_sunday_unli_session", {
    p_session_id: sessionId,
  });

  if (error || typeof data !== "string") {
    const message = error?.message.toLowerCase() ?? "";
    const errorCode = message.includes("active participants")
      ? "sunday-unli-has-participants"
      : "remove-sunday-unli-failed";
    redirect(`${sundayUnliReturnPath(returnDate)}&error=${errorCode}`);
  }

  revalidatePath("/");
  revalidatePath("/owner/calendar");
  revalidatePath("/owner/today");

  redirect(
    `${sundayUnliReturnPath(returnDate)}&removedSundayUnli=${encodeURIComponent(data)}`,
  );
}

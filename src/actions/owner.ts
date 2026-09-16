"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  courtBlockReturnPath,
  parseCourtBlockSelection,
  UUID_PATTERN,
  manilaHourToIso,
} from "@/lib/court-blocks";
import { getCourtBlockPreview } from "@/lib/data/owner";
import { getTodayInManila, isIsoDate } from "@/lib/dates";
import { sendCourtBlockedNotification } from "@/lib/notifications/court-blocked";
import { requireOwner } from "@/lib/owner-auth";
import { createClient } from "@/lib/supabase/server";

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
  selection: {
    courtId: number;
    date: string;
    startHour: number;
    endHour: number;
    reason: string;
  },
  error: string,
) {
  const params = new URLSearchParams({
    week: selection.date,
    day: selection.date,
    blockCourt: String(selection.courtId),
    blockDate: selection.date,
    blockStart: String(selection.startHour),
    blockEnd: String(selection.endHour),
    blockReason: selection.reason,
    error,
  });

  return `/owner/calendar?${params.toString()}`;
}

export async function createCourtBlockAction(formData: FormData) {
  await requireOwner();

  const parsed = parseCourtBlockSelection({
    courtId: String(formData.get("courtId") ?? ""),
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
    p_court_id: selection.courtId,
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
    block_reference?: unknown;
    cancelled_count?: unknown;
    notification_ids?: unknown;
  };
  const blockReference =
    typeof result.block_reference === "string"
      ? result.block_reference
      : "created";
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

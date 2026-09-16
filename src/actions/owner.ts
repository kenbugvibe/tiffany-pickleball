"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireOwner } from "@/lib/owner-auth";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

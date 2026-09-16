import "server-only";

import { createClient } from "@/lib/supabase/server";
import { normalizePhPhone } from "@/lib/validation";

/**
 * Creates the caller's `customers` row when it does not exist yet.
 *
 * The signup database trigger creates this row for new customer accounts.
 * This fallback repairs older accounts after they first authenticate, using
 * the full name and phone carried in the auth user's metadata.
 */
export async function ensureCustomerProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return null;
  }

  const { data: existing } = await supabase
    .from("customers")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (existing) {
    return existing.id as string;
  }

  const metadata = user.user_metadata ?? {};
  const fullName = String(metadata.full_name ?? "").trim();
  const phone = normalizePhPhone(String(metadata.phone ?? ""));

  // The table's check constraints reject blanks, so an account missing its
  // metadata is left without a profile rather than failing the whole request.
  if (fullName.length < 2 || !phone) {
    return null;
  }

  const { data, error } = await supabase
    .from("customers")
    .insert({
      auth_user_id: user.id,
      full_name: fullName,
      phone,
      email: user.email,
      is_coach: false,
    })
    .select("id")
    .single();

  if (error) {
    // A concurrent request may have inserted it first; the unique index on
    // auth_user_id makes that safe to ignore.
    return null;
  }

  return data.id as string;
}

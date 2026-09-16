import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * Verifies both identity and owner authorization close to protected data.
 * The proxy only performs the optimistic signed-in check; this DAL check is
 * the authoritative application guard, with RLS providing the final layer.
 */
export const requireOwner = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in?next=%2Fowner%2Ftoday");
  }

  const { data: isAdmin, error } = await supabase.rpc("is_admin");

  if (error) {
    throw new Error("Owner authorization could not be verified.");
  }

  if (!isAdmin) {
    redirect("/");
  }

  return {
    id: user.id,
    email: user.email ?? "Owner",
  };
});

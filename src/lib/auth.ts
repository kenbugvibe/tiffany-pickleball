import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

export type AuthUser = {
  id: string;
  email: string | null;
  userMetadata: Record<string, unknown>;
};

/**
 * The signed-in user for this request, looked up once per render.
 *
 * getClaims() verifies the session token against the project's ES256 public
 * key locally (the key is cached in memory), so it does not make a network
 * call to Supabase Auth the way getUser() does. Row Level Security still
 * checks the same token on every database query.
 */
export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (error || !claims?.sub) {
    return null;
  }

  return {
    id: claims.sub,
    email:
      typeof claims.email === "string" && claims.email ? claims.email : null,
    userMetadata: (claims.user_metadata ?? {}) as Record<string, unknown>,
  };
});

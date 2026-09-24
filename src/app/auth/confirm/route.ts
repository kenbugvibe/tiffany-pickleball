import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { ensureCustomerProfile } from "@/lib/data/customers";
import { safeRedirectPath } from "@/lib/redirects";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const flowId = searchParams.get("sb_flow_id");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const flow = searchParams.get("flow");
  const oauthProvider = searchParams.get("provider");
  const oauthAuthPage =
    searchParams.get("authPage") === "sign-up" ? "/sign-up" : "/sign-in";
  const next = safeRedirectPath(searchParams.get("next"));
  const supabase = await createClient();
  let verified = false;

  // Supabase's default SSR flow redirects back with a PKCE code. Token-hash
  // links remain supported for projects with customized email templates.
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(
      code,
      flowId ? { flowId } : undefined,
    );

    verified = !error;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });

    verified = !error;
  }

  if (verified) {
    if (flow === "oauth") {
      const { data: isAdmin } = await supabase.rpc("is_admin");

      if (isAdmin) {
        let conflictError = "owner-social-conflict";

        // Supabase automatically links OAuth identities that share a verified
        // email. Never let a customer-facing social login silently become an
        // owner session when the social account uses the owner's email.
        if (oauthProvider === "google" || oauthProvider === "facebook") {
          const { data: identityData } =
            await supabase.auth.getUserIdentities();
          const identities = identityData?.identities ?? [];
          const socialIdentity = identities.find(
            (identity) => identity.provider === oauthProvider,
          );

          if (socialIdentity && identities.length > 1) {
            const { error: unlinkError } =
              await supabase.auth.unlinkIdentity(socialIdentity);

            if (unlinkError) {
              console.error(
                "[auth/confirm] Could not unlink social identity from owner",
                { provider: oauthProvider, message: unlinkError.message },
              );
            } else {
              conflictError = "owner-social-unlinked";
            }
          }
        }

        await supabase.auth.signOut({ scope: "local" });

        const conflictUrl = new URL(oauthAuthPage, request.url);
        conflictUrl.searchParams.set("error", conflictError);
        conflictUrl.searchParams.set("next", next);

        return NextResponse.redirect(conflictUrl);
      }

      const customerId = await ensureCustomerProfile();

      if (!customerId) {
        const profileUrl = new URL("/complete-profile", request.url);
        profileUrl.searchParams.set("next", next);

        return NextResponse.redirect(profileUrl);
      }
    } else {
      // Repairs profiles for accounts created before the signup trigger existed.
      await ensureCustomerProfile();
    }

    return NextResponse.redirect(new URL(next, request.url));
  }

  const error = flow === "oauth" ? "oauth-failed" : "confirmation-failed";
  const signInUrl = new URL("/sign-in", request.url);
  signInUrl.searchParams.set("error", error);
  signInUrl.searchParams.set("next", next);

  return NextResponse.redirect(signInUrl);
}

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
    // Repairs profiles for accounts created before the signup trigger existed.
    await ensureCustomerProfile();

    return NextResponse.redirect(new URL(next, request.url));
  }

  return NextResponse.redirect(
    new URL("/sign-in?error=confirmation-failed", request.url),
  );
}

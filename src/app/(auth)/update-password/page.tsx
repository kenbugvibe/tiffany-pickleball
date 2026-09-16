import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { UpdatePasswordForm } from "@/components/shared/update-password-form";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Choose a new password",
};

export default async function UpdatePasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Reaching this page means the recovery link already created a session.
  if (!user) {
    redirect("/forgot-password");
  }

  return (
    <>
      <h1 className="font-display text-2xl font-bold text-ink-900">
        Choose a new password
      </h1>
      <p className="mt-1.5 text-sm text-ink-500">
        Signed in as {user.email}.
      </p>

      <div className="mt-6">
        <UpdatePasswordForm />
      </div>
    </>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BookingForm } from "@/components/booking/booking-form";
import { BookingShell } from "@/components/booking/booking-shell";
import { getAvailabilityForDays } from "@/lib/data/availability";
import { ensureCustomerProfile } from "@/lib/data/customers";
import { getTodayInManila, isIsoDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Book a court",
};

type BookPageProps = {
  searchParams: Promise<{
    date?: string | string[];
    court?: string | string[];
    startsAt?: string | string[];
  }>;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function BookPage({ searchParams }: BookPageProps) {
  const params = await searchParams;
  const today = getTodayInManila();
  const requestedDate = firstValue(params.date);
  const selectedDate =
    isIsoDate(requestedDate) && requestedDate >= today ? requestedDate : today;
  const requestedCourt = Number(firstValue(params.court));
  const initialCourtId = Number.isInteger(requestedCourt)
    ? requestedCourt
    : null;
  const initialStartsAt = firstValue(params.startsAt) ?? null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const next = `/book?date=${encodeURIComponent(selectedDate)}`;
    redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  }

  const profileId = await ensureCustomerProfile();

  if (!profileId) {
    return (
      <BookingShell currentStep={1}>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800">
          <h1 className="font-display text-2xl font-bold">
            Customer profile incomplete
          </h1>
          <p className="mt-2 text-sm leading-6">
            This account is missing the full name or Philippine mobile number
            needed for a booking. Sign out and create the customer account again.
          </p>
        </div>
      </BookingShell>
    );
  }

  const [availability, settingsResult] = await Promise.all([
    getAvailabilityForDays([selectedDate]),
    supabase
      .from("business_settings")
      .select("paddle_price_per_hour")
      .eq("id", 1)
      .single(),
  ]);
  const rows = availability[selectedDate] ?? [];

  if (settingsResult.error || !settingsResult.data) {
    return (
      <BookingShell currentStep={1}>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800">
          <h1 className="font-display text-2xl font-bold">
            Booking is temporarily unavailable
          </h1>
          <p className="mt-2 text-sm leading-6">
            Court pricing could not be loaded. Return to availability and try
            again in a moment.
          </p>
        </div>
      </BookingShell>
    );
  }

  const paymentConfigured = Boolean(
    process.env.GCASH_ACCOUNT_NAME?.trim() &&
      process.env.GCASH_MOBILE_NUMBER?.trim(),
  );

  return (
    <BookingShell currentStep={3}>
      <BookingForm
        rows={rows}
        selectedDate={selectedDate}
        initialCourtId={initialCourtId}
        initialStartsAt={initialStartsAt}
        paddlePricePerHour={settingsResult.data.paddle_price_per_hour}
        paymentConfigured={paymentConfigured}
      />
    </BookingShell>
  );
}

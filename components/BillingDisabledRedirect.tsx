"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Shown instead of billing pages while BILLING_ENABLED is off (see lib/subscription.ts).
export default function BillingDisabledRedirect({ to }: { to: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(to);
  }, [router, to]);
  return null;
}

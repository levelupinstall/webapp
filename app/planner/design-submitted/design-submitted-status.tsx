"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

const LABOR_HOLD_STORAGE_KEY = "plannerSubmitLaborHoldCheckoutUrl";

function Inner() {
  const searchParams = useSearchParams();
  const checkoutKind = searchParams.get("checkout_kind");
  const [storedLaborUrl, setStoredLaborUrl] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(LABOR_HOLD_STORAGE_KEY);
      setStoredLaborUrl(raw?.trim() || null);
    } catch {
      setStoredLaborUrl(null);
    }
  }, []);

  useEffect(() => {
    if (checkoutKind !== "labor_hold") return;
    try {
      sessionStorage.removeItem(LABOR_HOLD_STORAGE_KEY);
      setStoredLaborUrl(null);
    } catch {
      /* ignore */
    }
  }, [checkoutKind]);

  const stripeBanner = useMemo(() => {
    if (checkoutKind === "immediate") {
      return "Payment authorized — thank you. Keep your confirmation email for records.";
    }
    if (checkoutKind === "labor_hold") {
      return "Labor authorization hold recorded — thanks.";
    }
    if (checkoutKind === "cancelled" || checkoutKind === "labor_hold_cancelled") {
      return "Checkout was cancelled. You can return from Saved Ideas to retry payment when ready.";
    }
    return null;
  }, [checkoutKind]);

  return (
    <>
      {stripeBanner ? (
        <p className="mt-4 rounded-2xl border border-[#cbb6ee] bg-white/70 px-4 py-3 text-[15px] text-[#442866]">
          {stripeBanner}
        </p>
      ) : null}

      {storedLaborUrl ? (
        <div className="mt-6 rounded-2xl border border-[#b79ae8] bg-white px-5 py-4 shadow-sm">
          <p className="text-[15px] font-semibold text-[#2d1546]">Labor authorization (hold)</p>
          <p className="mt-2 text-sm leading-relaxed text-[#55337b]">
            Your estimate includes incremental labor beyond the included assessment window. Complete this
            secure hold so we can schedule installation — it uses manual capture and is settled at
            completion.
          </p>
          <a
            href={storedLaborUrl}
            className="mt-4 inline-flex rounded-full bg-[#6e3eb2] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#5b3292]"
          >
            Authorize labor hold
          </a>
        </div>
      ) : null}
    </>
  );
}

export function DesignSubmittedStatus() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}

export { LABOR_HOLD_STORAGE_KEY };

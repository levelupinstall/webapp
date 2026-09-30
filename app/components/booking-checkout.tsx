"use client";

import { FormEvent, useEffect, useState } from "react";
import { lu } from "@/lib/level-up-ui";

type BookingPayload = {
  fullName: string;
  email: string;
  phone: string;
  projectAddress: string;
  preferredDate: string;
  projectDetails: string;
  agreedToTerms: boolean;
};

/** Service policy copy — booking / payment timing lives next to the checkout action, not here */
const TERMS_OF_SERVICE = [
  "Jobs are quoted at a fixed price agreed in writing before work begins. The $150 call-out fee covers the site visit and scope review, and is credited toward your project when you move ahead.",
  "Materials, specialty hardware, parking fees, and disposal costs are itemized in your fixed quote.",
  "Level Up Install maintains commercial general liability insurance and WSIB (Workplace Safety and Insurance Board) coverage for workers on jobs booked through this service; coverage is subject to current policies and eligibility.",
  "Client must provide safe, reasonable access to the work area and disclose site conditions that may impact scope or timing.",
  "Estimated schedules may shift due to site conditions, material delays, or safety considerations.",
  "Any scope changes requested after work begins may require updated pricing and timeline confirmation.",
];

export type BookingCheckoutProps = {
  /** Used inside AI Planner — adjusts headings and prefills project details from the brief */
  embedded?: boolean;
  initialProjectDetails?: string;
};

export default function BookingCheckout({
  embedded = false,
  initialProjectDetails = "",
}: BookingCheckoutProps) {
  const [form, setForm] = useState<BookingPayload>({
    fullName: "",
    email: "",
    phone: "",
    projectAddress: "",
    preferredDate: "",
    projectDetails: "",
    agreedToTerms: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!embedded || !initialProjectDetails.trim()) return;
    const timer = window.setTimeout(() => {
      setForm((prev) => ({
        ...prev,
        projectDetails: initialProjectDetails.trim(),
      }));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [embedded, initialProjectDetails]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!form.agreedToTerms) {
      setError("You must accept the Terms of Service before continuing.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/create-booking-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error || "Unable to start checkout.");
      }

      const data = (await response.json()) as { url: string };
      window.location.href = data.url;
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Unable to process booking payment.";
      setError(message);
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className={embedded ? `${lu.panelInset} p-5 sm:p-6` : `${lu.panel} bg-[#f7f1ff]`}
    >
      <h3 className={lu.heading}>
        {embedded ? "Secure your booking" : "Booking checkout"}
      </h3>
      <p className="mt-2 text-sm text-[#55337b] sm:text-[15px]">
        {embedded
          ? "Pay the $150 call-out fee to hold your spot. Our team will contact you to confirm scope, schedule, and payment details, align with an available carpenter, and follow up with formal terms and any remaining balance through Stripe."
          : "Complete your details and accept the Terms of Service to continue to secure card checkout."}
      </p>

      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            required
            value={form.fullName}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, fullName: event.target.value }))
            }
            placeholder="Full Name"
            className={lu.input}
          />
          <input
            required
            type="email"
            value={form.email}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, email: event.target.value }))
            }
            placeholder="Email"
            className={lu.input}
          />
          <input
            required
            value={form.phone}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, phone: event.target.value }))
            }
            placeholder="Phone Number"
            className={lu.input}
          />
          <input
            required
            value={form.projectAddress}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                projectAddress: event.target.value,
              }))
            }
            placeholder="Project Address"
            className={lu.input}
          />
          <label className="sm:col-span-2">
            <span className="mb-1 block text-sm font-medium text-[#4a2381]">
              Preferred Service Date
            </span>
            <input
              required
              type="date"
              value={form.preferredDate}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  preferredDate: event.target.value,
                }))
              }
              className={lu.textarea}
            />
          </label>
        </div>

        <textarea
          value={form.projectDetails}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, projectDetails: event.target.value }))
          }
          placeholder="Project details (scope, room, goals — your AI brief is prefilled when you start from the planner)"
          rows={4}
          className={lu.textarea}
        />

        <div className="rounded-2xl border border-[#dcc6fb] bg-white p-4">
          <h4 className="font-semibold text-[#2f1748]">Terms of Service</h4>
          <div className="mt-3 max-h-52 space-y-2 overflow-y-auto pr-1 text-sm text-[#4d2e70]">
            {TERMS_OF_SERVICE.map((term) => (
              <p key={term}>- {term}</p>
            ))}
          </div>
          <label className="mt-4 flex items-start gap-2 text-sm text-[#4d2e70]">
            <input
              type="checkbox"
              checked={form.agreedToTerms}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  agreedToTerms: event.target.checked,
                }))
              }
              className="mt-0.5"
            />
            I have read and agree to the Terms of Service.
          </label>
        </div>

        {error ? <p className="text-sm text-[#a2175d]">{error}</p> : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className={`${lu.btnPrimary} disabled:opacity-60`}
        >
          {isSubmitting
            ? "Redirecting to secure checkout..."
            : "Book — pay $150 call-out (Stripe)"}
        </button>
      </form>
    </div>
  );
}

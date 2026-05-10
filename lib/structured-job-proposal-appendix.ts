export const STRUCTURED_JOB_BILLING_START = "<!-- structured-job-billing -->";
export const STRUCTURED_JOB_BILLING_END = "<!-- /structured-job-billing -->";

export function defaultStructuredBillingTermsMarkdown(): string {
  return [
    "### Billing terms",
    "- **Call-out fee and materials** are billed immediately upon checkout authorization and are **non-refundable** once captured.",
    "- The client is responsible for **condominium / strata elevator bookings**, loading access, and any building-required notices.",
    "- **Final labor capture** occurs **immediately upon completion** of the installation scope described in this proposal.",
  ].join("\n");
}

/** Merge or replace the structured-job billing appendix block in proposal markdown. */
export function mergeStructuredJobBillingAppendix(
  markdownBody: string,
  appendixMarkdown: string,
): string {
  const block = `${STRUCTURED_JOB_BILLING_START}\n\n${appendixMarkdown.trim()}\n\n${STRUCTURED_JOB_BILLING_END}`;
  const startIdx = markdownBody.indexOf(STRUCTURED_JOB_BILLING_START);
  const endIdx = markdownBody.indexOf(STRUCTURED_JOB_BILLING_END);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    return (
      markdownBody.slice(0, startIdx) +
      block +
      markdownBody.slice(endIdx + STRUCTURED_JOB_BILLING_END.length)
    );
  }
  return `${markdownBody.trim()}\n\n${block}\n`;
}

export function buildStructuredJobProposalAppendixMarkdown(params: {
  scopeOfWorkTerms: string | null | undefined;
  immediateCheckoutUrl: string;
  laborHoldCheckoutUrl: string | null;
  immediateChargeCad: number;
  laborHoldCad: number;
}): string {
  const scopeBlock =
    params.scopeOfWorkTerms?.trim() ||
    "## Scope of work acknowledgement\n\n" + defaultStructuredBillingTermsMarkdown();

  const lines: string[] = [
    "## Formal scope of work & billing terms",
    "",
    scopeBlock.trim(),
    "",
    "### Secure checkout (CAD)",
    `- **Call-out & materials (${params.immediateChargeCad.toFixed(2)}):** [Pay now](${params.immediateCheckoutUrl})`,
  ];

  if (params.laborHoldCheckoutUrl && params.laborHoldCad > 0) {
    lines.push(
      `- **Labor authorization hold — manual capture (${params.laborHoldCad.toFixed(2)}):** [Authorize hold](${params.laborHoldCheckoutUrl})`,
    );
  }

  lines.push(
    "",
    "_Use the links above to complete deposits. If your browser blocked the redirect after payment, return here via your proposal email link._",
  );

  return lines.join("\n");
}

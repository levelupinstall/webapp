/**
 * Terms block appended to formal proposals (customer review + acceptance).
 * Not a substitute for jurisdiction-specific legal advice — customize with counsel.
 */
export function getWorkProposalTermsMarkdown(): string {
  const fullTermsUrl = process.env.NEXT_PUBLIC_LEVEL_UP_TERMS_URL?.trim();

  const linkSection = fullTermsUrl
    ? `\n\n## Complete Terms of Service\n\nBinding terms may include additional sections beyond this summary. Full document: **${fullTermsUrl}**\n`
    : `\n\n## Complete Terms of Service\n\n_A binding master Terms of Service may also apply (e.g. from your booking or call-out flow). Request the latest PDF or URL from Level Up if you need it._\n`;

  return `## Legal notice

This summary is for readability only and **does not replace** a full Terms of Service or legal review. Level Up Install recommends **consulting qualified legal counsel** to adapt contract language for your jurisdiction and business practices.

## Terms of Service (summary)

1. **Estimates & drawings** — Installer hours, timelines, and placement drawings are planning aids based on information available at proposal time. Final measurements and site conditions are verified on site; adjustments may be required.

2. **Materials & procurement** — Materials lists identify typical sources for homeowner purchase. If Level Up procures materials on your behalf, a **15% markup** applies to documented supplier costs unless otherwise stated in writing.

3. **Payment** — Payment terms follow the Stripe checkout presented after you accept this proposal. Work scheduling may depend on cleared payment per Level Up policy.

4. **Changes** — Changes to scope after acceptance may require a revised proposal or change order.

5. **Acceptance** — By accepting electronically below, you confirm you have reviewed this proposal (including the summary and any linked terms) and agree to proceed under these conditions for the described scope.
${linkSection}
`;
}

/** @deprecated Use \`getWorkProposalTermsMarkdown()\` for env-aware terms text. */
export const WORK_PROPOSAL_TERMS_MARKDOWN = getWorkProposalTermsMarkdown();

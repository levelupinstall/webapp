/**
 * Canonical CRM pipeline for structured jobs (`Job.status`).
 * Other legacy strings (e.g. PAID, APPROVED_PENDING_PAYMENT) may exist on older rows.
 */
export const STRUCTURED_JOB_PIPELINE = [
  "PENDING_REVIEW",
  "PROPOSAL_SENT",
  "CURRENT_JOB",
  "COMPLETED",
] as const;

export type StructuredJobPipelineStatus = (typeof STRUCTURED_JOB_PIPELINE)[number];

const SEND_PROPOSAL_FROM = new Set<string>(["PENDING_REVIEW"]);

/** Mirrors deposit activation: proposal path plus legacy/admin awaiting payment. */
const MOCK_PAYMENT_FROM = new Set<string>([
  "PROPOSAL_SENT",
  "PENDING_REVIEW",
  "APPROVED_PENDING_PAYMENT",
]);

const MARK_COMPLETED_FROM = new Set<string>(["CURRENT_JOB"]);

export function canSendProposalStatus(current: string): boolean {
  return SEND_PROPOSAL_FROM.has(current);
}

export function canMockPaymentSuccess(current: string): boolean {
  return MOCK_PAYMENT_FROM.has(current);
}

export function canMarkCompleted(current: string): boolean {
  return MARK_COMPLETED_FROM.has(current);
}

export function pipelineIndex(status: string): number {
  const i = STRUCTURED_JOB_PIPELINE.indexOf(status as StructuredJobPipelineStatus);
  return i >= 0 ? i : -1;
}

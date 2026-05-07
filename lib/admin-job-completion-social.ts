/** Shared job shape for generating completion celebration copy (used by CRM UI + API). */
export type JobCompletionSocialInput = {
  title: string;
  startDate: string;
  clientName: string;
  carpenterUsername: string;
  carpenterFullName: string;
};

export function buildJobCompletionCaption(
  input: JobCompletionSocialInput,
  brandName = "Our crew",
): string {
  const biz = brandName.trim() || "Our crew";
  const carpenter = input.carpenterFullName?.trim() || input.carpenterUsername;
  const firstName = input.clientName.trim().split(/\s+/)[0] || "our client";
  const date = new Date(input.startDate).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return [
    `${biz} wrapped another project: "${input.title.trim()}".`,
    `Huge thanks to ${firstName} for trusting us — finished ${date}.`,
    `Shoutout to ${carpenter} on site.`,
    "",
    "#FinishedProject #Craftsmanship #HomeProjects",
  ].join("\n");
}

/** X / Twitter intent URLs cap practical length; keep copy friendly for compose windows. */
export function truncateForTwitterIntent(text: string, maxLen = 260): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}…`;
}

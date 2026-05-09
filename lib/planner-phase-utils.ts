/** Internal Morgan phase markers — stripped before any client-visible text. */

export type PlannerPhaseTag = "consultation" | "recommend" | "refine";

/** Remove every `[PHASE:…]` marker (any casing/spacing, any suffix) from user-visible copy. */
export function stripPlannerPhaseMarkers(text: string): string {
  const noBracketTags = text.replace(/\[PHASE:\s*[^\]]+\]/gi, "");
  const lines = noBracketTags.split(/\r?\n/).filter((line) => {
    const t = line.trim();
    if (!t) return true;
    // Models sometimes echo phase as a plain line instead of a bracket tag.
    if (/^phase\s*:\s*(consultation|recommend|refine|recomend)\b/i.test(t)) {
      return false;
    }
    return true;
  });
  return lines
    .join("\n")
    .replace(/(?:\n\s*){3,}/g, "\n\n")
    .trim();
}

/**
 * Parse phase from the **last** recognized tag; strip **all** phase tags from the reply.
 * Accepts common model typos (e.g. recomend → recommend).
 */
export function extractPlannerPhase(reply: string): {
  cleanReply: string;
  phase: PlannerPhaseTag;
} {
  const trimmed = reply.trim();
  let phase: PlannerPhaseTag = "consultation";

  const tagRegex =
    /\[PHASE:\s*(consultation|recommend|refine|recomend)\s*\]/gi;
  const matches = [...trimmed.matchAll(tagRegex)];
  if (matches.length > 0) {
    const raw = matches[matches.length - 1][1].toLowerCase();
    if (raw === "recommend" || raw === "recomend") {
      phase = "recommend";
    } else if (raw === "refine") {
      phase = "refine";
    } else {
      phase = "consultation";
    }
  }

  const cleanReply = stripPlannerPhaseMarkers(trimmed);
  return { cleanReply, phase };
}

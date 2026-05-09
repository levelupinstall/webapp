/** Internal planner phase markers — stripped before any client-visible text. */

export type PlannerPhaseTag = "consultation" | "recommend" | "refine";

/** Remove every `[PHASE:…]` marker (any casing/spacing, any suffix) from user-visible copy. */
export function stripPlannerPhaseMarkers(text: string): string {
  const noPhotoPrompt = text.replace(/\[PHOTO_PROMPT\]/gi, "");
  const noBracketTags = noPhotoPrompt.replace(/\[PHASE:\s*[^\]]+\]/gi, "");
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
/** Planner asks the UI to offer camera/upload for space photos (stripped from chat display). */
export function plannerRequestedPhotoUpload(reply: string): boolean {
  return /\[PHOTO_PROMPT\]/i.test(reply);
}

export function extractPlannerPhase(reply: string): {
  cleanReply: string;
  phase: PlannerPhaseTag;
  showPhotoUploader: boolean;
} {
  const trimmed = reply.trim();
  const showPhotoUploader = plannerRequestedPhotoUpload(trimmed);
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
  return { cleanReply, phase, showPhotoUploader };
}

/** When no concept image was delivered, remove common model phrases that falsely claim one was attached. */
export function stripMisleadingImageDeliveryClaims(text: string): string {
  if (!text.trim()) return text;
  let t = text;
  const patterns = [
    /\bI'?ve\s+(just\s+)?(created|generated|attached|included|added|shown)\s+[^.!?\n]*[.!?]\s*/gi,
    /\bI\s+(also\s+)?(created|generated|attached|included)\s+(a|your|the)\s+[^.!?\n]*[.!?]\s*/gi,
    /\b(here'?s|here is)\s+(your\s+|a\s+|the\s+)?(sketch|rendering|visual|concept\s+image|image|mock-?up)[^.!?\n]*[.!?]\s*/gi,
    /\b(the\s+)?(sketch|image|visual|rendering)\s+(is\s+)?(below|attached|included|ready|for\s+you)[^.!?\n]*[.!?]\s*/gi,
  ];
  for (const re of patterns) {
    t = t.replace(re, "");
  }
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

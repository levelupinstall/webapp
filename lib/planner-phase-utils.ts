/** Internal planner phase markers — stripped before any client-visible text. */

/** Multi-wall marker: Alex labels uploaded photos, e.g. `[WALLS: back wall | left wall]`. */
export function extractWallLabels(text: string): string[] {
  const tagRegex = /\[WALLS:\s*([^\]]+)\]/gi;
  const matches = [...text.matchAll(tagRegex)];
  if (matches.length === 0) return [];
  // Last marker wins (labels may be corrected over the conversation).
  const raw = matches[matches.length - 1][1];
  return raw
    .split("|")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 60)
    .slice(0, 6);
}

const ORDINAL_INDEX: Record<string, number> = {
  first: 0,
  second: 1,
  third: 2,
  fourth: 3,
  fifth: 4,
  sixth: 5,
  "1st": 0,
  "2nd": 1,
  "3rd": 2,
  "4th": 3,
  "5th": 4,
  "6th": 5,
};

/**
 * Deterministic wall-label extraction from the homeowner's own message.
 * Handles "first photo is the kitchen wall, second photo is the bedroom wall"
 * and "photo 1 = kitchen, photo 2 = bedroom". Requires an explicit "is"/"="
 * separator per clause, so "first, I want shelves" is not misread as a label.
 * Returns labels in photo-upload order; empty unless ≥2 walls found.
 */
export function extractWallLabelsFromUserText(text: string): string[] {
  if (!text || !text.trim()) return [];
  const clauses = text
    .split(/[,.;!?\n]+|\band\b/gi)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const found: Array<{ index: number; label: string }> = [];
  for (const clause of clauses) {
    let index: number | null = null;
    const ordM = clause.match(
      /\b(first|second|third|fourth|fifth|sixth|1st|2nd|3rd|4th|5th|6th)\b/i,
    );
    if (ordM) {
      index = ORDINAL_INDEX[ordM[1].toLowerCase()];
    } else {
      const pnM = clause.match(/\bphoto\s*([1-6])\b/i);
      if (pnM) index = parseInt(pnM[1], 10) - 1;
    }
    if (index === null || index === undefined || index < 0 || index > 5) continue;
    const sepM = clause.match(/(?:\bis\b|=)\s*(.+)$/i);
    if (!sepM) continue;
    const label = sepM[1].trim().replace(/^the\s+/i, "").trim();
    if (label.length === 0 || label.length > 60) continue;
    // Guard: label shouldn't itself contain another ordinal reference.
    if (/\b(first|second|third|photo\s*[1-6])\b/i.test(label)) continue;
    found.push({ index, label });
  }
  if (found.length < 2) return [];
  found.sort((a, b) => a.index - b.index);
  const seen = new Set<number>();
  const deduped: string[] = [];
  for (const f of found) {
    if (!seen.has(f.index)) {
      seen.add(f.index);
      deduped.push(f.label);
    }
  }
  return deduped.length >= 2 ? deduped : [];
}

export type PlannerPhaseTag = "consultation" | "recommend" | "refine";

/** Remove every `[PHASE:…]` / `[WALLS:…]` marker (any casing/spacing, any suffix) from user-visible copy. */
export function stripPlannerPhaseMarkers(text: string): string {
  const noPhotoPrompt = text.replace(/\[PHOTO_PROMPT\]/gi, "");
  const noWalls = noPhotoPrompt.replace(/\[WALLS:\s*[^\]]+\]/gi, "");
  const noBracketTags = noWalls.replace(/\[PHASE:\s*[^\]]+\]/gi, "");
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
    /\bI'?ve\s+(just\s+)?(created|generated|produced|attached|included|added|shown|put\s+together)\s+[^.!?\n]*[.!?]\s*/gi,
    /\bI\s+(also\s+)?(created|generated|produced|attached|included)\s+(a|your|the)\s+[^.!?\n]*[.!?]\s*/gi,
    /\b(here'?s|here is)\s+(your\s+|a\s+|the\s+)?(sketch|rendering|visual|concept\s+image|image|picture|mock-?up)[^.!?\n]*[.!?]\s*/gi,
    /\b(the\s+)?(sketch|image|visual|rendering|picture|concept)\s+(is\s+)?(below|above|attached|included|ready|for\s+you|waiting)[^.!?\n]*[.!?]\s*/gi,
    /\b(you\s+should\s+now\s+see|you'?ll\s+see|you\s+can\s+see|for\s+you\s+to\s+see)\s+[^.!?\n]*[.!?]\s*/gi,
    /\b(take\s+a\s+look\s+at)\s+(the\s+|your\s+)?(sketch|rendering|picture|image|visual|concept)[^.!?\n]*[.!?]\s*/gi,
  ];
  for (const re of patterns) {
    t = t.replace(re, "");
  }
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

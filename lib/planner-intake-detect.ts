/**
 * Heuristics for Alex phased intake + first-render gate (project-assistant route).
 * Intent-oriented: prefers homeowner meaning over exact keywords; can use assistant
 * echoes when the homeowner confirms with short replies.
 */

import { stripPlannerPhaseMarkers } from "@/lib/planner-phase-utils";

/** Populated from homeowner messages for session display; photo UI also uses `hasEarlyPhotoInviteContext`. */
export type NorthStarSessionLabels = {
  workCategory: string | null;
  stylePreference: string | null;
};

export type SimplifiedIntakeSignal = "category" | "style" | "budget" | "dimensions";

export type SimplifiedIntakeDiagnostics = {
  ready: boolean;
  category: boolean;
  style: boolean;
  budget: boolean;
  dimensions: boolean;
  /** Signals satisfied via assistant transcript echo (user said "yes" / short reply). */
  augmentedFromAssistant: SimplifiedIntakeSignal[];
  missing: SimplifiedIntakeSignal[];
  /** One-line CRM / admin summary. */
  summary: string;
};

/**
 * Derive Phase 1 labels from all homeowner text so far (display-oriented strings).
 * Also feeds `hasEarlyPhotoInviteContext` when both labels match.
 */
export function deriveNorthStarLabelsFromUserText(userMessagesCombined: string): NorthStarSessionLabels {
  const raw = userMessagesCombined.trim();
  if (!raw) return { workCategory: null, stylePreference: null };

  let workCategory: string | null = null;
  if (/\b(tv|television|media\s+wall)\b/i.test(raw)) {
    workCategory = "TV / media wall";
  } else if (
    /\bclosets?\b|walk[\s-]?in|wardrobe|reach[\s-]?in|coat\s+closet|linen\s+closet/i.test(raw)
  ) {
    workCategory = "Closet";
  } else if (/\btrim\b|crown|baseboard|casing|wainscot/i.test(raw)) {
    workCategory = "Trim / millwork";
  } else if (
    /\bshelv(?:e|es|ing)|shelfs?\b|bookcases?\b|built[\s-]?ins?\b|built\s+in|cabinet\s+run|storage\s+wall|mudroom|pantry|mantel|ledge|\bmirror\b|floating\s+shelf|wall\s+unit/i.test(
      raw,
    )
  ) {
    workCategory = "Shelving / built-ins";
  }

  let stylePreference: string | null = null;
  if (/\bscandi(navian)?\b/i.test(raw)) {
    stylePreference = "Scandinavian";
  } else if (/\bikea\b/i.test(raw)) {
    stylePreference = "IKEA-inspired";
  } else if (/\bmodern\b/i.test(raw) && /\bminimal(?:ist)?\b/i.test(raw)) {
    stylePreference = "Modern minimalist";
  } else if (/\bmodern\b/i.test(raw)) {
    stylePreference = "Modern";
  } else if (/\bminimal(?:ist)?\b/i.test(raw)) {
    stylePreference = "Minimalist";
  } else if (/\btraditional\b/i.test(raw) && /\bwarm\b/i.test(raw)) {
    stylePreference = "Traditional warm";
  } else if (/\btraditional\b/i.test(raw)) {
    stylePreference = "Traditional";
  } else if (/\bwarm\b/i.test(raw)) {
    stylePreference = "Warm";
  } else if (/\bfarmhouse\b/i.test(raw)) {
    stylePreference = "Farmhouse";
  } else if (/\btransitional\b/i.test(raw)) {
    stylePreference = "Transitional";
  } else if (/\bindustrial\b/i.test(raw)) {
    stylePreference = "Industrial";
  } else if (/\bclassic\b/i.test(raw)) {
    stylePreference = "Classic";
  } else if (/\brustic\b/i.test(raw)) {
    stylePreference = "Rustic";
  } else if (/\bcoastal\b/i.test(raw)) {
    stylePreference = "Coastal";
  } else if (/\bcontemporary\b/i.test(raw)) {
    stylePreference = "Contemporary";
  } else if (/\b(simple|clean|sleek|plain|uncluttered)\b/i.test(raw)) {
    stylePreference = "Simple / clean";
  }

  return { workCategory, stylePreference };
}

export function deriveNorthStarSessionFromUserMessages(
  messages: Array<{ role: string; content: string }>,
): NorthStarSessionLabels {
  const blob = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content.trim())
    .filter(Boolean)
    .join("\n");
  return deriveNorthStarLabelsFromUserText(blob);
}

/** Category — explicit types + common homeowner phrasing. */
const NORTH_STAR_CATEGORY_PATTERN =
  /\b(tv|television|mount|media\s+wall|shelv(?:e|es|ing)|shelfs?|floating\s+shelf|built[\s-]?ins?\b|built\s+in|bookcase|closet|trim|crown|baseboard|casing|wainscot|mudroom|pantry|mantel|ledge|mirror\b|cabinet\s+run|storage\s+wall|wall\s+unit|organize|organizing)\b/i;

/** Style / vibe — includes informal words homeowners use. */
const NORTH_STAR_STYLE_PATTERN =
  /\b(modern|minimal|minimalist|traditional|warm|ikea|scandi|scandinavian|contemporary|farmhouse|transitional|industrial|classic|rustic|coastal|simple|clean|sleek|plain|uncluttered|floating)\b/i;

/** Project intent without a trade keyword (e.g. "add 3 shelves onto this wall"). */
const CATEGORY_INTENT_PATTERN =
  /\b(add|install|build|put|want|need)\b.{0,40}\b(shelf|shelves|shelving|shelfs?|built|closet|cabinet|trim|tv|mount|organiz)/i;

/**
 * Enough category + style signal to invite space photos (`[PHOTO_PROMPT]` + upload UI).
 * Looser than full Phase 1 north star (no use-case requirement); **does not** affect when the first concept image may render.
 */
export function hasEarlyPhotoInviteContext(allUserText: string): boolean {
  const { workCategory, stylePreference } = deriveNorthStarLabelsFromUserText(allUserText);
  if (workCategory && stylePreference) return true;
  const t = allUserText.toLowerCase();
  if (t.length < 40) return false;
  return (
    (NORTH_STAR_CATEGORY_PATTERN.test(allUserText) || CATEGORY_INTENT_PATTERN.test(allUserText)) &&
    NORTH_STAR_STYLE_PATTERN.test(allUserText)
  );
}

function joinUserMessages(messages: Array<{ role: string; content: string }>): string {
  return messages
    .filter((m) => m.role === "user")
    .map((m) => m.content.trim())
    .filter(Boolean)
    .join("\n");
}

/** Assistant lines that likely restate homeowner measurements / budget (for short "yes" replies). */
function extractAssistantIntakeEcho(messages: Array<{ role: string; content: string }>): string {
  const lines: string[] = [];
  for (const m of messages) {
    if (m.role !== "assistant") continue;
    const body = stripPlannerPhaseMarkers(m.content);
    for (const line of body.split(/\n/)) {
      const t = line.trim();
      if (t.length < 12 || t.length > 400) continue;
      if (!/\d/.test(t)) continue;
      if (
        /\b(inch|inches|ft|feet|'|"|wide|width|deep|depth|tall|high|spacing|below|budget|\$|dollar|shelf|shelves)\b/i.test(
          t,
        )
      ) {
        lines.push(t);
      }
    }
  }
  return lines.slice(-10).join("\n");
}

function isShortAffirmativeUserReply(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (t.length > 80) return false;
  return /^(yes|yeah|yep|yup|sure|ok|okay|correct|right|sounds good|looks good|that'?s right|perfect|go ahead|please do|do it|let'?s do it|i like|love it)/i.test(
    t,
  );
}

/** Budget signal — amounts and intent words, not only the word "budget". */
export function hasBudgetContextInText(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /\$+\s*\d/.test(text) ||
    /\b\d[\d,]*\s*(?:k|grand)\b/i.test(text) ||
    /\b\d+\s*k\b/i.test(text) ||
    /\b\d[\d,]*\s*dollars?\b/i.test(text) ||
    /\b\d[\d,]*\s*bucks?\b/i.test(text) ||
    /\b(under|around|about|approximately|roughly|up to|max|~)\s*\$?\s*\d/i.test(text) ||
    /\b(mid[\s-]?range|low[\s-]?end|high[\s-]?end|economy|premium|tight|flexible)\b/i.test(t) ||
    /\b(thousand|hundred)\s+(?:dollar|buck)/i.test(t) ||
    /\b(cost|price|afford|spend|investment|budget)\b/i.test(t)
  );
}

function hasCategorySignal(text: string): boolean {
  const { workCategory } = deriveNorthStarLabelsFromUserText(text);
  return (
    Boolean(workCategory) ||
    NORTH_STAR_CATEGORY_PATTERN.test(text) ||
    CATEGORY_INTENT_PATTERN.test(text)
  );
}

function hasStyleSignal(text: string): boolean {
  const { stylePreference } = deriveNorthStarLabelsFromUserText(text);
  return Boolean(stylePreference) || NORTH_STAR_STYLE_PATTERN.test(text);
}

/** Phase 2 — rough dimensions (flexible units and phrasing). */
export function hasRoughDimensions(allUserTextLower: string): boolean {
  const t = allUserTextLower;
  const numericSignal =
    /\d/.test(t) &&
    (/\b\d{1,3}\s*(?:×|\*|x|by)\s*\d{1,3}\b/i.test(t) ||
      /\b\d{1,3}\s*(?:'|′|ft|feet)\b/i.test(t) ||
      /\b\d{1,3}\s*(?:\"|''|in(?:ch(?:es)?)?)\b/i.test(t) ||
      /\b\d{1,3}\s*(?:inch|inches)\b/i.test(t));
  const wordSignal =
    /\b(width|wide|w\b|height|tall|high|depth|deep|long|length|span|run|opening|niche|alcove|spacing|between)\b/i.test(
      t,
    ) && /\d/.test(t);
  const shelfLayoutSignal =
    /\b\d+\s*shelf/i.test(t) &&
    (/\b(inch|inches|ft|feet|'|"|wide|deep|spacing|below|under)\b/i.test(t) ||
      /\b\d{1,3}\s*(?:×|\*|x|by)\b/i.test(t));
  return numericSignal || wordSignal || shelfLayoutSignal;
}

function signalWithAugment(params: {
  userText: string;
  augmentedText: string;
  check: (text: string) => boolean;
  allowAugment: boolean;
}): { ok: boolean; augmented: boolean } {
  if (params.check(params.userText)) return { ok: true, augmented: false };
  if (params.allowAugment && params.check(params.augmentedText)) {
    return { ok: true, augmented: true };
  }
  return { ok: false, augmented: false };
}

/**
 * Evaluate first-render intake with per-signal diagnostics for CRM.
 * Uses homeowner messages first; may count assistant measurement echoes when the
 * homeowner gave a short confirmation.
 */
export function evaluateSimplifiedIntakeReadiness(
  messages: Array<{ role: string; content: string }>,
): SimplifiedIntakeDiagnostics {
  const userText = joinUserMessages(messages);
  const userLower = userText.toLowerCase();
  const assistantEcho = extractAssistantIntakeEcho(messages);
  const augmentedText = [userText, assistantEcho].filter(Boolean).join("\n");
  const augmentedLower = augmentedText.toLowerCase();

  const lastUser =
    [...messages].reverse().find((m) => m.role === "user")?.content?.trim() ?? "";
  /** Style can be inferred from Alex recap when the homeowner uses informal words in a short reply. */
  const allowStyleAugment =
    isShortAffirmativeUserReply(lastUser) || !hasStyleSignal(userText);
  /** Budget/dimensions often appear only in Alex’s confirmation recap — use assistant echo when missing from user text. */
  const allowMeasureAugment = !hasBudgetContextInText(userText) || !hasRoughDimensions(userLower);

  const categoryResult = signalWithAugment({
    userText,
    augmentedText,
    check: hasCategorySignal,
    allowAugment: false,
  });
  const styleResult = signalWithAugment({
    userText,
    augmentedText,
    check: hasStyleSignal,
    allowAugment: allowStyleAugment,
  });
  const budgetResult = signalWithAugment({
    userText,
    augmentedText,
    check: hasBudgetContextInText,
    allowAugment: allowMeasureAugment || isShortAffirmativeUserReply(lastUser),
  });
  const dimensionsResult = signalWithAugment({
    userText: userLower,
    augmentedText: augmentedLower,
    check: hasRoughDimensions,
    allowAugment: allowMeasureAugment || isShortAffirmativeUserReply(lastUser),
  });

  const augmentedFromAssistant: SimplifiedIntakeSignal[] = [];
  if (styleResult.augmented) augmentedFromAssistant.push("style");
  if (budgetResult.augmented) augmentedFromAssistant.push("budget");
  if (dimensionsResult.augmented) augmentedFromAssistant.push("dimensions");

  const missing: SimplifiedIntakeSignal[] = [];
  if (!categoryResult.ok) missing.push("category");
  if (!styleResult.ok) missing.push("style");
  if (!budgetResult.ok) missing.push("budget");
  if (!dimensionsResult.ok) missing.push("dimensions");

  const ready = missing.length === 0;
  const summary = ready
    ? `intake ready (category, style, budget, dimensions)${augmentedFromAssistant.length ? `; augmented: ${augmentedFromAssistant.join("+")}` : ""}`
    : `intake incomplete — missing: ${missing.join(", ")}${augmentedFromAssistant.length ? `; partial via assistant echo: ${augmentedFromAssistant.join("+")}` : ""}`;

  return {
    ready,
    category: categoryResult.ok,
    style: styleResult.ok,
    budget: budgetResult.ok,
    dimensions: dimensionsResult.ok,
    augmentedFromAssistant,
    missing,
    summary,
  };
}

/**
 * Simplified intake for first concept render: category + style + budget + rough dimensions.
 */
export function hasSimplifiedIntakeReady(
  allUserTextOrMessages: string | Array<{ role: string; content: string }>,
): boolean {
  if (typeof allUserTextOrMessages === "string") {
    return evaluateSimplifiedIntakeReadiness([{ role: "user", content: allUserTextOrMessages }])
      .ready;
  }
  return evaluateSimplifiedIntakeReadiness(allUserTextOrMessages).ready;
}

/** Phase 1 — category + style + use case signals before relying on dimensions. */
export function hasNorthStarContext(allUserTextLower: string): boolean {
  const t = allUserTextLower;
  const hasCategory =
    NORTH_STAR_CATEGORY_PATTERN.test(t) || CATEGORY_INTENT_PATTERN.test(t);
  const hasStyle = NORTH_STAR_STYLE_PATTERN.test(t);
  const hasUseCase =
    /\b(storage|display|hide|cables|wires|books|heavy|focal|organize|wrap|conceal|seasonal|shoes|coats|linen)/i.test(
      t,
    ) ||
    /\bneed(s)?\s+(to|for)\s+/i.test(t) ||
    /\b(use|using)\s+(this|it|the\s+space)\s+for\b/i.test(t);

  return hasCategory && hasStyle && hasUseCase && t.length >= 72;
}

export function assistantAskedFirstDesignGate(messages: Array<{ role: string; content: string }>): boolean {
  return messages.some((m) => {
    if (m.role !== "assistant") return false;
    const c = m.content.toLowerCase();
    return (
      /anything else.*before (creating|i create).*(first rendering|first design idea)/i.test(c) ||
      /before i create the first design idea/i.test(c) ||
      /before\s+(we|i)\s+create\s+the\s+first\s+design\s+idea/i.test(c) ||
      /is there anything else to consider before i create/i.test(c) ||
      /anything else i should consider.*before creating our first rendering/i.test(c)
    );
  });
}

/** True after Alex asked for an explicit go-ahead to lock layout / run structural blueprint + first sketch. */
export function assistantAskedLayoutGoAheadPrompt(
  messages: Array<{ role: string; content: string }>,
): boolean {
  return messages.some((m) => {
    if (m.role !== "assistant") return false;
    const c = m.content.toLowerCase();
    return (
      (/\bgo ahead\b/i.test(c) || /\bproceed\b/i.test(c)) &&
      /\b(lock|layout|structural|blueprint|line drawing|first concept|first design|sketch|generate)\b/i.test(
        c,
      )
    );
  });
}

/** Human-readable skip reason for CRM when first render is blocked on intake. */
export function formatIntakeBlockedRenderReason(diag: SimplifiedIntakeDiagnostics): string {
  if (diag.ready) return "Intake marked ready but render was still blocked (check photos or other gates).";
  const parts = diag.missing.map((m) => {
    switch (m) {
      case "category":
        return "project type (e.g. shelves, closet, trim — what you are building)";
      case "style":
        return "style vibe (e.g. modern, simple, traditional)";
      case "budget":
        return "budget signal (e.g. $500, mid-range, or “budget” in your words)";
      case "dimensions":
        return "rough dimensions (width/depth/spacing or inches/feet)";
      default:
        return m;
    }
  });
  let msg = `First render blocked — still need: ${parts.join("; ")}.`;
  if (diag.augmentedFromAssistant.length > 0) {
    msg += ` (Partial context was inferred from Alex’s recap: ${diag.augmentedFromAssistant.join(", ")}.)`;
  }
  return msg;
}

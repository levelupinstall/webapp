/**
 * Heuristics for Alex phased intake + first-render gate (project-assistant route).
 * North-star signals precede strict spatial / budget gates per methodology docs.
 */

/** Populated from homeowner messages for session display; photo UI also uses `hasEarlyPhotoInviteContext`. */
export type NorthStarSessionLabels = {
  workCategory: string | null;
  stylePreference: string | null;
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
    /\bshelves\b|\bshelf\b|shelving|bookcases?\b|built[\s-]?ins?\b|built\s+in|cabinet\s+run|storage\s+wall|mudroom|pantry|mantel|ledge|\bmirror\b/i.test(
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

/** Category keyword coverage aligned with Phase 1 / first-render north-star checks. */
const NORTH_STAR_CATEGORY_PATTERN =
  /\b(tv|television|mount|media\s+wall|shelving|shelf|shelves|built[\s-]?ins?\b|built\s+in|bookcase|closet|trim|crown|baseboard|casing|wainscot|mudroom|pantry|mantel|ledge|mirror\b|cabinet\s+run|storage\s+wall)/i;

/** Style / vibe keywords — subset for heuristic gates (see deriveNorthStarLabelsFromUserText for display labels). */
const NORTH_STAR_STYLE_PATTERN =
  /\b(modern|minimal|minimalist|traditional|warm|ikea|scandi|scandinavian|contemporary|farmhouse|transitional|industrial|classic|rustic|coastal)/i;

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
    NORTH_STAR_CATEGORY_PATTERN.test(allUserText) &&
    NORTH_STAR_STYLE_PATTERN.test(allUserText)
  );
}

/** Phase 1 — category + style + use case signals before relying on dimensions. */
export function hasNorthStarContext(allUserTextLower: string): boolean {
  const t = allUserTextLower;
  const hasCategory = NORTH_STAR_CATEGORY_PATTERN.test(t);
  const hasStyle = NORTH_STAR_STYLE_PATTERN.test(t);
  const hasUseCase =
    /\b(storage|display|hide|cables|wires|books|heavy|focal|organize|wrap|conceal|seasonal|shoes|coats|linen)/i.test(
      t,
    ) ||
    /\bneed(s)?\s+(to|for)\s+/i.test(t) ||
    /\b(use|using)\s+(this|it|the\s+space)\s+for\b/i.test(t);

  return hasCategory && hasStyle && hasUseCase && t.length >= 72;
}

/** Phase 2 — rough dimensions stated (not requiring exact inches). */
export function hasRoughDimensions(allUserTextLower: string): boolean {
  const t = allUserTextLower;
  const numericSignal =
    /\d/.test(t) &&
    (/\b\d{1,3}\s*(?:×|\*|x|by)\s*\d{1,3}\b/i.test(t) ||
      /\b\d{1,3}\s*(?:'|′|ft|feet)\b/i.test(t) ||
      /\b\d{1,3}\s*(?:\"|''|in(?:ch(?:es)?)?)\b/i.test(t));
  const wordSignal =
    /\b(width|wide|w\b|height|tall|high|depth|deep|span|run|opening|niche|alcove)\b/i.test(t) &&
    /\d/.test(t);
  return numericSignal || wordSignal;
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

/** Minimum length for skills + tools narrative on signup / profile updates */
export const CARPENTER_PROFILE_DETAIL_MIN_CHARS = 20;

/** Validates emergency contact + narrative skill/tool sections for onboarding or profile saves */
export function validateCarpenterEmergencyAndSkills(params: {
  emergencyContactName: string;
  emergencyContactRelationship: string;
  emergencyContactPhone: string;
  skillsSummary: string;
  toolsInventory: string;
}): string | null {
  const eName = params.emergencyContactName.trim();
  const eRel = params.emergencyContactRelationship.trim();
  const ePhone = params.emergencyContactPhone.trim();
  const skills = params.skillsSummary.trim();
  const tools = params.toolsInventory.trim();
  const min = CARPENTER_PROFILE_DETAIL_MIN_CHARS;

  if (!eName) return "Emergency contact name is required.";
  if (!eRel) return "Emergency contact relationship is required (for example spouse, partner, sibling).";
  if (!ePhone) return "Emergency contact phone is required.";
  if (skills.length < min) {
    return `Skills section must be at least ${min} characters — describe trades you handle (trim, built-ins, cabinetry, finishing).`;
  }
  if (tools.length < min) {
    return `Tools section must be at least ${min} characters — list major tools or kits you bring (track saw, compressor, nailers).`;
  }
  return null;
}

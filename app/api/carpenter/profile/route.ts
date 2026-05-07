import { NextResponse } from "next/server";
import { getCarpenterSession } from "@/lib/carpenter-auth";
import { updateCarpenterProfile } from "@/lib/carpenter-store";
import { validateCarpenterEmergencyAndSkills } from "@/lib/carpenter-profile-rules";

export async function POST(request: Request) {
  const session = await getCarpenterSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    fullName?: string;
    phone?: string;
    profilePictureDataUrl?: string;
    emergencyContactName?: string;
    emergencyContactRelationship?: string;
    emergencyContactPhone?: string;
    emergencyContactAlternatePhone?: string;
    skillsSummary?: string;
    toolsInventory?: string;
  };

  const fullName = body.fullName?.trim() || "";
  const phone = body.phone?.trim() || "";
  const emergencyContactName = body.emergencyContactName?.trim() || "";
  const emergencyContactRelationship = body.emergencyContactRelationship?.trim() || "";
  const emergencyContactPhone = body.emergencyContactPhone?.trim() || "";
  const emergencyContactAlternatePhone =
    body.emergencyContactAlternatePhone?.trim() || "";
  const skillsSummary = body.skillsSummary?.trim() || "";
  const toolsInventory = body.toolsInventory?.trim() || "";

  if (!fullName) {
    return NextResponse.json({ error: "Full name is required." }, { status: 400 });
  }
  if (!phone) {
    return NextResponse.json({ error: "Your mobile/work phone is required." }, { status: 400 });
  }

  const profileErr = validateCarpenterEmergencyAndSkills({
    emergencyContactName,
    emergencyContactRelationship,
    emergencyContactPhone,
    skillsSummary,
    toolsInventory,
  });
  if (profileErr) {
    return NextResponse.json({ error: profileErr }, { status: 400 });
  }

  const user = await updateCarpenterProfile(session.carpenterId, {
    fullName,
    phone,
    profilePictureDataUrl: body.profilePictureDataUrl || "",
    emergencyContactName,
    emergencyContactRelationship,
    emergencyContactPhone,
    emergencyContactAlternatePhone,
    skillsSummary,
    toolsInventory,
  });
  return NextResponse.json({ user });
}


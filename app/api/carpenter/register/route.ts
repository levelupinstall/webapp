import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createCarpenterUser } from "@/lib/carpenter-store";
import { validateCarpenterEmergencyAndSkills } from "@/lib/carpenter-profile-rules";
import { setCarpenterSession } from "@/lib/carpenter-auth";
import { captureSignupLocationFromRequest } from "@/lib/signup-location-log";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      username?: string;
      password?: string;
      fullName?: string;
      email?: string;
      phone?: string;
      hasLiabilityInsurance?: boolean;
      liabilityInsuranceDetails?: string;
      hasWsib?: boolean;
      wsibDetails?: string;
      profilePictureDataUrl?: string;
      emergencyContactName?: string;
      emergencyContactRelationship?: string;
      emergencyContactPhone?: string;
      emergencyContactAlternatePhone?: string;
      skillsSummary?: string;
      toolsInventory?: string;
    };

    const username = body.username?.trim() || "";
    const password = body.password || "";
    const fullName = body.fullName?.trim() || "";
    const email = body.email?.trim() || "";
    const phone = body.phone?.trim() || "";
    const hasLiabilityInsurance = Boolean(body.hasLiabilityInsurance);
    const liabilityInsuranceDetails =
      body.liabilityInsuranceDetails?.trim() || "";
    const hasWsib = Boolean(body.hasWsib);
    const wsibDetails = body.wsibDetails?.trim() || "";
    const emergencyContactName = body.emergencyContactName?.trim() || "";
    const emergencyContactRelationship = body.emergencyContactRelationship?.trim() || "";
    const emergencyContactPhone = body.emergencyContactPhone?.trim() || "";
    const emergencyContactAlternatePhone =
      body.emergencyContactAlternatePhone?.trim() || "";
    const skillsSummary = body.skillsSummary?.trim() || "";
    const toolsInventory = body.toolsInventory?.trim() || "";

    if (!username || !password || !fullName || !email || !phone) {
      return NextResponse.json(
        {
          error:
            "Username, password, full name, email, and phone number are required.",
        },
        { status: 400 },
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 },
      );
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 },
      );
    }
    if (hasLiabilityInsurance && !liabilityInsuranceDetails) {
      return NextResponse.json(
        {
          error:
            "Please enter your liability insurance details (insurer, policy number, expiry).",
        },
        { status: 400 },
      );
    }
    if (hasWsib && !wsibDetails) {
      return NextResponse.json(
        {
          error:
            "Please enter your WSIB details (account number, clearance certificate info).",
        },
        { status: 400 },
      );
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

    const passwordHash = await bcrypt.hash(password, 10);
    const signupLocationLog = captureSignupLocationFromRequest(request);
    const user = await createCarpenterUser({
      username,
      passwordHash,
      fullName,
      email,
      phone,
      emergencyContactName,
      emergencyContactRelationship,
      emergencyContactPhone,
      emergencyContactAlternatePhone,
      skillsSummary,
      toolsInventory,
      hasLiabilityInsurance,
      liabilityInsuranceDetails,
      hasWsib,
      wsibDetails,
      profilePictureDataUrl: body.profilePictureDataUrl || "",
      signupLocationLog,
    });
    await setCarpenterSession({ carpenterId: user.id, username: user.username });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not register." },
      { status: 400 },
    );
  }
}


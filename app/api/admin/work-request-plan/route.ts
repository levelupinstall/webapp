import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { getWorkRequestById, updateWorkRequestJobPlan, type WorkRequestJobPlan } from "@/lib/work-requests-store";

type OpenAIResponse = {
  output_text?: string;
};

function fallbackPlan(scopeText: string): WorkRequestJobPlan {
  const lines = scopeText.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const hint = lines[0]?.slice(0, 120) || "General finish carpentry visit";

  return {
    materials: [
      `Stock lumber / sheet goods sized after site measure (${hint})`,
      "Wood filler, sandpaper assortment, painter's tape",
      "Construction adhesive and wood screws suitable for substrate",
      "Finish materials (primer/paint/stain/clear coat) per approved samples",
      "Hardware (hinges, drawer slides, pulls) if scope includes cabinetry",
    ],
    tools: [
      "Tape measure, combination square, chalk line",
      "Circular saw / track saw or mitre saw",
      "Router + straight/pattern bits for trim and dados",
      "Drill/driver + impact, assorted drill bits and drivers",
      "Levels (4 ft + torpedo), clamps, pry bars",
      "Nail gun + compressor (if permitted on site) or trim nails + hammer",
      "Dust collection / HEPA vac for occupied homes",
    ],
    crewSize: 2,
    notes:
      "This is a baseline checklist only. Confirm quantities, species, and finishes on-site. Adjust crew if heavy panels or lift assists are required.",
    generatedAt: new Date().toISOString(),
  };
}

async function generatePlanWithOpenAI(payload: {
  titleLine: string;
  address: string;
  preferredDate: string;
  details: string;
}): Promise<WorkRequestJobPlan | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const system = `You are operations planning for Level Up Install (finish carpentry). Given a paid booking / work request, output ONLY valid JSON with this exact shape (no markdown):
{"materials":["string", ...],"tools":["string", ...],"crewSize":number,"notes":"string"}
Rules:
- materials: specific consumables and rough lumber categories likely needed (not pricing).
- tools: portable jobsite tools a crew would bring (no shop-only industrial unless justified).
- crewSize: integer >= 1 and <= 6; use 2 for typical built-ins; 3+ for large installs or heavy panels.
- notes: 2-4 sentences on assumptions and site verification items.
English only. Be practical for residential Toronto-area work.`;

  const user = `Work request summary:
${payload.titleLine}
Project address: ${payload.address}
Preferred date: ${payload.preferredDate}

Details:
${payload.details}`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: [{ type: "input_text", text: system }] },
        { role: "user", content: [{ type: "input_text", text: user }] },
      ],
    }),
  });

  if (!response.ok) return null;

  const data = (await response.json()) as OpenAIResponse;
  const raw = data.output_text?.trim();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as {
      materials?: unknown;
      tools?: unknown;
      crewSize?: unknown;
      notes?: unknown;
    };
    const materials = Array.isArray(parsed.materials)
      ? parsed.materials.map((s) => String(s).trim()).filter(Boolean)
      : [];
    const tools = Array.isArray(parsed.tools)
      ? parsed.tools.map((s) => String(s).trim()).filter(Boolean)
      : [];
    const crew =
      typeof parsed.crewSize === "number" && Number.isFinite(parsed.crewSize)
        ? Math.min(6, Math.max(1, Math.round(parsed.crewSize)))
        : 2;
    const notes = typeof parsed.notes === "string" ? parsed.notes.trim() : "";

    if (materials.length === 0 || tools.length === 0) return null;

    return {
      materials,
      tools,
      crewSize: crew,
      notes: notes || "Confirm scope and materials on-site.",
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { workRequestId?: string };
  try {
    body = (await request.json()) as { workRequestId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const id = String(body.workRequestId ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "workRequestId is required." }, { status: 400 });
  }

  const wr = await getWorkRequestById(id);
  if (!wr) {
    return NextResponse.json({ error: "Work request not found." }, { status: 404 });
  }

  const scopeBlob = [
    `Client: ${wr.fullName}`,
    `Project: ${wr.projectDetails}`,
    `Address: ${wr.projectAddress}`,
    `Preferred date: ${wr.preferredDate}`,
  ].join("\n");

  let plan =
    (await generatePlanWithOpenAI({
      titleLine: `Booking call-out — ${wr.fullName} (${wr.email})`,
      address: wr.projectAddress,
      preferredDate: wr.preferredDate,
      details: wr.projectDetails || "Details not provided.",
    })) ?? fallbackPlan(scopeBlob);

  plan = { ...plan, generatedAt: new Date().toISOString() };

  const updated = await updateWorkRequestJobPlan(wr.id, plan);
  return NextResponse.json({ workRequest: updated });
}

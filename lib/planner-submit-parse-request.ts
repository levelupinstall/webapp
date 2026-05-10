import { Buffer } from "node:buffer";

export const PLANNER_SUBMIT_MAX_TRANSCRIPT = 48_000;
export const PLANNER_SUBMIT_MAX_RENDERINGS = 6;
export const PLANNER_SUBMIT_MAX_SPACE_PHOTOS = 6;
export const PLANNER_SUBMIT_MAX_B64_PER_IMAGE = 750_000;

export type PlannerSubmitRawRendering = { mimeType?: string; dataBase64?: string };

export type PlannerSubmitParsedMultipart = {
  transcript: string;
  renderingParts: Array<{ inline_data: { mime_type: string; data: string } }>;
  spacePhotoParts: Array<{ inline_data: { mime_type: string; data: string } }>;
};

async function fileToInlinePart(
  file: File,
): Promise<{ inline_data: { mime_type: string; data: string } } | null> {
  const buf = Buffer.from(await file.arrayBuffer());
  const b64 = buf.toString("base64");
  if (!b64 || b64.length > PLANNER_SUBMIT_MAX_B64_PER_IMAGE) return null;
  const mime = (file.type || "image/jpeg").trim() || "image/jpeg";
  return { inline_data: { mime_type: mime, data: b64 } };
}

export async function parsePlannerSubmitMultipart(
  request: Request,
): Promise<
  | { ok: true; data: PlannerSubmitParsedMultipart }
  | { ok: false; status: number; error: string }
> {
  const contentType = request.headers.get("content-type") || "";

  let transcript = "";
  let rawRenderings: PlannerSubmitRawRendering[] = [];
  const spacePhotoParts: Array<{ inline_data: { mime_type: string; data: string } }> = [];

  if (contentType.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return { ok: false, status: 400, error: "Invalid form data." };
    }

    transcript = String(form.get("transcript") ?? "").slice(0, PLANNER_SUBMIT_MAX_TRANSCRIPT);
    const rendJson = String(form.get("renderings") ?? "").trim();
    try {
      const parsed = rendJson ? (JSON.parse(rendJson) as unknown) : [];
      rawRenderings = Array.isArray(parsed) ? (parsed as PlannerSubmitRawRendering[]) : [];
    } catch {
      rawRenderings = [];
    }

    const files = form
      .getAll("spacePhotos")
      .filter((x): x is File => typeof File !== "undefined" && x instanceof File);
    for (const file of files) {
      if (spacePhotoParts.length >= PLANNER_SUBMIT_MAX_SPACE_PHOTOS) break;
      const part = await fileToInlinePart(file);
      if (part) spacePhotoParts.push(part);
    }
  } else {
    let body: {
      transcript?: string;
      renderings?: PlannerSubmitRawRendering[];
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return { ok: false, status: 400, error: "Invalid JSON." };
    }
    transcript = String(body.transcript ?? "").slice(0, PLANNER_SUBMIT_MAX_TRANSCRIPT);
    rawRenderings = Array.isArray(body.renderings) ? body.renderings : [];
  }

  if (!transcript.trim()) {
    return { ok: false, status: 400, error: "Transcript is required." };
  }

  const renderingParts: Array<{ inline_data: { mime_type: string; data: string } }> = [];

  for (
    let i = 0;
    i < rawRenderings.length && renderingParts.length < PLANNER_SUBMIT_MAX_RENDERINGS;
    i++
  ) {
    const row = rawRenderings[i];
    const b64 = String(row?.dataBase64 ?? "").replace(/\s/g, "");
    if (!b64) continue;
    if (b64.length > PLANNER_SUBMIT_MAX_B64_PER_IMAGE) {
      return {
        ok: false,
        status: 400,
        error: `Rendering ${i + 1} is too large. Try fewer or smaller images.`,
      };
    }
    const mime = String(row?.mimeType ?? "image/jpeg").trim() || "image/jpeg";
    renderingParts.push({
      inline_data: { mime_type: mime, data: b64 },
    });
  }

  return {
    ok: true,
    data: {
      transcript,
      renderingParts,
      spacePhotoParts,
    },
  };
}

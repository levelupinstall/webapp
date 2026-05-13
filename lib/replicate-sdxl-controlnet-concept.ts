/**
 * Optional concept render via Replicate — SDXL img2img + ControlNet (fofr/sdxl-multi-controlnet-lora).
 * Room photo = init image (style / perspective). Blueprint PNG = controlnet_1_image (layout geometry).
 *
 * Env:
 * - REPLICATE_API_TOKEN (required)
 * - REPLICATE_SDXL_MULTICN_VERSION (default: pinned fofr/sdxl-multi-controlnet-lora latest)
 * - REPLICATE_CONTROLNET_1 (default: lineart — good for schematic linework; try edge_canny if needed)
 * - REPLICATE_PROMPT_STRENGTH (default 0.42 — conservative to preserve room)
 * - REPLICATE_CN1_CONDITIONING_SCALE (default 0.92)
 * - REPLICATE_NUM_INFERENCE_STEPS (default 28)
 * - REPLICATE_APPLY_WATERMARK (default false)
 * - REPLICATE_DISABLE_SAFETY_CHECKER (default true — home interiors often false-positive)
 */

const REPLICATE_API = "https://api.replicate.com/v1";

const DEFAULT_VERSION =
  "89eb212b3d1366a83e949c12a4b45dfe6b6b313b594cb8268e864931ac9ffb16";

function envTrim(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v && v.length > 0 ? v : undefined;
}

function dataUriFromBuffer(mime: string, buf: Buffer): string {
  const m = mime || "image/png";
  return `data:${m};base64,${buf.toString("base64")}`;
}

type ReplicatePrediction = {
  id: string;
  status: string;
  error?: string;
  output?: unknown;
};

function parsePrediction(json: unknown): ReplicatePrediction {
  const o = json as Record<string, unknown>;
  return {
    id: String(o.id ?? ""),
    status: String(o.status ?? ""),
    error: typeof o.error === "string" ? o.error : undefined,
    output: o.output,
  };
}

async function createPrediction(
  token: string,
  version: string,
  input: Record<string, unknown>,
): Promise<ReplicatePrediction> {
  const res = await fetch(`${REPLICATE_API}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Token ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ version, input }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail =
      typeof (json as { detail?: string }).detail === "string"
        ? (json as { detail: string }).detail
        : JSON.stringify(json).slice(0, 500);
    throw new Error(`Replicate create failed (${res.status}): ${detail}`);
  }
  return parsePrediction(json);
}

async function getPrediction(token: string, id: string): Promise<ReplicatePrediction> {
  const res = await fetch(`${REPLICATE_API}/predictions/${id}`, {
    headers: { Authorization: `Token ${token}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Replicate get failed (${res.status})`);
  }
  return parsePrediction(json);
}

async function fetchUrlAsBase64(url: string): Promise<{ mimeType: string; dataBase64: string }> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch output image (${res.status})`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const ct = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
  return { mimeType: ct, dataBase64: buf.toString("base64") };
}

function coerceOutputUrls(output: unknown): string[] {
  if (typeof output === "string") return [output];
  if (Array.isArray(output)) {
    return output.filter((x): x is string => typeof x === "string" && x.startsWith("http"));
  }
  return [];
}

export type ReplicateConceptParams = {
  roomImage: { mimeType: string; buffer: Buffer };
  blueprintPng: Buffer;
  positivePrompt: string;
  negativePrompt: string;
};

export type ReplicateConceptResult =
  | { ok: true; images: Array<{ mimeType: string; dataBase64: string }> }
  | { ok: false; error: string };

export function replicateConceptConfigured(): boolean {
  return Boolean(envTrim("REPLICATE_API_TOKEN"));
}

export function replicateConceptProviderEnabled(): boolean {
  const p = envTrim("CONCEPT_IMAGE_PROVIDER")?.toLowerCase();
  return p === "replicate" || p === "replicate_then_gemini";
}

/**
 * Single prediction: one output image by default (num_outputs=1).
 */
export async function runReplicateSdxlControlNetConcept(
  params: ReplicateConceptParams,
): Promise<ReplicateConceptResult> {
  const token = envTrim("REPLICATE_API_TOKEN");
  if (!token) {
    return { ok: false, error: "REPLICATE_API_TOKEN is not set" };
  }

  const version = envTrim("REPLICATE_SDXL_MULTICN_VERSION") ?? DEFAULT_VERSION;
  const controlnet1 = envTrim("REPLICATE_CONTROLNET_1") ?? "lineart";
  const promptStrength = Number(envTrim("REPLICATE_PROMPT_STRENGTH") ?? "0.42");
  const cn1Scale = Number(envTrim("REPLICATE_CN1_CONDITIONING_SCALE") ?? "0.92");
  const steps = Math.min(80, Math.max(10, Number(envTrim("REPLICATE_NUM_INFERENCE_STEPS") ?? "28")));
  const guidance = Number(envTrim("REPLICATE_GUIDANCE_SCALE") ?? "7.5");
  const applyWatermark =
    envTrim("REPLICATE_APPLY_WATERMARK") === "true" ||
    envTrim("REPLICATE_APPLY_WATERMARK") === "1";
  const disableSafety =
    envTrim("REPLICATE_DISABLE_SAFETY_CHECKER") !== "false" &&
    envTrim("REPLICATE_DISABLE_SAFETY_CHECKER") !== "0";

  const roomMime = params.roomImage.mimeType || "image/jpeg";
  const roomUri = dataUriFromBuffer(roomMime, params.roomImage.buffer);
  const bpUri = dataUriFromBuffer("image/png", params.blueprintPng);

  const input: Record<string, unknown> = {
    prompt: params.positivePrompt.slice(0, 3500),
    negative_prompt: params.negativePrompt.slice(0, 1500),
    image: roomUri,
    sizing_strategy: "input_image",
    width: 1024,
    height: 1024,
    scheduler: "K_EULER",
    num_inference_steps: steps,
    guidance_scale: guidance,
    prompt_strength: Math.min(1, Math.max(0.05, Number.isFinite(promptStrength) ? promptStrength : 0.42)),
    refine: "no_refiner",
    apply_watermark: applyWatermark,
    disable_safety_checker: disableSafety,
    controlnet_1: controlnet1,
    controlnet_1_image: bpUri,
    controlnet_1_conditioning_scale: Math.min(4, Math.max(0, Number.isFinite(cn1Scale) ? cn1Scale : 0.92)),
    controlnet_1_start: 0,
    controlnet_1_end: 1,
    controlnet_2: "none",
    controlnet_3: "none",
    num_outputs: 1,
  };

  try {
    const created = await createPrediction(token, version, input);
    if (!created.id) {
      return { ok: false, error: "Replicate returned no prediction id" };
    }

    const timeoutMs = Math.min(
      600_000,
      Math.max(30_000, Number(envTrim("REPLICATE_PREDICTION_TIMEOUT_MS") ?? "420000")),
    );
    const started = Date.now();
    let pred = created;
    while (
      pred.status !== "succeeded" &&
      pred.status !== "failed" &&
      pred.status !== "canceled" &&
      Date.now() - started < timeoutMs
    ) {
      await new Promise((r) => setTimeout(r, 1200));
      pred = await getPrediction(token, created.id);
    }

    if (pred.status === "failed" || pred.status === "canceled") {
      return {
        ok: false,
        error: pred.error || `Replicate status: ${pred.status}`,
      };
    }
    if (pred.status !== "succeeded") {
      return { ok: false, error: `Replicate timed out (last status: ${pred.status})` };
    }

    const urls = coerceOutputUrls(pred.output);
    /** Model appends control debug images then outputs — use last URL as the rendered frame. */
    const primaryUrl = urls.length > 0 ? urls[urls.length - 1] : "";
    if (!primaryUrl) {
      return { ok: false, error: "Replicate returned no output image URL" };
    }

    const img = await fetchUrlAsBase64(primaryUrl);
    return { ok: true, images: [img] };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export function buildControlNetPromptParts(params: {
  extractedVisualDirective?: string;
  userGoal: string;
}): { positive: string; negative: string } {
  const neg =
    "watermark, logo, brand name, price tag, SKU, text overlay, cartoon, anime, fisheye, deformed architecture, duplicate room, mirror text, low quality, blurry, extra windows, wrong wall count";
  const parts = [
    "Photorealistic interior photograph of the same room as the reference image. Preserve existing wall paint, flooring, ceiling, windows, doors, baseboards, and lighting character from the reference.",
    "Integrate the finish carpentry (built-ins, shelving, closet system, trim, or media wall) so it aligns with the structural guide lines: follow shelf tiers, openings, and divisions implied by the schematic.",
    "No shopping labels, no retailer branding, no dollar amounts visible.",
    params.extractedVisualDirective?.trim() ?? "",
    params.userGoal.trim(),
  ].filter(Boolean);
  return { positive: parts.join("\n\n"), negative: neg };
}

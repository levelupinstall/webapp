"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  type PlannerPhaseTag,
  stripPlannerPhaseMarkers,
} from "@/lib/planner-phase-utils";
import { deriveNorthStarSessionFromUserMessages } from "@/lib/planner-intake-detect";
import { PLANNER_ASSISTANT_NAME } from "@/lib/planner-brand";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  images?: { mimeType: string; dataUrl: string }[];
  showSubmitDesignCta?: boolean;
};

type AssistantResponse = {
  reply: string;
  phase: PlannerPhaseTag;
  showPhotoUploader?: boolean;
  showSubmitDesignCta?: boolean;
  images?: { mimeType: string; data: string }[];
};

type ProjectPlannerAssistantProps = {
  /** When set (logged-in visitor), shown at the top of the planner section. */
  welcomeDisplayName?: string;
  onRequireCreateAccount?: () => void;
  /** Saved projects in the portal when signed in; sign-in when guest. */
  onViewSavedIdeas?: () => void;
};

const MAX_IMAGES = 4;
const MAX_IMAGE_MB = 5;
const MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024;

/** Target max bytes per image after compression (keeps multipart body under typical platform limits). */
const PLANNER_COMPRESSED_TARGET_BYTES = 1_350_000;

/** Assistant turns that included a concept image; sent to API for long-loop guidance. */
const MAX_SKETCH_ROUNDS_TRACKED = 99;

function isLikelyImageFile(file: File): boolean {
  const t = (file.type || "").toLowerCase();
  if (t.startsWith("image/")) return true;
  return /\.(heic|heif|jpg|jpeg|png|webp|gif)$/i.test(file.name);
}

/**
 * Shrinks large gallery photos before upload so POST bodies stay under edge/server limits
 * (full-resolution phone photos often exceed ~4.5MB total and surface as "Failed to fetch").
 */
async function compressImageForPlannerUpload(file: File): Promise<File> {
  if (!isLikelyImageFile(file)) return file;

  const baseName = file.name.replace(/\.[^/.]+$/, "") || "photo";

  if (
    file.size <= 650 * 1024 &&
    (file.type === "image/jpeg" || file.type === "image/png" || file.type === "image/webp")
  ) {
    return file;
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  try {
    let scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    let best: File | null = null;

    for (let attempt = 0; attempt < 8; attempt++) {
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(bitmap, 0, 0, w, h);

      const blob: Blob | null = await new Promise((resolve) => {
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.82);
      });

      if (blob) {
        best = new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
        if (blob.size <= PLANNER_COMPRESSED_TARGET_BYTES || scale <= 0.28) {
          return best;
        }
      }
      scale *= 0.82;
    }

    return best ?? file;
  } finally {
    bitmap.close();
  }
}

export default function ProjectPlannerAssistant({
  welcomeDisplayName,
  onRequireCreateAccount,
  onViewSavedIdeas,
}: ProjectPlannerAssistantProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: `Hi — I'm ${PLANNER_ASSISTANT_NAME}, Level Up's planning consultant. I'll ask a few quick questions about your project before suggesting directions — nothing overwhelming. Want to start by telling me which space you're thinking about?`,
    },
  ]);
  const [draft, setDraft] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [phase, setPhase] = useState<PlannerPhaseTag>("consultation");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [showCreateAccountPrompt, setShowCreateAccountPrompt] = useState(false);
  const [photoInviteActive, setPhotoInviteActive] = useState(false);
  /** Phase 1 — populated from homeowner messages; `[PHOTO_PROMPT]` UI only when both are set. */
  const [workCategory, setWorkCategory] = useState<string | null>(null);
  const [stylePreference, setStylePreference] = useState<string | null>(null);
  const [sketchRoundsDelivered, setSketchRoundsDelivered] = useState(0);
  const [submitDesignBusy, setSubmitDesignBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [ideaNameModalOpen, setIdeaNameModalOpen] = useState(false);
  const [ideaNameDraft, setIdeaNameDraft] = useState("");
  const [ideaNameModalIntent, setIdeaNameModalIntent] = useState<"save" | "submit" | null>(null);
  const [ideaNameModalError, setIdeaNameModalError] = useState<string | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();
  const ideaNameInputRef = useRef<HTMLInputElement>(null);

  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  /** Compressed uploads from earlier turns — re-sent so refinement sketches stay anchored to their room. */
  const sketchSpacePhotosRef = useRef<File[]>([]);

  const previews = useMemo(
    () => images.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [images],
  );

  useEffect(() => {
    return () => {
      previews.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [previews]);

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isLoading]);

  useEffect(() => {
    if (!photoInviteActive) {
      queueMicrotask(() => {
        setImages([]);
        if (galleryInputRef.current) galleryInputRef.current.value = "";
        if (cameraInputRef.current) cameraInputRef.current.value = "";
      });
    }
  }, [photoInviteActive]);

  /** Sign-in required — at least one homeowner message exists (including photo-only sends). */
  const canSaveConversation = messages.some((m) => m.role === "user");

  const welcome = welcomeDisplayName?.trim();
  const resumedIdeaId = searchParams.get("idea");
  const [loadedIdeaId, setLoadedIdeaId] = useState<string | null>(null);

  function defaultIdeaTitle(kind: "save" | "submit"): string {
    const stamp = new Date().toLocaleString();
    return kind === "submit"
      ? `${PLANNER_ASSISTANT_NAME} · Design submitted (${stamp})`
      : `${PLANNER_ASSISTANT_NAME} · Design conversation (${stamp})`;
  }

  function buildConversationNotes(): string {
    const chunks: string[] = [];
    for (const m of messages) {
      const label = m.role === "user" ? "You" : PLANNER_ASSISTANT_NAME;
      const body =
        m.role === "assistant" ? stripPlannerPhaseMarkers(m.content) : m.content;
      let block = `${label}: ${body}`;
      if (m.images?.length) {
        block += `\n[Includes ${m.images.length} AI concept visual(s) — reopen this planner chat on your device to view images.]`;
      }
      chunks.push(block);
    }
    const full = chunks.join("\n\n");
    const max = 48_000;
    if (full.length <= max) return full;
    return `${full.slice(0, max)}\n\n… (saved excerpt truncated — continue saving after starting a fresh planner thread if needed.)`;
  }

  function buildConversationPayload() {
    return {
      messages: messages.map((m) => ({
        role: m.role,
        content: m.role === "assistant" ? stripPlannerPhaseMarkers(m.content) : m.content,
        ...(m.images?.length
          ? {
              images: m.images.map((img) => ({
                mimeType: img.mimeType,
                dataUrl: img.dataUrl,
              })),
            }
          : {}),
      })),
    };
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!draft.trim() && images.length === 0) {
      setError("Type a message or add a photo.");
      return;
    }

    setError(null);
    setSaveStatus(null);
    setShowCreateAccountPrompt(false);

    const draftBefore = draft;

    const userMessage =
      draft.trim() ||
      "I'm sharing a photo of the space — please take a look.";

    const lastAssistantBeforeSend = [...messages]
      .reverse()
      .find((m) => m.role === "assistant");
    const priorTurnHadConceptImage = Boolean(lastAssistantBeforeSend?.images?.length);

    const payloadMessages: { role: "user" | "assistant"; content: string }[] = [
      ...messages.map((m) => ({
        role: m.role,
        content:
          m.role === "assistant"
            ? stripPlannerPhaseMarkers(m.content)
            : m.content,
      })),
      { role: "user", content: userMessage },
    ];

    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setDraft("");
    const imagesToSend = [...images];
    setImages([]);
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append("messages", JSON.stringify(payloadMessages));
      formData.append("phase", phase);
      formData.append(
        "priorTurnHadConceptImage",
        priorTurnHadConceptImage ? "true" : "false",
      );
      formData.append(
        "sketchRoundsDelivered",
        String(Math.min(MAX_SKETCH_ROUNDS_TRACKED, sketchRoundsDelivered)),
      );

      const compressedImages = await Promise.all(
        imagesToSend.map((image) => compressImageForPlannerUpload(image)),
      );

      let uploadTotalBytes = 0;
      for (const image of sketchSpacePhotosRef.current) {
        uploadTotalBytes += image.size;
        formData.append("sketchReferenceImages", image);
      }
      for (const image of compressedImages) {
        uploadTotalBytes += image.size;
        formData.append("images", image);
      }

      if (uploadTotalBytes > 4 * 1024 * 1024) {
        throw new Error(
          "Those photos are still too large to send at once. Try one or two images, or use Take photo for smaller files.",
        );
      }

      const response = await fetch("/api/project-assistant", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Could not get a response right now.");
      }

      const data = (await response.json()) as AssistantResponse;
      const northStar = deriveNorthStarSessionFromUserMessages(payloadMessages);
      setWorkCategory(northStar.workCategory);
      setStylePreference(northStar.stylePreference);

      setPhase(data.phase);
      setPhotoInviteActive(
        Boolean(
          data.showPhotoUploader && northStar.workCategory && northStar.stylePreference,
        ),
      );

      const assistantImages = data.images?.map((img) => ({
        mimeType: img.mimeType,
        dataUrl: `data:${img.mimeType};base64,${img.data}`,
      }));

      const safeReply = stripPlannerPhaseMarkers(data.reply);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: safeReply,
          ...(data.showSubmitDesignCta ? { showSubmitDesignCta: true } : {}),
          ...(assistantImages?.length ? { images: assistantImages } : {}),
        },
      ]);

      if (assistantImages?.length) {
        setSketchRoundsDelivered((n) =>
          Math.min(MAX_SKETCH_ROUNDS_TRACKED, n + 1),
        );
      }

      if (compressedImages.length > 0) {
        sketchSpacePhotosRef.current = [
          ...sketchSpacePhotosRef.current,
          ...compressedImages,
        ].slice(-MAX_IMAGES);
      }
    } catch (submitError) {
      setMessages((prev) =>
        prev.length && prev[prev.length - 1]?.role === "user"
          ? prev.slice(0, -1)
          : prev,
      );
      setDraft(draftBefore);
      setImages(imagesToSend);

      let message =
        submitError instanceof Error
          ? submitError.message
          : "Something went wrong while sending your message.";
      if (
        submitError instanceof TypeError &&
        (submitError.message === "Failed to fetch" ||
          submitError.message === "Load failed")
      ) {
        message =
          "Could not upload — usually caused by very large gallery photos or a weak connection. Try again after we resized your images, use Take photo, or send fewer pictures at once.";
      }
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  function handleFilesChange(fileList: FileList | null) {
    if (!fileList) return;

    const nextFiles = Array.from(fileList);
    const validFiles: File[] = [];
    let skippedType = 0;
    let skippedSize = 0;

    for (const file of nextFiles) {
      if (!isLikelyImageFile(file)) {
        skippedType += 1;
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        skippedSize += 1;
        continue;
      }
      validFiles.push(file);
    }

    const merged = [...images, ...validFiles].slice(0, MAX_IMAGES);
    setImages(merged);

    if (skippedSize > 0) {
      setError(
        `${skippedSize} file(s) skipped — max ${MAX_IMAGE_MB} MB each. Pick “Medium” / “Large” if your phone asks for export size.`,
      );
    } else if (skippedType > 0 && merged.length === images.length) {
      setError("Those files don’t look like supported images (JPEG, PNG, HEIC, WebP…).");
    } else if (skippedType > 0) {
      setError(`${skippedType} non-image file(s) skipped.`);
    } else if (validFiles.length > 0) {
      setError(null);
    }

    if (galleryInputRef.current) galleryInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, current) => current !== index));
  }

  async function createWorkProposalFormData(): Promise<FormData> {
    const transcript = messages
      .map((m) => {
        const label = m.role === "user" ? "Homeowner" : PLANNER_ASSISTANT_NAME;
        let block = `${label}: ${m.content}`;
        if (m.images?.length) {
          block += `\n[Includes ${m.images.length} planner visualization(s)]`;
        }
        return block;
      })
      .join("\n\n");

    const seen = new Set<string>();
    const renderings: { mimeType: string; dataBase64: string }[] = [];
    for (const m of messages) {
      if (m.role !== "assistant" || !m.images?.length) continue;
      for (const img of m.images) {
        const parsed = /^data:([^;]+);base64,(.+)$/i.exec(img.dataUrl.trim());
        if (!parsed) continue;
        const fingerprint = parsed[2].slice(0, 200);
        if (seen.has(fingerprint)) continue;
        seen.add(fingerprint);
        renderings.push({ mimeType: parsed[1], dataBase64: parsed[2] });
        if (renderings.length >= 6) break;
      }
      if (renderings.length >= 6) break;
    }

    const compressedSpace = await Promise.all(
      sketchSpacePhotosRef.current.map((f) => compressImageForPlannerUpload(f)),
    );

    const formData = new FormData();
    formData.append("transcript", transcript);
    formData.append("renderings", JSON.stringify(renderings));
    for (const file of compressedSpace) {
      formData.append("spacePhotos", file);
    }
    return formData;
  }

  function requestSubmitDesignForReview() {
    setError(null);
    setSaveStatus(null);

    if (!welcome) {
      setShowCreateAccountPrompt(true);
      setError("Sign in to submit your design for review.");
      return;
    }

    if (!canSaveConversation) {
      setError("Send at least one message in the planner before submitting your design.");
      return;
    }

    setIdeaNameDraft(defaultIdeaTitle("submit"));
    setIdeaNameModalError(null);
    setIdeaNameModalIntent("submit");
    setIdeaNameModalOpen(true);
  }

  /** Saves the conversation to Saved Ideas, creates the formal proposal draft for admin, then redirects. */
  async function executeSubmitDesignForReview(ideaTitle: string) {
    setSubmitDesignBusy(true);
    try {
      const notes = buildConversationNotes();

      const saveResponse = await fetch("/api/portal/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: ideaTitle.trim().slice(0, 200),
          notes,
          conversation: buildConversationPayload(),
        }),
      });

      if (saveResponse.status === 401) {
        setShowCreateAccountPrompt(true);
        setError("Sign in to submit your design.");
        return;
      }

      if (!saveResponse.ok) {
        setError("Could not save your design. Please try again.");
        return;
      }

      const formData = await createWorkProposalFormData();
      const submitResponse = await fetch("/api/planner/submit-design-job", {
        method: "POST",
        body: formData,
      });
      const submitData = (await submitResponse.json().catch(() => ({}))) as {
        error?: string;
        stripeWarning?: string;
        immediateCheckoutUrl?: string | null;
        laborHoldCheckoutUrl?: string | null;
      };

      if (submitResponse.status === 401) {
        setShowCreateAccountPrompt(true);
        setError("Your session may have expired — sign in again and try submitting.");
        return;
      }

      if (!submitResponse.ok) {
        setError(
          submitData.error ||
            "Your design was saved, but we could not finish submission. Try again or contact Level Up.",
        );
        return;
      }

      setShowCreateAccountPrompt(false);

      try {
        if (submitData.laborHoldCheckoutUrl?.trim()) {
          sessionStorage.setItem("plannerSubmitLaborHoldCheckoutUrl", submitData.laborHoldCheckoutUrl);
        } else {
          sessionStorage.removeItem("plannerSubmitLaborHoldCheckoutUrl");
        }
      } catch {
        /* ignore */
      }

      if (submitData.stripeWarning?.trim()) {
        setError(submitData.stripeWarning);
      }

      const payUrl = submitData.immediateCheckoutUrl?.trim();
      if (payUrl) {
        window.location.href = payUrl;
        return;
      }

      router.push("/planner/design-submitted");
    } catch {
      setError("Something went wrong while submitting. Please try again.");
    } finally {
      setSubmitDesignBusy(false);
    }
  }

  function requestSaveConversation() {
    setError(null);
    setSaveStatus(null);

    if (!canSaveConversation) {
      setError("Send at least one message (or photos) in the planner before saving.");
      return;
    }

    setIdeaNameDraft(defaultIdeaTitle("save"));
    setIdeaNameModalError(null);
    setIdeaNameModalIntent("save");
    setIdeaNameModalOpen(true);
  }

  async function executeSaveConversation(ideaTitle: string) {
    const notes = buildConversationNotes();

    setSaveBusy(true);
    try {
      const response = await fetch("/api/portal/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: ideaTitle.trim().slice(0, 200),
          notes,
          conversation: buildConversationPayload(),
        }),
      });

      if (response.status === 401) {
        setShowCreateAccountPrompt(true);
        setError("Create an account to save your planner conversation.");
        return;
      }

      if (!response.ok) {
        setError("Could not save right now. Please try again.");
        return;
      }

      setShowCreateAccountPrompt(false);
      setSaveStatus("Saved to Client Portal → Saved Ideas.");
    } finally {
      setSaveBusy(false);
    }
  }

  async function confirmIdeaNameModal() {
    const trimmed = ideaNameDraft.trim();
    if (!trimmed) {
      setIdeaNameModalError("Enter a name for this idea.");
      return;
    }
    setIdeaNameModalError(null);
    const intent = ideaNameModalIntent;
    setIdeaNameModalOpen(false);
    setIdeaNameModalIntent(null);

    if (intent === "save") {
      await executeSaveConversation(trimmed);
    } else if (intent === "submit") {
      await executeSubmitDesignForReview(trimmed);
    }
  }

  useEffect(() => {
    if (!ideaNameModalOpen) return;
    const id = window.setTimeout(() => ideaNameInputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [ideaNameModalOpen]);

  useEffect(() => {
    const id = resumedIdeaId?.trim();
    if (!id || !welcome || loadedIdeaId === id) return;
    let cancelled = false;
    void fetch("/api/portal/ideas")
      .then(async (res) => {
        if (!res.ok) return null;
        const data = (await res.json()) as {
          ideas?: Array<{
            id: string;
            notes?: string;
            conversation?: {
              messages?: Array<{
                role?: "user" | "assistant";
                content?: string;
                images?: Array<{ mimeType?: string; dataUrl?: string }>;
              }>;
            };
          }>;
        };
        const idea = (data.ideas ?? []).find((it) => it.id === id);
        if (!idea) return null;
        const msgs = idea.conversation?.messages;
        if (Array.isArray(msgs) && msgs.length > 0) {
          const parsed = msgs
            .map((m) => {
              const role = m.role === "assistant" ? "assistant" : "user";
              const content = String(m.content ?? "");
              const images = Array.isArray(m.images)
                ? m.images
                    .map((img) => ({
                      mimeType: String(img?.mimeType ?? "image/png"),
                      dataUrl: String(img?.dataUrl ?? ""),
                    }))
                    .filter((img) => img.dataUrl.startsWith("data:"))
                : [];
              return {
                role,
                content,
                ...(images.length ? { images } : {}),
              } as ChatMessage;
            })
            .filter((m) => m.content.trim().length > 0 || (m.images?.length ?? 0) > 0);
          return parsed.length ? parsed : null;
        }

        // Backward-compatible fallback for older ideas saved before structured conversation existed.
        const notes = String(idea.notes ?? "").trim();
        if (!notes) return null;
        const blocks = notes
          .split(/\n\s*\n/g)
          .map((b) => b.trim())
          .filter(Boolean);
        const parsedFromNotes = blocks
          .map((m) => {
            if (m.startsWith("You:")) {
              return {
                role: "user" as const,
                content: m.replace(/^You:\s*/, "").trim(),
              };
            }
            if (m.startsWith(`${PLANNER_ASSISTANT_NAME}:`)) {
              return {
                role: "assistant" as const,
                content: m.replace(new RegExp(`^${PLANNER_ASSISTANT_NAME}:\\s*`), "").trim(),
              };
            }
            return {
              role: "assistant" as const,
              content: m,
            } as ChatMessage;
          })
          .filter((m) => m.content.trim().length > 0);
        return parsedFromNotes.length ? parsedFromNotes : null;
      })
      .then((parsed) => {
        if (cancelled || !parsed) return;
        setMessages(parsed);
        const payloadLike = parsed.map((m) => ({
          role: m.role,
          content:
            m.role === "assistant" ? stripPlannerPhaseMarkers(m.content) : m.content,
        }));
        const resumedNorthStar = deriveNorthStarSessionFromUserMessages(payloadLike);
        setWorkCategory(resumedNorthStar.workCategory);
        setStylePreference(resumedNorthStar.stylePreference);

        setLoadedIdeaId(id);
        setSaveStatus("Resumed saved design conversation.");
        const aiWithImages = parsed.filter((m) => m.role === "assistant" && (m.images?.length ?? 0) > 0)
          .length;
        setSketchRoundsDelivered(Math.min(MAX_SKETCH_ROUNDS_TRACKED, aiWithImages));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [resumedIdeaId, welcome, loadedIdeaId]);

  return (
    <section
      className="mt-8 rounded-3xl border border-[#dac6fb] bg-white p-6 shadow-[0_10px_30px_-20px_rgba(91,33,182,0.55)] sm:p-8"
      data-planner-work-category={workCategory ?? ""}
      data-planner-style-preference={stylePreference ?? ""}
    >
      {welcome ? (
        <div className="mb-6 rounded-2xl border border-[#c9e8d4] bg-gradient-to-br from-[#f4fcf7] to-[#eefaf3] px-5 py-4 sm:px-6">
          <p className="text-lg font-semibold text-[#1a4d2e] sm:text-xl">
            Welcome, {welcome}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[#2d6a45]">
            You&apos;re signed in — continue your project plan with {PLANNER_ASSISTANT_NAME}. When the assistant
            confirms your design and asks if you&apos;re ready for the next stage, you&apos;ll see an in-chat{" "}
            <strong className="font-semibold">Submit design for review</strong> button.
          </p>
        </div>
      ) : null}
      <h2 className="text-2xl font-semibold text-[#2d1546] sm:text-3xl">
        Meet {PLANNER_ASSISTANT_NAME}, your planning consultant
      </h2>
      <p className="mt-3 text-[#55337b]">
        Conversational guidance from a finish-carpentry mindset — budget and practical constraints matter early.
        {PLANNER_ASSISTANT_NAME} asks tailored questions (sizes, what you already bought, closet habits, IKEA lines when relevant)
        and invites photos when it helps; if you skip photos, you may still see a neutral blank-room sketch so you can react visually.
        Refinements stay in chat until the direction feels right — no prices or store-specific products here, just the look.
        When you&apos;re ready to proceed, Level Up reviews your designs and reaches out with a detailed proposal for approval.
      </p>

      <div className="mt-6 max-h-[min(520px,70vh)] space-y-3 overflow-y-auto rounded-2xl border border-[#ecdefe] bg-[#fcf9ff] p-4">
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`rounded-2xl px-4 py-3 text-sm leading-relaxed sm:text-base ${
              message.role === "assistant"
                ? "bg-white text-[#3e2560]"
                : "ml-auto max-w-[90%] bg-[#6e3eb2] text-white"
            }`}
          >
            <div className="whitespace-pre-wrap">
              {message.role === "assistant"
                ? stripPlannerPhaseMarkers(message.content)
                : message.content}
            </div>
            {message.images?.length ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {message.images.map((img, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={`${index}-viz-${i}`}
                    src={img.dataUrl}
                    alt="Visualization"
                    className="max-h-56 w-full rounded-xl border border-[#e8d9ff] object-contain"
                  />
                ))}
              </div>
            ) : null}
            {message.role === "assistant" && message.showSubmitDesignCta && welcome ? (
              <div className="mt-3 border-t border-[#eadbff] pt-3">
                <button
                  type="button"
                  disabled={submitDesignBusy || saveBusy || isLoading || !canSaveConversation}
                  onClick={() => requestSubmitDesignForReview()}
                  className="inline-flex items-center justify-center rounded-full border border-[#2f7a32] bg-[#f4fcf7] px-4 py-2 text-xs font-semibold text-[#1a4d2e] transition hover:bg-[#dff5e8] disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
                >
                  {submitDesignBusy ? "Submitting…" : "Submit design for review"}
                </button>
              </div>
            ) : null}
          </div>
        ))}
        {isLoading ? (
          <div className="rounded-2xl bg-white px-4 py-3 text-sm text-[#6a4a8f]">
            {PLANNER_ASSISTANT_NAME} is thinking…
          </div>
        ) : null}
        <div ref={scrollAnchorRef} />
      </div>

      <form id="levelup-planner-form" className="mt-5 space-y-4" onSubmit={handleSubmit}>
        {photoInviteActive ? (
          <div className="space-y-3 rounded-2xl border border-[#e8d9ff] bg-[#faf6ff] p-4">
            <p className="text-sm text-[#4d2e70]">
              <span className="font-semibold text-[#2f1748]">
                {PLANNER_ASSISTANT_NAME} asked for photos.
              </span>{" "}
              Share pictures of your <strong className="text-[#4d2e70]">space</strong> and, if you already have materials or kits, photos of{" "}
              <strong className="text-[#4d2e70]">those items</strong> too — upload from your gallery or use your camera (
              up to {MAX_IMAGES} photos per send, {MAX_IMAGE_MB}MB each).
            </p>
            <p className="text-xs leading-relaxed text-[#6a4a8f]">
              Choose photos, preview them below, then tap{" "}
              <strong className="text-[#4d2e70]">Send photos</strong> here or{" "}
              <strong className="text-[#4d2e70]">Send</strong> under your message — both finalize the upload.
              Large gallery shots are resized automatically so they send reliably.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                className="rounded-full border border-[#dcc6fb] bg-white px-4 py-2 text-xs font-semibold text-[#4a2381] transition hover:bg-[#f0e6ff] sm:text-sm"
              >
                Upload photo
              </button>
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="rounded-full border border-[#dcc6fb] bg-white px-4 py-2 text-xs font-semibold text-[#4a2381] transition hover:bg-[#f0e6ff] sm:text-sm"
              >
                Take photo
              </button>
              <input
                ref={galleryInputRef}
                type="file"
                multiple
                accept="image/*,.heic,.heif"
                className="hidden"
                onChange={(event) => handleFilesChange(event.target.files)}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(event) => handleFilesChange(event.target.files)}
              />
            </div>

            {previews.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {previews.map((preview, index) => (
                  <div
                    key={`${preview.file.name}-${index}`}
                    className="relative overflow-hidden rounded-xl border border-[#dcc6fb]"
                  >
                    <Image
                      src={preview.url}
                      alt={preview.file.name}
                      width={320}
                      height={160}
                      unoptimized
                      className="h-24 w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute right-1 top-1 rounded-full bg-black/60 px-2 py-1 text-xs text-white"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            {previews.length > 0 ? (
              <div className="flex flex-col gap-2 border-t border-[#e8d9ff] pt-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="inline-flex items-center justify-center rounded-full bg-[#6e3eb2] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#5b3292] disabled:cursor-not-allowed disabled:opacity-65"
                >
                  {isLoading ? "Sending…" : `Send ${previews.length} photo${previews.length === 1 ? "" : "s"}`}
                </button>
                <p className="text-xs text-[#6a4a8f] sm:max-w-[280px]">
                  Same as the main <strong className="text-[#4d2e70]">Send</strong> button under your message — use whichever is easier on your device.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        <label className="block">
          <span className="text-sm font-semibold text-[#4a2381]">Your message</span>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Reply here…"
            rows={3}
            className="mt-2 w-full resize-y rounded-2xl border border-[#dcbef9] bg-white px-4 py-3 text-[#32174f] outline-none ring-[#c9a0f8] transition focus:ring-2"
          />
        </label>

        {error ? <p className="text-sm text-[#a2175d]">{error}</p> : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex items-center justify-center rounded-full bg-[#6e3eb2] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#5b3292] disabled:cursor-not-allowed disabled:opacity-65"
          >
            {isLoading ? "Sending…" : "Send"}
          </button>
          {welcome ? (
            <>
              <button
                type="button"
                disabled={saveBusy || submitDesignBusy || isLoading || !canSaveConversation}
                onClick={() => requestSaveConversation()}
                title={
                  canSaveConversation
                    ? "Save full transcript to Saved Ideas"
                    : "Send a message first to enable saving"
                }
                className="inline-flex items-center justify-center rounded-full border-2 border-[#6e3eb2] bg-white px-6 py-3 text-sm font-semibold text-[#5b3292] transition hover:bg-[#f5efff] disabled:cursor-not-allowed disabled:border-[#cbb8e8] disabled:text-[#9b87b5]"
              >
                {saveBusy ? "Saving…" : "Save design & conversation"}
              </button>
            </>
          ) : onRequireCreateAccount ? (
            <button
              type="button"
              disabled={isLoading}
              onClick={onRequireCreateAccount}
              className="inline-flex items-center justify-center rounded-full border-2 border-[#6e3eb2] bg-white px-6 py-3 text-sm font-semibold text-[#5b3292] transition hover:bg-[#f5efff] disabled:opacity-65"
            >
              Save to portal — sign in
            </button>
          ) : null}
          {onViewSavedIdeas ? (
            <button
              type="button"
              onClick={onViewSavedIdeas}
              className="inline-flex items-center justify-center rounded-full border border-[#dcc6fb] bg-white px-6 py-3 text-sm font-semibold text-[#5b3292] transition hover:bg-[#f3ebff]"
            >
              View saved ideas
            </button>
          ) : null}
        </div>
        {saveStatus ? (
          <p className="text-sm font-medium text-[#2f7a32]">{saveStatus}</p>
        ) : null}
        {showCreateAccountPrompt ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-[#55337b]">
              Saving requires a free client account.
            </p>
            <button
              type="button"
              onClick={onRequireCreateAccount}
              className="rounded-full border border-[#6e3eb2] px-4 py-2 text-xs font-semibold text-[#5b3292] transition hover:bg-[#f3ebff] sm:text-sm"
            >
              Create account
            </button>
          </div>
        ) : null}
      </form>

      {ideaNameModalOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 px-4 py-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby="idea-name-modal-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-[#dcc6fb] bg-white p-6 shadow-[0_20px_50px_-20px_rgba(45,21,70,0.45)]">
            <h3
              id="idea-name-modal-title"
              className="text-lg font-semibold text-[#2d1546]"
            >
              {ideaNameModalIntent === "submit" ? "Name this design" : "Name your saved idea"}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[#55337b]">
              {ideaNameModalIntent === "submit"
                ? "Choose a title for this submission — it will appear in Saved Ideas and helps our team recognize your project."
                : "Pick a title so you can find this conversation later under Saved Ideas in your portal."}
            </p>
            <label className="mt-4 block">
              <span className="text-sm font-semibold text-[#4a2381]">Idea name</span>
              <input
                ref={ideaNameInputRef}
                type="text"
                value={ideaNameDraft}
                maxLength={200}
                onChange={(e) => {
                  setIdeaNameDraft(e.target.value);
                  setIdeaNameModalError(null);
                }}
                className="mt-2 w-full rounded-xl border border-[#dcbef9] bg-white px-4 py-3 text-[#32174f] outline-none ring-[#c9a0f8] transition focus:ring-2"
                placeholder="e.g. Kitchen built-ins — walnut mood"
              />
            </label>
            {ideaNameModalError ? (
              <p className="mt-2 text-sm text-[#a2175d]">{ideaNameModalError}</p>
            ) : null}
            <p className="mt-2 text-xs text-[#8b7aa8]">{ideaNameDraft.length}/200 characters</p>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                disabled={saveBusy || submitDesignBusy}
                onClick={() => {
                  setIdeaNameModalOpen(false);
                  setIdeaNameModalIntent(null);
                  setIdeaNameModalError(null);
                }}
                className="rounded-full border border-[#dcc6fb] bg-white px-5 py-2.5 text-sm font-semibold text-[#5b3292] transition hover:bg-[#f3ebff] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saveBusy || submitDesignBusy}
                onClick={() => void confirmIdeaNameModal()}
                className="rounded-full bg-[#6e3eb2] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5b3292] disabled:opacity-50"
              >
                {ideaNameModalIntent === "submit"
                  ? submitDesignBusy
                    ? "Working…"
                    : "Continue"
                  : saveBusy
                    ? "Saving…"
                    : "Save idea"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

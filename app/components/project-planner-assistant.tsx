"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import BookingCheckout from "./booking-checkout";
import {
  type PlannerPhaseTag,
  stripPlannerPhaseMarkers,
} from "@/lib/planner-phase-utils";
import { PLANNER_ASSISTANT_NAME } from "@/lib/planner-brand";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  images?: { mimeType: string; dataUrl: string }[];
};

type AssistantResponse = {
  reply: string;
  phase: PlannerPhaseTag;
  showPhotoUploader?: boolean;
  images?: { mimeType: string; data: string }[];
};

type ProjectPlannerAssistantProps = {
  onRequireCreateAccount?: () => void;
};

const MAX_IMAGES = 4;
const MAX_IMAGE_MB = 5;

/** Assistant turns that included a concept image; sent to API for long-loop guidance. */
const MAX_SKETCH_ROUNDS_TRACKED = 99;

export default function ProjectPlannerAssistant({
  onRequireCreateAccount,
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
  const [sketchRoundsDelivered, setSketchRoundsDelivered] = useState(0);

  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);

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
      setImages([]);
      if (galleryInputRef.current) galleryInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  }, [photoInviteActive]);

  const latestAssistantIdea = [...messages]
    .reverse()
    .find((message) => message.role === "assistant");

  const showSecureBooking =
    (phase === "recommend" || phase === "refine") &&
    Boolean(latestAssistantIdea) &&
    messages.some((message) => message.role === "user");

  const canSaveIdea = phase === "recommend" || phase === "refine";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!draft.trim() && images.length === 0) {
      setError("Type a message or add a photo.");
      return;
    }

    setError(null);
    setSaveStatus(null);
    setShowCreateAccountPrompt(false);

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
      imagesToSend.forEach((image) => formData.append("images", image));

      const response = await fetch("/api/project-assistant", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Could not get a response right now.");
      }

      const data = (await response.json()) as AssistantResponse;
      setPhase(data.phase);
      setPhotoInviteActive(Boolean(data.showPhotoUploader));

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
          ...(assistantImages?.length ? { images: assistantImages } : {}),
        },
      ]);

      if (assistantImages?.length) {
        setSketchRoundsDelivered((n) =>
          Math.min(MAX_SKETCH_ROUNDS_TRACKED, n + 1),
        );
      }
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Something went wrong while sending your message.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  function handleFilesChange(fileList: FileList | null) {
    if (!fileList) return;

    const nextFiles = Array.from(fileList);
    const validFiles: File[] = [];

    for (const file of nextFiles) {
      if (!file.type.startsWith("image/")) continue;
      if (file.size > MAX_IMAGE_MB * 1024 * 1024) continue;
      validFiles.push(file);
    }

    const merged = [...images, ...validFiles].slice(0, MAX_IMAGES);
    setImages(merged);
    galleryInputRef.current && (galleryInputRef.current.value = "");
    cameraInputRef.current && (cameraInputRef.current.value = "");
  }

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, current) => current !== index));
  }

  async function handleSaveIdea() {
    if (!latestAssistantIdea || !canSaveIdea) return;

    setError(null);
    setSaveStatus(null);

    const ideaTitle = `${PLANNER_ASSISTANT_NAME} planning notes`;

    const response = await fetch("/api/portal/ideas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: ideaTitle,
        notes: stripPlannerPhaseMarkers(latestAssistantIdea.content),
      }),
    });

    if (response.status === 401) {
      setShowCreateAccountPrompt(true);
      setError("Create an account to save this conversation summary.");
      return;
    }

    if (!response.ok) {
      setError("Could not save right now. Please try again.");
      return;
    }

    setShowCreateAccountPrompt(false);
    setSaveStatus("Saved to your Client Portal.");
  }

  return (
    <section className="mt-8 rounded-3xl border border-[#dac6fb] bg-white p-6 shadow-[0_10px_30px_-20px_rgba(91,33,182,0.55)] sm:p-8">
      <h2 className="text-2xl font-semibold text-[#2d1546] sm:text-3xl">
        Meet {PLANNER_ASSISTANT_NAME}, your planning consultant
      </h2>
      <p className="mt-3 text-[#55337b]">
        Short, conversational guidance for finish carpentry and installs.{" "}
        {PLANNER_ASSISTANT_NAME} asks a few questions first (budget is important early),
        then invites photos of your space so we can sketch a concept together — refinements happen in chat until the direction feels right. No walls of text or shopping lists.
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
          </div>
        ))}
        {isLoading ? (
          <div className="rounded-2xl bg-white px-4 py-3 text-sm text-[#6a4a8f]">
            {PLANNER_ASSISTANT_NAME} is thinking…
          </div>
        ) : null}
        <div ref={scrollAnchorRef} />
      </div>

      {showSecureBooking && latestAssistantIdea ? (
        <div className="mt-6">
          <BookingCheckout
            embedded
            initialProjectDetails={stripPlannerPhaseMarkers(latestAssistantIdea.content)}
          />
        </div>
      ) : null}

      <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
        {photoInviteActive ? (
          <div className="space-y-3 rounded-2xl border border-[#e8d9ff] bg-[#faf6ff] p-4">
            <p className="text-sm text-[#4d2e70]">
              <span className="font-semibold text-[#2f1748]">
                {PLANNER_ASSISTANT_NAME} asked for pictures of your space.
              </span>{" "}
              Upload from your gallery or use your phone camera — they&apos;ll be sent with your next message (
              up to {MAX_IMAGES} photos, {MAX_IMAGE_MB}MB each).
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
                accept="image/*"
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
          {latestAssistantIdea && canSaveIdea ? (
            <button
              type="button"
              onClick={() => void handleSaveIdea()}
              className="inline-flex items-center justify-center rounded-full border-2 border-[#6e3eb2] bg-white px-6 py-3 text-sm font-semibold text-[#5b3292] transition hover:bg-[#f5efff]"
            >
              Save summary
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
    </section>
  );
}

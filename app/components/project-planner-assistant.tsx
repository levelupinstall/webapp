"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useState } from "react";
import BookingCheckout from "./booking-checkout";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  images?: { mimeType: string; dataUrl: string }[];
};

type AssistantResponse = {
  reply: string;
  images?: { mimeType: string; data: string }[];
};

type IntakeFields = {
  roomType: string;
  dimensions: string;
  style: string;
  budget: string;
  timeline: string;
};

type ProjectPlannerAssistantProps = {
  onRequireCreateAccount?: () => void;
};

const MAX_IMAGES = 4;
const MAX_IMAGE_MB = 5;

export default function ProjectPlannerAssistant({
  onRequireCreateAccount,
}: ProjectPlannerAssistantProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hi! I am your Level Up Install planner (Gemini). Share goals, room details, budget, and photos for a retailer-grounded brief. Check “Include concept image” or ask to sketch/visualize for an AI concept image (buildable ideas only — IKEA / Home Depot / Lowe's–style materials).",
    },
  ]);
  const [prompt, setPrompt] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [intake, setIntake] = useState<IntakeFields>({
    roomType: "",
    dimensions: "",
    style: "",
    budget: "",
    timeline: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [showCreateAccountPrompt, setShowCreateAccountPrompt] = useState(false);
  const [includeConceptImage, setIncludeConceptImage] = useState(false);

  const previews = useMemo(
    () => images.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [images],
  );

  useEffect(() => {
    return () => {
      previews.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [previews]);

  const latestAssistantIdea = [...messages]
    .reverse()
    .find((message) => message.role === "assistant");

  const latestMessage = messages[messages.length - 1];
  const showSecureBooking =
    Boolean(latestMessage?.role === "assistant") &&
    messages.some((message) => message.role === "user");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!prompt.trim() && images.length === 0) {
      setError("Add a message or at least one image.");
      return;
    }

    setError(null);
    setSaveStatus(null);
    setShowCreateAccountPrompt(false);
    const userMessage = prompt.trim()
      ? prompt.trim()
      : "Please review these photos and suggest project ideas.";

    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setPrompt("");
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append("prompt", userMessage);
      formData.append("roomType", intake.roomType);
      formData.append("dimensions", intake.dimensions);
      formData.append("style", intake.style);
      formData.append("budget", intake.budget);
      formData.append("timeline", intake.timeline);
      images.forEach((image) => formData.append("images", image));
      formData.append("includeConceptImage", includeConceptImage ? "true" : "false");

      const response = await fetch("/api/project-assistant", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Could not get a response from the assistant.");
      }

      const data = (await response.json()) as AssistantResponse;
      const assistantImages = data.images?.map((img) => ({
        mimeType: img.mimeType,
        dataUrl: `data:${img.mimeType};base64,${img.data}`,
      }));

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply,
          ...(assistantImages?.length ? { images: assistantImages } : {}),
        },
      ]);
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Something went wrong while processing your request.";
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
  }

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, current) => current !== index));
  }

  async function handleSaveIdea() {
    if (!latestAssistantIdea) return;

    setError(null);
    setSaveStatus(null);

    const titlePrefix = intake.roomType?.trim() || "Carpentry";
    const ideaTitle = `${titlePrefix} Project Brief`;

    const response = await fetch("/api/portal/ideas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: ideaTitle,
        notes: latestAssistantIdea.content,
      }),
    });

    if (response.status === 401) {
      setShowCreateAccountPrompt(true);
      setError("Create an account to save this project idea.");
      return;
    }

    if (!response.ok) {
      setError("Could not save idea right now. Please try again.");
      return;
    }

    setShowCreateAccountPrompt(false);
    setSaveStatus("Idea saved to your Client Portal.");
  }

  return (
    <section className="mt-8 rounded-3xl border border-[#dac6fb] bg-white p-6 shadow-[0_10px_30px_-20px_rgba(91,33,182,0.55)] sm:p-8">
      <h2 className="text-2xl font-semibold text-[#2d1546] sm:text-3xl">
        Project Planner Assistant
      </h2>
      <p className="mt-3 text-[#55337b]">
        Chat with our Gemini-powered planner for grounded finish-carpentry ideas.
        Upload up to 4 photos so suggestions fit your space. Optional concept images
        use retailer-realistic materials (no fantasy builds).
      </p>
      <div className="mt-4 rounded-2xl border border-[#e8d9ff] bg-[#faf6ff] p-4 text-sm text-[#4d2e70]">
        Fill in the quick intake below. Each reply includes a clean{" "}
        <span className="font-semibold text-[#3f1f62]">Project Brief</span> you
        can review before booking.
      </div>

      <div className="mt-6 space-y-3 rounded-2xl border border-[#ecdefe] bg-[#fcf9ff] p-4">
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`rounded-2xl px-4 py-3 text-sm leading-relaxed sm:text-base ${
              message.role === "assistant"
                ? "bg-white text-[#3e2560]"
                : "ml-auto max-w-[90%] bg-[#6e3eb2] text-white"
            }`}
          >
            <div className="whitespace-pre-wrap">{message.content}</div>
            {message.images?.length ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {message.images.map((img, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={`${index}-viz-${i}`}
                    src={img.dataUrl}
                    alt="Concept visualization"
                    className="max-h-56 w-full rounded-xl border border-[#e8d9ff] object-contain"
                  />
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {showSecureBooking && latestAssistantIdea ? (
        <div className="mt-6">
          <BookingCheckout
            embedded
            initialProjectDetails={latestAssistantIdea.content}
          />
        </div>
      ) : null}

      <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-semibold text-[#4a2381]">Room Type</span>
            <input
              value={intake.roomType}
              onChange={(event) =>
                setIntake((prev) => ({ ...prev, roomType: event.target.value }))
              }
              placeholder="Kitchen, mudroom, living room..."
              className="mt-2 w-full rounded-xl border border-[#dcbef9] bg-white px-3 py-2 text-sm text-[#32174f] outline-none ring-[#c9a0f8] transition focus:ring-2"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-[#4a2381]">Dimensions</span>
            <input
              value={intake.dimensions}
              onChange={(event) =>
                setIntake((prev) => ({ ...prev, dimensions: event.target.value }))
              }
              placeholder='Example: 7ft wall, 9ft ceiling'
              className="mt-2 w-full rounded-xl border border-[#dcbef9] bg-white px-3 py-2 text-sm text-[#32174f] outline-none ring-[#c9a0f8] transition focus:ring-2"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-[#4a2381]">Style</span>
            <input
              value={intake.style}
              onChange={(event) =>
                setIntake((prev) => ({ ...prev, style: event.target.value }))
              }
              placeholder="Modern, shaker, traditional..."
              className="mt-2 w-full rounded-xl border border-[#dcbef9] bg-white px-3 py-2 text-sm text-[#32174f] outline-none ring-[#c9a0f8] transition focus:ring-2"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-[#4a2381]">Budget</span>
            <input
              value={intake.budget}
              onChange={(event) =>
                setIntake((prev) => ({ ...prev, budget: event.target.value }))
              }
              placeholder="Example: $1,500 - $3,000"
              className="mt-2 w-full rounded-xl border border-[#dcbef9] bg-white px-3 py-2 text-sm text-[#32174f] outline-none ring-[#c9a0f8] transition focus:ring-2"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-semibold text-[#4a2381]">Timeline</span>
            <input
              value={intake.timeline}
              onChange={(event) =>
                setIntake((prev) => ({ ...prev, timeline: event.target.value }))
              }
              placeholder="When would you like this completed?"
              className="mt-2 w-full rounded-xl border border-[#dcbef9] bg-white px-3 py-2 text-sm text-[#32174f] outline-none ring-[#c9a0f8] transition focus:ring-2"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-sm font-semibold text-[#4a2381]">
            Tell us about your project
          </span>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Example: I want a built-in mudroom bench with storage in a 7ft wall space."
            rows={4}
            className="mt-2 w-full rounded-2xl border border-[#dcbef9] bg-white px-4 py-3 text-[#32174f] outline-none ring-[#c9a0f8] transition focus:ring-2"
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-[#4a2381]">
            Upload space photos (optional)
          </span>
          <input
            type="file"
            multiple
            accept="image/*"
            onChange={(event) => handleFilesChange(event.target.files)}
            className="mt-2 block w-full text-sm text-[#4a2a69] file:mr-4 file:rounded-full file:border-0 file:bg-[#ede0ff] file:px-4 file:py-2 file:font-semibold file:text-[#4a2381] hover:file:bg-[#e4d2ff]"
          />
          <p className="mt-2 text-xs text-[#6a4a8f]">
            Up to {MAX_IMAGES} images, {MAX_IMAGE_MB}MB each.
          </p>
        </label>

        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[#e8d9ff] bg-[#faf6ff] px-4 py-3">
          <input
            type="checkbox"
            checked={includeConceptImage}
            onChange={(event) => setIncludeConceptImage(event.target.checked)}
            className="mt-1 h-4 w-4 rounded border-[#6e3eb2] text-[#6e3eb2]"
          />
          <span className="text-sm text-[#4d2e70]">
            <span className="font-semibold text-[#2f1748]">Include concept image</span>
            — generates one Gemini visualization grounded in common retailer materials
            (optional; slightly slower).
          </span>
        </label>

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

        {error ? <p className="text-sm text-[#a2175d]">{error}</p> : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex items-center justify-center rounded-full bg-[#6e3eb2] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#5b3292] disabled:cursor-not-allowed disabled:opacity-65"
          >
            {isLoading ? "Thinking..." : "Get Project Ideas"}
          </button>
          {latestAssistantIdea ? (
            <button
              type="button"
              onClick={() => void handleSaveIdea()}
              className="inline-flex items-center justify-center rounded-full border-2 border-[#6e3eb2] bg-white px-6 py-3 text-sm font-semibold text-[#5b3292] transition hover:bg-[#f5efff]"
            >
              Save This Idea
            </button>
          ) : null}
        </div>
        {saveStatus ? (
          <p className="text-sm font-medium text-[#2f7a32]">{saveStatus}</p>
        ) : null}
        {showCreateAccountPrompt ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-[#55337b]">
              To save ideas, please create a client account first.
            </p>
            <button
              type="button"
              onClick={onRequireCreateAccount}
              className="rounded-full border border-[#6e3eb2] px-4 py-2 text-xs font-semibold text-[#5b3292] transition hover:bg-[#f3ebff] sm:text-sm"
            >
              Create Account
            </button>
          </div>
        ) : null}
      </form>
    </section>
  );
}

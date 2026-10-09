"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import {
  type PlannerPhaseTag,
  stripPlannerPhaseMarkers,
} from "@/lib/planner-phase-utils";
import {
  deriveNorthStarSessionFromUserMessages,
  hasEarlyPhotoInviteContext,
} from "@/lib/planner-intake-detect";
import { PLANNER_ASSISTANT_NAME } from "@/lib/planner-brand";
import { lu } from "@/lib/level-up-ui";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  images?: {
    mimeType: string;
    dataUrl: string;
    caption?: string;
    dimensions?: Array<{ name: string; expectedIn: number; known: boolean; wallLabel?: string }>;
  }[];
  showSubmitDesignCta?: boolean;
  sketchNotUpdated?: boolean;
};

type AssistantResponse = {
  reply: string;
  phase: PlannerPhaseTag;
  showPhotoUploader?: boolean;
  showSubmitDesignCta?: boolean;
  images?: {
    mimeType: string;
    data: string;
    caption?: string;
    dimensions?: Array<{ name: string; expectedIn: number; known: boolean; wallLabel?: string }>;
  }[];
  /** Server tried to refine a sketch but returned no new image bytes. */
  sketchNotUpdated?: boolean;
  /** Present when PLANNER_DEBUG_DIAGNOSTICS or NODE_ENV=development on server. */
  debugHint?: string;
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

const SKETCH_PHOTOS_SESSION_KEY = "levelup-planner-sketch-space-photos-v1";

type StoredSketchPhoto = {
  name: string;
  type: string;
  base64: string;
};

async function persistSketchSpacePhotos(files: File[]) {
  if (typeof sessionStorage === "undefined" || files.length === 0) return;
  try {
    const items: StoredSketchPhoto[] = await Promise.all(
      files.slice(-MAX_IMAGES).map(async (file) => {
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
        return {
          name: file.name,
          type: file.type || "image/jpeg",
          base64: btoa(binary),
        };
      }),
    );
    sessionStorage.setItem(SKETCH_PHOTOS_SESSION_KEY, JSON.stringify(items));
  } catch {
    /* quota / private mode */
  }
}

function base64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length) as Uint8Array<ArrayBuffer>;
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function restoreSketchSpacePhotosFromSession(
  target: MutableRefObject<File[]>,
): Promise<void> {
  if (typeof sessionStorage === "undefined") return;
  try {
    const raw = sessionStorage.getItem(SKETCH_PHOTOS_SESSION_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as StoredSketchPhoto[];
    if (!Array.isArray(parsed) || parsed.length === 0) return;
    const files = parsed
      .filter((p) => p?.base64 && typeof p.base64 === "string")
      .map((p) => {
        const bytes = base64ToUint8Array(p.base64);
        const blob = new Blob([bytes], { type: p.type || "image/jpeg" });
        return new File([blob], p.name || "space-photo.jpg", {
          type: p.type || "image/jpeg",
        });
      });
    if (files.length) target.current = files.slice(-MAX_IMAGES);
  } catch {
    sessionStorage.removeItem(SKETCH_PHOTOS_SESSION_KEY);
  }
}

/** Opening turn — short, states capabilities; starter chips render below it. */
function initialPlannerAssistantMessage(): ChatMessage {
  return {
    role: "assistant",
    content: `Hi — I'm ${PLANNER_ASSISTANT_NAME}, your planning consultant. I help you explore what your space could look like, then generate concept visuals of the direction. Upload a photo of the room to begin, or tap a starter below.`,
  };
}

/** Clickable starter prompts (NN/g: no blank-state anxiety). */
const SUGGESTED_STARTERS = [
  "I want floating shelves in my living room",
  "Help me plan a home office feature wall",
  "What can I do with an awkward empty hallway?",
] as const;

function isLikelyImageFile(file: File): boolean {
  const t = (file.type || "").toLowerCase();
  if (t.startsWith("image/")) return true;
  return /\.(heic|heif|jpg|jpeg|png|webp|gif)$/i.test(file.name);
}

/**
 * Last assistant concept sketch as a File for refinement baseline (server prepends to reference parts).
 */
async function conceptDataUrlToRefinementFile(
  dataUrl: string,
  filename: string,
): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type || "image/png" });
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
  const [messages, setMessages] = useState<ChatMessage[]>(
    () => [initialPlannerAssistantMessage()],
  );
  const [draft, setDraft] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [phase, setPhase] = useState<PlannerPhaseTag>("consultation");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const recognitionRef = useRef<any>(null);
  const voiceModeRef = useRef(false);

  // Voice input: Web Speech API (free, built into Chrome/Edge/Safari).
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const SS = (window as any).speechSynthesis;
      setVoiceSupported(!!SR && !!SS);
    }
  }, []);

  // Keep ref in sync for use in callbacks
  useEffect(() => {
    voiceModeRef.current = voiceMode;
  }, [voiceMode]);

  // In voice mode, speak each new assistant message aloud
  const lastSpokenRef = useRef<number>(-1);
  useEffect(() => {
    if (!voiceMode || messages.length === 0) return;
    const lastIdx = messages.length - 1;
    const last = messages[lastIdx];
    if (last.role === "assistant" && lastIdx !== lastSpokenRef.current && last.content) {
      lastSpokenRef.current = lastIdx;
      // Small delay so the UI updates first
      setTimeout(() => speakText(last.content), 300);
    }
  }, [messages, voiceMode]);

  // Speak text aloud using the browser's speech synthesis
  const speakText = (text: string) => {
    if (typeof window === "undefined" || !(window as any).speechSynthesis) return;
    const synth = (window as any).speechSynthesis;
    synth.cancel(); // stop any current speech
    // Strip markdown and keep it conversational
    const clean = text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[*_~`#]/g, "")
      .replace(/\n+/g, ". ")
      .trim();
    if (!clean) return;
    const utter = new SpeechSynthesisUtterance(clean);
    utter.rate = 1.05;
    utter.pitch = 1;
    utter.onstart = () => setIsSpeaking(true);
    utter.onend = () => {
      setIsSpeaking(false);
      // In voice mode, auto-listen for the next turn (free-flowing conversation)
      if (voiceModeRef.current) {
        setTimeout(() => startListening(), 400);
      }
    };
    utter.onerror = () => setIsSpeaking(false);
    synth.speak(utter);
  };

  const startListening = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR || isRecording) return;
    const rec = new SR();
    rec.continuous = false; // single utterance per turn in voice mode
    rec.interimResults = true;
    rec.lang = "en-US";
    const baseText = "";
    rec.onresult = (event: any) => {
      let finalText = "";
      let interimText = "";
      for (let i = 0; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += transcript + " ";
        } else {
          interimText += transcript;
        }
      }
      const combined = (baseText + " " + finalText + interimText).trim().replace(/\s+/g, " ");
      setDraft(combined);
      // Auto-send when we get a final result in voice mode
      if (finalText.trim() && voiceModeRef.current) {
        setTimeout(() => {
          const textToSend = (baseText + " " + finalText).trim();
          if (textToSend) {
            setDraft("");
            sendPlannerMessage(textToSend);
          }
        }, 800);
      }
    };
    rec.onend = () => setIsRecording(false);
    rec.onerror = () => setIsRecording(false);
    recognitionRef.current = rec;
    rec.start();
    setIsRecording(true);
  };

  const toggleVoiceInput = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    const baseText = draft;
    rec.onresult = (event: any) => {
      let finalText = "";
      let interimText = "";
      for (let i = 0; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += transcript + " ";
        } else {
          interimText += transcript;
        }
      }
      const combined = (baseText + " " + finalText + interimText).trim().replace(/\s+/g, " ");
      setDraft(combined);
    };
    rec.onend = () => setIsRecording(false);
    rec.onerror = () => setIsRecording(false);
    recognitionRef.current = rec;
    rec.start();
    setIsRecording(true);
  };
  const [showCreateAccountPrompt, setShowCreateAccountPrompt] = useState(false);
  /** Upload-first opener: show picker until first space photos are sent (then match API gate). */
  const [photoInviteActive, setPhotoInviteActive] = useState(true);
  /** Phase 1 — populated from homeowner messages (display); upload UI follows `hasEarlyPhotoInviteContext`. */
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
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [videoProcessing, setVideoProcessing] = useState(false);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  /** Compressed uploads from earlier turns — re-sent so refinement sketches stay anchored to their room. */
  const sketchSpacePhotosRef = useRef<File[]>([]);

  const previews = useMemo(
    () => images.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [images],
  );

  useEffect(() => {
    // Do NOT restore photos from sessionStorage on mount. The conversation
    // (React state) does not survive reloads, so restored photos would be
    // stale — they'd leak into a fresh conversation and confuse the image
    // generator. Photos only live for the current page session.
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem(SKETCH_PHOTOS_SESSION_KEY);
    }
  }, []);

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
    await sendPlannerMessage();
  }

  /** Sends the draft — or a tapped starter chip — as the next user turn. */
  async function sendPlannerMessage(presetText?: string) {
    const text = presetText?.trim() || draft.trim();

    if (!text && images.length === 0) {
      setError("Type a message or add a photo.");
      return;
    }

    setError(null);
    setSaveStatus(null);
    setShowCreateAccountPrompt(false);

    const draftBefore = draft;

    const userMessage =
      text || "I'm sharing a photo of the space — please take a look.";

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

      if (priorTurnHadConceptImage && lastAssistantBeforeSend?.images?.[0]) {
        const ref = lastAssistantBeforeSend.images[0];
        const refinementFile = await conceptDataUrlToRefinementFile(
          ref.dataUrl,
          "refinement-baseline.png",
        );
        if (refinementFile.size <= MAX_IMAGE_BYTES) {
          formData.append("refinementBaseImage", refinementFile);
          uploadTotalBytes += refinementFile.size;
        }
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

      const userMessagesBlob = payloadMessages
        .filter((m) => m.role === "user")
        .map((m) => m.content.trim())
        .filter(Boolean)
        .join("\n");

      setPhase(data.phase);
      const serverPhotoInvite = Boolean(
        data.showPhotoUploader && hasEarlyPhotoInviteContext(userMessagesBlob),
      );
      const noSpacePhotosSentYet =
        sketchSpacePhotosRef.current.length === 0 && compressedImages.length === 0;
      setPhotoInviteActive(serverPhotoInvite || noSpacePhotosSentYet);

      const assistantImages = data.images?.map((img) => ({
        mimeType: img.mimeType,
        dataUrl: `data:${img.mimeType};base64,${img.data}`,
        ...(img.caption ? { caption: img.caption } : {}),
        ...(img.dimensions?.length ? { dimensions: img.dimensions } : {}),
      }));

      const safeReply = stripPlannerPhaseMarkers(data.reply);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: safeReply,
          ...(data.showSubmitDesignCta ? { showSubmitDesignCta: true } : {}),
          ...(assistantImages?.length ? { images: assistantImages } : {}),
          ...(data.sketchNotUpdated && !assistantImages?.length
            ? { sketchNotUpdated: true }
            : {}),
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
        void persistSketchSpacePhotos(sketchSpacePhotosRef.current);
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

  /** Video walkthrough: upload a narrated walkthrough video, extract the design brief. */
  async function handleVideoChange(fileList: FileList | null) {
    const file = fileList?.[0];
    if (videoInputRef.current) videoInputRef.current.value = "";
    if (!file) return;

    // ~200MB limit via Files API (roughly 10 minutes)
    if (file.size > 200 * 1024 * 1024) {
      setError("Video is too large. Please keep walkthroughs under ~10 minutes.");
      return;
    }

    setVideoProcessing(true);
    setError(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const comma = result.indexOf(",");
          resolve(comma >= 0 ? result.slice(comma + 1) : result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await fetch("/api/planner/video-walkthrough", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoMimeType: file.type || "video/mp4",
          videoDataBase64: base64,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Video processing failed");
      }

      // Post the extracted brief as the user's opening message
      const briefText = `Here's my video walkthrough — I walked through the space describing what I want:\n\n${data.brief}`;
      await sendPlannerMessage(briefText);
      setPhotoInviteActive(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Video processing failed. Please try again.");
    } finally {
      setVideoProcessing(false);
    }
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
    const renderings: {
      mimeType: string;
      dataBase64: string;
      caption?: string;
      dimensions?: Array<{ name: string; expectedIn: number; known: boolean; wallLabel?: string }>;
    }[] = [];
    for (const m of messages) {
      if (m.role !== "assistant" || !m.images?.length) continue;
      for (const img of m.images) {
        const parsed = /^data:([^;]+);base64,(.+)$/i.exec(img.dataUrl.trim());
        if (!parsed) continue;
        const fingerprint = parsed[2].slice(0, 200);
        if (seen.has(fingerprint)) continue;
        seen.add(fingerprint);
        renderings.push({
          mimeType: parsed[1],
          dataBase64: parsed[2],
          ...(img.caption?.trim() ? { caption: img.caption.trim() } : {}),
          ...(img.dimensions?.length ? { dimensions: img.dimensions } : {}),
        });
        if (renderings.length >= 10) break;
      }
      if (renderings.length >= 10) break;
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

      const proposalId = (submitData as { proposalId?: string }).proposalId?.trim();
      router.push(
        proposalId
          ? `/planner/design-submitted?proposal=${encodeURIComponent(proposalId)}`
          : "/planner/design-submitted",
      );
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
        setPhotoInviteActive(false);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [resumedIdeaId, welcome, loadedIdeaId]);

  return (
    <section
      className="flex min-h-[70vh] flex-col rounded-3xl border border-[#e8d9ff] bg-white/80 shadow-sm"
      data-planner-work-category={workCategory ?? ""}
      data-planner-style-preference={stylePreference ?? ""}
    >
      {/* Compact chat header */}
      <div className="flex items-center gap-3 border-b border-[#e8d9ff] px-4 py-3 sm:px-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#6e3eb2] text-lg font-bold text-white">
          A
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-[#31184a]">
            {PLANNER_ASSISTANT_NAME}
          </p>
          <p className="text-xs text-[#6a4a8f]">
            Planning consultant • Concept visuals, no prices in chat
          </p>
        </div>
      </div>

      <div className={`${lu.chatScroll} flex-1 px-4 py-4 sm:px-5`}>
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={
              message.role === "assistant" ? lu.chatAssistant : lu.chatUser
            }
          >
            <div className="whitespace-pre-wrap">
              {message.role === "assistant"
                ? stripPlannerPhaseMarkers(message.content)
                : message.content}
            </div>
            {message.images?.length ? (
              <div className="mt-3">
                <p className="mb-2 rounded-lg border border-[#d9c2ff] bg-[#f5edff] px-3 py-2 text-xs font-semibold leading-relaxed text-[#5b3292]">
                  Concept visualization — shows the general look and feel only.
                  Exact measurements, counts, and details are confirmed in
                  writing in the chat above.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {message.images.map((img, i) => (
                    <div key={`${index}-viz-${i}`}>
                      {img.caption ? (
                        <p className="mb-1 text-xs font-semibold capitalize text-[#5b3292]">
                          {img.caption}
                        </p>
                      ) : null}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.dataUrl}
                        alt={`Concept visualization${img.caption ? ` — ${img.caption}` : ""} — general look and feel only`}
                        className="max-h-56 w-full rounded-xl border border-[#e8d9ff] object-contain"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {message.role === "assistant" &&
            message.sketchNotUpdated &&
            !(message.images?.length ?? 0) ? (
              <p className="mt-3 rounded-lg border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-xs leading-relaxed text-amber-950">
                No new sketch for this reply — your last concept image is still shown above.
              </p>
            ) : null}
            {message.role === "assistant" && message.showSubmitDesignCta && welcome ? (
              <div className="mt-3 border-t border-[#eadbff] pt-3">
                <button
                  type="button"
                  disabled={submitDesignBusy || saveBusy || isLoading || !canSaveConversation}
                  onClick={() => requestSubmitDesignForReview()}
                  className={`${lu.btnSuccess} disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {submitDesignBusy ? "Submitting…" : "Submit design for review"}
                </button>
              </div>
            ) : null}
          </div>
        ))}
        {messages.length === 1 && messages[0]?.role === "assistant" && !isLoading ? (
          <div className="flex flex-wrap gap-2 pt-1" aria-label="Suggested starting prompts">
            {SUGGESTED_STARTERS.map((starter) => (
              <button
                key={starter}
                type="button"
                onClick={() => void sendPlannerMessage(starter)}
                className={`${lu.btnGhost} !py-3 text-left`}
              >
                {starter}
              </button>
            ))}
          </div>
        ) : null}
        {isLoading ? (
          <div className={`${lu.chatAssistant} animate-pulse text-[#6a4a8f]`}>
            {PLANNER_ASSISTANT_NAME} is thinking…
          </div>
        ) : null}
        <div ref={scrollAnchorRef} />
      </div>

      <form id="levelup-planner-form" onSubmit={handleSubmit} className="border-t border-[#e8d9ff] bg-white/60 px-4 py-3 sm:px-5">
        {photoInviteActive ? (
          <div className="mb-3 rounded-2xl border border-dashed border-[#cbb8e8] bg-[#faf7ff] px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#6e3eb2] bg-white px-4 py-2 text-sm font-medium text-[#5b3292] transition hover:bg-[#f5efff]"
              >
                <span aria-hidden>📷</span> Upload photo
              </button>
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#6e3eb2] bg-white px-4 py-2 text-sm font-medium text-[#5b3292] transition hover:bg-[#f5efff]"
              >
                <span aria-hidden>📸</span> Take photo
              </button>
              <button
                type="button"
                onClick={() => videoInputRef.current?.click()}
                disabled={videoProcessing}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#6e3eb2] bg-white px-4 py-2 text-sm font-medium text-[#5b3292] transition hover:bg-[#f5efff] disabled:opacity-50"
                title="Record a video walkthrough while describing what you want — the planner will listen and watch"
              >
                <span aria-hidden>🎥</span> {videoProcessing ? "Watching your video…" : "Video walkthrough"}
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
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                capture="environment"
                className="hidden"
                onChange={(event) => handleVideoChange(event.target.files)}
              />
              <span className="text-xs text-[#6a4a8f]">
                Up to {MAX_IMAGES} photos, {MAX_IMAGE_MB}MB each
              </span>
            </div>

            {previews.length > 0 ? (
              <div className="mt-2.5 grid grid-cols-4 gap-2">
                {previews.map((preview, index) => (
                  <div
                    key={`${preview.file.name}-${index}`}
                    className="relative overflow-hidden rounded-xl border border-[#dcc6fb]"
                  >
                    <Image
                      src={preview.url}
                      alt={preview.file.name}
                      width={160}
                      height={120}
                      unoptimized
                      className="h-16 w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] text-white"
                      aria-label="Remove photo"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-end gap-2">
          {voiceSupported && !voiceMode ? (
            <button
              type="button"
              onClick={() => {
                setVoiceMode(true);
                voiceModeRef.current = true;
                setTimeout(() => startListening(), 300);
              }}
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-[#6e3eb2] bg-white px-4 text-xs font-semibold text-[#5b3292] transition hover:bg-[#f5efff]"
              title="Start a spoken conversation with the planner"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
              Voice chat
            </button>
          ) : null}
          {voiceMode ? (
            <button
              type="button"
              onClick={() => {
                setVoiceMode(false);
                voiceModeRef.current = false;
                recognitionRef.current?.stop();
                if (typeof window !== "undefined" && (window as any).speechSynthesis) {
                  (window as any).speechSynthesis.cancel();
                }
                setIsRecording(false);
                setIsSpeaking(false);
              }}
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-red-600 px-4 text-xs font-semibold text-white transition hover:bg-red-700"
              title="End voice conversation"
            >
              <span className={`h-2 w-2 rounded-full ${isSpeaking ? "animate-pulse bg-white" : isRecording ? "animate-pulse bg-yellow-300" : "bg-white/60"}`} />
              {isSpeaking ? "Speaking…" : isRecording ? "Listening…" : "End voice"}
            </button>
          ) : null}
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={isRecording ? "Listening… speak now" : "Describe what you want to build…"}
            rows={2}
            className={`${lu.textarea} flex-1 resize-none`}
          />
          {voiceSupported && !voiceMode ? (
            <button
              type="button"
              onClick={toggleVoiceInput}
              disabled={isLoading}
              className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-65 ${
                isRecording
                  ? "animate-pulse bg-red-600 text-white hover:bg-red-700"
                  : "border border-[#6e3eb2] bg-white text-[#5b3292] hover:bg-[#f5efff]"
              }`}
              aria-label={isRecording ? "Stop voice input" : "Speak instead of typing"}
              title={isRecording ? "Stop listening" : "Speak instead of typing"}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </button>
          ) : null}
          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#6e3eb2] text-white transition hover:bg-[#5b3292] disabled:cursor-not-allowed disabled:opacity-65"
            aria-label="Send message"
          >
            {isLoading ? (
              <span className="text-sm">…</span>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M22 2L11 13" />
                <path d="M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            )}
          </button>
        </div>

        {error ? <p className={`${lu.alertError} mt-2`}>{error}</p> : null}

        {(welcome || onRequireCreateAccount) ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {welcome ? (
              <button
                type="button"
                disabled={saveBusy || submitDesignBusy || isLoading || !canSaveConversation}
                onClick={() => requestSaveConversation()}
                title={
                  canSaveConversation
                    ? "Save full transcript to Saved Ideas"
                    : "Send a message first to enable saving"
                }
                className="inline-flex items-center justify-center rounded-full border border-[#6e3eb2] bg-white px-4 py-2 text-xs font-semibold text-[#5b3292] transition hover:bg-[#f5efff] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saveBusy ? "Saving…" : "Save design & conversation"}
              </button>
            ) : onRequireCreateAccount ? (
              <button
                type="button"
                disabled={isLoading}
                onClick={onRequireCreateAccount}
                className="inline-flex items-center justify-center rounded-full border border-[#6e3eb2] bg-white px-4 py-2 text-xs font-semibold text-[#5b3292] transition hover:bg-[#f5efff] disabled:opacity-65"
              >
                Save to portal — sign in
              </button>
            ) : null}
            {onViewSavedIdeas ? (
              <button
                type="button"
                onClick={onViewSavedIdeas}
                className="inline-flex items-center justify-center rounded-full border border-[#dcc6fb] bg-white px-4 py-2 text-xs font-semibold text-[#5b3292] transition hover:bg-[#f3ebff]"
              >
                View saved ideas
              </button>
            ) : null}
          </div>
        ) : null}
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
          <div className={`w-full max-w-md ${lu.panel} shadow-[0_20px_50px_-20px_rgba(45,21,70,0.45)]`}>
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

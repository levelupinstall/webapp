"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type PortalView = "saved-projects" | "proposals" | "invoices" | "profile" | "bookings";

type PortalUser = {
  id: string;
  username: string;
  email: string;
  fullName: string;
  serviceAddress: string;
  avatarDataUrl: string;
  carpenterUploads: {
    id: string;
    type: "image" | "video";
    url: string;
    caption: string;
    uploadedAt: string;
  }[];
  spacePhotos: {
    id: string;
    type: "image" | "video";
    url: string;
    caption: string;
    uploadedAt: string;
  }[];
  ideas: {
    id: string;
    title: string;
    notes: string;
    conversation?: {
      messages: Array<{
        role: "user" | "assistant";
        content: string;
        images?: Array<{ mimeType: string; dataUrl: string }>;
      }>;
    };
    createdAt: string;
  }[];
  invoices: {
    id: string;
    projectName: string;
    amountCents: number;
    status: "paid" | "due";
    issuedAt: string;
    billingKind?: "call_out" | "balance" | "work_proposal";
    lineItemsSummary?: string;
  }[];
  projectStatus: { phase: string; updatedAt: string; details: string };
  workProposals: {
    id: string;
    title: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    paymentAmountCents: number;
    viewToken: string;
  }[];
};

function formatProposalStatus(status: string): string {
  switch (status) {
    case "draft":
      return "With Level Up for review";
    case "sent":
      return "Sent — ready to open";
    case "viewed":
      return "Opened";
    case "accepted_pending_payment":
      return "Accepted — payment pending";
    case "paid":
      return "Paid";
    default:
      return status.replace(/_/g, " ");
  }
}

function cadMoneyPortal(cents: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(cents / 100);
}

type ClientPortalProps = {
  initialMode?: "login" | "register";
  selectedView?: PortalView;
  onAuthChange?: (user: PortalUser | null) => void;
  /** Called only after a successful login or registration session (not on session restore). */
  onLoginSuccess?: (user: PortalUser) => void;
};

export default function ClientPortal({
  initialMode = "login",
  selectedView = "saved-projects",
  onAuthChange,
  onLoginSuccess,
}: ClientPortalProps) {
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [user, setUser] = useState<PortalUser | null>(null);
  const [registerFullName, setRegisterFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [ideaTitle, setIdeaTitle] = useState("");
  const [ideaNotes, setIdeaNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileServiceAddress, setProfileServiceAddress] = useState("");
  const [profileAvatar, setProfileAvatar] = useState("");
  const [invoiceCheckoutBusyId, setInvoiceCheckoutBusyId] = useState<string | null>(null);
  const [verificationBanner, setVerificationBanner] = useState<string | null>(null);
  const [authGate, setAuthGate] = useState<null | {
    kind: "login-unverified" | "register-duplicate";
    verificationChannel: string;
    contactHint: string;
  }>(null);
  const [resendBusy, setResendBusy] = useState(false);
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [expandedIdeaId, setExpandedIdeaId] = useState<string | null>(null);
  const router = useRouter();
  const savedProjectsTrackRef = useRef(false);
  const spacePhotosTrackRef = useRef(false);

  const loadMe = useCallback(async (): Promise<PortalUser | null> => {
    const response = await fetch("/api/portal/me");
    if (!response.ok) {
      setUser(null);
      onAuthChange?.(null);
      return null;
    }
    const data = (await response.json()) as { user: PortalUser };
    const normalized: PortalUser = {
      ...data.user,
      workProposals: data.user.workProposals ?? [],
    };
    setUser(normalized);
    onAuthChange?.(normalized);
    setProfileName(normalized.fullName || "");
    setProfileServiceAddress(normalized.serviceAddress || "");
    setProfileAvatar(normalized.avatarDataUrl || "");
    return normalized;
  }, [onAuthChange]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadMe();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadMe]);

  useEffect(() => {
    setAuthGate(null);
    setForgotPasswordOpen(false);
    setForgotMessage(null);
    setForgotError(null);
  }, [mode]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pv = params.get("portal_verify");
    if (!pv) return;
    const messages: Record<string, string> = {
      expired:
        "That confirmation link has expired or was already used. Please create your account again or contact us for help.",
      invalid:
        "That confirmation link is not valid. Try registering again or open the latest email we sent you.",
      missing:
        "We could not read a confirmation link. Open the link directly from your welcome email.",
    };
    setVerificationBanner(messages[pv] ?? "Something went wrong with email confirmation.");
    params.delete("portal_verify");
    const q = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${q ? `?${q}` : ""}`);
  }, []);

  useEffect(() => {
    savedProjectsTrackRef.current = false;
    spacePhotosTrackRef.current = false;
  }, [selectedView, user?.id]);

  useEffect(() => {
    if (!user || selectedView !== "saved-projects") return;
    if (savedProjectsTrackRef.current) return;
    savedProjectsTrackRef.current = true;
    void fetch("/api/portal/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "saved_projects_section" }),
    }).catch(() => {});
  }, [user?.id, selectedView]);

  useEffect(() => {
    if (!user || selectedView !== "saved-projects") return;
    if (!(user.spacePhotos?.length > 0)) return;
    if (spacePhotosTrackRef.current) return;
    spacePhotosTrackRef.current = true;
    void fetch("/api/portal/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "space_photos_section" }),
    }).catch(() => {});
  }, [user?.id, selectedView, user?.spacePhotos?.length]);

  async function handleAuth(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setAuthGate(null);
    if (mode === "login" && forgotPasswordOpen) {
      return;
    }
    setLoading(true);
    try {
      const endpoint = mode === "login" ? "/api/portal/login" : "/api/portal/register";
      const payload =
        mode === "login"
          ? { email: email.trim(), password }
          : {
              fullName: registerFullName.trim(),
              email: email.trim(),
              password,
            };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as {
        error?: string;
        needsVerification?: boolean;
        verificationChannel?: string;
        contactHint?: string;
        unverifiedDuplicate?: boolean;
      };
      if (!response.ok) {
        if (
          mode === "register" &&
          response.status === 409 &&
          data.unverifiedDuplicate
        ) {
          setAuthGate({
            kind: "register-duplicate",
            verificationChannel: data.verificationChannel ?? "email",
            contactHint: data.contactHint ?? "",
          });
          setError(data.error ?? "This account is waiting for verification.");
          return;
        }
        if (mode === "login" && response.status === 403 && data.needsVerification) {
          setAuthGate({
            kind: "login-unverified",
            verificationChannel: data.verificationChannel ?? "email",
            contactHint: data.contactHint ?? "",
          });
          setError(data.error ?? "Your account is not verified yet.");
          return;
        }
        throw new Error(data.error || "Authentication failed.");
      }
      if (data.needsVerification) {
        setPassword("");
        const channel = encodeURIComponent(data.verificationChannel ?? "email");
        const hintRaw = data.contactHint?.trim();
        const hintQs = hintRaw ? `&hint=${encodeURIComponent(hintRaw)}` : "";
        router.push(`/portal/signup-pending?channel=${channel}${hintQs}`);
        return;
      }
      const loggedInUser = await loadMe();
      setPassword("");
      if (loggedInUser) {
        onLoginSuccess?.(loggedInUser);
      }
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Auth failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    setForgotError(null);
    setForgotMessage(null);
    const em = forgotEmail.trim().toLowerCase();
    if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      setForgotError("Enter the email address on your account.");
      return;
    }
    setForgotBusy(true);
    try {
      const response = await fetch("/api/portal/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: em }),
      });
      const data = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(data.error || "Could not send reset email.");
      }
      setForgotMessage(
        data.message ??
          "If an account exists for that email, we sent instructions to reset your password.",
      );
      setForgotEmail("");
    } catch (forgotErr) {
      setForgotError(
        forgotErr instanceof Error ? forgotErr.message : "Could not send reset email.",
      );
    } finally {
      setForgotBusy(false);
    }
  }

  async function handleResendVerification() {
    if (!email.trim() || !password) {
      setError("Enter your email and password, then try sending again.");
      return;
    }
    setError(null);
    setResendBusy(true);
    try {
      const response = await fetch("/api/portal/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = (await response.json()) as {
        error?: string;
        verificationChannel?: string;
        contactHint?: string;
      };
      if (!response.ok) {
        throw new Error(data.error || "Could not send verification.");
      }
      setAuthGate(null);
      setPassword("");
      const channel = encodeURIComponent(data.verificationChannel ?? "email");
      const hintRaw = data.contactHint?.trim();
      const hintQs = hintRaw ? `&hint=${encodeURIComponent(hintRaw)}` : "";
      router.push(`/portal/signup-pending?channel=${channel}${hintQs}&resent=1`);
    } catch (resendErr) {
      setError(resendErr instanceof Error ? resendErr.message : "Could not send verification.");
    } finally {
      setResendBusy(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/portal/logout", { method: "POST" });
    setUser(null);
    onAuthChange?.(null);
  }

  async function handleSpacePhotoUpload(fileList: FileList | null) {
    if (!fileList?.length) return;
    setError(null);
    try {
      for (const file of Array.from(fileList)) {
        const isVideo = file.type.startsWith("video/");
        const isImage = file.type.startsWith("image/");
        if (!isVideo && !isImage) continue;
        if (file.size > 12 * 1024 * 1024) {
          setError(`"${file.name}" is too large (max 12 MB per file).`);
          return;
        }
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(new Error("Could not read file."));
          reader.readAsDataURL(file);
        });
        const response = await fetch("/api/portal/space-photos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: isVideo ? "video" : "image",
            url: dataUrl,
            caption: file.name,
          }),
        });
        const data = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(data.error || "Upload failed.");
      }
      await loadMe();
    } catch (uploadErr) {
      setError(uploadErr instanceof Error ? uploadErr.message : "Could not upload.");
    }
  }

  async function handleAddIdea(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const response = await fetch("/api/portal/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: ideaTitle, notes: ideaNotes }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not save idea.");
      setIdeaTitle("");
      setIdeaNotes("");
      setExpandedIdeaId(null);
      await loadMe();
    } catch (ideaError) {
      setError(ideaError instanceof Error ? ideaError.message : "Could not save.");
    }
  }

  async function handleProfileImageChange(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const file = fileList[0];
    if (!file.type.startsWith("image/")) {
      setProfileError("Please upload an image file.");
      return;
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Could not read selected image."));
      reader.readAsDataURL(file);
    });

    setProfileAvatar(dataUrl);
    setProfileError(null);
  }

  async function handleSaveProfile(event: FormEvent) {
    event.preventDefault();
    setProfileError(null);
    setProfileMessage(null);
    setProfileLoading(true);

    try {
      const response = await fetch("/api/portal/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: profileName,
          serviceAddress: profileServiceAddress,
          avatarDataUrl: profileAvatar,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Could not update profile.");
      }
      setProfileMessage("Profile updated successfully.");
      await loadMe();
    } catch (profileErr) {
      setProfileError(
        profileErr instanceof Error
          ? profileErr.message
          : "Could not update profile.",
      );
    } finally {
      setProfileLoading(false);
    }
  }

  if (!user) {
    return (
      <section className="rounded-3xl border border-[#dac6fb] bg-white p-6 shadow-[0_10px_30px_-20px_rgba(91,33,182,0.55)] sm:p-8">
        <h2 className="text-2xl font-semibold text-[#2d1546] sm:text-3xl">
          Client Account Portal
        </h2>
        <p className="mt-3 text-[#55337b]">
          Create an account to save project ideas, view project status, and download invoices.
        </p>
        {verificationBanner ? (
          <div className="mt-4 rounded-2xl border border-[#c9e8c9] bg-[#f4faf4] px-4 py-3 text-sm text-[#1f4d22]">
            <div className="flex gap-3">
              <p className="min-w-0 flex-1">{verificationBanner}</p>
              <button
                type="button"
                className="shrink-0 text-xs font-semibold text-[#2f7a32] underline"
                onClick={() => setVerificationBanner(null)}
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : null}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              mode === "login" ? "bg-[#6e3eb2] text-white" : "border border-[#6e3eb2] text-[#5b3292]"
            }`}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => setMode("register")}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              mode === "register"
                ? "bg-[#6e3eb2] text-white"
                : "border border-[#6e3eb2] text-[#5b3292]"
            }`}
          >
            Create Account
          </button>
        </div>
        <form className="mt-5 space-y-3" onSubmit={handleAuth}>
          {mode === "register" ? (
            <input
              required
              value={registerFullName}
              onChange={(event) => setRegisterFullName(event.target.value)}
              placeholder="Full name"
              autoComplete="name"
              className="w-full rounded-xl border border-[#dcbef9] bg-white px-3 py-2 text-sm text-[#32174f]"
            />
          ) : null}
          {(mode === "register" || (mode === "login" && !forgotPasswordOpen)) && (
            <input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email"
              autoComplete="email"
              className="w-full rounded-xl border border-[#dcbef9] bg-white px-3 py-2 text-sm text-[#32174f]"
            />
          )}
          {(mode === "register" || (mode === "login" && !forgotPasswordOpen)) && (
            <input
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password (min 8 characters)"
              className="w-full rounded-xl border border-[#dcbef9] bg-white px-3 py-2 text-sm text-[#32174f]"
            />
          )}
          {mode === "login" && !forgotPasswordOpen ? (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setForgotPasswordOpen(true);
                  setForgotMessage(null);
                  setForgotError(null);
                  setError(null);
                  setAuthGate(null);
                }}
                className="text-sm font-semibold text-[#5b3292] underline decoration-[#c9a5f1] underline-offset-4 hover:text-[#4a2381]"
              >
                Forgot password?
              </button>
            </div>
          ) : null}
          {mode === "login" && forgotPasswordOpen ? (
            <div className="rounded-2xl border border-[#e8d9ff] bg-[#faf6ff] px-4 py-4 space-y-3">
              <p className="text-sm text-[#4d2e70]">
                Enter the email address on your account. We&apos;ll send a link to reset your
                password if the account exists and is verified.
              </p>
              <input
                type="email"
                value={forgotEmail}
                onChange={(event) => setForgotEmail(event.target.value)}
                placeholder="Your email"
                autoComplete="email"
                className="w-full rounded-xl border border-[#dcbef9] bg-white px-3 py-2 text-sm text-[#32174f]"
              />
              {forgotError ? <p className="text-sm text-[#a2175d]">{forgotError}</p> : null}
              {forgotMessage ? (
                <p className="text-sm font-medium text-[#2f7a32]">{forgotMessage}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={forgotBusy}
                  onClick={() => void handleForgotPassword()}
                  className="rounded-full bg-[#6e3eb2] px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {forgotBusy ? "Sending…" : "Send reset link"}
                </button>
                <button
                  type="button"
                  disabled={forgotBusy}
                  onClick={() => {
                    setForgotPasswordOpen(false);
                    setForgotEmail("");
                    setForgotMessage(null);
                    setForgotError(null);
                  }}
                  className="rounded-full border border-[#6e3eb2] px-5 py-2 text-sm font-semibold text-[#5b3292]"
                >
                  Back to login
                </button>
              </div>
            </div>
          ) : null}
          {error ? <p className="text-sm text-[#a2175d]">{error}</p> : null}
          {authGate && !(mode === "login" && forgotPasswordOpen) ? (
            <div className="rounded-2xl border border-[#e8d9ff] bg-[#faf6ff] px-4 py-4">
              <p className="text-sm text-[#4d2e70]">
                {authGate.contactHint ? (
                  <>
                    We will send to{" "}
                    <span className="font-semibold text-[#2f1748]">{authGate.contactHint}</span>
                    {authGate.verificationChannel === "sms" ? " by text." : "."}
                  </>
                ) : authGate.verificationChannel === "sms" ? (
                  <>We will send a new text with your verification code.</>
                ) : (
                  <>We will send a new confirmation email.</>
                )}
              </p>
              <button
                type="button"
                disabled={resendBusy || loading}
                onClick={() => void handleResendVerification()}
                className="mt-3 rounded-full bg-[#6e3eb2] px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {resendBusy
                  ? "Sending…"
                  : authGate.verificationChannel === "sms"
                    ? "Send new verification text"
                    : "Send new verification email"}
              </button>
            </div>
          ) : null}
          {!(mode === "login" && forgotPasswordOpen) ? (
            <button
              type="submit"
              disabled={loading}
              className="rounded-full bg-[#6e3eb2] px-5 py-2 text-sm font-semibold text-white"
            >
              {loading ? "Please wait..." : mode === "login" ? "Login" : "Create Account"}
            </button>
          ) : null}
        </form>
      </section>
    );
  }

  const displayName = user.fullName?.trim() || user.email || user.username;

  return (
    <section className="rounded-3xl border border-[#dac6fb] bg-white p-6 shadow-[0_10px_30px_-20px_rgba(91,33,182,0.55)] sm:p-8">
      {verificationBanner ? (
        <div className="mb-5 rounded-2xl border border-[#c9e8c9] bg-[#f4faf4] px-4 py-3 text-sm text-[#1f4d22]">
          <div className="flex gap-3">
            <p className="min-w-0 flex-1">{verificationBanner}</p>
            <button
              type="button"
              className="shrink-0 text-xs font-semibold text-[#2f7a32] underline"
              onClick={() => setVerificationBanner(null)}
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-[#2d1546] sm:text-3xl">
            Welcome, {displayName}
          </h2>
          <p className="text-[#55337b]">{user.email}</p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="rounded-full border border-[#6e3eb2] px-4 py-2 text-sm font-semibold text-[#5b3292]"
        >
          Logout
        </button>
      </div>

      {selectedView === "saved-projects" ? (
        <div className="mt-6 rounded-2xl border border-[#e8d9ff] p-4">
          <h3 className="font-semibold text-[#2f1748]">Saved Ideas</h3>
          <form className="mt-3 space-y-2" onSubmit={handleAddIdea}>
            <input
              required
              value={ideaTitle}
              onChange={(event) => setIdeaTitle(event.target.value)}
              placeholder="Idea title"
              className="w-full rounded-xl border border-[#dcbef9] px-3 py-2 text-sm"
            />
            <textarea
              required
              value={ideaNotes}
              onChange={(event) => setIdeaNotes(event.target.value)}
              rows={3}
              placeholder="Idea details..."
              className="w-full rounded-xl border border-[#dcbef9] px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-full bg-[#6e3eb2] px-4 py-2 text-sm font-semibold text-white"
            >
              Save Idea
            </button>
          </form>
          <div className="mt-4 space-y-2">
            {user.ideas.length === 0 ? (
              <p className="text-sm text-[#6a4a8f]">No saved ideas yet.</p>
            ) : (
              user.ideas.map((idea) => (
                <div key={idea.id} className="rounded-xl border border-[#eddfff] p-3">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedIdeaId((prev) => (prev === idea.id ? null : idea.id))
                    }
                    className="flex w-full items-center justify-between gap-3 text-left"
                  >
                    <span className="font-semibold text-[#2f1748]">{idea.title}</span>
                    <span className="text-xs font-semibold text-[#6a4a8f]">
                      {expandedIdeaId === idea.id ? "Hide" : "Open"}
                    </span>
                  </button>
                  {expandedIdeaId === idea.id ? (
                    <div className="mt-3 space-y-3 border-t border-[#f0e8ff] pt-3">
                      {idea.conversation?.messages?.length ? (
                        <div className="space-y-3">
                          {idea.conversation.messages.map((m, idx) => (
                            <div
                              key={`${idea.id}-m-${idx}`}
                              className={`rounded-xl px-3 py-2 text-sm ${
                                m.role === "assistant"
                                  ? "bg-[#faf6ff] text-[#3e2560]"
                                  : "ml-auto max-w-[92%] bg-[#6e3eb2] text-white"
                              }`}
                            >
                              <p className="whitespace-pre-wrap">{m.content}</p>
                              {m.images?.length ? (
                                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                  {m.images.map((img, i) => (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      key={`${idea.id}-img-${idx}-${i}`}
                                      src={img.dataUrl}
                                      alt="Saved design image"
                                      className="max-h-52 w-full rounded-lg border border-[#e8d9ff] object-contain"
                                    />
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap text-sm text-[#4d2e70]">{idea.notes}</p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => router.push(`/?section=planner&idea=${encodeURIComponent(idea.id)}`)}
                          className="rounded-full bg-[#6e3eb2] px-4 py-2 text-xs font-semibold text-white sm:text-sm"
                        >
                          Continue in design tool
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>

          <div className="mt-8 border-t border-[#e8d9ff] pt-6">
            <h4 className="font-semibold text-[#2f1748]">Photos & videos of your space</h4>
            <p className="mt-1 text-sm text-[#55337b]">
              Upload current room photos or short clips so your carpenter sees real conditions and can
              match expectations before arriving.
            </p>
            <label className="mt-3 block cursor-pointer rounded-xl border border-[#dcc6fb] bg-[#faf6ff] px-3 py-2 text-sm">
              <span className="font-semibold text-[#31184a]">Add images or video</span>
              <input
                type="file"
                accept="image/*,video/*"
                multiple
                className="mt-2 block w-full text-xs text-[#4a2a69] file:mr-3 file:rounded-full file:border-0 file:bg-[#ede0ff] file:px-3 file:py-2 file:font-semibold file:text-[#4a2381]"
                onChange={(event) => void handleSpacePhotoUpload(event.target.files)}
              />
            </label>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {(user.spacePhotos ?? []).length ? (
                (user.spacePhotos ?? []).map((photo) => (
                  <div key={photo.id} className="overflow-hidden rounded-xl border border-[#eddfff]">
                    {photo.type === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photo.url}
                        alt={photo.caption}
                        className="h-44 w-full object-cover"
                      />
                    ) : (
                      <video controls className="h-44 w-full object-cover" src={photo.url} />
                    )}
                    <p className="border-t border-[#f0e8ff] px-2 py-1 text-xs text-[#4d2e70]">
                      {photo.caption}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[#6a4a8f]">No uploads yet.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {selectedView === "proposals" ? (
        <div className="mt-6 rounded-2xl border border-[#e8d9ff] p-4">
          <h3 className="font-semibold text-[#2f1748]">Formal proposals</h3>
          <p className="mt-1 text-sm text-[#6a4a8f]">
            After you request a proposal from the planner, drafts appear here. Once Level Up emails your link,
            open it to review visuals, terms, accept, and pay.
          </p>
          <div className="mt-4 space-y-3">
            {(user.workProposals ?? []).length === 0 ? (
              <p className="text-sm text-[#6a4a8f]">
                No proposals yet. Use{" "}
                <span className="font-semibold text-[#4d2e70]">Request formal proposal</span> in the planner
                when you&apos;re signed in.
              </p>
            ) : (
              (user.workProposals ?? []).map((p) => {
                const canOpen = p.status !== "draft";
                const href = `/portal/proposal?t=${encodeURIComponent(p.viewToken)}`;
                return (
                  <div
                    key={p.id}
                    className="flex flex-col gap-3 rounded-xl border border-[#eddfff] p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[#2f1748]">{p.title}</p>
                      <p className="text-sm text-[#4d2e70]">
                        {formatProposalStatus(p.status)} · {cadMoneyPortal(p.paymentAmountCents)} · Updated{" "}
                        {new Date(p.updatedAt).toLocaleString()}
                      </p>
                      {p.status === "draft" ? (
                        <p className="mt-2 text-xs text-[#6a4a8f]">
                          Level Up is preparing this draft. You&apos;ll get an email when it&apos;s ready to
                          sign.
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {canOpen ? (
                        <a
                          href={href}
                          className="inline-flex items-center justify-center rounded-full bg-[#6e3eb2] px-4 py-2 text-xs font-semibold text-white sm:text-sm"
                        >
                          Open proposal
                        </a>
                      ) : (
                        <span className="inline-flex items-center justify-center rounded-full border border-[#dcc6fb] px-4 py-2 text-xs font-semibold text-[#6a4a8f] sm:text-sm">
                          Not shared yet
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}

      {selectedView === "invoices" ? (
        <div className="mt-6 rounded-2xl border border-[#e8d9ff] p-4">
          <h3 className="font-semibold text-[#2f1748]">Invoices</h3>
          <p className="mt-1 text-sm text-[#6a4a8f]">
            Pay open balance invoices securely with Stripe. After payment, status updates to paid
            automatically.
          </p>
          <div className="mt-3 space-y-2">
            {user.invoices.map((invoice) => (
              <div
                key={invoice.id}
                className="flex flex-col gap-3 rounded-xl border border-[#eddfff] p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[#2f1748]">{invoice.projectName}</p>
                  <p className="text-sm text-[#4d2e70]">
                    ${(invoice.amountCents / 100).toFixed(2)} CAD ·{" "}
                    <span className={invoice.status === "due" ? "font-semibold text-[#b45309]" : ""}>
                      {invoice.status === "due" ? "Payment due" : "Paid"}
                    </span>
                  </p>
                  {invoice.lineItemsSummary?.trim() ? (
                    <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-[#6a4a8f]">
                      {invoice.lineItemsSummary}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {invoice.status === "due" ? (
                    <button
                      type="button"
                      disabled={invoiceCheckoutBusyId === invoice.id}
                      onClick={() => {
                        void (async () => {
                          setError(null);
                          setInvoiceCheckoutBusyId(invoice.id);
                          try {
                            const response = await fetch(
                              `/api/portal/invoices/${encodeURIComponent(invoice.id)}/checkout`,
                              { method: "POST" },
                            );
                            const data = (await response.json()) as { error?: string; url?: string };
                            if (!response.ok) {
                              throw new Error(data.error || "Could not start checkout.");
                            }
                            if (data.url) window.location.href = data.url;
                          } catch (checkoutErr) {
                            setError(
                              checkoutErr instanceof Error
                                ? checkoutErr.message
                                : "Checkout failed.",
                            );
                          } finally {
                            setInvoiceCheckoutBusyId(null);
                          }
                        })();
                      }}
                      className="rounded-full bg-[#6e3eb2] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60 sm:text-sm"
                    >
                      {invoiceCheckoutBusyId === invoice.id ? "Opening…" : "Pay with Stripe"}
                    </button>
                  ) : null}
                  <a
                    href={`/api/portal/invoices/${invoice.id}/download`}
                    className="inline-flex items-center justify-center rounded-full border border-[#6e3eb2] px-4 py-2 text-xs font-semibold text-[#5b3292] sm:text-sm"
                  >
                    Download PDF
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {selectedView === "profile" ? (
        <div className="mt-6 rounded-2xl border border-[#e8d9ff] p-4">
          <h3 className="font-semibold text-[#2f1748]">Profile</h3>
          <p className="mt-1 text-sm text-[#4d2e70]">
            Update your display picture, full name, and service address.
          </p>
          <form className="mt-4 space-y-3" onSubmit={handleSaveProfile}>
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 overflow-hidden rounded-full border border-[#dcc6fb] bg-[#f5efff]">
                {profileAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profileAvatar}
                    alt="Profile avatar"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-[#6e3eb2]">
                    No Photo
                  </div>
                )}
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={(event) =>
                  void handleProfileImageChange(event.target.files)
                }
                className="block w-full text-sm text-[#4a2a69] file:mr-3 file:rounded-full file:border-0 file:bg-[#ede0ff] file:px-3 file:py-2 file:font-semibold file:text-[#4a2381]"
              />
            </div>
            <input
              required
              value={profileName}
              onChange={(event) => setProfileName(event.target.value)}
              placeholder="Full Name"
              className="w-full rounded-xl border border-[#dcbef9] px-3 py-2 text-sm text-[#32174f]"
            />
            <input
              required
              value={profileServiceAddress}
              onChange={(event) => setProfileServiceAddress(event.target.value)}
              placeholder="Service Address"
              className="w-full rounded-xl border border-[#dcbef9] px-3 py-2 text-sm text-[#32174f]"
            />
            {profileError ? (
              <p className="text-sm text-[#a2175d]">{profileError}</p>
            ) : null}
            {profileMessage ? (
              <p className="text-sm text-[#2f7a32]">{profileMessage}</p>
            ) : null}
            <button
              type="submit"
              disabled={profileLoading}
              className="rounded-full bg-[#6e3eb2] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {profileLoading ? "Saving..." : "Save Profile"}
            </button>
          </form>
        </div>
      ) : null}

      {selectedView === "bookings" ? (
        <div className="mt-6 rounded-2xl border border-[#e8d9ff] p-4">
          <h3 className="font-semibold text-[#2f1748]">Bookings</h3>
          <div className="mt-3 rounded-2xl border border-[#e8d9ff] bg-[#faf6ff] p-4">
            <h4 className="font-semibold text-[#2f1748]">Project Status</h4>
            <p className="mt-1 text-sm text-[#4d2e70]">
              {user.projectStatus.phase} - {user.projectStatus.details}
            </p>
            <p className="text-xs text-[#6a4a8f]">
              Updated: {new Date(user.projectStatus.updatedAt).toLocaleString()}
            </p>
          </div>

          <div className="mt-4">
            <h4 className="font-semibold text-[#2f1748]">
              Carpenter Uploads (Photos/Videos)
            </h4>
            {user.carpenterUploads.length === 0 ? (
              <p className="mt-2 text-sm text-[#6a4a8f]">
                No uploads yet. Your carpenter will add progress media here.
              </p>
            ) : (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {user.carpenterUploads.map((upload) => (
                  <div
                    key={upload.id}
                    className="rounded-xl border border-[#eddfff] p-3"
                  >
                    {upload.type === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={upload.url}
                        alt={upload.caption}
                        className="h-40 w-full rounded-lg object-cover"
                      />
                    ) : (
                      <video
                        controls
                        className="h-40 w-full rounded-lg object-cover"
                        src={upload.url}
                      />
                    )}
                    <p className="mt-2 text-sm text-[#4d2e70]">{upload.caption}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}


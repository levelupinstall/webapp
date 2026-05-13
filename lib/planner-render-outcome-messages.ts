import { PLANNER_ASSISTANT_NAME } from "@/lib/planner-brand";
import type { LayoutConflict } from "@/lib/planner-render-guard";

function trimJoin(base: string, block: string): string {
  return `${base.trim()}\n\n${block.trim()}`;
}

/** When blueprint vs. spec disagree — no visualization until resolved. */
export function appendLayoutConflictNotice(
  cleanReply: string,
  conflicts: LayoutConflict[],
): string {
  if (conflicts.length === 0) return cleanReply;
  const bullets = conflicts
    .map((c, i) => `${i + 1}. **${c.code}** — ${c.detail}\n   → ${c.clarifyingQuestion}`)
    .join("\n\n");
  const block = `**Visualization paused (layout check)**  
${PLANNER_ASSISTANT_NAME} won’t run a concept image until the **numbers in chat** match the **structural blueprint** we would generate — otherwise you could see something that doesn’t match what you asked for.

Here’s what didn’t line up yet:

${bullets}

Once you reply with the clarifications above, we’ll realign the layout lock and try the rendering again on your next message.

**Reach-out (optional but helpful)** — if you’d like a quick call once we’ve sorted the numbers, share your **best phone number** and **good times** (days + morning/afternoon/evening).`;
  return trimJoin(cleanReply, block);
}

/**
 * When no image is delivered (pipeline error, refusal, or conflict already explained elsewhere).
 * Honest copy + human follow-up + phone/callback ask (accuracy over “something pretty”).
 */
export function appendVisualizationUnavailableNotice(
  cleanReply: string,
  params: { technicalDetail?: string | null; skipIfConflictBlockPresent?: boolean },
): string {
  const lower = cleanReply.toLowerCase();
  if (
    params.skipIfConflictBlockPresent &&
    lower.includes("visualization paused (layout check)")
  ) {
    return cleanReply;
  }
  const tech = params.technicalDetail?.trim();
  const techLine = tech
    ? `\n(Technical note for support: ${tech.slice(0, 280)}${tech.length > 280 ? "…" : ""})`
    : "";

  const block = `**There was an error creating the rendering**  
This planner uses AI tools that are **not perfect**. Rather than show you a picture that might **look** fine but **doesn’t match** what we’ve locked in from your conversation, we’re **not** attaching a concept image for this turn.${techLine}

**What happens next**  
A member of the Level Up team will **review this thread** (including your photos and notes), figure out what went wrong, and **get back to you**.

**So we can reach you** — please share your **best phone number** and **good times for a quick call** (days of week + morning/afternoon/evening works great).`;

  return trimJoin(cleanReply, block);
}

/**
 * Sales handoff helpers for the AI planner.
 *
 * Once a homeowner likes a concept, the planner pivots into a light sales flow:
 * agree on a callback time with Tom, then (server-side) record it and move the
 * portal profile through the CRM pipeline in the background.
 */

export type ParsedCallTime = {
  /** When the call should happen (exact instant). */
  scheduledFor: Date;
  /** Human label in America/Toronto, e.g. "Tuesday, October 6 at 2:00 PM". */
  label: string;
};

const TORONTO_TZ = "America/Toronto";

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

function torontoParts(date: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
} {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: TORONTO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(date).map((p) => [p.type, p.value]),
  );
  const weekdayName = String(parts.weekday ?? "").toLowerCase();
  const weekday =
    ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].findIndex((w) =>
      weekdayName.startsWith(w),
    );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    weekday: weekday < 0 ? 0 : weekday,
  };
}

/** Offset of America/Toronto from UTC at the given instant, in ms. */
function torontoOffsetMs(instant: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: TORONTO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(instant).map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - instant.getTime();
}

/** Build a Date for a Toronto-local wall-clock time. */
function torontoWallClock(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  // Iterate twice so DST transitions resolve.
  for (let i = 0; i < 2; i++) {
    guess = new Date(Date.UTC(year, month - 1, day, hour, minute) - torontoOffsetMs(guess));
  }
  return guess;
}

function addDaysToronto(
  base: ReturnType<typeof torontoParts>,
  days: number,
): { year: number; month: number; day: number } {
  const utc = Date.UTC(base.year, base.month - 1, base.day) + days * 86_400_000;
  const d = new Date(utc);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

function formatCallLabel(date: Date): string {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: TORONTO_TZ,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return dtf.format(date);
}

type TimeOfDay = { hour: number; minute: number } | null;

function parseTimeOfDay(text: string): TimeOfDay {
  const t = text.toLowerCase();
  // Explicit clock times: "2pm", "2:30 pm", "14:00", "2 p.m."
  const clock = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/);
  if (clock) {
    let hour = Number(clock[1]);
    const minute = Number(clock[2] ?? 0);
    const pm = clock[3].startsWith("p");
    if (hour < 1 || hour > 12 || minute > 59) return null;
    if (pm && hour !== 12) hour += 12;
    if (!pm && hour === 12) hour = 0;
    return { hour, minute };
  }
  const military = t.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (military) {
    return { hour: Number(military[1]), minute: Number(military[2]) };
  }
  if (/\bnoon\b/.test(t)) return { hour: 12, minute: 0 };
  if (/\bmorning\b/.test(t)) return { hour: 10, minute: 0 };
  if (/\bafternoon\b/.test(t)) return { hour: 14, minute: 0 };
  if (/\bevening\b/.test(t)) return { hour: 18, minute: 0 };
  return null;
}

/**
 * Parse a concrete callback time from free text, interpreted in
 * America/Toronto. Understands "today/tomorrow", weekday names (with optional
 * "next"), and clock times or morning/afternoon/evening.
 * Returns null when the text has no concrete day+time (e.g. "sometime next
 * week", "weekdays are fine").
 */
export function parseCallWindow(text: string, now: Date = new Date()): ParsedCallTime | null {
  const t = text.toLowerCase().trim();
  if (t.length < 3) return null;

  const tod = parseTimeOfDay(t);
  const nowParts = torontoParts(now);

  let targetDate: { year: number; month: number; day: number } | null = null;

  if (/\btoday\b|\btonight\b/.test(t)) {
    targetDate = { year: nowParts.year, month: nowParts.month, day: nowParts.day };
  } else if (/\btomorrow\b/.test(t)) {
    targetDate = addDaysToronto(nowParts, 1);
  } else {
    const nextMatch = t.match(/\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
    const dayMatch =
      nextMatch ??
      t.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
    if (dayMatch) {
      const wanted = WEEKDAYS.indexOf(dayMatch[1] as (typeof WEEKDAYS)[number]);
      let delta = (wanted - nowParts.weekday + 7) % 7;
      if (nextMatch) {
        delta = delta === 0 ? 7 : delta + 7;
      }
      targetDate = addDaysToronto(nowParts, delta);
      // Bare weekday earlier today (or time already passed) rolls to next week.
      if (!nextMatch && tod) {
        const candidate = torontoWallClock(
          targetDate.year,
          targetDate.month,
          targetDate.day,
          tod.hour,
          tod.minute,
        );
        if (candidate.getTime() <= now.getTime() + 30 * 60_000) {
          targetDate = addDaysToronto(nowParts, delta + 7);
        }
      }
    }
  }

  if (!targetDate || !tod) return null;

  const scheduledFor = torontoWallClock(
    targetDate.year,
    targetDate.month,
    targetDate.day,
    tod.hour,
    tod.minute,
  );
  if (scheduledFor.getTime() <= now.getTime()) return null;
  return { scheduledFor, label: formatCallLabel(scheduledFor) };
}

/**
 * Extract a North-American 10-digit phone number from free text.
 * Returns the digits (leading 1 stripped) or null.
 */
export function extractPhoneNumber(text: string): string | null {
  const m = text.match(/(?:\+?1[\s.-]?)?\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})/);
  if (!m) return null;
  return `${m[1]}${m[2]}${m[3]}`;
}

/** True when the message mentions timing but nothing concrete enough to book. */
export function mentionsVagueTiming(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /next week|sometime|whenever|flexible|weekdays|weekends/.test(t) &&
    !parseCallWindow(text)
  );
}

/** CRM pipeline phases for a portal profile after the design stage. */
export const SALES_PIPELINE_PHASES = {
  planning: "Planning",
  designApproved: "Design approved",
  callScheduled: "Call scheduled",
} as const;

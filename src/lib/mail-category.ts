import type { MailItem } from "@/lib/types";

// Client-safe mail categorisation (no googleapis import) so both the Gmail sync and the
// Mail tab can use it.

export type MailCategory = MailItem["category"];

/** Categories shown on the Mail tab. Support mail is detected but skipped (read in Gmail). */
export const MAIL_CATEGORIES: { id: MailCategory; label: string }[] = [
  { id: "leave", label: "Leaves/WFH" },
  { id: "meeting", label: "Meetings" },
  { id: "sprint", label: "Sprint costing" },
  { id: "other", label: "Others" },
];

const MEETING_SUBJECT_PREFIXES = [
  "invitation:",
  "updated invitation",
  "proposed new time:",
  "accepted:",
  "declined:",
  "tentatively accepted",
  "canceled event",
  "cancelled event",
  "invitation from google calendar",
];

const MEETING_SUBJECT_PATTERN = /\bmeetings?\b|\bsync up\b|\bcatch up\b|\b1:1\b|\bstandup\b|\breview call\b/;

const LEAVE_SUBJECT_PATTERN =
  /\bleaves?\b|\bwfh\b|\bwork from home\b|\bout of office\b|\booo\b|\bsick\b|\bhalf[ -]day\b|\bcomp[ -]off\b|\bvacation\b|\btime off\b|\bholiday request\b/;

const SUPPORT_SUBJECT_KEYWORDS = [
  "[support]",
  "support ticket",
  "helpdesk",
  "ticket #",
  "zendesk",
  "freshdesk",
  "player issue",
  "bug report",
  // Freshdesk tickets forwarded by the cryptogram@ group
  "feedback on cryptogram",
  "need some help on cryptogram",
];

// Sprint costing threads, e.g. "Re: Android Build 1.192 Thread" / "iOS Release 1.80 Thread".
// The space before "Thread" is optional: a subject typed as "Android Build 1.202Thread" still counts.
export const SPRINT_SUBJECT_PATTERN = /\b(android build|ios release)\s+\d+\.\d+\s*thread\b/i;

/** Keyword-based category for a message. Rules are checked sprint → meeting → leave → support. */
export function categorizeMail(subject: string, from: string): MailCategory {
  const s = subject.toLowerCase().trim();
  const f = from.toLowerCase();

  if (SPRINT_SUBJECT_PATTERN.test(s)) return "sprint";
  if (
    MEETING_SUBJECT_PREFIXES.some((p) => s.startsWith(p)) ||
    f.includes("calendar-notification@google.com") ||
    MEETING_SUBJECT_PATTERN.test(s)
  ) {
    return "meeting";
  }
  if (LEAVE_SUBJECT_PATTERN.test(s)) return "leave";
  if (
    SUPPORT_SUBJECT_KEYWORDS.some((k) => s.includes(k)) ||
    f.includes("support@") ||
    ["helpdesk", "zendesk", "freshdesk"].some((k) => f.includes(k))
  ) {
    return "support";
  }
  return "other";
}

/**
 * Category to show for an item. Legacy items in the store may still carry the old
 * "internal"/"vendor" values; those are re-categorised from subject/from on the fly.
 */
export function resolveMailCategory(
  item: Pick<MailItem, "subject" | "from"> & { category?: string }
): MailCategory {
  // Category is never user-edited, so recompute it: rule changes then apply without a re-sync.
  return categorizeMail(item.subject, item.from);
}

/** Thread key: subject without Re:/Fwd: prefixes, case and whitespace normalised. */
export function mailThreadKey(subject: string): string {
  return subject
    .replace(/^\s*((re|fwd?|aw|wg)\s*(\[\d+\])?\s*:\s*)+/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Short sender label: display-name part if present, else the email local-part. */
export function mailSenderLabel(from: string): string {
  const named = from.match(/^\s*"?([^"<]+?)"?\s*</);
  if (named?.[1]) return named[1].trim();
  const email = (from.match(/<([^>]+)>/)?.[1] ?? from).trim();
  const at = email.indexOf("@");
  return at > 0 ? email.slice(0, at) : email;
}

const pad = (n: number) => String(n).padStart(2, "0");
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Compact received time: "10:42" today, weekday within the last 6 days, else "3 Oct". */
export function formatMailTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (dayDiff === 0) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (dayDiff > 0 && dayDiff < 7) return WEEKDAYS[d.getDay()];
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

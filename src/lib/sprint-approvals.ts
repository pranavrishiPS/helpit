import type {
  DashboardStore,
  MailItem,
  Release,
  SprintApproval,
  SprintApprovalParty,
} from "./types";
import { formatSprintApprovalTitle } from "./utils";
import { SPRINT_SUBJECT_PATTERN } from "./mail-category";

/** Who signs off each column. Matched case-insensitively against the email in `from`. */
export const SPRINT_APPROVAL_SENDERS: Record<SprintApprovalParty, string[]> = {
  gm: ["amitsrivastava@playsimple.in"],
  dev: ["uttamk@playsimple.in", "ayushupadhyay@playsimple.in"],
  qa: ["rohankarir@playsimple.in", "manvithakur@playsimple.in"],
};

/** "android:1.192" / "ios:1.80" for build titles and mail subjects; lowercased text otherwise. */
export function approvalKey(title: string, platform?: Release["platform"]): string {
  const lower = title.toLowerCase();
  const version = title.match(/(\d+\.\d+)/)?.[1];
  if (!version) return lower.trim();

  if (lower.includes("android") || platform === "android") return `android:${version}`;
  if (lower.includes("ios") || platform === "ios") return `ios:${version}`;
  return lower.trim();
}

const PARTIES: SprintApprovalParty[] = ["gm", "dev", "qa"];

/**
 * Creates a row for each build with a sprint thread in mail ("Android Build 1.200 Thread")
 * but no approval row yet (matched by approvalKey). Run applyMailApprovals afterwards to
 * tick parties and set sentAt. Idempotent; returns the same array when nothing was added.
 */
export function addApprovalsFromMail(
  approvals: SprintApproval[],
  mailItems: MailItem[],
  now: string = new Date().toISOString()
): SprintApproval[] {
  const known = new Set(approvals.map((a) => approvalKey(a.title, a.platform)));

  const added: SprintApproval[] = [];
  for (const mail of mailItems) {
    const subject = mail.subject ?? "";
    if (!SPRINT_SUBJECT_PATTERN.test(subject)) continue;
    const key = approvalKey(subject);
    const match = key.match(/^(android|ios):(\d+\.\d+)$/);
    if (!match || known.has(key)) continue;
    known.add(key);

    const platform = match[1] as "android" | "ios";
    added.push({
      id: `sprint-approval-mail-${platform}-${match[2]}`,
      title: formatSprintApprovalTitle(match[2], platform),
      platform,
      source: "mail",
      approvals: { gm: false, dev: false, qa: false },
      createdAt: now,
      updatedAt: now,
    });
  }

  return added.length > 0 ? [...added, ...approvals] : approvals;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

/** The sender's own reply text: everything before the quoted "On <date> ... wrote:" header. */
export function ownReplyText(snippet: string): string {
  const text = decodeEntities(snippet);
  const quoteStart = text.search(/\bOn\s[\s\S]{0,300}?\bwrote:/i);
  const original = text.search(/-{2,}\s*Original Message/i);
  const cuts = [quoteStart, original].filter((i) => i >= 0);
  return cuts.length > 0 ? text.slice(0, Math.min(...cuts)) : text;
}

function senderEmail(from: string): string {
  const decoded = decodeEntities(from);
  return (decoded.match(/[^\s<>"']+@[^\s<>"']+/)?.[0] ?? decoded).trim().toLowerCase();
}

function mailParty(from: string): SprintApprovalParty | undefined {
  const email = senderEmail(from);
  return PARTIES.find((party) =>
    SPRINT_APPROVAL_SENDERS[party].some((s) => s.toLowerCase() === email)
  );
}

/** "can't approve", "do not approve", "won't approve", "not approve(d)", "never approved". */
const NEGATED_APPROVE =
  /\b(?:not|never|cannot|can['’]?t|don['’]?t|won['’]?t|isn['’]?t|wasn['’]?t)\s+(?:yet\s+|be\s+)?approved?\b/i;

function saysApproved(text: string): boolean {
  // \b keeps "unapproved" out; any negated phrasing disqualifies the reply.
  return /\bapproved\b/i.test(text) && !NEGATED_APPROVE.test(text);
}

function isApprovalEvidence(party: SprintApprovalParty, text: string): boolean {
  if (saysApproved(text)) return true;
  // Dev/QA sign off by sharing their costing.
  return party !== "gm" && /\bcosting\b/i.test(text);
}

interface MailEvidence {
  parties: Set<SprintApprovalParty>;
  /** Earliest receivedAt of any mail on this build's thread. */
  firstReceivedAt?: string;
}

/** Build key → approval evidence in mail. Only platform:version keys count. */
function mailEvidence(mailItems: MailItem[]): Map<string, MailEvidence> {
  const evidence = new Map<string, MailEvidence>();
  for (const mail of mailItems) {
    const key = approvalKey(mail.subject ?? "");
    if (!/^(android|ios):/.test(key)) continue;
    const entry = evidence.get(key) ?? { parties: new Set<SprintApprovalParty>() };
    evidence.set(key, entry);
    if (mail.receivedAt && (!entry.firstReceivedAt || mail.receivedAt < entry.firstReceivedAt)) {
      entry.firstReceivedAt = mail.receivedAt;
    }
    const party = mailParty(mail.from ?? "");
    if (party && isApprovalEvidence(party, ownReplyText(mail.summary ?? ""))) {
      entry.parties.add(party);
    }
  }
  return evidence;
}

/**
 * Ticks parties whose approval/costing is found in mail, and marks the approval mail as
 * sent when its thread exists. Only ever sets values, never clears them, and skips
 * anything the user overrode. Returns the same array when unchanged.
 */
export function applyMailApprovals(
  approvals: SprintApproval[],
  mailItems: MailItem[],
  now: string = new Date().toISOString()
): SprintApproval[] {
  if (approvals.length === 0 || mailItems.length === 0) return approvals;
  const evidence = mailEvidence(mailItems);
  if (evidence.size === 0) return approvals;

  let changed = false;
  const next = approvals.map((approval) => {
    const found = evidence.get(approvalKey(approval.title, approval.platform));
    if (!found) return approval;

    const setSent =
      !approval.sentAt && approval.sentOverride == null && !!found.firstReceivedAt;
    const toTick = PARTIES.filter(
      (party) =>
        found.parties.has(party) &&
        !approval.approvals[party] &&
        approval.overrides?.[party] == null
    );
    if (toTick.length === 0 && !setSent) return approval;
    changed = true;

    const updated: SprintApproval = { ...approval, updatedAt: now };
    if (setSent) {
      updated.sentAt = found.firstReceivedAt;
      updated.autoSent = true;
    }
    if (toTick.length > 0) {
      const ticked = { ...approval.approvals };
      const autoApproved = { ...approval.autoApproved };
      for (const party of toTick) {
        ticked[party] = true;
        autoApproved[party] = true;
      }
      updated.approvals = ticked;
      updated.autoApproved = autoApproved;
    }
    return updated;
  });

  return changed ? next : approvals;
}

/**
 * True when mail could still change this row: a party is unticked and not overridden, or
 * the sent date is missing and not overridden. Used to skip Gmail thread searches.
 */
export function needsMailCheck(approval: SprintApproval): boolean {
  const pendingParty = PARTIES.some(
    (party) => !approval.approvals[party] && approval.overrides?.[party] == null
  );
  const pendingSent = !approval.sentAt && approval.sentOverride == null;
  return pendingParty || pendingSent;
}

/** Store-level wrapper; returns the same store when nothing changed. */
export function applyMailApprovalsToStore(store: DashboardStore): DashboardStore {
  const current = store.sprintApprovals ?? [];
  const sprintApprovals = applyMailApprovals(current, store.mailItems ?? []);
  if (sprintApprovals === current) return store;
  return { ...store, sprintApprovals };
}

/**
 * What the store runs on every read/write. Sprint approvals come only from Gmail build
 * threads; they are not linked to Planning releases.
 */
export function syncSprintApprovals(store: DashboardStore): DashboardStore {
  return applyMailApprovalsToStore(store);
}

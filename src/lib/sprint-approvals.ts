import type {
  DashboardStore,
  MailItem,
  Release,
  SprintApproval,
  SprintApprovalParty,
} from "./types";
import { formatSprintApprovalTitle } from "./utils";

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

export function syncSprintApprovalsFromReleases(store: DashboardStore): DashboardStore {
  let changed = false;
  const approvals = (store.sprintApprovals ?? []).filter((item) => {
    const keep = item.title.trim().length > 1;
    if (!keep) changed = true;
    return keep;
  });

  for (const approval of approvals) {
    const formatted = formatSprintApprovalTitle(approval.title, approval.platform);
    if (approval.title !== formatted) {
      approval.title = formatted;
      changed = true;
    }
  }

  const byReleaseId = new Map(
    approvals.filter((a) => a.releaseId).map((a) => [a.releaseId!, a])
  );
  const byKey = new Map(approvals.map((a) => [approvalKey(a.title, a.platform), a]));

  const now = new Date().toISOString();
  const added: SprintApproval[] = [];

  for (const release of store.releases) {
    if (release.status === "live") continue;

    const key = approvalKey(release.name, release.platform);
    const linked = byReleaseId.get(release.id) ?? byKey.get(key);

    if (linked) {
      let linkedChanged = false;
      if (!linked.releaseId) {
        linked.releaseId = release.id;
        linkedChanged = true;
      }
      if (!linked.platform && release.platform) {
        linked.platform = release.platform;
        linkedChanged = true;
      }
      const formattedTitle = formatSprintApprovalTitle(release.name, release.platform);
      if (linked.title !== formattedTitle) {
        linked.title = formattedTitle;
        linkedChanged = true;
      }
      if (linkedChanged) {
        linked.updatedAt = now;
        changed = true;
      }
      continue;
    }

    const approval: SprintApproval = {
      id: `sprint-approval-${release.id}`,
      releaseId: release.id,
      title: formatSprintApprovalTitle(release.name, release.platform),
      platform: release.platform,
      approvals: { gm: false, dev: false, qa: false },
      createdAt: now,
      updatedAt: now,
    };
    added.push(approval);
    byReleaseId.set(release.id, approval);
    byKey.set(key, approval);
    changed = true;
  }

  if (!changed) return store;

  return {
    ...store,
    sprintApprovals: pruneOrphanApprovals([...added, ...approvals], store.releases),
  };
}

function pruneOrphanApprovals(
  approvals: SprintApproval[],
  releases: Release[]
): SprintApproval[] {
  const releaseIds = new Set(releases.map((r) => r.id));
  const activeKeys = new Set(
    releases
      .filter((r) => r.status !== "live")
      .map((r) => approvalKey(r.name, r.platform))
  );

  return approvals.filter((approval) => {
    if (approval.releaseId) return releaseIds.has(approval.releaseId);
    return activeKeys.has(approvalKey(approval.title, approval.platform));
  });
}

const PARTIES: SprintApprovalParty[] = ["gm", "dev", "qa"];

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

/** Release sync + mail auto-detection — what the store runs on every read/write. */
export function syncSprintApprovals(store: DashboardStore): DashboardStore {
  return applyMailApprovalsToStore(syncSprintApprovalsFromReleases(store));
}

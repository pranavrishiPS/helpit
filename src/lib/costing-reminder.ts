import type { SprintApproval, SprintApprovalParty } from "./types";
import { compareBuildVersionTitlesDesc, formatSprintApprovalTitle } from "./utils";

/**
 * Who owes each costing column, from TEAM.md (tagged by full name: pasted `<@USERID>` shows as raw text in Slack). The mail
 * senders in SPRINT_APPROVAL_SENDERS also include Uttam Katiyar for Dev, but TEAM.md does
 * not name him a Dev approver, so only Ayush is tagged; add `U08TT62MAD8` here to include him.
 */
export const COSTING_REMINDER_OWNERS: Record<
  SprintApprovalParty,
  { name: string; slackId: string }[]
> = {
  gm: [{ name: "Amit Kumar Srivastava", slackId: "U0BC98DKXQ8" }],
  dev: [{ name: "Ayush Upadhyay", slackId: "U0A4E3EQW9Z" }],
  qa: [
    { name: "Rohan Karir", slackId: "U08TT5VN15G" },
  ],
};

const PARTIES: SprintApprovalParty[] = ["gm", "dev", "qa"];

const HEADER = "Hi team, gentle reminder on the sprint costing threads — pending from you:";

/**
 * Ready-to-paste Slack reminder listing, per column owner, the builds still awaiting their
 * response. A build counts as pending when its approval row is not fully approved and its
 * mail has been sent (a column can only owe a reply once the thread exists). Builds are
 * newest-first, as in the pending table. Returns "" when nobody owes anything.
 */
export function buildCostingReminder(approvals: SprintApproval[]): string {
  const pending = approvals
    .filter((item) => !!item.sentAt && PARTIES.some((party) => !item.approvals[party]))
    .sort((a, b) => compareBuildVersionTitlesDesc(a.title, b.title));

  const lines: string[] = [];
  for (const party of PARTIES) {
    const builds = pending
      .filter((item) => !item.approvals[party])
      .map((item) => formatSprintApprovalTitle(item.title, item.platform));
    if (builds.length === 0) continue;
    const mentions = COSTING_REMINDER_OWNERS[party].map((o) => `@${o.name}`).join(", ");
    lines.push(`• ${mentions} — ${builds.join(", ")}`);
  }

  return lines.length > 0 ? [HEADER, ...lines].join("\n") : "";
}

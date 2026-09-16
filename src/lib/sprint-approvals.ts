import type { DashboardStore, Release, SprintApproval } from "./types";
import { formatSprintApprovalTitle } from "./utils";

function approvalKey(title: string, platform?: Release["platform"]): string {
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

import { apiAuthHeaders } from "@/lib/auth";
import type {
  DashboardStore,
  MailItem,
  ProjectResourceType,
  ReleasePhase,
  ReleaseStatus,
  SprintApprovalParty,
  Task,
} from "@/lib/types";

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = { ...apiAuthHeaders(), ...init?.headers };
  return fetch(path, { ...init, headers });
}

export async function fetchStore(): Promise<DashboardStore> {
  const res = await apiFetch("/api/store");
  if (!res.ok) throw new Error("Failed to load dashboard");
  return res.json();
}

export async function createTask(partial: Partial<Task>): Promise<Task> {
  const res = await apiFetch("/api/tasks", {
    method: "POST",
    body: JSON.stringify(partial),
  });
  if (!res.ok) throw new Error("Failed to create task");
  return res.json();
}

export async function updateTask(
  id: string,
  updates: Partial<Omit<Task, "id" | "createdAt">>
): Promise<Task> {
  const res = await apiFetch("/api/tasks", {
    method: "PATCH",
    body: JSON.stringify({ id, ...updates }),
  });
  if (!res.ok) throw new Error("Failed to update task");
  return res.json();
}

export async function deleteTask(id: string): Promise<void> {
  const res = await apiFetch(`/api/tasks?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete task");
}

export async function updateSlackItem(id: string, completed: boolean): Promise<void> {
  const res = await apiFetch("/api/slack", {
    method: "PATCH",
    body: JSON.stringify({ id, completed }),
  });
  if (!res.ok) throw new Error("Failed to update Slack item");
}

export async function updateMailItem(
  id: string,
  status: MailItem["status"]
): Promise<void> {
  const res = await apiFetch("/api/mail", {
    method: "PATCH",
    body: JSON.stringify({ id, status }),
  });
  if (!res.ok) throw new Error("Failed to update mail item");
}

export async function updateSprintApproval(
  id: string,
  party: SprintApprovalParty,
  approved: boolean
): Promise<void> {
  const res = await apiFetch("/api/mail/approvals", {
    method: "PATCH",
    body: JSON.stringify({ id, party, approved }),
  });
  if (!res.ok) throw new Error("Failed to update sprint approval");
}

export async function updateSprintApprovalMailSent(
  id: string,
  mailSent: boolean
): Promise<void> {
  const res = await apiFetch("/api/mail/approvals", {
    method: "PATCH",
    body: JSON.stringify({ id, mailSent }),
  });
  if (!res.ok) throw new Error("Failed to update sprint approval mail status");
}

export interface CreateReleaseInput {
  platform: "android" | "ios";
  buildNumber: string;
  targetDate: string;
  notes?: string;
  functionCosts?: Array<{
    role: string;
    involved: boolean;
    effortDays?: number;
    actualEffortDays?: number;
  }>;
}

export async function createRelease(input: CreateReleaseInput) {
  const res = await apiFetch("/api/releases", {
    method: "POST",
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to create release");
  return data;
}

export async function updateRelease(
  id: string,
  input: {
    status?: ReleaseStatus;
    phase?: ReleasePhase;
    notes?: string | null;
    sprintNote?: string | null;
    targetDate?: string | null;
    actualDate?: string | null;
    blockers?: string[];
    functionCosts?: CreateReleaseInput["functionCosts"];
  }
) {
  const res = await apiFetch("/api/releases", {
    method: "PATCH",
    body: JSON.stringify({ id, ...input }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to update release");
  return data;
}

export interface CreateProjectResourceInput {
  title: string;
  url: string;
  type: ProjectResourceType;
  description?: string;
}

export async function createProjectResource(input: CreateProjectResourceInput) {
  const res = await apiFetch("/api/resources", {
    method: "POST",
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to add resource");
  return data;
}

export async function deleteProjectResource(id: string): Promise<void> {
  const res = await apiFetch(`/api/resources?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete resource");
}

export async function createPlotBacklogItem(input: { title: string; tags?: string[] }) {
  const res = await apiFetch("/api/plot-backlog", {
    method: "POST",
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to add plot item");
  return data;
}

export async function deletePlotBacklogItem(id: string): Promise<void> {
  const res = await apiFetch(`/api/plot-backlog?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Failed to remove plot item");
}

export async function reorderPlotBacklog(ids: string[]): Promise<void> {
  const res = await apiFetch("/api/plot-backlog", {
    method: "PATCH",
    body: JSON.stringify({ ids }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Failed to reorder plot backlog");
}

export interface CreateFeatureInput {
  title: string;
  startDate?: string;
  scopeClosureDate?: string;
  preProductionClosureDate?: string;
  releaseDate?: string;
  functionCosts?: Array<{
    role: string;
    involved: boolean;
    effortDays?: number;
    actualEffortDays?: number;
  }>;
}

export async function createFeature(input: CreateFeatureInput) {
  const res = await apiFetch("/api/features", {
    method: "POST",
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to create feature");
  return data;
}

export async function updateFeature(
  id: string,
  input: {
    title?: string;
    startDate?: string | null;
    scopeClosureDate?: string | null;
    preProductionClosureDate?: string | null;
    releaseDate?: string | null;
    scopeClosureCompleted?: boolean;
    specReviewCompleted?: boolean;
    addDiscussionNote?: { date: string; content: string };
    removeDiscussionNoteId?: string;
    functionCosts?: CreateFeatureInput["functionCosts"];
  }
) {
  const res = await apiFetch("/api/features", {
    method: "PATCH",
    body: JSON.stringify({ id, ...input }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to update feature");
  return data;
}

export async function deleteFeature(id: string): Promise<void> {
  const res = await apiFetch(`/api/features?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Failed to delete feature");
}

export async function updateProjectResource(
  id: string,
  input: Partial<CreateProjectResourceInput> & { description?: string | null }
): Promise<void> {
  const res = await apiFetch("/api/resources", {
    method: "PATCH",
    body: JSON.stringify({ id, ...input }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to update resource");
}

export interface CreateOutingInput {
  title: string;
  destination?: string;
  date?: string;
  budget?: number;
  budgetPerPerson?: number;
  members?: string[];
  notes?: string;
}

export async function createOuting(input: CreateOutingInput) {
  const res = await apiFetch("/api/outings", {
    method: "POST",
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to create outing");
  return data;
}

export async function updateOuting(
  id: string,
  input: Partial<CreateOutingInput> & {
    destination?: string | null;
    date?: string | null;
    budgetPerPerson?: number | null;
    notes?: string | null;
  }
): Promise<void> {
  const res = await apiFetch("/api/outings", {
    method: "PATCH",
    body: JSON.stringify({ id, ...input }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to update outing");
}

export interface OutingExpenseInput {
  title: string;
  amount: number;
  type: "outing" | "follow_up";
  date?: string;
  notes?: string;
  attendeeCount?: number;
}

export async function createOutingExpense(outingId: string, input: OutingExpenseInput) {
  const res = await apiFetch("/api/outings/expenses", {
    method: "POST",
    body: JSON.stringify({ outingId, ...input }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to add expense");
  return data;
}

export async function updateOutingExpense(
  outingId: string,
  id: string,
  input: Partial<OutingExpenseInput> & {
    date?: string | null;
    notes?: string | null;
    attendeeCount?: number | null;
  }
): Promise<void> {
  const res = await apiFetch("/api/outings/expenses", {
    method: "PATCH",
    body: JSON.stringify({ outingId, id, ...input }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to update expense");
}

export async function deleteOutingExpense(outingId: string, id: string): Promise<void> {
  const res = await apiFetch("/api/outings/expenses", {
    method: "DELETE",
    body: JSON.stringify({ outingId, id }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to delete expense");
}

export async function updateProfile(profile: {
  name: string;
  role: string;
  company: string;
}): Promise<void> {
  const res = await apiFetch("/api/profile", {
    method: "PATCH",
    body: JSON.stringify(profile),
  });
  if (!res.ok) throw new Error("Failed to update profile");
}

export async function syncGmail(): Promise<{ ok: boolean; added?: number; error?: string }> {
  const res = await apiFetch("/api/gmail/sync", { method: "POST" });
  const data = await res.json();
  if (!res.ok) return { ok: false, error: data.error ?? "Sync failed" };
  return { ok: true, added: data.added };
}

export async function syncSlack(): Promise<Response> {
  return apiFetch("/api/slack/sync", { method: "POST" });
}

export async function disconnectSlack(): Promise<void> {
  const res = await apiFetch("/api/slack/disconnect", { method: "POST" });
  if (!res.ok) throw new Error("Failed to disconnect Slack");
}

export async function disconnectGmail(): Promise<void> {
  const res = await apiFetch("/api/gmail/disconnect", { method: "POST" });
  if (!res.ok) throw new Error("Failed to disconnect Gmail");
}

export async function fetchSlackStatus() {
  const res = await apiFetch("/api/slack/status");
  if (!res.ok) throw new Error("Failed to load Slack status");
  return res.json();
}

export async function fetchGmailStatus() {
  const res = await apiFetch("/api/gmail/status");
  if (!res.ok) throw new Error("Failed to load Gmail status");
  return res.json();
}

export async function sendChatMessage(
  message: string,
  history: { role: "user" | "assistant"; content: string }[]
) {
  const res = await apiFetch("/api/chat", {
    method: "POST",
    body: JSON.stringify({ message, history }),
  });
  if (!res.ok) throw new Error("Chat request failed");
  return res.json();
}

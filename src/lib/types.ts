export type TaskStatus = "todo" | "in_progress" | "done" | "blocked";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type TaskSource = "manual" | "slack" | "mail" | "planning" | "outing";

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  source: TaskSource;
  dueDate?: string;
  reminderAt?: string;
  tags: string[];
  owner?: string;
  slackTs?: string;
  createdAt: string;
  updatedAt: string;
}

export type ReleaseStatus =
  | "idea"
  | "spec_draft"
  | "spec_ready"
  | "in_dev"
  | "qa"
  | "ready"
  | "live";

export type ReleasePlatform = "android" | "ios";

export type ReleaseFunctionRole =
  | "product"
  | "ux"
  | "designer"
  | "art"
  | "tech_art"
  | "devs"
  | "qa";

export type ReleasePhase = "ux" | "art" | "animation" | "dev" | "qa";

export interface ReleaseFunctionCost {
  role: ReleaseFunctionRole;
  involved: boolean;
  /** Estimated effort in person-days */
  effortDays?: number;
  /** Actual effort in person-days (for est vs actual tracking) */
  actualEffortDays?: number;
}

export interface Release {
  id: string;
  name: string;
  platform?: ReleasePlatform;
  game?: string;
  targetDate?: string;
  actualDate?: string;
  phase?: ReleasePhase;
  functionCosts?: ReleaseFunctionCost[];
  status: ReleaseStatus;
  notes?: string;
  /** Free-form planning note for the sprint (separate from sprint scope items in `notes`). */
  sprintNote?: string;
  blockers: string[];
  /** @deprecated Active release is derived from nearest target date in the UI */
  isActive?: boolean;
  createdAt: string;
  updatedAt: string;
}

/** MoM / scope discussion note for a feature. */
export interface FeatureDiscussionNote {
  id: string;
  /** Date of the discussion (YYYY-MM-DD). */
  date: string;
  content: string;
  createdAt: string;
}

export interface Feature {
  id: string;
  title: string;
  /** When scope tracking / discussions begin. */
  startDate?: string;
  /** All scope discussions and decisions should be finalized by this date. */
  scopeClosureDate?: string;
  /** When scope closure was marked complete. */
  scopeClosureCompletedAt?: string;
  /** Team commitment to complete pre-production by this date. */
  preProductionClosureDate?: string;
  /** When internal spec review was marked complete. */
  specReviewCompletedAt?: string;
  /** Target release / ship date for this feature. */
  releaseDate?: string;
  /** Per-function effort estimates and actuals (person-days). */
  functionCosts?: ReleaseFunctionCost[];
  discussionNotes: FeatureDiscussionNote[];
  createdAt: string;
  updatedAt: string;
}

/** Feature or work item to remember for a future release sprint. */
export interface PlotBacklogItem {
  id: string;
  title: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface OutingAttendee {
  name: string;
  confirmed: boolean;
}

export type OutingExpenseType = "outing" | "follow_up";

export interface OutingExpense {
  id: string;
  title: string;
  amount: number;
  date?: string;
  type: OutingExpenseType;
  notes?: string;
  /** People covered by this expense (mainly for follow-up snack orders) */
  attendeeCount?: number;
}

export interface Outing {
  id: string;
  title: string;
  destination?: string;
  date?: string;
  budget: number;
  budgetPerPerson?: number;
  /** @deprecated Use expenses — kept for legacy stores */
  spent?: number;
  expenses: OutingExpense[];
  /** Roster / who attended the main outing */
  attendees: OutingAttendee[];
  /** Who shares the leftover snack / follow-up budget (often a subset of outing attendees) */
  followUpAttendees?: OutingAttendee[];
  notes?: string;
  /** When true, outing moves to past even before date logic */
  completed?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SlackItem {
  id: string;
  channel: string;
  summary: string;
  action: "follow_up" | "reply" | "remind" | "review";
  priority: TaskPriority;
  dueDate?: string;
  threadUrl?: string;
  slackTs?: string;
  source?: "manual" | "slack";
  completed: boolean;
  createdAt: string;
}

export interface MailItem {
  id: string;
  subject: string;
  from: string;
  category: "support" | "internal" | "vendor" | "other";
  summary: string;
  status: "unread" | "needs_reply" | "drafted" | "done";
  receivedAt: string;
  followUpDate?: string;
  source?: "manual" | "gmail";
  gmailId?: string;
}

export type SprintApprovalParty = "gm" | "dev" | "qa";

export interface SprintApproval {
  id: string;
  /** Linked Planning release — approvals auto-sync from releases */
  releaseId?: string;
  /** Sprint costing mail subject, e.g. "Android 1.180" */
  title: string;
  platform?: ReleasePlatform;
  /** When the approval mail was sent */
  sentAt?: string;
  approvals: Record<SprintApprovalParty, boolean>;
  createdAt: string;
  updatedAt: string;
}

export type ProjectResourceType = "doc" | "figma" | "link" | "sheets" | "slides";

export interface ProjectResource {
  id: string;
  title: string;
  url: string;
  type: ProjectResourceType;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SlackIntegration {
  connected: boolean;
  userId?: string;
  teamName?: string;
  lastSyncedAt?: string;
  lastSyncError?: string;
}

export interface GmailIntegration {
  connected: boolean;
  email?: string;
  lastSyncedAt?: string;
  lastSyncError?: string;
}

export interface UserProfile {
  name: string;
  role: string;
  company: string;
}

export interface DashboardStore {
  profile: UserProfile;
  tasks: Task[];
  releases: Release[];
  outings: Outing[];
  slackItems: SlackItem[];
  mailItems: MailItem[];
  sprintApprovals: SprintApproval[];
  projectResources: ProjectResource[];
  plotBacklog: PlotBacklogItem[];
  features: Feature[];
  integrations?: {
    gmail?: GmailIntegration;
    slack?: SlackIntegration;
  };
  lastUpdated: string;
}

export type ModuleId =
  | "home"
  | "tasks"
  | "slack"
  | "mail"
  | "planning"
  | "features"
  | "resources"
  | "outings"
  | "settings";

export interface NavItem {
  id: ModuleId;
  label: string;
  href: string;
  description: string;
}

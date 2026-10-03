import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { addDays, format, nextFriday, startOfDay } from "date-fns";
import { updateStore } from "@/lib/db";
import { createTaskSchema, taskPrioritySchema, taskStatusSchema } from "@/lib/validation";
import type {
  DashboardStore,
  Task,
  TaskPriority,
  TaskStatus,
  SlackItem,
} from "@/lib/types";

export interface AssistantActionResult {
  action: string;
  success: boolean;
  detail: string;
}

export type ParsedAction =
  | {
      type: "create_task";
      title: string;
      priority?: TaskPriority;
      dueDate?: string;
      status?: TaskStatus;
      description?: string;
    }
  | {
      type: "update_task";
      titleMatch: string;
      status?: TaskStatus;
      priority?: TaskPriority;
      dueDate?: string;
    }
  | {
      type: "create_slack_item";
      channel: string;
      summary: string;
      priority?: TaskPriority;
      action?: SlackItem["action"];
      dueDate?: string;
    }
  | { type: "complete_slack_item"; titleMatch: string }
  | { type: "update_mail_status"; titleMatch: string; status: "done" | "needs_reply" | "drafted" }
  // Produced when input (local parser or model output) can't become a valid action.
  // Never written to the store; `reason` is shown to the user instead.
  | { type: "invalid_action"; reason: string };

/** Hard cap on actions executed from a single message. */
const MAX_ACTIONS_PER_MESSAGE = 20;

const PRIORITY_WORDS: Record<string, TaskPriority> = {
  low: "low",
  medium: "medium",
  med: "medium",
  high: "high",
  urgent: "urgent",
};

function normalizePriority(word?: string): TaskPriority | undefined {
  if (!word) return undefined;
  return PRIORITY_WORDS[word.toLowerCase()];
}

function isRealDate(year: number, month: number, day: number): boolean {
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

export function isRealIsoDate(value: string): boolean {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  return isRealDate(parseInt(m[1]), parseInt(m[2]), parseInt(m[3]));
}

/**
 * Parses a short date phrase into yyyy-MM-dd. Slash dates are day/month[/year] (India),
 * never month/day. Returns undefined for anything unrecognised or not a real calendar date.
 */
export function parseDueDate(text: string): string | undefined {
  const lower = text.toLowerCase().trim().replace(/\s+/g, " ").replace(/[.!]+$/, "");
  const today = startOfDay(new Date());

  if (lower === "today") return format(today, "yyyy-MM-dd");
  if (lower === "tomorrow") return format(addDays(today, 1), "yyyy-MM-dd");
  if (lower === "friday" || lower === "next friday") {
    return format(nextFriday(today), "yyyy-MM-dd");
  }

  const inDays = lower.match(/^in (\d+) days?$/);
  if (inDays) return format(addDays(today, parseInt(inDays[1])), "yyyy-MM-dd");

  const iso = lower.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return isRealIsoDate(iso[1]) ? iso[1] : undefined;

  const slash = lower.match(/^(?:(?:due|on|by) )?(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?$/);
  if (slash) {
    const day = parseInt(slash[1]);
    const month = parseInt(slash[2]);
    const year = slash[3]
      ? parseInt(slash[3].length === 2 ? `20${slash[3]}` : slash[3])
      : today.getFullYear();
    if (!isRealDate(year, month, day)) return undefined;
    return format(new Date(year, month - 1, day), "yyyy-MM-dd");
  }

  return undefined;
}

function extractQuotedOrRest(text: string): string {
  const quoted = text.match(/["']([^"']+)["']/);
  if (quoted) return quoted[1].trim();
  return text.trim();
}

export type TaskMatch =
  | { kind: "found"; task: Task }
  | { kind: "ambiguous"; tasks: Task[] }
  | { kind: "none" };

/**
 * Resolves a title match to exactly one task. Only exact (case-insensitive) or
 * "match is contained in the title" lookups are used, and only when unambiguous.
 * There is deliberately no reverse match (task title found inside the message):
 * short titles would otherwise hijack unrelated sentences.
 */
export function resolveTaskMatch(store: DashboardStore, match: string): TaskMatch {
  const lower = match.toLowerCase().trim();
  if (!lower) return { kind: "none" };

  const exact = store.tasks.filter((t) => t.title.toLowerCase() === lower);
  if (exact.length === 1) return { kind: "found", task: exact[0] };
  if (exact.length > 1) return { kind: "ambiguous", tasks: exact };

  if (lower.length < 3) return { kind: "none" };
  const contains = store.tasks.filter((t) => t.title.toLowerCase().includes(lower));
  if (contains.length === 1) return { kind: "found", task: contains[0] };
  if (contains.length > 1) return { kind: "ambiguous", tasks: contains };

  return { kind: "none" };
}

export function findTaskByMatch(store: DashboardStore, match: string): Task | undefined {
  const result = resolveTaskMatch(store, match);
  return result.kind === "found" ? result.task : undefined;
}

function findSlackByMatch(store: DashboardStore, match: string): SlackItem | undefined {
  const lower = match.toLowerCase().trim();
  if (!lower) return undefined;

  const open = store.slackItems.filter((s) => !s.completed);
  const exact = open.find((s) => s.summary.toLowerCase() === lower);
  if (exact) return exact;

  const contains = open.filter((s) => s.summary.toLowerCase().includes(lower));
  if (contains.length === 1) return contains[0];

  const byChannel = open.filter((s) => s.channel.toLowerCase().includes(lower));
  if (byChannel.length === 1) return byChannel[0];

  return undefined;
}

function findMailByMatch(store: DashboardStore, match: string) {
  const lower = match.toLowerCase().trim();
  if (!lower) return undefined;

  const exact = store.mailItems.find((m) => m.subject.toLowerCase() === lower);
  if (exact) return exact;

  const contains = store.mailItems.filter(
    (m) => m.subject.toLowerCase().includes(lower) || m.summary.toLowerCase().includes(lower)
  );
  if (contains.length === 1) return contains[0];

  return undefined;
}

// ---------------------------------------------------------------------------
// Intent gating
// ---------------------------------------------------------------------------

const QUESTION_START =
  /^(?:what|what's|whats|how|can|could|should|is|are|was|were|when|why|who|which|where|do|does|did|will|would|shall|may|might|have|has)\b/i;
const WRITE_VERB_START =
  /^(?:please\s+)?(?:add|create|new|set|log|track|remind|complete|mark|finish|done)\b/i;

/** True for messages that ask something rather than command something. */
export function isQuestionLike(message: string): boolean {
  const trimmed = message.trim();
  if (QUESTION_START.test(trimmed)) return true;
  const firstLine = trimmed.split("\n")[0].trim();
  return firstLine.endsWith("?");
}

/**
 * A write is only attempted when the message STARTS with an imperative verb and is
 * not phrased as a question. Mentioning "mark"/"complete" mid-sentence never counts.
 */
export function looksLikeWriteIntent(message: string): boolean {
  const trimmed = message.trim();
  return !isQuestionLike(trimmed) && WRITE_VERB_START.test(trimmed);
}

// ---------------------------------------------------------------------------
// Trailing priority / due-date phrases
// ---------------------------------------------------------------------------

const PRIORITY_WORD = "low|medium|med|high|urgent";
const DATE_PHRASE = String.raw`today|tomorrow|(?:next\s+)?friday|in\s+\d+\s+days?|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?`;
const SEP = String.raw`(?:\s*[,;]\s*|\s+)`;
const END = String.raw`\s*[.!]?$`;

const PRIORITY_TAILS = [
  new RegExp(`${SEP}priority\\s+(${PRIORITY_WORD})${END}`, "i"),
  new RegExp(`${SEP}(${PRIORITY_WORD})\\s+priority${END}`, "i"),
  // A bare priority word only counts when explicitly comma-separated: "Fix login, high"
  new RegExp(String.raw`\s*[,;]\s*(${PRIORITY_WORD})${END}`, "i"),
];
const DUE_TAIL = new RegExp(`${SEP}due(?:\\s+(?:on|by))?\\s+(${DATE_PHRASE})${END}`, "i");
// "due 10/10 high" / "due 10/10, high" / "due 10/10 high priority": a priority word glued to
// the due phrase (with or without a comma) is unambiguous, unlike a bare word in a title.
const DUE_THEN_PRIORITY_TAIL = new RegExp(
  `${SEP}due(?:\\s+(?:on|by))?\\s+(${DATE_PHRASE})${SEP}(?:priority\\s+)?(${PRIORITY_WORD})(?:\\s+priority)?${END}`,
  "i"
);
// "X high due 10/10": once a due phrase was peeled off, a bare priority word may follow the title.
const BARE_PRIORITY_TAIL = new RegExp(`${SEP}(${PRIORITY_WORD})${END}`, "i");

export interface TrailingModifiers {
  title: string;
  priority?: TaskPriority;
  dueDate?: string;
  /** Set when a "due ..." phrase was present but is not a real date. */
  error?: string;
}

/**
 * Peels ", high" / "priority high" / "high priority" / "due <date>" off the END of the
 * text only. Ordinary words inside the title ("Friday", "high score") are left alone.
 */
export function extractTrailingModifiers(text: string): TrailingModifiers {
  let title = text.trim();
  let priority: TaskPriority | undefined;
  let dueDate: string | undefined;
  let dueSeen = false;
  let error: string | undefined;

  for (let i = 0; i < 4; i++) {
    let changed = false;

    if (!priority && !dueSeen) {
      const m = title.match(DUE_THEN_PRIORITY_TAIL);
      if (m) {
        priority = normalizePriority(m[2]);
        dueSeen = true;
        dueDate = parseDueDate(m[1]);
        if (!dueDate) error = `"${m[1]}" is not a valid date (use yyyy-MM-dd or dd/mm/yyyy)`;
        title = title.slice(0, m.index).trim();
        changed = true;
      }
    }

    if (!priority) {
      const tails = dueSeen ? [...PRIORITY_TAILS, BARE_PRIORITY_TAIL] : PRIORITY_TAILS;
      for (const re of tails) {
        const m = title.match(re);
        if (m) {
          priority = normalizePriority(m[1]);
          title = title.slice(0, m.index).trim();
          changed = true;
          break;
        }
      }
    }

    if (!dueSeen) {
      const m = title.match(DUE_TAIL);
      if (m) {
        dueSeen = true;
        dueDate = parseDueDate(m[1]);
        if (!dueDate) error = `"${m[1]}" is not a valid date (use yyyy-MM-dd or dd/mm/yyyy)`;
        title = title.slice(0, m.index).trim();
        changed = true;
      }
    }

    if (!changed) break;
  }

  title = title
    .replace(/[,;]+$/, "")
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .trim();
  return { title, priority, dueDate, error };
}

function taskActionFromText(text: string): ParsedAction {
  const parsed = extractTrailingModifiers(text);
  if (parsed.error) {
    return { type: "invalid_action", reason: `Task "${parsed.title}": ${parsed.error}` };
  }
  if (!parsed.title) return { type: "invalid_action", reason: "Task title is empty" };
  return {
    type: "create_task",
    title: parsed.title,
    priority: parsed.priority ?? "medium",
    dueDate: parsed.dueDate,
  };
}

/** Trailing date for reminders: "... tomorrow", "... on 12/10". */
const REMINDER_DATE_TAIL = new RegExp(`(?:\\s+(?:on|by|for))?\\s+(${DATE_PHRASE})${END}`, "i");
/** Leading date for reminders: "on 12/10 to call Bob", "tomorrow call Bob". */
const REMINDER_DATE_HEAD = new RegExp(
  `^(?:(?:on|by|for)\\s+)?(${DATE_PHRASE})\\s+(?:to\\s+)?(?=\\S)`,
  "i"
);
/** "Remind me what's due" asks something; it is not a reminder to create. */
const REMINDER_QUESTION_BODY = /^(?:what|what's|whats|which|when|why|who|whom|where|how)\b/i;

export function parseLocalActions(message: string): ParsedAction[] {
  const actions: ParsedAction[] = [];
  const trimmed = message.trim();

  // Writes need an imperative at the very start and must not be a question.
  if (!looksLikeWriteIntent(trimmed)) return actions;

  const bulkMatch = trimmed.match(/^(?:please\s+)?(?:add|create)\s+tasks?:?\s*\n([\s\S]+)/i);
  if (bulkMatch) {
    const lines = bulkMatch[1]
      .split("\n")
      .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim())
      .filter(Boolean);
    for (const line of lines) actions.push(taskActionFromText(line));
    if (actions.length > 0) return actions;
  }

  const firstLine = trimmed.split("\n")[0];
  if (/^(?:please\s+)?add data\b/i.test(trimmed) || /^title\s*,/i.test(firstLine)) {
    const csvBlock = trimmed.replace(/^(?:please\s+)?add data:?\s*/i, "");
    const rows = csvBlock.split("\n").filter((r) => r.trim() && !/^title\b/i.test(r.trim()));
    for (const row of rows) {
      const [title, priority, dueDate] = row.split(",").map((c) => c.trim());
      if (!title) continue;
      if (priority && !normalizePriority(priority)) {
        actions.push({
          type: "invalid_action",
          reason: `Task "${title}": unknown priority "${priority}"`,
        });
        continue;
      }
      const due = dueDate ? parseDueDate(dueDate) : undefined;
      if (dueDate && !due) {
        actions.push({
          type: "invalid_action",
          reason: `Task "${title}": "${dueDate}" is not a valid date (use yyyy-MM-dd or dd/mm/yyyy)`,
        });
        continue;
      }
      actions.push({
        type: "create_task",
        title,
        priority: normalizePriority(priority) ?? "medium",
        dueDate: due,
      });
    }
    if (actions.length > 0) return actions;
  }

  const completeSlack = trimmed.match(
    /^(?:please\s+)?(?:mark|complete|done)\s+slack(?:\s+item)?\s+(.+)/i
  );
  if (completeSlack) {
    actions.push({
      type: "complete_slack_item",
      titleMatch: extractQuotedOrRest(completeSlack[1]),
    });
    return actions;
  }

  const completeTask = trimmed.match(
    /^(?:please\s+)?(?:mark|complete|finish|done(?:\s+with)?)\s+(?:the\s+)?(?:task\s+)?(.+?)(?:\s+(?:as\s+)?(?:done|complete|completed|finished))?\s*[.!]?$/i
  );
  if (completeTask) {
    const titleMatch = extractQuotedOrRest(completeTask[1]);
    if (titleMatch) {
      actions.push({ type: "update_task", titleMatch, status: "done" });
      return actions;
    }
  }

  const reminderMatch = trimmed.match(
    /^(?:please\s+)?(?:remind me(?:\s+to)?|add reminder(?:\s+to)?|set reminder(?:\s+for)?)\s+(.+)/i
  );
  if (reminderMatch) {
    let rest = reminderMatch[1].trim();
    if (REMINDER_QUESTION_BODY.test(rest)) return actions; // question: never mutates
    let dueText: string | undefined;
    const tail = rest.match(REMINDER_DATE_TAIL);
    if (tail && tail.index !== undefined) {
      dueText = tail[1];
      rest = rest.slice(0, tail.index).trim();
    } else {
      const head = rest.match(REMINDER_DATE_HEAD);
      if (head) {
        dueText = head[1];
        rest = rest.slice(head[0].length).trim();
      }
    }
    let dueDate: string | undefined;
    if (dueText) {
      dueDate = parseDueDate(dueText);
      if (!dueDate) {
        return [
          {
            type: "invalid_action",
            reason: `Reminder: "${dueText}" is not a valid date (use yyyy-MM-dd or dd/mm/yyyy)`,
          },
        ];
      }
    }
    if (!rest) return [{ type: "invalid_action", reason: "Reminder text is empty" }];
    actions.push({
      type: "create_task",
      title: rest,
      dueDate: dueDate ?? format(addDays(startOfDay(new Date()), 1), "yyyy-MM-dd"),
      priority: "medium",
    });
    return actions;
  }

  const slackMatch = trimmed.match(
    /^(?:please\s+)?(?:add|track|log)\s+slack(?:\s+item)?:?\s*(#[\w-]+)\s*[-:]\s*(.+)/i
  );
  if (slackMatch) {
    const parsed = extractTrailingModifiers(slackMatch[2]);
    if (parsed.error) {
      return [{ type: "invalid_action", reason: `Slack item: ${parsed.error}` }];
    }
    actions.push({
      type: "create_slack_item",
      channel: slackMatch[1],
      summary: parsed.title,
      priority: parsed.priority ?? "medium",
      dueDate: parsed.dueDate,
    });
    return actions;
  }

  const addTask = trimmed.match(/^(?:please\s+)?(?:add|create|new)\s+task:?\s+(.+)/i);
  if (addTask) {
    actions.push(taskActionFromText(addTask[1]));
    return actions;
  }

  return actions;
}

// ---------------------------------------------------------------------------
// Action validation (applies to local-parser AND model-produced actions)
// ---------------------------------------------------------------------------

const DATE_ERROR = { message: "must be a real date in yyyy-MM-dd format", path: ["dueDate"] };
const hasValidDate = (d: { dueDate?: string }) => !d.dueDate || isRealIsoDate(d.dueDate);

const createTaskActionSchema = createTaskSchema
  .pick({ title: true, description: true, status: true, priority: true, dueDate: true })
  .refine(hasValidDate, DATE_ERROR);

const updateTaskActionSchema = z
  .object({
    titleMatch: z.string().min(1).max(500),
    status: taskStatusSchema.optional(),
    priority: taskPrioritySchema.optional(),
    dueDate: createTaskSchema.shape.dueDate,
  })
  .refine((d) => d.status || d.priority || d.dueDate, {
    message: "update_task needs a status, priority or dueDate",
  })
  .refine(hasValidDate, DATE_ERROR);

const createSlackActionSchema = z
  .object({
    channel: z.string().regex(/^#?[\w-]{1,80}$/, "must look like #channel-name"),
    summary: z.string().min(1).max(500),
    priority: taskPrioritySchema.optional(),
    action: z.enum(["follow_up", "reply", "remind", "review"]).optional(),
    dueDate: createTaskSchema.shape.dueDate,
  })
  .refine(hasValidDate, DATE_ERROR);

const completeSlackActionSchema = z.object({ titleMatch: z.string().min(1).max(500) });

const updateMailActionSchema = z.object({
  titleMatch: z.string().min(1).max(500),
  status: z.enum(["done", "needs_reply", "drafted"]),
});

export type ActionValidation =
  | { success: true; action: ParsedAction }
  | { success: false; error: string };

/** Drops null/empty values and trims strings so "" or null never reach the schemas. */
function cleanArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) out[key] = trimmed;
    } else {
      out[key] = value;
    }
  }
  return out;
}

function reject(type: string, error: z.ZodError): ActionValidation {
  const issues = error.issues
    .map((i) => `${i.path.length ? i.path.join(".") : "input"}: ${i.message}`)
    .join("; ");
  return { success: false, error: `Rejected ${type}: ${issues}` };
}

/** Validates (and normalises) an action before it may touch the store. */
export function validateAction(action: ParsedAction): ActionValidation {
  if (action.type === "invalid_action") return { success: false, error: action.reason };

  const { type, ...rest } = action;
  const raw = cleanArgs(rest);

  switch (type) {
    case "create_task": {
      const r = createTaskActionSchema.safeParse(raw);
      return r.success
        ? { success: true, action: { type: "create_task", ...r.data } }
        : reject(type, r.error);
    }
    case "update_task": {
      const r = updateTaskActionSchema.safeParse(raw);
      return r.success
        ? { success: true, action: { type: "update_task", ...r.data } }
        : reject(type, r.error);
    }
    case "create_slack_item": {
      const r = createSlackActionSchema.safeParse(raw);
      return r.success
        ? { success: true, action: { type: "create_slack_item", ...r.data } }
        : reject(type, r.error);
    }
    case "complete_slack_item": {
      const r = completeSlackActionSchema.safeParse(raw);
      return r.success
        ? { success: true, action: { type: "complete_slack_item", ...r.data } }
        : reject(type, r.error);
    }
    case "update_mail_status": {
      const r = updateMailActionSchema.safeParse(raw);
      return r.success
        ? { success: true, action: { type: "update_mail_status", ...r.data } }
        : reject(type, r.error);
    }
    default:
      return { success: false, error: "Rejected: unsupported action" };
  }
}

export const OPENAI_ACTION_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "create_task",
      description: "Add a new task or reminder to the dashboard",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
          dueDate: { type: "string", description: "ISO date YYYY-MM-DD" },
          description: { type: "string" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_task",
      description: "Update an existing task by matching its title",
      parameters: {
        type: "object",
        properties: {
          titleMatch: { type: "string" },
          status: { type: "string", enum: ["todo", "in_progress", "done", "blocked"] },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
          dueDate: { type: "string", description: "ISO date YYYY-MM-DD" },
        },
        required: ["titleMatch"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_slack_item",
      description: "Track a Slack follow-up item",
      parameters: {
        type: "object",
        properties: {
          channel: { type: "string", description: "e.g. #live-ops" },
          summary: { type: "string" },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
          action: { type: "string", enum: ["follow_up", "reply", "remind", "review"] },
          dueDate: { type: "string", description: "ISO date YYYY-MM-DD" },
        },
        required: ["channel", "summary"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "complete_slack_item",
      description: "Mark a Slack item as done by matching summary or channel",
      parameters: {
        type: "object",
        properties: {
          titleMatch: { type: "string" },
        },
        required: ["titleMatch"],
      },
    },
  },
];

/** The only tool names (and fields) model output may use. Anything else is rejected. */
const TOOL_FIELDS: Record<string, string[]> = {
  create_task: ["title", "priority", "dueDate", "description"],
  update_task: ["titleMatch", "status", "priority", "dueDate"],
  create_slack_item: ["channel", "summary", "priority", "action", "dueDate"],
  complete_slack_item: ["titleMatch"],
};

/**
 * Turns an untrusted model tool call into a validated action. Unknown tools, wrong
 * types, bad enums and bad dates come back as `invalid_action` (never written).
 */
export function toolCallToAction(name: string, args: Record<string, unknown>): ParsedAction {
  const fields = Object.prototype.hasOwnProperty.call(TOOL_FIELDS, name)
    ? TOOL_FIELDS[name]
    : undefined;
  if (!fields) {
    return { type: "invalid_action", reason: `Rejected: unsupported action "${name}"` };
  }
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return { type: "invalid_action", reason: `Rejected ${name}: arguments must be an object` };
  }

  const picked: Record<string, unknown> = {};
  for (const field of fields) {
    if (field in args) picked[field] = args[field];
  }

  const candidate = { type: name, ...picked } as unknown as ParsedAction;
  const result = validateAction(candidate);
  return result.success ? result.action : { type: "invalid_action", reason: result.error };
}

export async function executeActions(
  actions: ParsedAction[]
): Promise<AssistantActionResult[]> {
  const results: AssistantActionResult[] = [];

  for (const action of actions.slice(0, MAX_ACTIONS_PER_MESSAGE)) {
    try {
      results.push(await executeOneAction(action));
    } catch (err) {
      results.push({
        action: action.type,
        success: false,
        detail: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  if (actions.length > MAX_ACTIONS_PER_MESSAGE) {
    results.push({
      action: "limit",
      success: false,
      detail: `Ignored ${actions.length - MAX_ACTIONS_PER_MESSAGE} actions (max ${MAX_ACTIONS_PER_MESSAGE} per message)`,
    });
  }

  return results;
}

async function executeOneAction(input: ParsedAction): Promise<AssistantActionResult> {
  const validated = validateAction(input);
  if (!validated.success) {
    return { action: input.type, success: false, detail: validated.error };
  }
  const action = validated.action;
  const now = new Date().toISOString();

  switch (action.type) {
    case "create_task": {
      const task: Task = {
        id: uuidv4(),
        title: action.title,
        description: action.description,
        status: action.status ?? "todo",
        priority: action.priority ?? "medium",
        source: "manual",
        dueDate: action.dueDate,
        tags: [],
        createdAt: now,
        updatedAt: now,
      };
      await updateStore((s) => ({ ...s, tasks: [...s.tasks, task] }));
      return {
        action: "create_task",
        success: true,
        detail: `Added task "${task.title}"${task.dueDate ? ` (due ${task.dueDate})` : ""}`,
      };
    }

    case "update_task": {
      let updated: Task | undefined;
      let ambiguous: Task[] | undefined;
      await updateStore((s) => {
        // reset: the updater re-runs on optimistic retries; only the last run counts
        updated = undefined;
        ambiguous = undefined;
        const match = resolveTaskMatch(s, action.titleMatch);
        if (match.kind === "ambiguous") {
          ambiguous = match.tasks;
          return s;
        }
        if (match.kind !== "found") return s;
        const task = match.task;
        updated = {
          ...task,
          ...(action.status && { status: action.status }),
          ...(action.priority && { priority: action.priority }),
          ...(action.dueDate && { dueDate: action.dueDate }),
          updatedAt: now,
        };
        return {
          ...s,
          tasks: s.tasks.map((t) => (t.id === task.id ? updated! : t)),
        };
      });
      if (ambiguous) {
        const titles = ambiguous
          .slice(0, 5)
          .map((t) => `"${t.title}"`)
          .join(", ");
        return {
          action: "update_task",
          success: false,
          detail: `Several tasks match "${action.titleMatch}" (${titles}). Nothing changed. Which one did you mean?`,
        };
      }
      if (!updated) {
        return {
          action: "update_task",
          success: false,
          detail: `No task matching "${action.titleMatch}"`,
        };
      }
      return {
        action: "update_task",
        success: true,
        detail: `Updated "${updated.title}"${action.status ? ` → ${action.status}` : ""}`,
      };
    }

    case "create_slack_item": {
      const item: SlackItem = {
        id: uuidv4(),
        channel: action.channel.startsWith("#") ? action.channel : `#${action.channel}`,
        summary: action.summary,
        action: action.action ?? "follow_up",
        priority: action.priority ?? "medium",
        dueDate: action.dueDate,
        completed: false,
        createdAt: now,
      };
      await updateStore((s) => ({ ...s, slackItems: [...s.slackItems, item] }));
      return {
        action: "create_slack_item",
        success: true,
        detail: `Tracked Slack item in ${item.channel}: "${item.summary}"`,
      };
    }

    case "complete_slack_item": {
      let found = false;
      await updateStore((s) => {
        found = false; // reset: the updater re-runs on optimistic retries
        const item = findSlackByMatch(s, action.titleMatch);
        if (!item) return s;
        found = true;
        return {
          ...s,
          slackItems: s.slackItems.map((i) =>
            i.id === item.id ? { ...i, completed: true } : i
          ),
        };
      });
      return found
        ? { action: "complete_slack_item", success: true, detail: "Marked Slack item done" }
        : {
            action: "complete_slack_item",
            success: false,
            detail: `No open Slack item matching "${action.titleMatch}"`,
          };
    }

    case "update_mail_status": {
      let found = false;
      await updateStore((s) => {
        found = false; // reset: the updater re-runs on optimistic retries
        const mail = findMailByMatch(s, action.titleMatch);
        if (!mail) return s;
        found = true;
        return {
          ...s,
          mailItems: s.mailItems.map((m) =>
            m.id === mail.id ? { ...m, status: action.status } : m
          ),
        };
      });
      return found
        ? {
            action: "update_mail_status",
            success: true,
            detail: `Updated mail status → ${action.status}`,
          }
        : {
            action: "update_mail_status",
            success: false,
            detail: `No mail matching "${action.titleMatch}"`,
          };
    }

    case "invalid_action":
      return { action: "invalid_action", success: false, detail: action.reason };
  }
}

export function formatActionResults(results: AssistantActionResult[]): string {
  if (results.length === 0) return "";
  const lines = results.map((r) => (r.success ? `✓ ${r.detail}` : `✗ ${r.detail}`));
  return `\n\n**Dashboard updated:**\n${lines.join("\n")}`;
}

/**
 * Asks the model to turn a write command into tool calls. Only the user's own message
 * is sent: dashboard context (Gmail snippets, Slack text) is third-party content and
 * must never reach this prompt. Tool output is untrusted and re-validated.
 */
export async function parseActionsWithOpenAI(
  message: string,
  apiKey: string,
  model: string
): Promise<ParsedAction[]> {
  if (!looksLikeWriteIntent(message)) return [];

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are Helpit action parser. The user is commanding their task dashboard. If they want to ADD, CREATE, UPDATE, COMPLETE, or TRACK something, call the matching tool(s) using only what the user wrote. Never invent values. If the message is a question, call no tools. There is no tool for deleting anything.",
        },
        { role: "user", content: message },
      ],
      tools: OPENAI_ACTION_TOOLS,
      tool_choice: "auto",
      temperature: 0.1,
    }),
  });

  if (!response.ok) return [];

  const data = await response.json();
  const toolCalls: unknown[] = Array.isArray(data.choices?.[0]?.message?.tool_calls)
    ? data.choices[0].message.tool_calls
    : [];
  const actions: ParsedAction[] = [];

  for (const call of toolCalls.slice(0, MAX_ACTIONS_PER_MESSAGE)) {
    const fn = (call as { function?: { name?: unknown; arguments?: unknown } })?.function;
    if (!fn || typeof fn.name !== "string") continue;
    try {
      const args = JSON.parse(typeof fn.arguments === "string" ? fn.arguments : "{}");
      actions.push(toolCallToAction(fn.name, args));
    } catch {
      actions.push({
        type: "invalid_action",
        reason: `Rejected ${fn.name}: malformed arguments`,
      });
    }
  }

  return actions;
}

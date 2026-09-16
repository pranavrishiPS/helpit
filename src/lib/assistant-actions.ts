import { v4 as uuidv4 } from "uuid";
import { addDays, format, nextFriday, startOfDay } from "date-fns";
import { updateStore } from "@/lib/db";
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
  | { type: "update_mail_status"; titleMatch: string; status: "done" | "needs_reply" | "drafted" };

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

export function parseDueDate(text: string): string | undefined {
  const lower = text.toLowerCase().trim();
  const today = startOfDay(new Date());

  if (lower === "today") return format(today, "yyyy-MM-dd");
  if (lower === "tomorrow") return format(addDays(today, 1), "yyyy-MM-dd");
  if (lower === "friday" || lower === "next friday") {
    return format(nextFriday(today), "yyyy-MM-dd");
  }

  const inDays = lower.match(/in (\d+) days?/);
  if (inDays) return format(addDays(today, parseInt(inDays[1])), "yyyy-MM-dd");

  const iso = lower.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];

  const slash = lower.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slash) {
    const month = parseInt(slash[1]);
    const day = parseInt(slash[2]);
    const year = slash[3]
      ? parseInt(slash[3].length === 2 ? `20${slash[3]}` : slash[3])
      : today.getFullYear();
    return format(new Date(year, month - 1, day), "yyyy-MM-dd");
  }

  return undefined;
}

function extractQuotedOrRest(text: string): string {
  const quoted = text.match(/["']([^"']+)["']/);
  if (quoted) return quoted[1].trim();
  return text.trim();
}

export function findTaskByMatch(store: DashboardStore, match: string): Task | undefined {
  const lower = match.toLowerCase().trim();
  if (!lower) return undefined;

  const exact = store.tasks.find((t) => t.title.toLowerCase() === lower);
  if (exact) return exact;

  const contains = store.tasks.filter((t) => t.title.toLowerCase().includes(lower));
  if (contains.length === 1) return contains[0];

  const reverse = store.tasks.filter(
    (t) => t.title.length >= 3 && lower.includes(t.title.toLowerCase())
  );
  if (reverse.length === 1) return reverse[0];

  return undefined;
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

export function parseLocalActions(message: string): ParsedAction[] {
  const actions: ParsedAction[] = [];
  const trimmed = message.trim();
  const lower = trimmed.toLowerCase();

  const bulkMatch = trimmed.match(/(?:add|create)\s+tasks?:?\s*\n([\s\S]+)/i);
  if (bulkMatch) {
    const lines = bulkMatch[1]
      .split("\n")
      .map((l) => l.replace(/^[\s\-*•\d.)]+/, "").trim())
      .filter(Boolean);
    for (const line of lines) {
      actions.push({ type: "create_task", title: line, priority: "medium" });
    }
    if (actions.length > 0) return actions;
  }

  if (lower.includes(",") && (lower.includes("title") || lower.startsWith("add data"))) {
    const csvBlock = trimmed.replace(/^add data:?\s*/i, "");
    const rows = csvBlock.split("\n").filter((r) => r.trim() && !r.toLowerCase().startsWith("title"));
    for (const row of rows) {
      const [title, priority, dueDate] = row.split(",").map((c) => c.trim());
      if (title) {
        actions.push({
          type: "create_task",
          title,
          priority: normalizePriority(priority) ?? "medium",
          dueDate: dueDate ? (parseDueDate(dueDate) ?? dueDate) : undefined,
        });
      }
    }
    if (actions.length > 0) return actions;
  }

  const completeTask = trimmed.match(
    /(?:mark|complete|finish|done)\s+(?:task\s+)?(.+?)(?:\s+as\s+done)?$/i
  );
  if (
    completeTask &&
    (lower.includes("mark") || lower.includes("complete") || lower.includes("finish") || lower.startsWith("done "))
  ) {
    actions.push({
      type: "update_task",
      titleMatch: extractQuotedOrRest(completeTask[1]),
      status: "done",
    });
    return actions;
  }

  const reminderMatch = trimmed.match(
    /(?:remind me(?:\s+to)?|add reminder(?:\s+to)?|set reminder(?:\s+for)?)\s+(.+)/i
  );
  if (reminderMatch) {
    let rest = reminderMatch[1];
    let dueDate: string | undefined;
    const duePart = rest.match(
      /\b(today|tomorrow|friday|next friday|in \d+ days?|\d{4}-\d{2}-\d{2})\b/i
    );
    if (duePart) {
      dueDate = parseDueDate(duePart[1]);
      rest = rest.replace(duePart[0], "").trim();
    }
    actions.push({
      type: "create_task",
      title: rest.replace(/\s+on\s+$/i, "").trim(),
      dueDate: dueDate ?? format(addDays(startOfDay(new Date()), 1), "yyyy-MM-dd"),
      priority: "medium",
    });
    return actions;
  }

  const slackMatch = trimmed.match(
    /(?:add|track|log)\s+slack(?:\s+item)?:?\s*(#[\w-]+)\s*[-:]\s*(.+)/i
  );
  if (slackMatch) {
    const summary = slackMatch[2];
    const priorityMatch = summary.match(/\bpriority\s+(low|medium|med|high|urgent)\b/i);
    const dueMatch = summary.match(/\bdue\s+(today|tomorrow|friday|\d{4}-\d{2}-\d{2})\b/i);
    actions.push({
      type: "create_slack_item",
      channel: slackMatch[1],
      summary: summary
        .replace(/\bpriority\s+\w+/i, "")
        .replace(/\bdue\s+\S+/i, "")
        .trim(),
      priority: priorityMatch ? normalizePriority(priorityMatch[1]) : "medium",
      dueDate: dueMatch ? parseDueDate(dueMatch[1]) : undefined,
    });
    return actions;
  }

  const completeSlack = trimmed.match(/(?:mark|complete|done)\s+slack(?:\s+item)?\s+(.+)/i);
  if (completeSlack) {
    actions.push({
      type: "complete_slack_item",
      titleMatch: extractQuotedOrRest(completeSlack[1]),
    });
    return actions;
  }

  const addTask = trimmed.match(/(?:add|create|new)\s+task:?\s+(.+)/i);
  if (addTask) {
    const rest = addTask[1];
    const priorityMatch = rest.match(/\b(?:priority\s+)?(low|medium|med|high|urgent)\b/i);
    const dueMatch = rest.match(
      /\b(?:due\s+)?(today|tomorrow|friday|next friday|in \d+ days?|\d{4}-\d{2}-\d{2})\b/i
    );
    let title = rest;
    if (priorityMatch) title = title.replace(priorityMatch[0], "").trim();
    if (dueMatch) title = title.replace(dueMatch[0], "").replace(/\bdue\b/i, "").trim();
    title = title.replace(/^["']|["']$/g, "").trim();
    actions.push({
      type: "create_task",
      title,
      priority: priorityMatch ? normalizePriority(priorityMatch[1]) : "medium",
      dueDate: dueMatch ? parseDueDate(dueMatch[1]) : undefined,
    });
    return actions;
  }

  return actions;
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
          dueDate: { type: "string" },
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
          dueDate: { type: "string" },
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

export function toolCallToAction(name: string, args: Record<string, unknown>): ParsedAction | null {
  switch (name) {
    case "create_task":
      return {
        type: "create_task",
        title: String(args.title),
        priority: args.priority as TaskPriority | undefined,
        dueDate: args.dueDate as string | undefined,
        description: args.description as string | undefined,
      };
    case "update_task":
      return {
        type: "update_task",
        titleMatch: String(args.titleMatch),
        status: args.status as TaskStatus | undefined,
        priority: args.priority as TaskPriority | undefined,
        dueDate: args.dueDate as string | undefined,
      };
    case "create_slack_item":
      return {
        type: "create_slack_item",
        channel: String(args.channel),
        summary: String(args.summary),
        priority: args.priority as TaskPriority | undefined,
        action: args.action as SlackItem["action"] | undefined,
        dueDate: args.dueDate as string | undefined,
      };
    case "complete_slack_item":
      return {
        type: "complete_slack_item",
        titleMatch: String(args.titleMatch),
      };
    default:
      return null;
  }
}

export async function executeActions(
  actions: ParsedAction[]
): Promise<AssistantActionResult[]> {
  const results: AssistantActionResult[] = [];

  for (const action of actions) {
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

  return results;
}

async function executeOneAction(action: ParsedAction): Promise<AssistantActionResult> {
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
      await updateStore((s) => {
        const task = findTaskByMatch(s, action.titleMatch);
        if (!task) return s;
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
  }
}

export function formatActionResults(results: AssistantActionResult[]): string {
  if (results.length === 0) return "";
  const lines = results.map((r) => (r.success ? `✓ ${r.detail}` : `✗ ${r.detail}`));
  return `\n\n**Dashboard updated:**\n${lines.join("\n")}`;
}

export function looksLikeWriteIntent(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    /^(add|create|new|set|log|track|remind|complete|mark|finish|done)\b/.test(lower) ||
    /add tasks?:/i.test(message) ||
    lower.startsWith("add data")
  );
}

export async function parseActionsWithOpenAI(
  message: string,
  context: string,
  apiKey: string,
  model: string
): Promise<ParsedAction[]> {
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
          content: `You are Helpit action parser. If the user wants to ADD, CREATE, UPDATE, COMPLETE, or TRACK something on their dashboard, call the appropriate tool(s). If they are only asking questions, do NOT call tools. Dashboard context:\n${context}`,
        },
        { role: "user", content: message },
      ],
      tools: OPENAI_ACTION_TOOLS,
      tool_choice: looksLikeWriteIntent(message) ? "auto" : "none",
      temperature: 0.1,
    }),
  });

  if (!response.ok) return [];

  const data = await response.json();
  const toolCalls = data.choices?.[0]?.message?.tool_calls ?? [];
  const actions: ParsedAction[] = [];

  for (const call of toolCalls) {
    const fn = call.function;
    if (!fn?.name) continue;
    try {
      const args = JSON.parse(fn.arguments ?? "{}");
      const parsed = toolCallToAction(fn.name, args);
      if (parsed) actions.push(parsed);
    } catch {
      // skip malformed tool call
    }
  }

  return actions;
}

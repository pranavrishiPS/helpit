import { NextRequest, NextResponse } from "next/server";
import { readStore } from "@/lib/db";
import { buildAssistantContext } from "@/lib/utils";
import {
  parseLocalActions,
  parseActionsWithOpenAI,
  executeActions,
  formatActionResults,
  looksLikeWriteIntent,
} from "@/lib/assistant-actions";
import { chatMessageSchema, parseBody } from "@/lib/validation";
import { isErrorResponse, parseJsonBody } from "@/lib/request";
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function localAssistantReply(message: string, context: string): string {
  const lower = message.toLowerCase();

  if (lower.includes("overdue") || lower.includes("late")) {
    const match = context.match(/## Overdue tasks \((\d+)\)([\s\S]*?)(?=##|$)/);
    if (match && parseInt(match[1]) > 0) {
      return `You have ${match[1]} overdue task(s):\n${match[2].trim()}\n\nWant me to help prioritize or draft follow-up messages?`;
    }
    return "No overdue tasks right now. You're on track.";
  }

  if (lower.includes("today") || lower.includes("priority")) {
    const todayMatch = context.match(/## Due today \((\d+)\)([\s\S]*?)(?=##|$)/);
    const slackMatch = context.match(/## Open Slack items \((\d+)\)([\s\S]*?)(?=##|$)/);
    const parts: string[] = ["Here's what needs attention today:"];

    if (todayMatch && parseInt(todayMatch[1]) > 0) {
      parts.push(`\n**Tasks due today (${todayMatch[1]}):**${todayMatch[2]}`);
    }
    if (slackMatch && parseInt(slackMatch[1]) > 0) {
      parts.push(`\n**Slack follow-ups (${slackMatch[1]}):**${slackMatch[2]}`);
    }
    if (parts.length === 1) {
      return "Nothing urgent flagged for today. Check Planning for upcoming releases or Outings for team events.";
    }
    return parts.join("\n");
  }

  if (lower.includes("release") || lower.includes("planning") || lower.includes("spec")) {
    const match = context.match(/## Active releases \((\d+)\)([\s\S]*?)(?=##|$)/);
    if (match) {
      return `Active releases:\n${match[2].trim()}\n\nI can help draft spec checklists or status updates for stakeholders.`;
    }
  }

  if (lower.includes("slack")) {
    const match = context.match(/## Open Slack items \((\d+)\)([\s\S]*?)(?=##|$)/);
    if (match && parseInt(match[1]) > 0) {
      return `Open Slack items:\n${match[2].trim()}\n\nHead to the Slack module to mark items done or convert to tasks.`;
    }
    return "No open Slack items tracked. Connect Slack in Settings or add items manually.";
  }

  if (lower.includes("mail") || lower.includes("support")) {
    const match = context.match(/## Mail needing action \((\d+)\)([\s\S]*?)(?=##|$)/);
    if (match && parseInt(match[1]) > 0) {
      return `Mail needing action:\n${match[2].trim()}`;
    }
    return "Inbox is clear on tracked items.";
  }

  if (lower.includes("outing") || lower.includes("budget")) {
    const match = context.match(/## Team outings([\s\S]*?)$/);
    if (match) {
      return `Outing status:\n${match[1].trim()}`;
    }
  }

  if (lower.includes("remind")) {
    const match = context.match(/## Coming up \((\d+)\)([\s\S]*?)(?=##|$)/);
    if (match && parseInt(match[1]) > 0) {
      return `Upcoming todos:\n${match[2].trim()}`;
    }
    return "No upcoming todos tracked right now.";
  }

  if (looksLikeWriteIntent(message)) {
    return `I can update your dashboard. Try:
- "Add task: Review Q3 calendar, high priority, due tomorrow"
- "Add tasks:" then a bullet list
- "Remind me to check D1/D7 tomorrow"
- "Add slack #live-ops: Eng needs reward table"
- "Mark task art follow-up as done"`;
  }

  return `I have full context on your tasks, Slack items, mail, releases, and outings.

Try asking:
- "What's overdue?"
- "What should I prioritize today?"
- "Status on releases?"
- "Any Slack follow-ups?"
- "Support mail summary?"

Or tell me to add/update items — I'll write to your dashboard.`;
}

async function aiReply(
  message: string,
  history: ChatMessage[],
  context: string,
  actionSummary?: string
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    const base = localAssistantReply(message, context);
    return actionSummary ? `${base}${actionSummary}` : base;
  }

  const systemContent = actionSummary
    ? `You are Helpit, a personal office assistant for a Game Producer at PlaySimple Games. Be concise and actionable. The user asked you to update their dashboard — you already executed these changes:\n${actionSummary}\n\nConfirm what was done briefly and offer next steps. Dashboard context:\n\n${context}`
    : `You are Helpit, a personal office assistant for a Game Producer at PlaySimple Games. Be concise, actionable, and use game-industry terms naturally. Flag blockers, owners, and deadlines. You have access to this dashboard context:\n\n${context}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      messages: [
        { role: "system", content: systemContent },
        ...history.slice(-6),
        { role: "user", content: message },
      ],
      temperature: 0.4,
      max_tokens: 800,
    }),
  });

  if (!response.ok) {
    const base = localAssistantReply(message, context);
    return actionSummary ? `Done.${actionSummary}` : base;
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (content) return content;
  if (actionSummary) return `Done.${actionSummary}`;
  return localAssistantReply(message, context);
}

async function resolveActions(
  message: string,
  context: string
): Promise<{ actions: Awaited<ReturnType<typeof parseLocalActions>>; source: "local" | "openai" }> {
  const local = parseLocalActions(message);
  if (local.length > 0) {
    return { actions: local, source: "local" };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey && looksLikeWriteIntent(message)) {
    const openaiActions = await parseActionsWithOpenAI(
      message,
      context,
      apiKey,
      process.env.OPENAI_MODEL ?? "gpt-4o-mini"
    );
    if (openaiActions.length > 0) {
      return { actions: openaiActions, source: "openai" };
    }
  }

  return { actions: [], source: "local" };
}

export async function POST(request: NextRequest) {
  const body = await parseJsonBody(request);
  if (isErrorResponse(body)) return body;

  const parsed = parseBody(chatMessageSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { message, history = [] } = parsed.data;
  const store = await readStore();
  const context = buildAssistantContext(store);

  const { actions } = await resolveActions(message, context);
  let actionResults: Awaited<ReturnType<typeof executeActions>> = [];
  let storeUpdated = false;

  if (actions.length > 0) {
    actionResults = await executeActions(actions);
    storeUpdated = actionResults.some((r) => r.success);
  }

  const actionSummary = formatActionResults(actionResults);
  const reply = await aiReply(message, history, context, actionSummary || undefined);

  return NextResponse.json({
    reply,
    hasAi: !!process.env.OPENAI_API_KEY,
    storeUpdated,
    actions: actionResults,
  });
}

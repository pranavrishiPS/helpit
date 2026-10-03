import { NextRequest, NextResponse } from "next/server";
import type { SlackSearchMatch } from "@/lib/slack";
import { importSlackMatches, parseMcpSlackSearchResults } from "@/lib/slack-import";
import { parseBody, slackImportSchema } from "@/lib/validation";
import { publicErrorMessage } from "@/lib/errors";
import { isErrorResponse, parseJsonBody } from "@/lib/request";

export async function POST(request: NextRequest) {
  const raw = await parseJsonBody(request);
  if (isErrorResponse(raw)) return raw;

  const parsed = parseBody(slackImportSchema, raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const { matches: rawMatches, results, userId, teamName } = parsed.data;

    const matches: SlackSearchMatch[] = [
      ...(rawMatches ?? []),
      ...(results ? parseMcpSlackSearchResults(results) : []),
    ];

    if (matches.length === 0) {
      return NextResponse.json(
        { error: "No Slack matches to import. Pass `matches` or MCP `results` text." },
        { status: 400 }
      );
    }

    const result = await importSlackMatches(matches, { userId, teamName });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = publicErrorMessage(err, "Import failed — check the server logs", "Slack import");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

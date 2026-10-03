import { NextRequest, NextResponse } from "next/server";
import { updateStore } from "@/lib/db";
import {
  addScrumMemberSchema,
  parseBody,
  removeScrumMemberSchema,
} from "@/lib/validation";
import { isErrorResponse, parseJsonBody, guardMutation } from "@/lib/request";

export async function POST(request: NextRequest) {
  const body = await parseJsonBody(request);
  if (isErrorResponse(body)) return body;
  const parsed = parseBody(addScrumMemberSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const name = parsed.data.name.trim();
  let duplicate = false;

  const updated = await updateStore((s) => {
    duplicate = false; // reset: the updater re-runs on optimistic retries
    const existing = s.scrumMembers ?? [];
    if (existing.some((m) => m.toLowerCase() === name.toLowerCase())) {
      duplicate = true;
      return s;
    }
    return { ...s, scrumMembers: [...existing, name] };
  });

  if (duplicate) {
    return NextResponse.json({ error: "Member already exists" }, { status: 400 });
  }

  return NextResponse.json(updated.scrumMembers, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const guard = guardMutation(request);
  if (guard) return guard;
  const name = request.nextUrl.searchParams.get("name");
  const parsed = parseBody(removeScrumMemberSchema, { name });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  // Case-insensitive, matching how POST dedupes names
  const target = parsed.data.name.trim().toLowerCase();
  await updateStore((s) => {
    const existing = s.scrumMembers ?? [];
    const next = existing.filter((m) => m.trim().toLowerCase() !== target);
    if (next.length === existing.length) return s; // nothing to remove
    return { ...s, scrumMembers: next };
  });

  return NextResponse.json({ success: true });
}

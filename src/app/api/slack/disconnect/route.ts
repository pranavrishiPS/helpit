import { NextRequest, NextResponse } from "next/server";
import { guardMutation } from "@/lib/request";
import { deleteSlackTokens } from "@/lib/slack-store";
import { updateStore } from "@/lib/db";

export async function POST(request: NextRequest) {
  const blocked = guardMutation(request);
  if (blocked) return blocked;

  await deleteSlackTokens();
  await updateStore((s) => ({
    ...s,
    integrations: {
      ...s.integrations,
      slack: {
        connected: false,
      },
    },
  }));
  return NextResponse.json({ ok: true });
}

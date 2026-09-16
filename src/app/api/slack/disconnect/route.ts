import { NextResponse } from "next/server";
import { deleteSlackTokens } from "@/lib/slack-store";
import { updateStore } from "@/lib/db";

export async function POST() {
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

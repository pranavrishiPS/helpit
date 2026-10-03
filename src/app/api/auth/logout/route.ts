import { NextRequest, NextResponse } from "next/server";
import { guardMutation } from "@/lib/request";
import { SITE_AUTH_COOKIE_NAME } from "@/lib/site-auth";

export async function POST(request: NextRequest) {
  const guard = guardMutation(request);
  if (guard) return guard;

  const res = NextResponse.json({ success: true });
  res.cookies.delete(SITE_AUTH_COOKIE_NAME);
  return res;
}

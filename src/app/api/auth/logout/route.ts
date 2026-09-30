import { NextResponse } from "next/server";
import { SITE_AUTH_COOKIE_NAME } from "@/lib/site-auth";

export async function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.delete(SITE_AUTH_COOKIE_NAME);
  return res;
}

import { NextRequest, NextResponse } from "next/server";
import { validateApiKey } from "@/lib/auth";

export function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const authError = validateApiKey(request);
  if (authError) return authError;

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};

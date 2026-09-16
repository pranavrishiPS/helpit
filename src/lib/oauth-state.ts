import { randomBytes } from "crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "helpit_oauth_state";
const MAX_AGE_SECONDS = 600;

export function createOAuthState(): string {
  return randomBytes(24).toString("hex");
}

export async function setOAuthStateCookie(state: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_NAME, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE_SECONDS,
    path: "/",
  });
}

export async function consumeOAuthState(state: string | null): Promise<boolean> {
  if (!state) return false;
  const jar = await cookies();
  const stored = jar.get(COOKIE_NAME)?.value;
  jar.delete(COOKIE_NAME);
  return stored === state;
}

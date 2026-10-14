import { cookies } from "next/headers";

// Where the Google Sheets OAuth callback sends the user back to. Allow-listed (no open redirect).

const COOKIE_NAME = "helpit_sheet_oauth_return";
const MAX_AGE_SECONDS = 600;
const RETURN_PATHS: Record<string, string> = {
  "release-calendar": "/release-calendar",
};
const DEFAULT_RETURN_PATH = "/scrum";

export async function setSheetReturnCookie(target: string | null): Promise<void> {
  const jar = await cookies();
  if (target && RETURN_PATHS[target]) {
    jar.set(COOKIE_NAME, target, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: MAX_AGE_SECONDS,
      path: "/",
    });
  } else {
    jar.delete(COOKIE_NAME);
  }
}

export async function consumeSheetReturnPath(): Promise<string> {
  const jar = await cookies();
  const target = jar.get(COOKIE_NAME)?.value;
  jar.delete(COOKIE_NAME);
  return (target && RETURN_PATHS[target]) || DEFAULT_RETURN_PATH;
}

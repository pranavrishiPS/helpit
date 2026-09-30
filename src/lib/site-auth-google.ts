import { google } from "googleapis";
import { getAppUrl } from "@/lib/app-url";

export function getLoginRedirectUri(): string {
  return `${getAppUrl()}/api/auth/google/callback`;
}

export function getLoginOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getLoginRedirectUri()
  );
}

export function getLoginAuthUrl(state?: string): string {
  const client = getLoginOAuth2Client();
  return client.generateAuthUrl({
    access_type: "online",
    scope: ["https://www.googleapis.com/auth/userinfo.email"],
    state,
    prompt: "select_account",
  });
}

export async function exchangeLoginCode(code: string): Promise<string> {
  const client = getLoginOAuth2Client();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const profile = await oauth2.userinfo.get();
  const email = profile.data.email;
  if (!email) throw new Error("Could not read the signed-in account's email.");
  return email;
}

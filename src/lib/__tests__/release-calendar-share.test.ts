import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { isApiKeyExemptPath, isSharePublicPath, isSiteAuthPublicPath } from "@/lib/auth";
import {
  getReleaseCalendarSharePath,
  getReleaseCalendarShareToken,
  isValidReleaseCalendarShareToken,
} from "@/lib/release-calendar-share";
import { createSessionToken } from "@/lib/site-auth";

const TOKEN = "a".repeat(20) + "b".repeat(20); // 40 chars

describe("release calendar share token guard", () => {
  it("is off when the env var is unset, blank or shorter than 32 characters", async () => {
    for (const value of [undefined, "", "   ", "x".repeat(31)]) {
      const env = { RELEASE_CALENDAR_SHARE_TOKEN: value };
      expect(getReleaseCalendarShareToken(env)).toBeNull();
      expect(getReleaseCalendarSharePath(env)).toBeNull();
      expect(await isValidReleaseCalendarShareToken(value ?? "anything", env)).toBe(false);
    }
  });

  it("accepts only the exact token", async () => {
    const env = { RELEASE_CALENDAR_SHARE_TOKEN: ` ${TOKEN} ` };
    expect(getReleaseCalendarShareToken(env)).toBe(TOKEN);
    expect(await isValidReleaseCalendarShareToken(TOKEN, env)).toBe(true);
    expect(await isValidReleaseCalendarShareToken(TOKEN.slice(0, -1), env)).toBe(false);
    expect(await isValidReleaseCalendarShareToken(`${TOKEN}x`, env)).toBe(false);
    expect(await isValidReleaseCalendarShareToken("", env)).toBe(false);
    expect(await isValidReleaseCalendarShareToken(undefined, env)).toBe(false);
  });

  it("builds the share path only from a valid token", () => {
    expect(getReleaseCalendarSharePath({ RELEASE_CALENDAR_SHARE_TOKEN: TOKEN })).toBe(
      `/share/release-calendar/${TOKEN}`
    );
  });
});

describe("share public paths", () => {
  it("opens exactly the share page and share API prefixes", () => {
    expect(isSharePublicPath(`/share/release-calendar/${TOKEN}`)).toBe(true);
    expect(isSharePublicPath(`/api/share/release-calendar/${TOKEN}/sync`)).toBe(true);
    expect(isApiKeyExemptPath(`/api/share/release-calendar/${TOKEN}/sync`)).toBe(true);

    expect(isSharePublicPath("/share/release-calendar")).toBe(false);
    expect(isSharePublicPath("/share/other/x")).toBe(false);
    expect(isSharePublicPath("/release-calendar")).toBe(false);
    expect(isSharePublicPath("/api/release-calendar")).toBe(false);
    expect(isSharePublicPath("/api/release-calendar/sync")).toBe(false);
    expect(isSharePublicPath("/api/store")).toBe(false);
    expect(isSiteAuthPublicPath(`/share/release-calendar/${TOKEN}`)).toBe(false);
  });
});

describe("middleware with site auth on", () => {
  const saved = {
    allowed: process.env.SITE_AUTH_ALLOWED_EMAILS,
    secret: process.env.SITE_AUTH_SECRET,
    apiKey: process.env.HELPIT_API_KEY,
  };

  beforeEach(() => {
    process.env.SITE_AUTH_ALLOWED_EMAILS = "pranavrishi@playsimple.in";
    process.env.SITE_AUTH_SECRET = "test-secret";
    process.env.HELPIT_API_KEY = "api-secret";
  });

  afterEach(() => {
    for (const [name, value] of [
      ["SITE_AUTH_ALLOWED_EMAILS", saved.allowed],
      ["SITE_AUTH_SECRET", saved.secret],
      ["HELPIT_API_KEY", saved.apiKey],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    vi.resetModules();
  });

  async function run(path: string, init: { method?: string; cookie?: string } = {}) {
    const { middleware } = await import("@/middleware");
    const headers: Record<string, string> = init.cookie ? { cookie: init.cookie } : {};
    return middleware(new NextRequest(new URL(path, "http://localhost"), { method: init.method, headers }));
  }

  it("lets share paths through without a session or API key, with no-referrer/no-store headers", async () => {
    const page = await run(`/share/release-calendar/${TOKEN}`);
    expect(page.status).toBe(200);
    expect(page.headers.get("location")).toBeNull();
    expect(page.headers.get("referrer-policy")).toBe("no-referrer");
    expect(page.headers.get("cache-control")).toBe("no-store");

    const api = await run(`/api/share/release-calendar/${TOKEN}/sync`, { method: "POST" });
    expect(api.status).toBe(200);
  });

  it("still redirects pages to /login and 401s APIs without a session", async () => {
    const page = await run("/release-calendar");
    expect(page.headers.get("location")).toContain("/login");

    for (const path of ["/api/release-calendar", "/api/store", "/api/share/other"]) {
      expect((await run(path)).status).toBe(401);
    }
  });

  it("lets a signed-in session reach the owner API", async () => {
    const { SITE_AUTH_COOKIE_NAME } = await import("@/lib/site-auth");
    const token = await createSessionToken("pranavrishi@playsimple.in");
    const res = await run("/api/release-calendar", { cookie: `${SITE_AUTH_COOKIE_NAME}=${token}` });
    expect(res.status).toBe(200);
  });
});

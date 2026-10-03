import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import * as authModule from "@/lib/auth";
import {
  getApiKeyFromRequest,
  getAuthConfigError,
  isApiAuthEnabled,
  isApiKeyExemptPath,
  isProductionRuntime,
  isPublicApiPath,
  isSiteAuthPublicPath,
  timingSafeEqualStrings,
  validateApiKey,
} from "@/lib/auth";

function request(path: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(new URL(path, "http://localhost"), { headers });
}

describe("auth", () => {
  const originalServerKey = process.env.HELPIT_API_KEY;

  afterEach(() => {
    if (originalServerKey === undefined) delete process.env.HELPIT_API_KEY;
    else process.env.HELPIT_API_KEY = originalServerKey;
  });

  describe("isApiAuthEnabled", () => {
    it("is false when HELPIT_API_KEY is unset or blank", () => {
      delete process.env.HELPIT_API_KEY;
      expect(isApiAuthEnabled()).toBe(false);

      process.env.HELPIT_API_KEY = "   ";
      expect(isApiAuthEnabled()).toBe(false);
    });

    it("is true when HELPIT_API_KEY is set", () => {
      process.env.HELPIT_API_KEY = "secret";
      expect(isApiAuthEnabled()).toBe(true);
    });
  });

  describe("getApiKeyFromRequest", () => {
    it("prefers the x-helpit-api-key header over an authorization header", () => {
      const req = request("/api/tasks", {
        "x-helpit-api-key": "from-header",
        authorization: "Bearer from-bearer",
      });
      expect(getApiKeyFromRequest(req)).toBe("from-header");
    });

    it("falls back to a Bearer authorization header", () => {
      const req = request("/api/tasks", { authorization: "Bearer from-bearer" });
      expect(getApiKeyFromRequest(req)).toBe("from-bearer");
    });

    it("returns null when neither header is present", () => {
      expect(getApiKeyFromRequest(request("/api/tasks"))).toBeNull();
    });
  });

  describe("isPublicApiPath", () => {
    it("treats OAuth auth/callback paths as public", () => {
      expect(isPublicApiPath("/api/slack/callback")).toBe(true);
      expect(isPublicApiPath("/api/gmail/auth")).toBe(true);
      expect(isPublicApiPath("/api/slack/callback/extra")).toBe(true);
    });

    it("treats other API paths as protected", () => {
      expect(isPublicApiPath("/api/tasks")).toBe(false);
      expect(isPublicApiPath("/api/slack/sync")).toBe(false);
    });
  });

  describe("isSiteAuthPublicPath", () => {
    it("only lets the site sign-in routes bypass the site-auth session", () => {
      expect(isSiteAuthPublicPath("/login")).toBe(true);
      expect(isSiteAuthPublicPath("/api/auth/google/login")).toBe(true);
      expect(isSiteAuthPublicPath("/api/auth/google/callback")).toBe(true);
    });

    it("requires a session for OAuth start/callback routes and everything else", () => {
      expect(isSiteAuthPublicPath("/api/gmail/auth")).toBe(false);
      expect(isSiteAuthPublicPath("/api/gmail/callback")).toBe(false);
      expect(isSiteAuthPublicPath("/api/slack/auth")).toBe(false);
      expect(isSiteAuthPublicPath("/api/slack/callback")).toBe(false);
      expect(isSiteAuthPublicPath("/api/scrum-attendance/sheet/auth")).toBe(false);
      expect(isSiteAuthPublicPath("/api/scrum-attendance/sheet/callback")).toBe(false);
      expect(isSiteAuthPublicPath("/api/tasks")).toBe(false);
    });
  });

  describe("isApiKeyExemptPath", () => {
    it("exempts OAuth routes and Google site sign-in from the API key", () => {
      expect(isApiKeyExemptPath("/api/gmail/callback")).toBe(true);
      expect(isApiKeyExemptPath("/api/scrum-attendance/sheet/auth")).toBe(true);
      expect(isApiKeyExemptPath("/api/auth/google/login")).toBe(true);
      expect(isApiKeyExemptPath("/api/auth/google/callback")).toBe(true);
    });

    it("does not exempt other API paths", () => {
      expect(isApiKeyExemptPath("/api/tasks")).toBe(false);
      expect(isApiKeyExemptPath("/api/auth/google/other")).toBe(false);
    });
  });

  describe("validateApiKey", () => {
    it("lets Google site sign-in through without a key when auth is enabled", async () => {
      process.env.HELPIT_API_KEY = "secret";
      expect(await validateApiKey(request("/api/auth/google/login"))).toBeNull();
      expect(await validateApiKey(request("/api/auth/google/callback"))).toBeNull();
    });

    it("allows every request through when auth is disabled", async () => {
      delete process.env.HELPIT_API_KEY;
      expect(await validateApiKey(request("/api/tasks"))).toBeNull();
    });

    it("allows public OAuth paths through even when auth is enabled", async () => {
      process.env.HELPIT_API_KEY = "secret";
      expect(await validateApiKey(request("/api/gmail/callback"))).toBeNull();
    });

    it("rejects protected requests missing or with the wrong key", async () => {
      process.env.HELPIT_API_KEY = "secret";
      const withoutKey = await validateApiKey(request("/api/tasks"));
      const wrongKey = await validateApiKey(
        request("/api/tasks", { "x-helpit-api-key": "wrong" })
      );
      const prefixKey = await validateApiKey(
        request("/api/tasks", { "x-helpit-api-key": "secre" })
      );
      const longerKey = await validateApiKey(
        request("/api/tasks", { "x-helpit-api-key": "secret-extra" })
      );

      expect(withoutKey?.status).toBe(401);
      expect(wrongKey?.status).toBe(401);
      expect(prefixKey?.status).toBe(401);
      expect(longerKey?.status).toBe(401);
    });

    it("allows protected requests with the correct key (header or Bearer)", async () => {
      process.env.HELPIT_API_KEY = "secret";
      const viaHeader = request("/api/tasks", { "x-helpit-api-key": "secret" });
      const viaBearer = request("/api/tasks", { authorization: "Bearer secret" });
      expect(await validateApiKey(viaHeader)).toBeNull();
      expect(await validateApiKey(viaBearer)).toBeNull();
    });
  });

  describe("timingSafeEqualStrings", () => {
    it("matches equal strings and rejects different ones", async () => {
      expect(await timingSafeEqualStrings("secret", "secret")).toBe(true);
      expect(await timingSafeEqualStrings("secret", "secreT")).toBe(false);
      expect(await timingSafeEqualStrings("secret", "")).toBe(false);
      expect(await timingSafeEqualStrings("", "")).toBe(true);
    });
  });

  describe("no public client key", () => {
    it("no longer exports browser API-key helpers", () => {
      const mod = authModule as Record<string, unknown>;
      expect(mod.getClientApiKey).toBeUndefined();
      expect(mod.apiAuthHeaders).toBeUndefined();
    });
  });

  describe("isProductionRuntime", () => {
    it("is true on Vercel or NODE_ENV=production", () => {
      expect(isProductionRuntime({ VERCEL: "1" })).toBe(true);
      expect(isProductionRuntime({ NODE_ENV: "production" })).toBe(true);
    });

    it("is false for dev/test and for next build", () => {
      expect(isProductionRuntime({ NODE_ENV: "development" })).toBe(false);
      expect(isProductionRuntime({ NODE_ENV: "test" })).toBe(false);
      expect(
        isProductionRuntime({
          NODE_ENV: "production",
          VERCEL: "1",
          NEXT_PHASE: "phase-production-build",
        })
      ).toBe(false);
    });
  });

  describe("getAuthConfigError (fail closed)", () => {
    const base = {
      production: true,
      siteAuthEnabled: false,
      siteAuthMisconfigured: false,
      apiKeyEnabled: false,
    };

    it("refuses production with no gate configured", () => {
      expect(getAuthConfigError(base)).toMatch(/Auth not configured/);
    });

    it("refuses production when site auth has an allow-list but no secret", () => {
      expect(
        getAuthConfigError({ ...base, siteAuthMisconfigured: true, apiKeyEnabled: true })
      ).toMatch(/SITE_AUTH_SECRET/);
    });

    it("serves production when site auth is configured (with or without an API key)", () => {
      expect(getAuthConfigError({ ...base, siteAuthEnabled: true })).toBeNull();
      expect(
        getAuthConfigError({ ...base, siteAuthEnabled: true, apiKeyEnabled: true })
      ).toBeNull();
    });

    it("refuses production with only HELPIT_API_KEY (browser can't send it)", () => {
      expect(getAuthConfigError({ ...base, apiKeyEnabled: true })).toMatch(
        /SITE_AUTH_ALLOWED_EMAILS and SITE_AUTH_SECRET/
      );
    });

    it("never blocks non-production (dev, test, build)", () => {
      expect(getAuthConfigError({ ...base, production: false })).toBeNull();
      expect(
        getAuthConfigError({ ...base, production: false, siteAuthMisconfigured: true })
      ).toBeNull();
    });
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  apiAuthHeaders,
  getApiKeyFromRequest,
  getClientApiKey,
  isApiAuthEnabled,
  isPublicApiPath,
  validateApiKey,
} from "@/lib/auth";

function request(path: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(new URL(path, "http://localhost"), { headers });
}

describe("auth", () => {
  const originalServerKey = process.env.HELPIT_API_KEY;
  const originalClientKey = process.env.NEXT_PUBLIC_HELPIT_API_KEY;

  afterEach(() => {
    process.env.HELPIT_API_KEY = originalServerKey;
    process.env.NEXT_PUBLIC_HELPIT_API_KEY = originalClientKey;
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

  describe("validateApiKey", () => {
    it("allows every request through when auth is disabled", () => {
      delete process.env.HELPIT_API_KEY;
      expect(validateApiKey(request("/api/tasks"))).toBeNull();
    });

    it("allows public OAuth paths through even when auth is enabled", () => {
      process.env.HELPIT_API_KEY = "secret";
      expect(validateApiKey(request("/api/gmail/callback"))).toBeNull();
    });

    it("rejects protected requests missing or with the wrong key", () => {
      process.env.HELPIT_API_KEY = "secret";
      const withoutKey = validateApiKey(request("/api/tasks"));
      const wrongKey = validateApiKey(request("/api/tasks", { "x-helpit-api-key": "wrong" }));

      expect(withoutKey?.status).toBe(401);
      expect(wrongKey?.status).toBe(401);
    });

    it("allows protected requests with the correct key", () => {
      process.env.HELPIT_API_KEY = "secret";
      const req = request("/api/tasks", { "x-helpit-api-key": "secret" });
      expect(validateApiKey(req)).toBeNull();
    });
  });

  describe("getClientApiKey / apiAuthHeaders", () => {
    it("has no client key and defaults headers in a server (non-browser) environment", () => {
      process.env.NEXT_PUBLIC_HELPIT_API_KEY = "client-secret";
      expect(getClientApiKey()).toBeUndefined();
      expect(apiAuthHeaders()).toEqual({ "Content-Type": "application/json" });
    });
  });
});

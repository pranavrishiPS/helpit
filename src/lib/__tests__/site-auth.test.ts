import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSessionToken,
  isEmailAllowed,
  isSiteAuthEnabled,
  verifySessionToken,
} from "@/lib/site-auth";

describe("site-auth", () => {
  const originalAllowed = process.env.SITE_AUTH_ALLOWED_EMAILS;
  const originalSecret = process.env.SITE_AUTH_SECRET;

  beforeEach(() => {
    process.env.SITE_AUTH_ALLOWED_EMAILS = "pranavrishi@playsimple.in";
    process.env.SITE_AUTH_SECRET = "test-secret";
  });

  afterEach(() => {
    process.env.SITE_AUTH_ALLOWED_EMAILS = originalAllowed;
    process.env.SITE_AUTH_SECRET = originalSecret;
    vi.useRealTimers();
  });

  describe("isSiteAuthEnabled", () => {
    it("is true when both an allow-list and a secret are set", () => {
      expect(isSiteAuthEnabled()).toBe(true);
    });

    it("is false when the allow-list is empty", () => {
      process.env.SITE_AUTH_ALLOWED_EMAILS = "";
      expect(isSiteAuthEnabled()).toBe(false);
    });

    it("is false when no secret is available", () => {
      process.env.SITE_AUTH_SECRET = "";
      delete process.env.GOOGLE_CLIENT_SECRET;
      expect(isSiteAuthEnabled()).toBe(false);
    });
  });

  describe("isEmailAllowed", () => {
    it("matches case-insensitively", () => {
      expect(isEmailAllowed("PranavRishi@PlaySimple.in")).toBe(true);
      expect(isEmailAllowed("someone.else@playsimple.in")).toBe(false);
    });

    it("supports a comma-separated list", () => {
      process.env.SITE_AUTH_ALLOWED_EMAILS = "a@x.com, b@x.com";
      expect(isEmailAllowed("b@x.com")).toBe(true);
      expect(isEmailAllowed("c@x.com")).toBe(false);
    });
  });

  describe("createSessionToken / verifySessionToken", () => {
    it("round-trips a valid token back to the same email", async () => {
      const token = await createSessionToken("pranavrishi@playsimple.in");
      expect(await verifySessionToken(token)).toBe("pranavrishi@playsimple.in");
    });

    it("rejects a tampered signature", async () => {
      const token = await createSessionToken("pranavrishi@playsimple.in");
      const [payload] = token.split(".");
      const tampered = `${payload}.deadbeef`;
      expect(await verifySessionToken(tampered)).toBeNull();
    });

    it("rejects a token whose payload was swapped to an allowed-looking email", async () => {
      const token = await createSessionToken("pranavrishi@playsimple.in");
      const [, signature] = token.split(".");
      const forgedPayload = Buffer.from(`attacker@evil.com|${Date.now() + 100000}`).toString(
        "base64url"
      );
      expect(await verifySessionToken(`${forgedPayload}.${signature}`)).toBeNull();
    });

    it("rejects an expired token", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
      const token = await createSessionToken("pranavrishi@playsimple.in");
      vi.setSystemTime(new Date("2026-02-01T00:00:00.000Z"));
      expect(await verifySessionToken(token)).toBeNull();
    });

    it("rejects a well-formed token for an email no longer on the allow-list", async () => {
      const token = await createSessionToken("pranavrishi@playsimple.in");
      process.env.SITE_AUTH_ALLOWED_EMAILS = "someone.else@playsimple.in";
      expect(await verifySessionToken(token)).toBeNull();
    });

    it("rejects garbage input", async () => {
      expect(await verifySessionToken(undefined)).toBeNull();
      expect(await verifySessionToken("")).toBeNull();
      expect(await verifySessionToken("not-a-real-token")).toBeNull();
    });
  });
});

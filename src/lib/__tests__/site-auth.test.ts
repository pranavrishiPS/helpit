import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSessionToken,
  isEmailAllowed,
  isSiteAuthEnabled,
  isSiteAuthMisconfigured,
  verifySessionToken,
} from "@/lib/site-auth";
import { exchangeLoginCode } from "@/lib/site-auth-google";

const userinfoGet = vi.hoisted(() => vi.fn());
vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: class {
        getToken = async () => ({ tokens: {} });
        setCredentials() {}
      },
    },
    oauth2: () => ({ userinfo: { get: userinfoGet } }),
  },
}));

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe("site-auth", () => {
  const originalAllowed = process.env.SITE_AUTH_ALLOWED_EMAILS;
  const originalSecret = process.env.SITE_AUTH_SECRET;
  const originalGoogleSecret = process.env.GOOGLE_CLIENT_SECRET;

  beforeEach(() => {
    process.env.SITE_AUTH_ALLOWED_EMAILS = "pranavrishi@playsimple.in";
    process.env.SITE_AUTH_SECRET = "test-secret";
  });

  afterEach(() => {
    restore("SITE_AUTH_ALLOWED_EMAILS", originalAllowed);
    restore("SITE_AUTH_SECRET", originalSecret);
    restore("GOOGLE_CLIENT_SECRET", originalGoogleSecret);
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

    it("does not fall back to GOOGLE_CLIENT_SECRET as the signing secret", async () => {
      process.env.SITE_AUTH_SECRET = "";
      process.env.GOOGLE_CLIENT_SECRET = "google-secret";
      expect(isSiteAuthEnabled()).toBe(false);
      expect(isSiteAuthMisconfigured()).toBe(true);
      await expect(createSessionToken("pranavrishi@playsimple.in")).rejects.toThrow();
      expect(await verifySessionToken("abc.def")).toBeNull();
    });
  });

  describe("isSiteAuthMisconfigured", () => {
    it("is true only when an allow-list is set without a secret", () => {
      expect(isSiteAuthMisconfigured()).toBe(false);
      process.env.SITE_AUTH_SECRET = "";
      expect(isSiteAuthMisconfigured()).toBe(true);
      process.env.SITE_AUTH_ALLOWED_EMAILS = "";
      expect(isSiteAuthMisconfigured()).toBe(false);
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
      expect(await verifySessionToken("!!!.???")).toBeNull();
    });
  });

  describe("exchangeLoginCode (Google userinfo)", () => {
    it("returns the email when verified_email is true", async () => {
      userinfoGet.mockResolvedValue({ data: { email: "a@x.com", verified_email: true } });
      expect(await exchangeLoginCode("code")).toBe("a@x.com");
    });

    it("rejects an unverified email", async () => {
      userinfoGet.mockResolvedValue({ data: { email: "a@x.com", verified_email: false } });
      await expect(exchangeLoginCode("code")).rejects.toThrow(/not verified/);
    });

    it("rejects when verified_email is missing or not strictly true", async () => {
      userinfoGet.mockResolvedValue({ data: { email: "a@x.com" } });
      await expect(exchangeLoginCode("code")).rejects.toThrow(/not verified/);
      userinfoGet.mockResolvedValue({ data: { email: "a@x.com", verified_email: "true" } });
      await expect(exchangeLoginCode("code")).rejects.toThrow(/not verified/);
    });
  });
});

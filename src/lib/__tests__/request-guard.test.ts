import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { checkMutationRequest, parseJsonBody, isErrorResponse, requestHasBody } from "@/lib/request";

function check(method: string, headers: Record<string, string>, hasBody = true) {
  return checkMutationRequest({
    method,
    headers: new Headers(headers),
    hasBody,
    urlHost: "localhost:3000",
    appUrl: "http://localhost:3000",
  });
}

describe("checkMutationRequest", () => {
  it("rejects a text/plain body (CORS-preflight-free cross-site POST)", () => {
    expect(check("POST", { "content-type": "text/plain" })?.status).toBe(415);
    expect(check("POST", {})?.status).toBe(415);
    expect(check("PATCH", { "content-type": "application/x-www-form-urlencoded" })?.status).toBe(415);
  });

  it("accepts application/json, with charset or +json", () => {
    expect(check("POST", { "content-type": "application/json" })).toBeNull();
    expect(check("POST", { "content-type": "application/json; charset=utf-8" })).toBeNull();
    expect(check("PUT", { "content-type": "application/merge-patch+json" })).toBeNull();
  });

  it("rejects cross-site Origin and Sec-Fetch-Site", () => {
    const json = { "content-type": "application/json" };
    expect(check("POST", { ...json, origin: "https://evil.example" })?.status).toBe(403);
    expect(check("POST", { ...json, origin: "null" })?.status).toBe(403);
    expect(check("POST", { ...json, "sec-fetch-site": "cross-site" })?.status).toBe(403);
    expect(check("DELETE", { origin: "https://evil.example" }, false)?.status).toBe(403);
  });

  it("allows same-origin browsers and header-less scripts", () => {
    const json = { "content-type": "application/json" };
    expect(check("POST", { ...json, origin: "http://localhost:3000", "sec-fetch-site": "same-origin" })).toBeNull();
    expect(check("POST", { ...json, "sec-fetch-site": "none" })).toBeNull();
    expect(check("POST", { ...json, origin: "http://localhost:3000", host: "localhost:3000" })).toBeNull();
    expect(check("POST", json)).toBeNull(); // curl / scripts: no Origin
    expect(check("DELETE", {}, false)).toBeNull(); // bodyless
  });

  it("does not touch GET (OAuth callbacks)", () => {
    expect(
      check("GET", { origin: "https://accounts.google.com", "sec-fetch-site": "cross-site" }, false)
    ).toBeNull();
  });

  it("matches the request host when the app URL differs", () => {
    const failure = checkMutationRequest({
      method: "POST",
      headers: new Headers({
        "content-type": "application/json",
        origin: "https://helpit.example",
        host: "helpit.example",
      }),
      hasBody: true,
      urlHost: "helpit.example",
      appUrl: "http://localhost:3000",
    });
    expect(failure).toBeNull();
  });
});

describe("parseJsonBody", () => {
  it("rejects text/plain bodies even if they contain valid JSON", async () => {
    const res = await parseJsonBody(
      new NextRequest("http://localhost/api/tasks", {
        method: "POST",
        body: '{"a":1}',
        headers: { "content-type": "text/plain" },
      })
    );
    expect(isErrorResponse(res)).toBe(true);
    expect((res as Response).status).toBe(415);
  });

  it("rejects a cross-origin JSON post", async () => {
    const res = await parseJsonBody(
      new NextRequest("http://localhost/api/tasks", {
        method: "POST",
        body: "{}",
        headers: { "content-type": "application/json", origin: "https://evil.example" },
      })
    );
    expect((res as Response).status).toBe(403);
  });

  it("parses a same-origin JSON body", async () => {
    const res = await parseJsonBody(
      new NextRequest("http://localhost/api/tasks", {
        method: "POST",
        body: '{"a":1}',
        headers: { "content-type": "application/json", origin: "http://localhost" },
      })
    );
    expect(res).toEqual({ a: 1 });
  });
});

describe("requestHasBody", () => {
  it("is false for a body-less request with no content-length (e.g. logout, DELETE)", () => {
    expect(requestHasBody(new Headers())).toBe(false);
    expect(requestHasBody(new Headers({ "content-length": "0" }))).toBe(false);
  });

  it("is true when a body is declared", () => {
    expect(requestHasBody(new Headers({ "content-length": "12" }))).toBe(true);
    expect(requestHasBody(new Headers({ "transfer-encoding": "chunked" }))).toBe(true);
  });
});

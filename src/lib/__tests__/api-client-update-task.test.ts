import { afterEach, describe, expect, it, vi } from "vitest";
import { updateTask } from "@/lib/api-client";

function stubFetch() {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "t1" }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function sentBody(fetchMock: ReturnType<typeof stubFetch>) {
  const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
  return JSON.parse(calls[0][1].body as string);
}

afterEach(() => vi.unstubAllGlobals());

describe("updateTask", () => {
  it("sends null for a field explicitly set to undefined so the server clears it", async () => {
    const fetchMock = stubFetch();
    await updateTask("t1", { reminderAt: undefined, status: "todo" });
    expect(sentBody(fetchMock)).toEqual({ id: "t1", reminderAt: null, status: "todo" });
  });

  it("leaves absent fields out of the PATCH", async () => {
    const fetchMock = stubFetch();
    await updateTask("t1", { status: "done" });
    expect(sentBody(fetchMock)).toEqual({ id: "t1", status: "done" });
  });
});

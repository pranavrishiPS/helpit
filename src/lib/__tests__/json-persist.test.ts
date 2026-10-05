import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "fs";
import { jsonExists, readJsonText, readJsonTextWithEtag, writeJsonTextIfMatch } from "@/lib/json-persist";

const blob = vi.hoisted(() => {
  class BlobNotFoundError extends Error {}
  class BlobPreconditionFailedError extends Error {}
  return { BlobNotFoundError, BlobPreconditionFailedError, get: vi.fn(), put: vi.fn() };
});
vi.mock("@vercel/blob", () => blob);

function fsError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`${code}: simulated`), { code });
}

describe("json-persist (local filesystem)", () => {
  beforeEach(() => {
    // Never exercise the Blob branch (or any production data) from tests.
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    vi.stubEnv("VERCEL", "");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe("readJsonText", () => {
    it("returns null when the file is missing (ENOENT)", async () => {
      vi.spyOn(fs, "readFile").mockRejectedValueOnce(fsError("ENOENT"));
      await expect(readJsonText("store.json")).resolves.toBeNull();
    });

    it("returns null for an empty or whitespace-only file", async () => {
      vi.spyOn(fs, "readFile").mockResolvedValueOnce("  \n");
      await expect(readJsonText("store.json")).resolves.toBeNull();
    });

    it.each(["EBUSY", "EPERM", "EACCES"])("rethrows %s instead of reporting the file as missing", async (code) => {
      vi.spyOn(fs, "readFile").mockRejectedValueOnce(fsError(code));
      await expect(readJsonText("store.json")).rejects.toMatchObject({ code });
    });
  });

  describe("jsonExists", () => {
    it("returns false only for ENOENT", async () => {
      vi.spyOn(fs, "access").mockRejectedValueOnce(fsError("ENOENT"));
      await expect(jsonExists("store.json")).resolves.toBe(false);
    });

    it("returns true when the file is accessible", async () => {
      vi.spyOn(fs, "access").mockResolvedValueOnce(undefined);
      await expect(jsonExists("store.json")).resolves.toBe(true);
    });

    it("rethrows other errors since existence can't be determined", async () => {
      vi.spyOn(fs, "access").mockRejectedValueOnce(fsError("EACCES"));
      await expect(jsonExists("store.json")).rejects.toMatchObject({ code: "EACCES" });
    });
  });
});

describe("json-persist (Blob conditional writes, mocked SDK)", () => {
  beforeEach(() => {
    // Mocked SDK only; VERCEL=1 selects the Blob branch without any real token.
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    vi.stubEnv("VERCEL", "1");
    blob.get.mockReset();
    blob.put.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  const body = (text: string) => ({
    statusCode: 200,
    stream: new Response(text).body,
    blob: { etag: '"abc"' },
  });

  it("readJsonTextWithEtag returns text and etag from one response", async () => {
    blob.get.mockResolvedValueOnce(body('{"a":1}'));
    await expect(readJsonTextWithEtag("store.json")).resolves.toEqual({ text: '{"a":1}', etag: '"abc"' });
  });

  it("readJsonTextWithEtag returns nulls for a missing blob and rethrows other errors", async () => {
    blob.get.mockRejectedValueOnce(new blob.BlobNotFoundError());
    await expect(readJsonTextWithEtag("store.json")).resolves.toEqual({ text: null, etag: null });
    blob.get.mockRejectedValueOnce(new Error("network down"));
    await expect(readJsonTextWithEtag("store.json")).rejects.toThrow(/network down/);
  });

  // Conditional (ifMatch) Blob writes are switched off (BLOB_CONDITIONAL_WRITES) after they
  // failed every production save; an existing blob is overwritten unconditionally.
  it("writeJsonTextIfMatch overwrites an existing blob without ifMatch", async () => {
    blob.put.mockClear();
    blob.put.mockResolvedValueOnce({});
    await expect(writeJsonTextIfMatch("store.json", "x", '"abc"')).resolves.toBe(true);
    expect(blob.put).toHaveBeenCalledTimes(1);
    const opts = blob.put.mock.calls[0][2];
    expect(opts.allowOverwrite).toBe(true);
    expect(opts.ifMatch).toBeUndefined();
  });

  it("writeJsonTextIfMatch overwrites unconditionally when the blob exists but the SDK gave no ETag", async () => {
    blob.put.mockClear();
    blob.put.mockResolvedValueOnce({});
    await expect(writeJsonTextIfMatch("store.json", "x", "")).resolves.toBe(true);
    const opts = blob.put.mock.calls[0][2];
    expect(opts.allowOverwrite).toBe(true);
    expect(opts.ifMatch).toBeUndefined();
  });

  it("writeJsonTextIfMatch creates without overwrite when there is no blob yet", async () => {
    blob.put.mockClear();
    blob.put.mockResolvedValueOnce({});
    await expect(writeJsonTextIfMatch("store.json", "x", null)).resolves.toBe(true);
    const opts = blob.put.mock.calls[0][2];
    expect(opts.allowOverwrite).toBe(false);
    expect(opts.ifMatch).toBeUndefined();
  });

  it("writeJsonTextIfMatch returns false when a create-only write loses the race, throws otherwise", async () => {
    blob.put.mockRejectedValueOnce(new Error("This blob already exists"));
    await expect(writeJsonTextIfMatch("store.json", "x", null)).resolves.toBe(false);
    blob.put.mockRejectedValueOnce(new Error("boom"));
    await expect(writeJsonTextIfMatch("store.json", "x", null)).rejects.toThrow(/boom/);
    blob.put.mockRejectedValueOnce(new Error("blob store down"));
    await expect(writeJsonTextIfMatch("store.json", "x", '"abc"')).rejects.toThrow(/blob store down/);
  });
});

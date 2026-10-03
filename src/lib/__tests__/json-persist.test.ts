import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "fs";
import { jsonExists, readJsonText } from "@/lib/json-persist";

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

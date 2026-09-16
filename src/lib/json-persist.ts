import { promises as fs } from "fs";
import path from "path";
import lockfile from "proper-lockfile";

const DATA_DIR = path.join(process.cwd(), "data");
const LOCK_OPTIONS = { retries: { retries: 5, minTimeout: 50, maxTimeout: 500 } };

/** Vercel’s function filesystem is ephemeral; persist JSON in Blob there. */
export function usesBlobStore(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL === "1");
}

async function readBlobText(pathname: string): Promise<string | null> {
  const { get } = await import("@vercel/blob");
  try {
    const result = await get(pathname, { access: "private", useCache: false });
    if (!result?.stream) return null;
    const text = await new Response(result.stream).text();
    return text.trim() ? text : null;
  } catch {
    return null;
  }
}

async function writeBlobText(pathname: string, content: string): Promise<void> {
  const { put } = await import("@vercel/blob");
  await put(pathname, content, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export async function withJsonLock<T>(filename: string, fn: () => Promise<T>): Promise<T> {
  if (usesBlobStore()) {
    return fn();
  }

  const filePath = path.join(DATA_DIR, filename);
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, "", "utf-8");
  }
  const release = await lockfile.lock(filePath, LOCK_OPTIONS);
  try {
    return await fn();
  } finally {
    await release();
  }
}

export async function readJsonText(filename: string): Promise<string | null> {
  if (usesBlobStore()) {
    return readBlobText(filename);
  }
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, filename), "utf-8");
    return raw.trim() ? raw : null;
  } catch {
    return null;
  }
}

export async function writeJsonText(filename: string, content: string): Promise<void> {
  if (usesBlobStore()) {
    await writeBlobText(filename, content);
    return;
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  const filePath = path.join(DATA_DIR, filename);
  const tmpPath = `${filePath}.tmp`;
  await fs.writeFile(tmpPath, content, "utf-8");
  await fs.rename(tmpPath, filePath);
}

export async function deleteJson(filename: string): Promise<void> {
  if (usesBlobStore()) {
    try {
      const { del } = await import("@vercel/blob");
      await del(filename);
    } catch {
      // already removed
    }
    return;
  }
  try {
    await fs.unlink(path.join(DATA_DIR, filename));
  } catch {
    // already removed
  }
}

export async function backupJson(filename: string, backupFilename: string): Promise<void> {
  const raw = await readJsonText(filename);
  if (raw == null) return;
  await writeJsonText(backupFilename, raw);
}

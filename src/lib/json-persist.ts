import { promises as fs } from "fs";
import path from "path";
import lockfile from "proper-lockfile";

const DATA_DIR = path.join(process.cwd(), "data");
const LOCK_OPTIONS = { retries: { retries: 20, minTimeout: 50, maxTimeout: 500 } };

/** Vercel’s function filesystem is ephemeral; persist JSON in Blob there. */
export function usesBlobStore(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL === "1");
}

async function readBlobText(pathname: string): Promise<string | null> {
  const { get, BlobNotFoundError } = await import("@vercel/blob");
  let result;
  try {
    result = await get(pathname, { access: "private", useCache: false });
  } catch (err) {
    // Only a definite "not found" means the file is missing. Any other failure
    // must surface: callers treat null as "create defaults", which would
    // overwrite real data after a transient read error.
    if (err instanceof BlobNotFoundError) return null;
    throw err;
  }
  if (result == null) return null;
  if (!result.stream) throw new Error(`[json-persist] Blob ${pathname} returned no body`);
  const text = await new Response(result.stream).text();
  return text.trim() ? text : null;
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

/**
 * Whether Blob writes use ifMatch (optimistic concurrency). Disabled: it was only ever tested
 * with mocks and broke every production save. Re-enable only after verifying the ETag
 * round-trip (get() ETag -> put ifMatch) against a real Blob store.
 */
const BLOB_CONDITIONAL_WRITES = false;

export interface JsonTextWithEtag {
  text: string | null;
  /** Blob ETag of the version that was read; null when there is no blob yet. */
  etag: string | null;
}

/**
 * Blob only: read the text and its ETag from one response, so the ETag always
 * describes the exact bytes returned (a later ifMatch write fails if anyone wrote since).
 */
export async function readJsonTextWithEtag(filename: string): Promise<JsonTextWithEtag> {
  const { get, BlobNotFoundError } = await import("@vercel/blob");
  let result;
  try {
    result = await get(filename, { access: "private", useCache: false });
  } catch (err) {
    if (err instanceof BlobNotFoundError) return { text: null, etag: null };
    throw err;
  }
  if (result == null) return { text: null, etag: null };
  if (!result.stream) throw new Error(`[json-persist] Blob ${filename} returned no body`);
  const text = await new Response(result.stream).text();
  return { text: text.trim() ? text : null, etag: result.blob.etag ?? null };
}

/**
 * Blob only: conditional write. With an etag, writes only if the blob is unchanged since
 * that read; with null, only creates the blob if it doesn't exist yet.
 * Returns false on a lost race (caller should re-read and retry); other errors throw.
 */
export async function writeJsonTextIfMatch(
  filename: string,
  content: string,
  etag: string | null
): Promise<boolean> {
  const { put, BlobPreconditionFailedError } = await import("@vercel/blob");
  const base = {
    access: "private" as const,
    addRandomSuffix: false,
    contentType: "application/json",
  };

  // Production showed every ifMatch write failing as a precondition error even with no
  // concurrent writer (the ETag from get() is not accepted by put's ifMatch), which made
  // all saves fail. Conditional writes stay off until verified against a real Blob store.
  if (!BLOB_CONDITIONAL_WRITES && etag !== null) {
    await put(filename, content, { ...base, allowOverwrite: true });
    return true;
  }

  // null  -> the blob doesn't exist yet: create-only.
  // ""    -> the blob exists but the SDK returned no ETag: we can't do a conditional write,
  //          so overwrite unconditionally (the pre-concurrency behaviour) rather than fail.
  // other -> conditional write.
  if (etag === "") {
    await put(filename, content, { ...base, allowOverwrite: true });
    return true;
  }

  try {
    await put(
      filename,
      content,
      etag === null
        ? { ...base, allowOverwrite: false }
        : { ...base, allowOverwrite: true, ifMatch: etag }
    );
    return true;
  } catch (err) {
    if (err instanceof BlobPreconditionFailedError) return false;
    // Create-only write hit an existing blob (someone created it first).
    if (etag === null && err instanceof Error && /already exists/i.test(err.message)) return false;
    if (etag === null) throw err;
    // The conditional write itself was rejected for a reason other than "someone else wrote"
    // (e.g. the store doesn't accept ifMatch). Saving the user's change matters more than the
    // race protection, so log it and fall back to a plain overwrite.
    console.error("[json-persist] conditional Blob write failed; falling back to overwrite:", err);
    await put(filename, content, { ...base, allowOverwrite: true });
    return true;
  }
}

export async function withJsonLock<T>(filename: string, fn: () => Promise<T>): Promise<T> {
  if (usesBlobStore()) {
    return fn();
  }

  const filePath = path.join(DATA_DIR, filename);
  await fs.mkdir(DATA_DIR, { recursive: true });
  // realpath:false lets us lock a file that doesn't exist yet, so we never create an
  // empty placeholder that would look like an existing (unreadable) store.
  const release = await lockfile.lock(filePath, { ...LOCK_OPTIONS, realpath: false });
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
  } catch (err) {
    // Only a definitely-missing file is "missing". Any other error (EBUSY, EPERM,
    // EACCES, ...) must surface so callers don't seed defaults over a real store.
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/** True if the file exists at all (even empty). Throws if existence can't be determined. */
export async function jsonExists(filename: string): Promise<boolean> {
  if (usesBlobStore()) {
    const { head, BlobNotFoundError } = await import("@vercel/blob");
    try {
      await head(filename);
      return true;
    } catch (err) {
      if (err instanceof BlobNotFoundError) return false;
      throw err;
    }
  }
  try {
    await fs.access(path.join(DATA_DIR, filename));
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
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

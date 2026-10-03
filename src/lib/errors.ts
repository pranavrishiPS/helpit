/**
 * An error whose message is written for the end user and is safe to show/persist.
 * Anything else (SDK/network/OAuth errors) may contain internals and is replaced
 * by a generic message via `publicErrorMessage`.
 */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}

/**
 * Logs the detail server-side and returns a short message that is safe to return to
 * the client and store in `integrations.*.lastSyncError`.
 */
export function publicErrorMessage(err: unknown, genericMessage: string, context?: string): string {
  if (err instanceof UserFacingError) return err.message;
  const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  console.error(context ? `${context}:` : "Error:", detail);
  return genericMessage;
}

/** Canonical public URL for OAuth redirects and post-login bounces. */
export function getAppUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (explicit) return explicit;

  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (prod) return `https://${prod.replace(/^https?:\/\//, "")}`;

  const deploy = process.env.VERCEL_URL?.trim();
  if (deploy) return `https://${deploy.replace(/^https?:\/\//, "")}`;

  return "http://localhost:3000";
}

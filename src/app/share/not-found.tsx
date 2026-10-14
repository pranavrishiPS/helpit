// Plain 404 for share links (wrong token or sharing off): no branding, no login link.
export default function ShareNotFound() {
  return (
    <div className="py-24 text-center">
      <h1 className="text-lg font-semibold text-foreground">404</h1>
      <p className="mt-1 text-sm text-muted">This page could not be found.</p>
    </div>
  );
}

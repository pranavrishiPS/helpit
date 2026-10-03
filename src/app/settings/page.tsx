"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader, Card, Button, ErrorBanner } from "@/components/ui";
import { MessageSquare, Mail, Link2, RefreshCw } from "lucide-react";
import { useDashboard } from "@/lib/use-dashboard";
import {
  disconnectGmail,
  disconnectSlack,
  fetchGmailStatus,
  fetchSlackStatus,
  syncGmail,
  updateProfile,
} from "@/lib/api-client";
import { notifyStoreUpdated } from "@/lib/store-events";

interface GmailStatus {
  configured: boolean;
  connected: boolean;
  email?: string;
  lastSyncedAt?: string;
}

interface SlackStatus {
  configured: boolean;
  connected: boolean;
  autoSyncAvailable?: boolean;
  teamName?: string;
  lastSyncedAt?: string;
  lastSyncError?: string;
}

function SettingsContent() {
  const searchParams = useSearchParams();
  const { store, loading, error, clearError, reload } = useDashboard();
  const [gmail, setGmail] = useState<GmailStatus | null>(null);
  const [slack, setSlack] = useState<SlackStatus | null>(null);
  const [disconnectingSlack, setDisconnectingSlack] = useState(false);
  const [disconnectingGmail, setDisconnectingGmail] = useState(false);
  const [syncingGmail, setSyncingGmail] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: "", role: "", company: "" });
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [integrationMessage, setIntegrationMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [profileDirty, setProfileDirty] = useState(false);

  async function loadIntegrations() {
    const [gmailRes, slackRes] = await Promise.all([
      fetchGmailStatus().catch(() => null),
      fetchSlackStatus().catch(() => null),
    ]);
    if (gmailRes) setGmail(gmailRes);
    if (slackRes) setSlack(slackRes);
  }

  useEffect(() => {
    loadIntegrations();
  }, []);

  useEffect(() => {
    const slackStatus = searchParams.get("slack");
    const gmailStatus = searchParams.get("gmail");
    if (slackStatus === "connected") {
      setIntegrationMessage("Slack connected successfully.");
      loadIntegrations();
      reload();
      notifyStoreUpdated();
    } else if (slackStatus === "error") {
      setIntegrationMessage("Slack connection failed. Check credentials and try again.");
    } else if (slackStatus === "invalid_state") {
      setIntegrationMessage("Slack OAuth expired or was invalid. Please try connecting again.");
    } else if (gmailStatus === "connected") {
      setIntegrationMessage("Gmail connected successfully.");
      loadIntegrations();
      reload();
      notifyStoreUpdated();
    } else if (gmailStatus === "error") {
      setIntegrationMessage("Gmail connection failed. Check credentials and try again.");
    } else if (gmailStatus === "invalid_state") {
      setIntegrationMessage("Gmail OAuth expired or was invalid. Please try connecting again.");
    }
  }, [searchParams, reload]);

  // Seed from the store, but never over unsaved edits (store reloads fire on any mutation).
  useEffect(() => {
    if (store?.profile && !profileDirty) {
      setProfileForm(store.profile);
    }
  }, [store?.profile, profileDirty]);

  function editProfile(patch: Partial<typeof profileForm>) {
    setProfileDirty(true);
    setProfileForm((p) => ({ ...p, ...patch }));
  }

  async function disconnectSlackHandler() {
    setDisconnectingSlack(true);
    setActionError(null);
    try {
      await disconnectSlack();
      await loadIntegrations();
      await reload();
      notifyStoreUpdated();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to disconnect Slack");
    } finally {
      setDisconnectingSlack(false);
    }
  }

  async function disconnectGmailHandler() {
    setDisconnectingGmail(true);
    setActionError(null);
    try {
      await disconnectGmail();
      await loadIntegrations();
      await reload();
      notifyStoreUpdated();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to disconnect Gmail");
    } finally {
      setDisconnectingGmail(false);
    }
  }

  async function handleGmailSync() {
    setSyncingGmail(true);
    setActionError(null);
    try {
      const result = await syncGmail();
      if (!result.ok) {
        setActionError(result.error ?? "Gmail sync failed");
        await loadIntegrations();
        return;
      }
      await loadIntegrations();
      await reload();
      notifyStoreUpdated();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Gmail sync failed");
    } finally {
      setSyncingGmail(false);
    }
  }

  async function saveProfile() {
    setSavingProfile(true);
    setProfileMessage(null);
    try {
      await updateProfile(profileForm);
      await reload();
      setProfileDirty(false);
      notifyStoreUpdated();
      setProfileMessage("Profile saved.");
    } catch {
      setProfileMessage("Failed to save profile.");
    } finally {
      setSavingProfile(false);
    }
  }

  if (loading) {
    return <div className="text-sm text-muted">Loading settings...</div>;
  }

  if (!store) {
    return <div className="text-sm text-warning">{error ?? "Failed to load settings"}</div>;
  }

  return (
    <div>
      {error && <ErrorBanner message={error} onDismiss={clearError} />}
      {actionError && <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />}
      <PageHeader
        title="Settings"
        description="Profile and integrations"
      />

      {integrationMessage && (
        <div className="mb-4 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted">
          {integrationMessage}
        </div>
      )}

      <div className="space-y-4">
        <Card>
          <h2 className="font-medium">Profile</h2>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <label className="text-xs text-muted" htmlFor="profile-name">
                Name
              </label>
              <input
                id="profile-name"
                className="mt-1 w-full rounded-lg border border-border px-3 py-2"
                value={profileForm.name}
                onChange={(e) => editProfile({ name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-muted" htmlFor="profile-role">
                Role
              </label>
              <input
                id="profile-role"
                className="mt-1 w-full rounded-lg border border-border px-3 py-2"
                value={profileForm.role}
                onChange={(e) => editProfile({ role: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-muted" htmlFor="profile-company">
                Company
              </label>
              <input
                id="profile-company"
                className="mt-1 w-full rounded-lg border border-border px-3 py-2"
                value={profileForm.company}
                onChange={(e) => editProfile({ company: e.target.value })}
              />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Button size="sm" onClick={saveProfile} disabled={savingProfile}>
              {savingProfile ? "Saving…" : "Save profile"}
            </Button>
            {profileMessage && <p className="text-xs text-muted">{profileMessage}</p>}
          </div>
          <p className="mt-4 text-xs text-muted">
            Locally, data lives in{" "}
            <code className="rounded bg-slate-100 px-1">data/store.json</code>. On Vercel it
            persists in a private Blob store.
          </p>
        </Card>

        <Card>
          <h2 className="font-medium">Integrations</h2>
          <div className="mt-4 space-y-3">
            <IntegrationRow
              icon={<MessageSquare className="h-4 w-4 text-accent" />}
              name="Slack"
              status={
                !slack
                  ? "Loading..."
                  : !slack.configured
                    ? "Needs setup"
                    : slack.connected
                      ? `Connected${slack.teamName ? ` · ${slack.teamName}` : ""}`
                      : "Not connected"
              }
              description={
                slack?.autoSyncAvailable === false
                  ? "Connected for identity only — track follow-ups manually (search:read not approved)"
                  : "Auto-syncs follow-ups every 10 min (9 AM–7 PM) when connected"
              }
              action={
                slack?.configured && !slack.connected ? (
                  <a href="/api/slack/auth">
                    <Button variant="secondary" size="sm">
                      <Link2 className="mr-1.5 h-3.5 w-3.5" />
                      Connect
                    </Button>
                  </a>
                ) : slack?.connected ? (
                  <div className="flex flex-col items-end gap-2">
                    <span className="text-xs text-muted">
                      {slack.autoSyncAvailable === false
                        ? "Manual tracking"
                        : "Syncing every 10 min · 9 AM–7 PM"}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={disconnectSlackHandler}
                      disabled={disconnectingSlack}
                    >
                      {disconnectingSlack ? "Disconnecting…" : "Disconnect"}
                    </Button>
                  </div>
                ) : undefined
              }
            />
            <IntegrationRow
              icon={<Mail className="h-4 w-4 text-accent" />}
              name="Gmail"
              status={
                !gmail
                  ? "Loading..."
                  : !gmail.configured
                    ? "Needs setup"
                    : gmail.connected
                      ? `Connected · ${gmail.email}`
                      : "Not connected"
              }
              description="Sync recent inbox messages into the Mail inbox"
              action={
                gmail?.configured && !gmail.connected ? (
                  <a href="/api/gmail/auth">
                    <Button variant="secondary" size="sm">
                      <Link2 className="mr-1.5 h-3.5 w-3.5" />
                      Connect
                    </Button>
                  </a>
                ) : gmail?.connected ? (
                  <div className="flex flex-col items-end gap-2">
                    {gmail.lastSyncedAt && (
                      <span className="text-xs text-muted">
                        Last sync {new Date(gmail.lastSyncedAt).toLocaleString()}
                      </span>
                    )}
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleGmailSync}
                        disabled={syncingGmail}
                      >
                        <RefreshCw
                          className={`mr-1.5 h-3.5 w-3.5 ${syncingGmail ? "animate-spin" : ""}`}
                        />
                        Sync now
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={disconnectGmailHandler}
                        disabled={disconnectingGmail}
                      >
                        {disconnectingGmail ? "…" : "Disconnect"}
                      </Button>
                    </div>
                  </div>
                ) : undefined
              }
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

function IntegrationRow({
  icon,
  name,
  status,
  description,
  action,
}: {
  icon: React.ReactNode;
  name: string;
  status: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10">
          {icon}
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{name}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-muted">
              {status}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">{description}</p>
        </div>
      </div>
      {action && <div className="shrink-0 sm:ml-auto">{action}</div>}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="text-sm text-muted">Loading settings...</div>}>
      <SettingsContent />
    </Suspense>
  );
}

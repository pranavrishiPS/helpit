"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  PageHeader,
  Alert,
  Badge,
  Card,
  CardHeader,
  Button,
  ErrorBanner,
  Input,
  Label,
  ModuleChip,
  PageSkeleton,
  buttonClasses,
  type BadgeTone,
} from "@/components/ui";
import { Link2, Plug, RefreshCw, UserRound } from "lucide-react";
import type { ModuleId } from "@/lib/modules";
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
    return <PageSkeleton label="Loading settings..." />;
  }

  if (!store) {
    return <ErrorBanner message={error ?? "Failed to load settings"} />;
  }

  return (
    <div>
      {error && <ErrorBanner message={error} onDismiss={clearError} />}
      {actionError && <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />}
      <PageHeader
        title="Settings"
        module="settings"
        description="Profile and integrations"
      />

      {integrationMessage && (
        <Alert tone="info" role="status" className="mb-4">
          {integrationMessage}
        </Alert>
      )}

      <div className="space-y-4">
        <Card>
          <CardHeader module="settings" icon={UserRound} title="Profile" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="profile-name">Name</Label>
              <Input
                id="profile-name"
                value={profileForm.name}
                onChange={(e) => editProfile({ name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="profile-role">Role</Label>
              <Input
                id="profile-role"
                value={profileForm.role}
                onChange={(e) => editProfile({ role: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="profile-company">Company</Label>
              <Input
                id="profile-company"
                value={profileForm.company}
                onChange={(e) => editProfile({ company: e.target.value })}
              />
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button onClick={saveProfile} disabled={savingProfile}>
              {savingProfile ? "Saving…" : "Save profile"}
            </Button>
            {profileMessage && (
              <p
                role="status"
                className={
                  profileMessage === "Profile saved."
                    ? "text-xs font-medium text-success"
                    : "text-xs font-medium text-danger"
                }
              >
                {profileMessage}
              </p>
            )}
          </div>
          <p className="mt-4 text-xs text-muted">
            Locally, data lives in{" "}
            <code className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[12px] text-foreground">data/store.json</code>. On Vercel it
            persists in a private Blob store.
          </p>
        </Card>

        <Card>
          <CardHeader module="settings" icon={Plug} title="Integrations" />
          <div className="space-y-3">
            <IntegrationRow
              module="slack"
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
                  <a href="/api/slack/auth" className={buttonClasses({ variant: "secondary", size: "sm" })}>
                    <Link2 />
                    Connect
                  </a>
                ) : slack?.connected ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 sm:flex-col sm:items-end">
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
              module="mail"
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
                  <a href="/api/gmail/auth" className={buttonClasses({ variant: "secondary", size: "sm" })}>
                    <Link2 />
                    Connect
                  </a>
                ) : gmail?.connected ? (
                  <div className="flex flex-col items-start gap-2 sm:items-end">
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
                        <RefreshCw className={syncingGmail ? "animate-spin" : ""} />
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

function integrationTone(status: string): BadgeTone {
  if (status.startsWith("Connected")) return "success";
  if (status === "Needs setup") return "caution";
  return "neutral";
}

function IntegrationRow({
  module,
  name,
  status,
  description,
  action,
}: {
  module: ModuleId;
  name: string;
  status: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-4 transition-colors hover:border-border-strong sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <ModuleChip module={module} variant="soft" size="md" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{name}</span>
            <Badge dot tone={integrationTone(status)} className="max-w-full whitespace-normal">
              {status}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted">{description}</p>
        </div>
      </div>
      {action && <div className="shrink-0 pl-12 sm:ml-auto sm:pl-0">{action}</div>}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading settings..." />}>
      <SettingsContent />
    </Suspense>
  );
}

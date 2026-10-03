"use client";

import { PageHeader, ErrorBanner, PageSkeleton } from "@/components/ui";
import { useDashboard } from "@/lib/use-dashboard";
import { ScrumAttendanceBoard } from "@/components/scrum/ScrumAttendanceBoard";
import { ScrumSheetSync } from "@/components/scrum/ScrumSheetSync";

export default function ScrumAttendancePage() {
  const { store, loading, error, clearError, reload } = useDashboard();

  if (loading) {
    return <PageSkeleton label="Loading scrum attendance..." />;
  }

  if (!store) {
    return <ErrorBanner message={error ?? "Failed to load scrum attendance"} />;
  }

  return (
    <div>
      {error && <ErrorBanner message={error} onDismiss={clearError} />}
      <PageHeader
        title="Scrum attendance"
        module="scrum"
        description="Log daily standup attendance and see individual trends"
      />
      <div className="mb-5">
        <ScrumSheetSync onSynced={reload} />
      </div>
      <ScrumAttendanceBoard
        members={store.scrumMembers ?? []}
        entries={store.scrumAttendance ?? []}
        holidays={store.scrumHolidays ?? []}
        onChanged={reload}
      />
    </div>
  );
}

"use client";

import { PageHeader } from "@/components/ui";
import { useDashboard } from "@/lib/use-dashboard";
import { ScrumAttendanceBoard } from "@/components/scrum/ScrumAttendanceBoard";
import { ScrumSheetSync } from "@/components/scrum/ScrumSheetSync";

export default function ScrumAttendancePage() {
  const { store, loading, error, reload } = useDashboard();

  if (loading) {
    return <div className="text-sm text-muted">Loading scrum attendance...</div>;
  }

  if (error || !store) {
    return <div className="text-sm text-warning">{error ?? "Failed to load scrum attendance"}</div>;
  }

  return (
    <div>
      <PageHeader
        title="Scrum attendance"
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

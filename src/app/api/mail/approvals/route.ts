import { NextRequest, NextResponse } from "next/server";
import { updateStore } from "@/lib/db";
import { parseBody, updateSprintApprovalSchema } from "@/lib/validation";
import { isErrorResponse, parseJsonBody } from "@/lib/request";

export async function PATCH(request: NextRequest) {
  const body = await parseJsonBody(request);
  if (isErrorResponse(body)) return body;

  const parsed = parseBody(updateSprintApprovalSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { id, party, approved, mailSent } = parsed.data;
  let found = false;

  await updateStore((s) => {
    found = false; // reset: the updater re-runs on optimistic retries
    return {
      ...s,
      sprintApprovals: (s.sprintApprovals ?? []).map((item) => {
        if (item.id !== id) return item;
        found = true;

        if (mailSent != null) {
          return {
            ...item,
            sentAt: mailSent ? new Date().toISOString() : undefined,
            // Manual choice wins over mail-thread detection from now on.
            sentOverride: mailSent,
            autoSent: undefined,
            updatedAt: new Date().toISOString(),
          };
        }

        // A manual toggle wins over mail auto-detection for this party from now on.
        const autoApproved = { ...item.autoApproved };
        delete autoApproved[party!];
        return {
          ...item,
          approvals: { ...item.approvals, [party!]: approved! },
          overrides: { ...item.overrides, [party!]: approved! },
          autoApproved: Object.keys(autoApproved).length > 0 ? autoApproved : undefined,
          updatedAt: new Date().toISOString(),
        };
      }),
    };
  });

  if (!found) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

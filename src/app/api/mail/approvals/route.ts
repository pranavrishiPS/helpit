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
            updatedAt: new Date().toISOString(),
          };
        }

        return {
          ...item,
          approvals: { ...item.approvals, [party!]: approved! },
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

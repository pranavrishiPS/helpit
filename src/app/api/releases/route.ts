import { NextRequest, NextResponse } from "next/server";
import { updateStore } from "@/lib/db";
import { normalizeFunctionCosts } from "@/lib/effort-utils";
import type { Release } from "@/lib/types";
import {
  createReleaseSchema,
  parseBody,
  updateReleaseSchema,
} from "@/lib/validation";
import { buildReleaseId, buildReleaseName } from "@/lib/release-utils";
import { applyReleasePatch } from "@/lib/release-lifecycle";
import { isErrorResponse, parseJsonBody } from "@/lib/request";

export async function POST(request: NextRequest) {
  const body = await parseJsonBody(request);
  if (isErrorResponse(body)) return body;

  const parsed = parseBody(createReleaseSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { platform, buildNumber, targetDate, notes, sprintNote, functionCosts } = parsed.data;
  const id = buildReleaseId(platform, buildNumber);
  const now = new Date().toISOString();

  let created: Release | null = null;

  try {
    await updateStore((s) => {
      if (s.releases.some((r) => r.id === id)) {
        throw new Error("DUPLICATE");
      }

      const release: Release = {
        id,
        name: buildReleaseName(platform, buildNumber),
        platform,
        targetDate,
        status: "idea",
        notes: notes?.trim() || undefined,
        sprintNote: sprintNote?.trim() || undefined,
        functionCosts: normalizeFunctionCosts(functionCosts),
        blockers: [],
        createdAt: now,
        updatedAt: now,
      };

      created = release;
      return { ...s, releases: [...s.releases, release] };
    });
  } catch (err) {
    if (err instanceof Error && err.message === "DUPLICATE") {
      return NextResponse.json(
        { error: "A release with this platform and build already exists" },
        { status: 409 }
      );
    }
    throw err;
  }

  return NextResponse.json(created, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const body = await parseJsonBody(request);
  if (isErrorResponse(body)) return body;

  const parsed = parseBody(updateReleaseSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { id, ...updates } = parsed.data;
  type ReleasePatch = Partial<
    Pick<
      Release,
      | "status"
      | "phase"
      | "targetDate"
      | "actualDate"
      | "notes"
      | "sprintNote"
      | "blockers"
      | "functionCosts"
    >
  >;

  const patch: ReleasePatch = {};

  if (updates.status !== undefined) patch.status = updates.status;
  if (updates.phase !== undefined) patch.phase = updates.phase;
  if (updates.blockers !== undefined) patch.blockers = updates.blockers;
  if ("targetDate" in updates) {
    patch.targetDate =
      updates.targetDate === null ? undefined : updates.targetDate;
  }
  if ("actualDate" in updates) {
    patch.actualDate =
      updates.actualDate === null ? undefined : updates.actualDate;
  }
  if ("sprintNote" in updates) {
    patch.sprintNote =
      updates.sprintNote === null ? undefined : updates.sprintNote?.trim() || undefined;
  }
  if ("notes" in updates) {
    patch.notes =
      updates.notes === null ? undefined : updates.notes?.trim() || undefined;
  }
  if ("functionCosts" in updates) {
    patch.functionCosts = updates.functionCosts
      ? normalizeFunctionCosts(updates.functionCosts)
      : undefined;
  }

  let updated: Release | undefined;
  const now = new Date().toISOString();

  try {
    await updateStore((s) => {
      const releases = applyReleasePatch(s.releases, id, patch, now);
      updated = releases.find((r) => r.id === id);
      return { ...s, releases };
    });
  } catch (err) {
    if (err instanceof Error && err.message === "RELEASE_COMPLETED") {
      return NextResponse.json(
        { error: "Completed releases cannot be moved back to in-flight." },
        { status: 400 }
      );
    }
    throw err;
  }

  if (!updated) {
    return NextResponse.json({ error: "Release not found" }, { status: 404 });
  }

  return NextResponse.json(updated);
}

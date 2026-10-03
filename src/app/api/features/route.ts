import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { updateStore } from "@/lib/db";
import { normalizeFunctionCosts } from "@/lib/effort-utils";
import type { Feature, FeatureDiscussionNote } from "@/lib/types";
import {
  parseBody,
  createFeatureSchema,
  updateFeatureSchema,
  deleteFeatureSchema,
} from "@/lib/validation";
import { isErrorResponse, parseJsonBody } from "@/lib/request";

function validateFeatureDates(
  startDate?: string,
  scopeClosureDate?: string,
  preProductionClosureDate?: string,
  releaseDate?: string
): string | null {
  if (startDate && scopeClosureDate && scopeClosureDate < startDate) {
    return "Scope closure must be on or after start date";
  }
  if (scopeClosureDate && preProductionClosureDate && preProductionClosureDate < scopeClosureDate) {
    return "Pre-production closure must be on or after scope closure date";
  }
  const preProdOrScope = preProductionClosureDate ?? scopeClosureDate;
  if (preProdOrScope && releaseDate && releaseDate < preProdOrScope) {
    return "Release date must be on or after pre-production closure";
  }
  return null;
}

export async function POST(request: NextRequest) {
  const body = await parseJsonBody(request);
  if (isErrorResponse(body)) return body;

  const parsed = parseBody(createFeatureSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const dateError = validateFeatureDates(
    parsed.data.startDate,
    parsed.data.scopeClosureDate,
    parsed.data.preProductionClosureDate,
    parsed.data.releaseDate
  );
  if (dateError) {
    return NextResponse.json({ error: dateError }, { status: 400 });
  }

  const now = new Date().toISOString();
  const feature: Feature = {
    id: uuidv4(),
    title: parsed.data.title.trim(),
    startDate: parsed.data.startDate,
    scopeClosureDate: parsed.data.scopeClosureDate,
    preProductionClosureDate: parsed.data.preProductionClosureDate,
    releaseDate: parsed.data.releaseDate,
    functionCosts: normalizeFunctionCosts(parsed.data.functionCosts),
    discussionNotes: [],
    createdAt: now,
    updatedAt: now,
  };

  await updateStore((s) => ({
    ...s,
    features: [feature, ...(s.features ?? [])],
  }));

  return NextResponse.json(feature, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const body = await parseJsonBody(request);
  if (isErrorResponse(body)) return body;

  const parsed = parseBody(updateFeatureSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { id, addDiscussionNote, removeDiscussionNoteId, specReviewCompleted, scopeClosureCompleted, ...updates } =
    parsed.data;

  let updatedFeature: Feature | undefined;
  let notFound = false;
  let dateError: string | null = null;

  await updateStore((s) => {
    // reset: the updater re-runs on optimistic retries
    updatedFeature = undefined;
    notFound = false;
    dateError = null;
    const features = s.features ?? [];
    const index = features.findIndex((f) => f.id === id);
    if (index === -1) {
      notFound = true;
      return s;
    }

    const current = features[index];
    const startDate =
      updates.startDate === null ? undefined : updates.startDate ?? current.startDate;
    const scopeClosureDate =
      updates.scopeClosureDate === null
        ? undefined
        : updates.scopeClosureDate ?? current.scopeClosureDate;
    const preProductionClosureDate =
      updates.preProductionClosureDate === null
        ? undefined
        : updates.preProductionClosureDate ?? current.preProductionClosureDate;
    const releaseDate =
      updates.releaseDate === null ? undefined : updates.releaseDate ?? current.releaseDate;

    dateError = validateFeatureDates(
      startDate,
      scopeClosureDate,
      preProductionClosureDate,
      releaseDate
    );
    if (dateError) return s;

    let discussionNotes = [...current.discussionNotes];

    if (addDiscussionNote) {
      const note: FeatureDiscussionNote = {
        id: uuidv4(),
        date: addDiscussionNote.date,
        content: addDiscussionNote.content.trim(),
        createdAt: new Date().toISOString(),
      };
      discussionNotes = [note, ...discussionNotes];
    }

    if (removeDiscussionNoteId) {
      discussionNotes = discussionNotes.filter((n) => n.id !== removeDiscussionNoteId);
    }

    discussionNotes.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

    let specReviewCompletedAt = current.specReviewCompletedAt;
    if (specReviewCompleted === true) {
      specReviewCompletedAt = new Date().toISOString();
    } else if (specReviewCompleted === false) {
      specReviewCompletedAt = undefined;
    }

    let scopeClosureCompletedAt = current.scopeClosureCompletedAt;
    if (scopeClosureCompleted === true) {
      scopeClosureCompletedAt = new Date().toISOString();
    } else if (scopeClosureCompleted === false) {
      scopeClosureCompletedAt = undefined;
    }

    updatedFeature = {
      ...current,
      title: updates.title?.trim() ?? current.title,
      startDate,
      scopeClosureDate,
      preProductionClosureDate,
      releaseDate,
      scopeClosureCompletedAt,
      specReviewCompletedAt,
      discussionNotes,
      updatedAt: new Date().toISOString(),
    };

    if ("functionCosts" in updates) {
      updatedFeature.functionCosts = updates.functionCosts
        ? normalizeFunctionCosts(updates.functionCosts)
        : undefined;
    }

    const next = [...features];
    next[index] = updatedFeature;
    return { ...s, features: next };
  });

  if (notFound) {
    return NextResponse.json({ error: "Feature not found" }, { status: 404 });
  }
  if (dateError) {
    return NextResponse.json({ error: dateError }, { status: 400 });
  }

  return NextResponse.json(updatedFeature);
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  const parsed = parseBody(deleteFeatureSchema, { id });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  let found = false;
  await updateStore((s) => {
    found = false; // reset: the updater re-runs on optimistic retries
    const next = (s.features ?? []).filter((item) => {
      if (item.id === parsed.data.id) {
        found = true;
        return false;
      }
      return true;
    });
    return { ...s, features: next };
  });

  if (!found) {
    return NextResponse.json({ error: "Feature not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

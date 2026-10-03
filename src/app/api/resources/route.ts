import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { updateStore } from "@/lib/db";
import type { ProjectResource } from "@/lib/types";
import {
  parseBody,
  createProjectResourceSchema,
  updateProjectResourceSchema,
  deleteProjectResourceSchema,
} from "@/lib/validation";
import { isErrorResponse, parseJsonBody, guardMutation } from "@/lib/request";

function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

export async function POST(request: NextRequest) {
  const body = await parseJsonBody(request);
  if (isErrorResponse(body)) return body;
  const parsed = parseBody(createProjectResourceSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { title, url, type, description } = parsed.data;
  const now = new Date().toISOString();

  let normalizedUrl: string;
  try {
    normalizedUrl = new URL(normalizeUrl(url)).toString();
  } catch {
    return NextResponse.json({ error: "Enter a valid URL" }, { status: 400 });
  }

  const resource: ProjectResource = {
    id: uuidv4(),
    title: title.trim(),
    url: normalizedUrl,
    type,
    description: description?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };

  await updateStore((s) => ({
    ...s,
    projectResources: [resource, ...(s.projectResources ?? [])],
  }));

  return NextResponse.json(resource, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const body = await parseJsonBody(request);
  if (isErrorResponse(body)) return body;
  const parsed = parseBody(updateProjectResourceSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { id, ...updates } = parsed.data;

  if (updates.url != null) {
    try {
      new URL(normalizeUrl(updates.url)).toString();
    } catch {
      return NextResponse.json({ error: "Enter a valid URL" }, { status: 400 });
    }
  }

  let found = false;

  await updateStore((s) => {
    found = false; // reset: the updater re-runs on optimistic retries
    return {
      ...s,
      projectResources: (s.projectResources ?? []).map((item) => {
        if (item.id !== id) return item;
        found = true;

        const url =
          updates.url != null
            ? new URL(normalizeUrl(updates.url)).toString()
            : item.url;

        return {
          ...item,
          ...updates,
          url,
          title: updates.title?.trim() ?? item.title,
          description:
            updates.description === null
              ? undefined
              : updates.description?.trim() ?? item.description,
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

export async function DELETE(request: NextRequest) {
  const guard = guardMutation(request);
  if (guard) return guard;
  const id = request.nextUrl.searchParams.get("id");
  const parsed = parseBody(deleteProjectResourceSchema, { id });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  let found = false;
  await updateStore((s) => {
    found = false; // reset: the updater re-runs on optimistic retries
    const next = (s.projectResources ?? []).filter((item) => {
      if (item.id === parsed.data.id) {
        found = true;
        return false;
      }
      return true;
    });
    return { ...s, projectResources: next };
  });

  if (!found) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

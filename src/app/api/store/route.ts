import { NextResponse } from "next/server";
import { readStore } from "@/lib/db";

export async function GET() {
  const store = await readStore();
  return NextResponse.json(store);
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/admin";
import { isSameOrigin } from "@/lib/origin";
import { isProjectNetwork, parseProgress, parseProjectStatus } from "@/lib/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in to view your sync dashboard." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  try {
    const items = await prisma.project.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
    return NextResponse.json({ items }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Project service is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Request origin rejected." }, { status: 403 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in to create sync projects." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "A valid JSON body is required." }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "A valid JSON body is required." }, { status: 400 });
  const data = body as Record<string, unknown>;
  const name = typeof data.name === "string" ? data.name.trim() : "";
  const description = typeof data.description === "string" ? data.description.trim().slice(0, 280) : "";
  const network = isProjectNetwork(data.network) ? data.network : "ethereum";
  const status = data.status === undefined ? "PENDING" : parseProjectStatus(data.status);
  const progress = data.progress === undefined ? 0 : parseProgress(data.progress);
  if (name.length < 2 || name.length > 120) return NextResponse.json({ error: "Project names must be between 2 and 120 characters." }, { status: 400 });
  if (!status) return NextResponse.json({ error: "Status must be ACTIVE, PENDING or COMPLETE." }, { status: 400 });
  if (progress === null) return NextResponse.json({ error: "Progress must be a whole number between 0 and 100." }, { status: 400 });
  try {
    const item = await prisma.project.create({
      data: { userId: user.id, name, description: description || null, network, status, progress },
    });
    return NextResponse.json({ item }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to create this project right now." }, { status: 503 });
  }
}

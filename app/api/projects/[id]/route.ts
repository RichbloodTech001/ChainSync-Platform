import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/admin";
import { isSameOrigin } from "@/lib/origin";
import { isProjectNetwork, parseProgress, parseProjectStatus } from "@/lib/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Update = Prisma.ProjectUpdateManyMutationInput;

export async function PATCH(request: NextRequest, context: { params: { id: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Request origin rejected." }, { status: 403 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in to update sync projects." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const id = context.params.id;
  if (!id || id.length > 100) return NextResponse.json({ error: "Invalid project." }, { status: 400 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "A valid JSON body is required." }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "A valid JSON body is required." }, { status: 400 });
  const data = body as Record<string, unknown>;

  const update: Update = {};
  if (data.name !== undefined) {
    const name = typeof data.name === "string" ? data.name.trim() : "";
    if (name.length < 2 || name.length > 120) return NextResponse.json({ error: "Project names must be between 2 and 120 characters." }, { status: 400 });
    update.name = name;
  }
  if (data.description !== undefined) {
    if (data.description !== null && typeof data.description !== "string") return NextResponse.json({ error: "Description must be text." }, { status: 400 });
    update.description = typeof data.description === "string" ? data.description.trim().slice(0, 280) || null : null;
  }
  if (data.status !== undefined) {
    const status = parseProjectStatus(data.status);
    if (!status) return NextResponse.json({ error: "Status must be ACTIVE, PENDING or COMPLETE." }, { status: 400 });
    update.status = status;
  }
  if (data.progress !== undefined) {
    const progress = parseProgress(data.progress);
    if (progress === null) return NextResponse.json({ error: "Progress must be a whole number between 0 and 100." }, { status: 400 });
    update.progress = progress;
  }
  if (data.network !== undefined) {
    if (!isProjectNetwork(data.network)) return NextResponse.json({ error: "Only Ethereum Mainnet and Sepolia are supported." }, { status: 400 });
    update.network = data.network;
  }
  if (!Object.keys(update).length) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  // Recording sync activity keeps staleness ("needs attention") honest.
  if (update.status !== undefined || update.progress !== undefined) update.lastSyncedAt = new Date();

  try {
    const result = await prisma.project.updateMany({ where: { id, userId: user.id }, data: update });
    if (!result.count) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    const item = await prisma.project.findUnique({ where: { id } });
    return NextResponse.json({ item }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to update this project right now." }, { status: 503 });
  }
}

export async function DELETE(request: NextRequest, context: { params: { id: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Request origin rejected." }, { status: 403 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in to manage sync projects." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const id = context.params.id;
  if (!id || id.length > 100) return NextResponse.json({ error: "Invalid project." }, { status: 400 });
  try {
    const result = await prisma.project.deleteMany({ where: { id, userId: user.id } });
    if (!result.count) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to delete this project right now." }, { status: 503 });
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentAdmin } from "@/lib/admin";
import { projectNeedsAttention } from "@/lib/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Administrator-only view of every account and every sync project. */
export async function GET() {
  const admin = await currentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Administrator access required." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const [users, projects] = await Promise.all([
      prisma.user.findMany({
        select: { id: true, email: true, displayName: true, role: true, createdAt: true, _count: { select: { projects: true } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.project.findMany({
        orderBy: { createdAt: "desc" },
        include: { user: { select: { email: true, displayName: true } } },
      }),
    ]);
    const now = Date.now();
    const rows = projects.map(project => ({
      id: project.id,
      name: project.name,
      description: project.description,
      status: project.status,
      progress: project.progress,
      network: project.network,
      lastSyncedAt: project.lastSyncedAt,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      ownerEmail: project.user.email,
      ownerName: project.user.displayName,
    }));
    const count = (status: string) => rows.filter(row => row.status === status).length;
    return NextResponse.json({
      users: users.map(user => ({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        createdAt: user.createdAt,
        projectCount: user._count.projects,
      })),
      projects: rows,
      summary: {
        users: users.length,
        projects: rows.length,
        active: count("ACTIVE"),
        pending: count("PENDING"),
        complete: count("COMPLETE"),
        needsAttention: rows.filter(row => projectNeedsAttention(row, now)).length,
      },
      checkedAt: new Date(now).toISOString(),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Administrator overview is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

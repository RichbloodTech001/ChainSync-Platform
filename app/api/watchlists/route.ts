import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/session";
import { isSameOrigin } from "@/lib/origin";
import { rateLimit, rateLimitResponse, requestKey } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in to access your saved watchlist." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  try {
    const items = await prisma.watchAddress.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
    return NextResponse.json({ items }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Watchlist service is temporarily unavailable." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Request origin rejected." }, { status: 403 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in to save watched addresses." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const rate = await rateLimit(requestKey(request, "watchlist-write"), 60, 60 * 60 * 1000);
  if (!rate.allowed) return rateLimitResponse(rate);
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "A valid JSON body is required." }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "A valid JSON body is required." }, { status: 400 });
  const data = body as Record<string, unknown>;
  const address = typeof data.address === "string" ? data.address.trim() : "";
  const label = typeof data.label === "string" ? data.label.trim() : "";
  const chainId = data.chainId === undefined ? 1 : data.chainId;
  if (!isAddress(address)) return NextResponse.json({ error: "Enter a valid public EVM address." }, { status: 400 });
  if (typeof chainId !== "number" || ![1, 11155111].includes(chainId)) return NextResponse.json({ error: "Only Ethereum Mainnet and Sepolia are supported." }, { status: 400 });
  if (label.length > 80) return NextResponse.json({ error: "Labels must be 80 characters or fewer." }, { status: 400 });
  try {
    const item = await prisma.watchAddress.create({ data: { userId: user.id, address: address.toLowerCase(), label: label || "Watched wallet", chainId } });
    await audit({ actorId: user.id, action: "watchlist.added", targetType: "watchAddress", targetId: item.id, metadata: { chainId } });
    return NextResponse.json({ item }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") return NextResponse.json({ error: "This address is already saved for that network." }, { status: 409 });
    return NextResponse.json({ error: "Unable to save this address right now." }, { status: 503 });
  }
}

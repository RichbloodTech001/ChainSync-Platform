import { describe, expect, it } from "vitest";
import { GET } from "./route";
import { NextRequest } from "next/server";

describe("GET /api/balance input validation", () => {
  it("rejects a missing address", async () => {
    const response = await GET(new NextRequest("http://localhost/api/balance"));
    expect(response.status).toBe(400);
  });
  it("rejects a malformed address", async () => {
    const response = await GET(new NextRequest("http://localhost/api/balance?address=not-an-address"));
    expect(response.status).toBe(400);
  });
  it("rejects unsupported networks", async () => {
    const response = await GET(new NextRequest("http://localhost/api/balance?address=0x0000000000000000000000000000000000000000&network=polygon"));
    expect(response.status).toBe(400);
  });
});

import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

describe("GET /api/transaction input validation", () => {
  it("rejects a missing hash", async () => {
    const response = await GET(new NextRequest("http://localhost/api/transaction"));
    expect(response.status).toBe(400);
  });
  it("rejects a malformed hash", async () => {
    const response = await GET(new NextRequest("http://localhost/api/transaction?hash=0x1234"));
    expect(response.status).toBe(400);
  });
  it("rejects unsupported networks before contacting an RPC", async () => {
    const hash = "0x" + "a".repeat(64);
    const response = await GET(new NextRequest(`http://localhost/api/transaction?hash=${hash}&network=polygon`));
    expect(response.status).toBe(400);
  });
});

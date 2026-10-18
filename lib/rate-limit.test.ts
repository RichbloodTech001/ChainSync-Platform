import { describe, expect, it } from "vitest";
import { requestKey } from "./rate-limit";
import { appBaseUrl } from "./app-url";

describe("requestKey", () => {
  it("scopes the key and uses the forwarded client address", () => {
    const request = new Request("http://localhost/api/auth/login", {
      headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
    });
    expect(requestKey(request, "login")).toBe("login:203.0.113.9");
  });

  it("falls back to a shared bucket when no address is present", () => {
    expect(requestKey(new Request("http://localhost/api/auth/login"), "login")).toBe("login:unknown");
  });
});

describe("appBaseUrl", () => {
  it("uses the public preview origin inside the Base44 preview", () => {
    const previous = { mode: process.env.BASE44_PREVIEW_MODE, suffix: process.env.BASE44_PUBLIC_HOST_SUFFIX, app: process.env.NEXT_PUBLIC_APP_URL };
    process.env.BASE44_PREVIEW_MODE = "1";
    process.env.BASE44_PUBLIC_HOST_SUFFIX = "sandbox.example.test";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    try {
      expect(appBaseUrl()).toBe("https://3000-sandbox.example.test");
    } finally {
      process.env.BASE44_PREVIEW_MODE = previous.mode;
      process.env.BASE44_PUBLIC_HOST_SUFFIX = previous.suffix;
      process.env.NEXT_PUBLIC_APP_URL = previous.app;
    }
  });

  it("uses the configured app URL outside the preview", () => {
    const previous = { mode: process.env.BASE44_PREVIEW_MODE, app: process.env.NEXT_PUBLIC_APP_URL };
    delete process.env.BASE44_PREVIEW_MODE;
    process.env.NEXT_PUBLIC_APP_URL = "https://chainsync.example.com/";
    try {
      expect(appBaseUrl()).toBe("https://chainsync.example.com");
    } finally {
      process.env.BASE44_PREVIEW_MODE = previous.mode;
      process.env.NEXT_PUBLIC_APP_URL = previous.app;
    }
  });
});

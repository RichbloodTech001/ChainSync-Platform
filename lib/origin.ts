import type { NextRequest } from "next/server";

/**
 * The origin the client actually used to reach us: a proxy-forwarded host when
 * present, otherwise the request's own Host header.
 */
function clientOrigin(request: NextRequest) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return null;
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = forwardedProto || request.nextUrl.protocol.replace(":", "");
  return `${proto}://${host}`;
}

/**
 * Same-origin check for state-changing requests (CSRF defence).
 *
 * The Origin header must match the origin the request was addressed to.
 * `request.nextUrl.origin` must NOT be used for this: it is derived from the
 * address the server was bound to (for example `http://0.0.0.0:3000`), so every
 * genuine same-origin request coming from a browser would be rejected and all
 * account write endpoints would fail.
 *
 * In the Base44 sandbox the preview proxy rewrites Host to the internal sandbox
 * host while the browser keeps sending the preview's public origin. That public
 * origin is therefore also accepted, but only when BASE44_PREVIEW_MODE is
 * exactly "1". With the variable unset or set to anything else the behaviour is
 * unchanged, and cross-site origins are rejected in every mode.
 */
export function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  if (origin === clientOrigin(request)) return true;

  if (process.env.BASE44_PREVIEW_MODE === "1") {
    const suffix = process.env.BASE44_PUBLIC_HOST_SUFFIX;
    if (suffix && origin === `https://3000-${suffix}`) return true;
  }
  return false;
}

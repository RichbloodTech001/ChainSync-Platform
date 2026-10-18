/**
 * The absolute base URL used in emails (verification, password reset, alerts).
 *
 * Inside the Base44 preview the app is reached through the preview proxy, so
 * links must use the public preview origin — the browser cannot resolve the
 * internal sandbox host. Outside the preview (production) the configured app URL
 * is used. This is the only place that builds user-facing absolute URLs.
 */
export function appBaseUrl() {
  if (process.env.BASE44_PREVIEW_MODE === "1" && process.env.BASE44_PUBLIC_HOST_SUFFIX) {
    return `https://3000-${process.env.BASE44_PUBLIC_HOST_SUFFIX}`;
  }
  const configured = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/+$/, "");
  return "http://localhost:3000";
}

export function appUrl(path: string) {
  return `${appBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

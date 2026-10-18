const securityHeaders = [{ key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }, { key: 'X-Frame-Options', value: 'DENY' }, { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' }, { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' }];

// HSTS and a content security policy are only meaningful over TLS in production.
// Next's development server needs inline/eval scripts, so they are not applied there.
if (process.env.NODE_ENV === 'production') {
  securityHeaders.push({ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' });
  securityHeaders.push({ key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" });
}

const nextConfig = { poweredByHeader: false, reactStrictMode: true, async headers() { return [{ source: '/:path*', headers: securityHeaders }]; } }; export default nextConfig;
// Cloudflare Worker entry.
//
// Two responsibilities:
//   1. Proxy /api/* to the upstream Builder API (https://api.agnt-gm.ai),
//      because the API does not send CORS headers — calling it directly from
//      the browser would be blocked.
//   2. Serve the built Vite SPA from the static-assets binding (./dist).
//      Unknown paths fall back to index.html (SPA routing).
//
// The Authorization header is forwarded as-is so Bearer tokens reach the API.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      const upstreamBase = env.API_UPSTREAM || "https://api.agnt-gm.ai";
      const upstreamUrl = new URL(url.pathname + url.search, upstreamBase);

      // Strip hop-by-hop headers; forward the rest unchanged.
      const fwdHeaders = new Headers(request.headers);
      fwdHeaders.delete("host");
      fwdHeaders.delete("connection");
      fwdHeaders.delete("cf-connecting-ip");
      fwdHeaders.delete("cf-ray");
      fwdHeaders.delete("cf-visitor");
      fwdHeaders.delete("x-forwarded-host");
      fwdHeaders.delete("x-forwarded-proto");

      const upstreamReq = new Request(upstreamUrl.toString(), {
        method: request.method,
        headers: fwdHeaders,
        body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
        redirect: "manual",
      });

      const res = await fetch(upstreamReq);
      // Re-emit the response so downstream caches do not see Cloudflare-set
      // hop headers from the proxied call.
      const respHeaders = new Headers(res.headers);
      respHeaders.delete("transfer-encoding");
      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: respHeaders,
      });
    }

    // Everything else: hand off to the static-assets binding. With
    // `not_found_handling = "single-page-application"` configured in
    // wrangler.toml, unknown paths serve /index.html so client-side routing
    // works.
    return env.ASSETS.fetch(request);
  },
};

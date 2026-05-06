// Cloudflare Worker entry.
//
// Single responsibility: serve the built Vite SPA from the static-assets
// binding. The SPA talks to https://api.agnt-gm.ai directly (CORS is
// configured on the API side for our origin), so the worker has no proxy
// duties.
//
// Unknown paths fall through to /index.html (SPA routing) thanks to
// `not_found_handling = "single-page-application"` in wrangler.toml.

export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};

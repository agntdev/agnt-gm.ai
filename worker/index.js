// Cloudflare Worker entry.
//
// Serves the built Vite SPA from the static-assets binding. The SPA talks to
// https://api.agnt-gm.ai directly (CORS is configured on the API side for our
// origin), so the worker has no proxy duties.
//
// The app lives under /app so the apex can hold the indexable promo page. Vite
// bakes /app/… into index.html (see `base` in vite.config.ts) but the files
// themselves sit at the bundle root, so requests arrive one path segment deeper
// than the asset they want — this worker removes that segment before the
// lookup.
//
// Both /app/… and bare / are served during the migration: the worker still owns
// the whole hostname until the promo site takes the apex, and breaking / in the
// meantime would break every open tab. Unknown paths fall through to
// /index.html (hash routing) via `not_found_handling = "single-page-application"`.

const PREFIX = '/app';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // /app → /app/ so relative resolution inside the document has a directory
    // to resolve against.
    if (url.pathname === PREFIX) {
      return Response.redirect(`${url.origin}${PREFIX}/`, 301);
    }

    // /app/assets/index-abc.js → /assets/index-abc.js
    if (url.pathname.startsWith(`${PREFIX}/`)) {
      url.pathname = url.pathname.slice(PREFIX.length) || '/';
      const response = await env.ASSETS.fetch(new Request(url, request));
      // Assets canonicalizes .html URLs. Keep its redirects inside the app
      // mount instead of sending customers to the separate promo site.
      const location = response.headers.get('Location');
      if (response.status >= 300 && response.status < 400 && location) {
        const target = new URL(location, url);
        if (target.origin === url.origin) {
          target.pathname = `${PREFIX}${target.pathname}`;
          const redirected = new Response(response.body, response);
          redirected.headers.set('Location', target.toString());
          return redirected;
        }
      }
      return response;
    }

    return env.ASSETS.fetch(request);
  },
};

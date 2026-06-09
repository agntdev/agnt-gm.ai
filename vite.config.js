import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { Readable } from "node:stream";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Vite's built-in proxy silently strips the `Authorization` header on
    // cross-origin requests (http-proxy treats it as hop-by-hop). That breaks
    // Bearer auth on POST /api/builder/* — GETs sometimes sneak through
    // because http-proxy's strip-list is header-name sensitive. Workaround:
    // register a custom Connect middleware that forwards /api/* to prod
    // manually, then explicitly copying every header the request arrived with.
    proxy: undefined,
  },
  plugins: [
    react(),
    {
      name: "agnt-api-passthrough",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (!req.url || !req.url.startsWith("/api/")) return next();
          const target = "https://api.agnt-gm.ai" + req.url;
          const headers = { ...req.headers, host: "api.agnt-gm.ai" };
          // Strip hop-by-hop that breaks the upstream connection.
          delete headers.connection;
          delete headers["keep-alive"];
          delete headers["transfer-encoding"];
          // API CORS allowlist is `https://agnt-gm.ai` only. The browser
          // sends `Origin: http://localhost:5173` which the prod API rejects
          // with 403. Rewrite Origin to the production frontend so the
          // request is treated like a same-origin call from prod.
          headers.origin = "https://agnt-gm.ai";
          headers.referer = "https://agnt-gm.ai/";
          try {
            // Read request body (needed for POST/PUT/PATCH). Buffer
            // instead of streaming so we can retry/fork if needed.
            let reqBodyBuf = null;
            if (req.method !== "GET" && req.method !== "HEAD") {
              const chunks = [];
              for await (const chunk of req) chunks.push(chunk);
              reqBodyBuf = Buffer.concat(chunks);
            }
            const upstream = await fetch(target, {
              method: req.method,
              headers,
              body: reqBodyBuf || undefined,
            });
            // Read the full body before forwarding. Vite's dev server
            // somehow swallows part of large res.end() strings, so we
            // chunk it manually.
            const bodyText = await upstream.text();
            const bodyBuf = Buffer.from(bodyText, "utf8");
            res.statusCode = upstream.status;
            upstream.headers.forEach((v, k) => {
              if (k === "content-encoding" || k === "transfer-encoding") return;
              res.setHeader(k, v);
            });
            res.setHeader("content-length", String(bodyBuf.length));
            res.write(bodyBuf);
            res.end();
          } catch (err) {
            res.statusCode = 502;
            res.end(`proxy error: ${err?.message || err}`);
          }
        });
      },
    },
  ],
});

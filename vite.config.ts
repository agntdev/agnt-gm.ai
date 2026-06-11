import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev proxy: api.agnt-gm.ai does not allow cross-origin browser calls,
// so /api is proxied during development. In production host the app
// behind the same domain or a reverse proxy that forwards /api.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'https://api.agnt-gm.ai',
        changeOrigin: true,
        // the API 403s browser Origins that aren't allowlisted — don't forward them
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('origin');
            proxyReq.removeHeader('referer');
          });
        },
      },
    },
  },
});

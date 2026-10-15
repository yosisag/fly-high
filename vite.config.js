import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Content-Security-Policy for the published site only (the dev server needs inline HMR + websockets).
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",                 // Draco decoder (WASM) for Google 3D tiles
  "worker-src 'self' blob:",
  "connect-src 'self' blob: data: https://api.cesium.com https://*.cesium.com https://tile.googleapis.com https://www.gstatic.com https://server.arcgisonline.com",
  "img-src 'self' data: blob: https://server.arcgisonline.com https://tile.googleapis.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');
const securityHeaders = () => ({
  name: 'security-meta',
  apply: 'build',
  transformIndexHtml: (html) => html.replace('<meta charset="UTF-8" />',
    `<meta charset="UTF-8" />\n  <meta http-equiv="Content-Security-Policy" content="${CSP}" />\n  <meta name="referrer" content="strict-origin-when-cross-origin" />`),
});

export default defineConfig({
  base: './',
  plugins: [securityHeaders()],
  build: { chunkSizeWarningLimit: 2500, rollupOptions: { input: { main: resolve(import.meta.dirname, 'index.html'), nyc: resolve(import.meta.dirname, 'nyc.html'), flight: resolve(import.meta.dirname, 'flight.html') } } },
});

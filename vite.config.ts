import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync, existsSync } from 'node:fs';

// Путь к board.canvas: env SOVERN_BOARD или дефолт — mc_hub feedback board.
const BOARD_PATH =
  process.env.SOVERN_BOARD ?? 'C:/telo/Efforts/Ongoing/mc_hub/feedback/board.canvas';

// Dev-only: отдаёт /board.canvas с диска на каждый запрос (никакого кэша) —
// polling на клиенте видит свежий файл сразу после записи fb.mjs.
const serveBoard = (): Plugin => ({
  name: 'sovern-serve-board',
  configureServer(server) {
    server.middlewares.use('/board.canvas', (_req, res) => {
      if (!existsSync(BOARD_PATH)) {
        res.statusCode = 404;
        res.end('board.canvas not found at ' + BOARD_PATH);
        return;
      }
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(readFileSync(BOARD_PATH, 'utf8'));
    });
  },
});

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), serveBoard()],
  // Tauri expects a fixed port, fail if it's already in use
  server: {
    port: 1420,
    strictPort: true,
  },
  // env vars starting with `VITE_` are exposed to the client
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    // Standard ES target for modern browsers/Tauri
    target: 'es2020',
    // don't minify for debug builds
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    // produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});

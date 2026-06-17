import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';

// Путь к board.canvas: env SOVERN_BOARD или дефолт — mc_hub feedback board.
const BOARD_PATH =
  process.env.SOVERN_BOARD ?? 'C:/telo/Efforts/Ongoing/mc_hub/feedback/board.canvas';
// fb.mjs живёт рядом с board.canvas: <feedback>/scripts/fb.mjs
const FB_CLI = join(dirname(BOARD_PATH), 'scripts', 'fb.mjs');

const STATUSES = ['idle', 'pending', 'active', 'done', 'blocked'];
const ID_RE = /^fb_[0-9a-f]{12}$/;

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

    // POST /api/feedback/status { id, status } → fb.mjs status <id> <status>
    // (kanban drag-and-drop write-back в feedback.jsonl + rebuild board.canvas)
    server.middlewares.use('/api/feedback/status', (req, res) => {
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.end('POST only');
        return;
      }
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        res.setHeader('Content-Type', 'application/json');
        try {
          const { id, status } = JSON.parse(body);
          // strict-валидация: аргументы уходят в execFile без shell, но не доверяем входу
          if (!ID_RE.test(id) || !STATUSES.includes(status)) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: 'invalid id or status' }));
            return;
          }
          const out = execFileSync(process.execPath, [FB_CLI, 'status', id, status], {
            encoding: 'utf8',
            timeout: 10_000,
          });
          res.end(JSON.stringify({ ok: true, out: out.trim() }));
        } catch (e: any) {
          res.statusCode = 500;
          res.end(JSON.stringify({ ok: false, error: e?.stderr?.toString?.() || String(e) }));
        }
      });
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
    proxy: {
      '/llm': {
        target: process.env.SOVERN_LLM_GATEWAY ?? 'http://localhost:4001',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/llm/, ''),
        configure: (proxy) => {
          const key = process.env.LITELLM_KEY;
          if (key) proxy.on('proxyReq', (proxyReq) => proxyReq.setHeader('Authorization', `Bearer ${key}`));
        },
      },
    },
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

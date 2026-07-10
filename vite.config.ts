import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve, sep } from 'node:path';
import { readArtifacts, readArtifactsWithDecisions, appendDecision } from './src/mcp/artifactInbox';

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

const TOKENS_CSS_PATH = 'C:/telo/Efforts/Ongoing/NAUTILUS/core/desops/ui-kit/globals.css';
const DECISIONS = ['approved', 'rejected', 'deleted'];

/** kebab-нормализация имени файла: lower-case, non-alnum -> '-', trim dashes. */
function kebab(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const FILENAME_RE = /^[a-z0-9-_]{1,64}$/;
const DOTDOT_RE = /(^|[\\/])\.\.($|[\\/])/;

// Dev-only: мост между DesOps orchestrator (artifact inbox JSONL) и React canvas —
// GET-лист артефактов, POST-решение approve/reject, POST-export approved-варианта
// на диск в <projectDir>\design\drafts\<name>.tsx, plus desops tokens.css passthrough.
const serveArtifacts = (): Plugin => ({
  name: 'sovern-serve-artifacts',
  configureServer(server) {
    server.middlewares.use('/api/artifacts', (req, res, next) => {
      // Connect strips the mount prefix from req.url, so here '/api/artifacts'
      // arrives as '', '/api/artifacts/decision' as '/decision', etc.
      const url = (req.url ?? '').split('?')[0];

      if (url === '' || url === '/') {
        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.end('GET only');
          return;
        }
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        try {
          res.end(JSON.stringify({ artifacts: readArtifactsWithDecisions() }));
        } catch (e: any) {
          res.statusCode = 500;
          res.end(JSON.stringify({ ok: false, error: String(e) }));
        }
        return;
      }

      if (url === '/decision') {
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
            const { artifactId, decision, name, variant_group } = JSON.parse(body);
            if (typeof artifactId !== 'string' || !artifactId || !DECISIONS.includes(decision)) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: 'invalid artifactId or decision' }));
              return;
            }
            appendDecision({ artifactId, decision, name, variant_group });
            res.end(JSON.stringify({ ok: true }));
          } catch (e: any) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: String(e) }));
          }
        });
        return;
      }

      if (url === '/export') {
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
            const { artifactId, projectDir, name } = JSON.parse(body);
            if (
              typeof artifactId !== 'string' ||
              !artifactId ||
              typeof projectDir !== 'string' ||
              !projectDir ||
              typeof name !== 'string' ||
              !name
            ) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: 'missing artifactId, projectDir, or name' }));
              return;
            }

            // raw-input check: no ".." path segments before we resolve anything.
            if (DOTDOT_RE.test(projectDir)) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: 'projectDir must not contain ".." segments' }));
              return;
            }

            const resolvedProjectDir = resolve(projectDir);
            if (!resolvedProjectDir.toLowerCase().startsWith('c:\\telo\\')) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: 'projectDir must resolve under C:\\telo\\' }));
              return;
            }

            const safeName = kebab(name);
            if (!FILENAME_RE.test(safeName)) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: 'invalid name' }));
              return;
            }

            const artifact = readArtifacts().find((a) => a.id === artifactId);
            if (!artifact) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: 'unknown artifactId' }));
              return;
            }

            const draftsDir = resolve(resolvedProjectDir, 'design', 'drafts');
            const finalPath = resolve(draftsDir, `${safeName}.tsx`);
            if (!finalPath.startsWith(draftsDir + sep)) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: 'resolved path escapes design/drafts' }));
              return;
            }

            mkdirSync(draftsDir, { recursive: true });
            writeFileSync(finalPath, artifact.code, 'utf8');
            appendDecision({
              artifactId,
              decision: 'approved',
              name,
              variant_group: artifact.variant_group,
              exportedTo: finalPath,
            });

            res.end(JSON.stringify({ ok: true, path: finalPath }));
          } catch (e: any) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: String(e) }));
          }
        });
        return;
      }

      next();
    });

    // GET /desops/tokens.css — passthrough to the shared DesOps token sheet
    // (read fresh per request, same no-cache pattern as serveBoard).
    server.middlewares.use('/desops/tokens.css', (_req, res) => {
      if (!existsSync(TOKENS_CSS_PATH)) {
        res.statusCode = 404;
        res.end('tokens.css not found at ' + TOKENS_CSS_PATH);
        return;
      }
      res.setHeader('Content-Type', 'text/css');
      res.setHeader('Cache-Control', 'no-store');
      res.end(readFileSync(TOKENS_CSS_PATH, 'utf8'));
    });
  },
});

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), serveBoard(), serveArtifacts()],
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

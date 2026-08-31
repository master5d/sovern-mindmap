import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { readArtifacts, readArtifactsWithDecisions, appendDecision } from './src/mcp/artifactInbox';
import { BodyTooLargeError, readBodyCapped } from './src/mcp/httpBody';
import { resolveContained } from './src/mcp/pathContainment';
import { resolveBoardPaths } from './src/mcp/boardSources';
import { readBoardIndex, fbCliFor } from './src/mcp/boardIndex';

/** Единственный корень, куда дев-мост имеет право писать. */
const TELO_ROOT = 'C:\\telo';

/** 413 вместо молчаливого проглатывания — общий хвост для всех POST-мостов.
 *  Порядок важен: сначала ответ, и только потом обрыв недочитанного запроса —
 *  иначе клиент видит разорванное соединение вместо кода. */
function sendBodyError(
  req: { destroy(): void },
  res: { statusCode: number; setHeader(k: string, v: string): void; end(s: string): void },
  e: unknown,
): void {
  res.statusCode = e instanceof BodyTooLargeError ? 413 : 400;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: false, error: String((e as Error)?.message ?? e) }));
  req.destroy();
}

// Живых бордов может быть много: SOVERN_BOARDS перечисляет файлы И каталоги.
// Разбор — в src/mcp/boardSources, потому что этот файл вне src/** и vitest
// его не видит; логика здесь была бы непокрываемой.
const { paths: BOARD_PATHS, note: BOARD_NOTE } = resolveBoardPaths();
if (BOARD_NOTE) console.warn(`[SOVERN] ${BOARD_NOTE}`);
console.log(`[SOVERN] живых бордов: ${BOARD_PATHS.length}`);

const STATUSES = ['idle', 'pending', 'active', 'done', 'blocked'];
const ID_RE = /^fb_[0-9a-f]{12}$/;

// Dev-only: отдаёт /board.canvas с диска на каждый запрос (никакого кэша) —
// polling на клиенте видит свежий файл сразу после записи fb.mjs.
const serveBoard = (): Plugin => ({
  name: 'sovern-serve-board',
  configureServer(server) {
    // GET /api/boards — что вообще живо, как это назвать и куда можно писать.
    server.middlewares.use('/api/boards', (_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(readBoardIndex(BOARD_PATHS)));
    });

    // GET /board.canvas — ПЕРВЫЙ борд списка. Маршрут сохранён: на него смотрят
    // внешние потребители и вкладки, созданные до этой правки.
    //
    // Регистрация ДО /board/ — обязательна. connect отрезает хвостовой слэш
    // маршрута ('/board/' -> '/board') и на границе сегмента принимает не
    // только '/', но и '.' — так что маршрут '/board/', будь он первым,
    // перехватывал бы и '/board.canvas' (проверено живым прогоном: id
    // разбирался в пустую строку, ответ был 404 не из этого блока).
    server.middlewares.use('/board.canvas', (_req, res) => {
      const first = BOARD_PATHS[0];
      if (!first || !existsSync(first)) {
        res.statusCode = 404;
        res.end('board.canvas not found at ' + first);
        return;
      }
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(readFileSync(first, 'utf8'));
    });

    // GET /board/<id>.canvas — содержимое одного борда по устойчивому id.
    server.middlewares.use('/board/', (req, res) => {
      const id = String(req.url ?? '').replace(/^\//, '').replace(/\.canvas$/, '').split('?')[0];
      const found = readBoardIndex(BOARD_PATHS).find((b) => b.id === id);
      if (!found) {
        res.statusCode = 404;
        res.end(`борд с id ${id} не значится среди живых`);
        return;
      }
      if (!existsSync(found.path)) {
        res.statusCode = 404;
        res.end('борд не найден на диске: ' + found.path);
        return;
      }
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(readFileSync(found.path, 'utf8'));
    });

    // POST /api/feedback/status { id, status, boardId } → fb.mjs status <id> <status>
    // (kanban drag-and-drop write-back в feedback.jsonl + rebuild board.canvas)
    server.middlewares.use('/api/feedback/status', (req, res) => {
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.end('POST only');
        return;
      }
      readBodyCapped(req).then((body) => {
        res.setHeader('Content-Type', 'application/json');
        try {
          const { id, status, boardId } = JSON.parse(body);
          // strict-валидация: аргументы уходят в execFile без shell, но не доверяем входу
          if (!ID_RE.test(id) || !STATUSES.includes(status)) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: 'invalid id or status' }));
            return;
          }
          const target = readBoardIndex(BOARD_PATHS).find((b) => b.id === boardId);
          if (!target) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: `борд ${boardId} не значится среди живых` }));
            return;
          }
          const cli = fbCliFor(target.path);
          if (!cli) {
            // Без этой проверки перетаскивание карточки на ПРОИЗВОДНОМ борде
            // ушло бы в fb.mjs от mc_hub с идентификатором, которого там нет.
            res.statusCode = 400;
            res.end(JSON.stringify({
              ok: false,
              error: `борд «${target.name}» производный: править его нечем, рядом нет scripts/fb.mjs`,
            }));
            return;
          }
          const out = execFileSync(process.execPath, [cli, 'status', id, status], {
            encoding: 'utf8',
            timeout: 10_000,
          });
          res.end(JSON.stringify({ ok: true, out: out.trim() }));
        } catch (e: any) {
          res.statusCode = 500;
          res.end(JSON.stringify({ ok: false, error: e?.stderr?.toString?.() || String(e) }));
        }
      }, (e) => sendBodyError(req, res, e));
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
        readBodyCapped(req).then((body) => {
          res.setHeader('Content-Type', 'application/json');
          try {
            const { artifactId, decision, name, variant_group } = JSON.parse(body);
            if (typeof artifactId !== 'string' || !artifactId || !DECISIONS.includes(decision)) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: 'invalid artifactId or decision' }));
              return;
            }
            // Решение по несуществующему артефакту — молчаливая порча журнала:
            // запись ляжет в JSONL и никогда ни к чему не применится (а при
            // переиспользовании id применится не к тому). /export эту проверку
            // делал с самого начала — здесь её просто забыли.
            if (!readArtifacts().some((a) => a.id === artifactId)) {
              res.statusCode = 404;
              res.end(JSON.stringify({ ok: false, error: `unknown artifactId: ${artifactId}` }));
              return;
            }
            appendDecision({ artifactId, decision, name, variant_group });
            res.end(JSON.stringify({ ok: true }));
          } catch (e: any) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: String(e) }));
          }
        }, (e) => sendBodyError(req, res, e));
        return;
      }

      if (url === '/export') {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('POST only');
          return;
        }
        readBodyCapped(req).then((body) => {
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

            // Контейнмент считается ПОСЛЕ разворота симлинков: `resolve()`
            // лексический, и junction внутри пути уводит запись наружу,
            // оставаясь «внутри» по строке.
            const projectContained = resolveContained(projectDir, TELO_ROOT);
            if (!projectContained.ok) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: `projectDir must resolve under ${TELO_ROOT}` }));
              return;
            }
            const resolvedProjectDir = projectContained.path;

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
            // Каталог создаётся ДО проверки: пока его нет, разворачивать
            // нечего — junction, подменяющий design/ или drafts/, виден
            // realpath'у только после того, как путь существует.
            mkdirSync(draftsDir, { recursive: true });

            // Две проверки, и обе нужны. Первая: сам каталог drafts обязан
            // реально лежать под C:\telo — иначе junction, подменяющий
            // design/ или drafts/, стал бы новым «корнем», и проверка файла
            // относительно него прошла бы, уже находясь снаружи.
            const draftsContained = resolveContained(draftsDir, TELO_ROOT);
            if (!draftsContained.ok) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: `design/drafts resolves outside ${TELO_ROOT}` }));
              return;
            }
            // Вторая: имя файла не выводит за пределы уже проверенного каталога.
            const fileContained = resolveContained(
              resolve(draftsContained.path, `${safeName}.tsx`),
              draftsContained.path,
            );
            if (!fileContained.ok) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: 'resolved path escapes design/drafts' }));
              return;
            }
            const finalPath = fileContained.path;

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
        }, (e) => sendBodyError(req, res, e));
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

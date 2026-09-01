// Дев-сервер с полным набором живых бордов лаборатории: борд обратной связи
// mc_hub плюс все плиты обсерватории DataViz из NAUTILUS.
//
// Зачем отдельный запуск, а не изменённый дефолт: `npm run dev` обязан
// оставаться тем же, чем был, — иначе у всех, кто его звал, молча появятся
// чужие вкладки. Здесь же набор объявлен явно и виден в одном месте.
//
// Зачем скрипт, а не строка в package.json: переменную окружения из npm-скрипта
// на Windows и на macOS задают по-разному, и такая строка работала бы ровно на
// одной из платформ. Node одинаков везде.
//
// Каталог в списке разворачивается сервером в свои *.canvas — новая плита
// обсерватории появится вкладкой сама, без правки этого файла.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Источники живых бордов. Каталог = все борды в нём. */
const SOURCES = [
  'C:/telo/Efforts/Ongoing/mc_hub/feedback',
  'C:/telo/Efforts/Ongoing/NAUTILUS/docs/plates/observatory',
];

// Отсутствующий источник не прячем: сервер потом честно покажет его записью с
// ошибкой, но человеку полезнее узнать об этом до старта, а не искать вкладку.
const missing = SOURCES.filter((p) => !existsSync(p));
if (missing.length) {
  console.warn(`[dev-lab] источников нет на этой машине: ${missing.join(', ')}`);
  console.warn('[dev-lab] остальные борды откроются как обычно');
}

const vite = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const child = spawn(process.execPath, [vite, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, SOVERN_BOARDS: SOURCES.join(';') },
});

// Код возврата дочернего процесса — наш код возврата: иначе упавший дев-сервер
// выглядел бы успешным запуском.
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});

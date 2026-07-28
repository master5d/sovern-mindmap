import type { IncomingMessage } from 'node:http';

/** Потолок тела запроса для dev-мостов. Все они принимают короткий JSON
 *  (id + enum + пара имён), так что 256 КБ — с большим запасом. */
export const BODY_LIMIT_BYTES = 256 * 1024;

export class BodyTooLargeError extends Error {
  readonly limit: number;
  constructor(limit: number) {
    super(`request body exceeds ${limit} bytes`);
    this.name = 'BodyTooLargeError';
    this.limit = limit;
  }
}

/**
 * Читает тело запроса с жёстким потолком.
 *
 * Наивное `let body=''; req.on('data', c => body += c)` не ограничено ничем:
 * достаточно одного длинного POST, чтобы дев-сервер съел память. Здесь размер
 * считается в БАЙТАХ по мере поступления чанков, и на первом же превышении
 * чтение прекращается — не дожидаясь 'end', иначе отправитель успеет
 * догрузить остальное.
 *
 * Поток НЕ убивается: сокет ещё нужен, чтобы отдать клиенту честный 413.
 * Убить его сразу — значит превратить осмысленный отказ в обрыв связи
 * (curl показывает HTTP 000). Закрытие — забота вызывающего, после ответа.
 */
export function readBodyCapped(
  req: IncomingMessage,
  limit: number = BODY_LIMIT_BYTES,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    req.on('data', (c: Buffer | string) => {
      if (settled) return;
      const buf = Buffer.isBuffer(c) ? c : Buffer.from(c);
      size += buf.length;
      if (size > limit) {
        finish(() => {
          req.pause();                    // перестаём читать, но сокет живой — под ответ 413
          reject(new BodyTooLargeError(limit));
        });
        return;
      }
      chunks.push(buf);
    });

    req.on('end', () => finish(() => resolve(Buffer.concat(chunks).toString('utf8'))));
    req.on('error', (e) => finish(() => reject(e)));
  });
}

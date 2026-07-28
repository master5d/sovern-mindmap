import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { BODY_LIMIT_BYTES, BodyTooLargeError, readBodyCapped } from './httpBody';

/** Минимальный стенд вместо IncomingMessage: нам нужны только 'data'/'end'/'error'
 *  и признак того, что поток прибили. */
function fakeReq() {
  const em = new EventEmitter() as EventEmitter & {
    destroyed: boolean;
    paused: boolean;
    destroy(): void;
    pause(): void;
  };
  em.destroyed = false;
  em.paused = false;
  em.destroy = () => {
    em.destroyed = true;
  };
  em.pause = () => {
    em.paused = true;
  };
  return em;
}

describe('readBodyCapped', () => {
  it('собирает тело целиком, когда оно в пределах лимита', async () => {
    const req = fakeReq();
    const p = readBodyCapped(req as never);
    req.emit('data', Buffer.from('{"a":'));
    req.emit('data', Buffer.from('1}'));
    req.emit('end');
    await expect(p).resolves.toBe('{"a":1}');
  });

  it('режет тело, переросшее лимит, и перестаёт читать', async () => {
    const req = fakeReq();
    const p = readBodyCapped(req as never, 8);
    req.emit('data', Buffer.from('12345'));
    req.emit('data', Buffer.from('67890'));            // 10 > 8
    await expect(p).rejects.toBeInstanceOf(BodyTooLargeError);
    expect(req.paused).toBe(true);
  });

  it('НЕ убивает сокет при превышении — иначе 413 некуда писать', async () => {
    // Смок поймал ровно это: с `req.destroy()` клиент получал обрыв связи
    // (curl: HTTP 000) вместо осмысленного 413. Закрывает вызывающий, после ответа.
    const req = fakeReq();
    const p = readBodyCapped(req as never, 4);
    req.emit('data', Buffer.from('123456789'));
    await expect(p).rejects.toBeInstanceOf(BodyTooLargeError);
    expect(req.destroyed).toBe(false);
  });

  it('считает лимит в БАЙТАХ, не в символах — многобайтовый текст не проскакивает', async () => {
    const req = fakeReq();
    const p = readBodyCapped(req as never, 8);
    req.emit('data', Buffer.from('«кавычки»'));        // 4 символа < 8, но байт больше
    await expect(p).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it('после превышения дальнейшие чанки не накапливаются и промис не режектится дважды', async () => {
    const req = fakeReq();
    const p = readBodyCapped(req as never, 4);
    req.emit('data', Buffer.from('123456'));
    req.emit('data', Buffer.from('789'));
    req.emit('end');
    await expect(p).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it('пробрасывает ошибку потока', async () => {
    const req = fakeReq();
    const p = readBodyCapped(req as never);
    req.emit('error', new Error('socket hang up'));
    await expect(p).rejects.toThrow('socket hang up');
  });

  it('дефолтный лимит задан и вменяем', () => {
    expect(BODY_LIMIT_BYTES).toBeGreaterThan(1024);
    expect(BODY_LIMIT_BYTES).toBeLessThanOrEqual(5 * 1024 * 1024);
  });
});

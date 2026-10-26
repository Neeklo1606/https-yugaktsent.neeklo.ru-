import { describe, expect, it } from 'vitest';
import { isLocalTarget, stagingDecision } from '../../staging-guard';

describe('staging-guard', () => {
  it('считает боевой домен чужим, а localhost — своим', () => {
    expect(isLocalTarget('https://yugaktsent.neeklo.ru')).toBe(false);
    expect(isLocalTarget('http://127.0.0.1:3000')).toBe(true);
    expect(isLocalTarget('http://localhost:3025')).toBe(true);
  });

  it('пропускает чтение в прокси', () => {
    expect(stagingDecision('GET', '/api/v1/blocks', false)).toBeNull();
    expect(stagingDecision('HEAD', '/uploads/a.jpg', false)).toBeNull();
  });

  it('заявку не отправляет на прод, отвечает демо', () => {
    const d = stagingDecision('POST', '/api/v1/requests', false);
    expect(d?.status).toBe(201);
    expect(d?.body).toMatchObject({ demo: true });
  });

  it('вход выдаёт демо-сессию, /auth/me отвечает демо-пользователем только с демо-токеном', () => {
    expect(stagingDecision('POST', '/api/v1/auth/login', false)?.status).toBe(200);
    expect(stagingDecision('GET', '/api/v1/auth/me', true)?.body).toMatchObject({ role: 'admin' });
    expect(stagingDecision('GET', '/api/v1/auth/me', false)).toBeNull();
  });

  it('прочие записи блокирует', () => {
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(stagingDecision(m, '/api/v1/admin/blocks/1', true)?.status).toBe(403);
    }
  });
});

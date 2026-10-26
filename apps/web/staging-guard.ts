/**
 * Staging-режим dev-сервера: фронт смотрит в боевой API только на чтение.
 *
 * Локальная разработка проксирует /api на прод (VITE_API_PROXY_TARGET). Без этой
 * прослойки любая отправленная форма или сохранение в админке писали бы в боевую БД.
 * Правила:
 *  - GET/HEAD/OPTIONS уходят в прокси как есть (публичные данные каталога);
 *  - заявки (/requests) отвечают демо-ответом, в прод не уходят;
 *  - вход в админку выдаёт демо-сессию, пароль на прод не отправляется;
 *  - прочие записи (POST/PUT/PATCH/DELETE) получают 403 с понятным текстом;
 *  - демо-токен никогда не уходит на прод.
 *
 * Включается сам, если цель прокси не локальная. Отключить: STAGING_ALLOW_WRITES=1.
 */
import type { Plugin, Connect } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

export const STAGING_DEMO_TOKEN = 'staging-demo-token';

const DEMO_USER = {
  id: 'staging-demo-admin',
  email: 'demo@staging.local',
  phone: null,
  fullName: 'Демо-администратор (staging)',
  avatarUrl: null,
  role: 'admin',
  telegramUsername: null,
  telegramLinked: false,
  isActive: true,
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isLocalTarget(target: string): boolean {
  try {
    const host = new URL(target).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.localhost');
  } catch {
    return false;
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Staging-Mode', 'read-only');
  res.end(JSON.stringify(body));
}

function hasDemoToken(req: IncomingMessage): boolean {
  return (req.headers.authorization ?? '') === `Bearer ${STAGING_DEMO_TOKEN}`;
}

/** Ответ демо-слоя или null, если запрос можно отдать прокси */
export function stagingDecision(
  method: string,
  path: string,
  demoAuth: boolean,
): { status: number; body: unknown } | null {
  const tokens = { accessToken: STAGING_DEMO_TOKEN, refreshToken: STAGING_DEMO_TOKEN };

  if (path === '/api/v1/auth/me' && demoAuth) return { status: 200, body: DEMO_USER };
  if (SAFE_METHODS.has(method)) return null;

  if (path === '/api/v1/auth/login' || path === '/api/v1/auth/refresh') return { status: 200, body: tokens };
  if (path === '/api/v1/auth/logout') return { status: 200, body: { ok: true } };
  if (path === '/api/v1/requests' && method === 'POST') {
    return { status: 201, body: { id: 0, demo: true, message: 'Staging: заявка не отправлена в CRM' } };
  }
  return {
    status: 403,
    body: {
      statusCode: 403,
      error: 'StagingReadOnly',
      message: 'Демо-режим: запись в боевой API отключена. Изменения не сохраняются.',
    },
  };
}

export function stagingGuard(enabled: boolean): Plugin {
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    const url = req.url ?? '';
    if (!url.startsWith('/api/') && !url.startsWith('/uploads/')) return next();
    const path = url.split('?')[0];
    const demoAuth = hasDemoToken(req);
    const decision = stagingDecision((req.method ?? 'GET').toUpperCase(), path, demoAuth);
    if (decision) return sendJson(res, decision.status, decision.body);
    // На прод уходит только анонимный запрос: демо-токен ему ничего не скажет, а настоящий здесь не нужен
    delete req.headers.authorization;
    delete req.headers.cookie;
    next();
  };

  return {
    name: 'yugaktsent-staging-guard',
    apply: 'serve',
    configureServer(server) {
      if (enabled) server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      if (enabled) server.middlewares.use(middleware);
    },
  };
}

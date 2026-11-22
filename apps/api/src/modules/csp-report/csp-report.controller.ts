import { Controller, HttpCode, HttpStatus, Logger, Post, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../auth/decorators';

/** Ключевые поля отчёта браузера о нарушении CSP (report-uri, формат application/csp-report) */
export type CspViolation = { directive: string; blocked: string; page: string };

/** Разбор отчёта: старый формат { "csp-report": {...} } и новый Reporting API [{ body: {...} }] */
export function parseCspReport(raw: string): CspViolation[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  const items: Record<string, unknown>[] = Array.isArray(data)
    ? data.map((d) => (d as { body?: Record<string, unknown> })?.body ?? {})
    : [((data as Record<string, unknown>)?.['csp-report'] as Record<string, unknown>) ?? {}];
  return items
    .map((r) => ({
      directive: String(r['effective-directive'] ?? r['violated-directive'] ?? r.effectiveDirective ?? ''),
      blocked: String(r['blocked-uri'] ?? r.blockedURL ?? '').slice(0, 200),
      // Страница без query: в адресе могут быть фильтры или метки, личных данных в журнал не пишем
      page: String(r['document-uri'] ?? r.documentURL ?? '').split('?')[0].slice(0, 200),
    }))
    .filter((v) => v.directive);
}

/**
 * Приёмник отчётов CSP (режим Report-Only): браузеры сообщают, что политика заблокировала бы.
 * Каждое новое сочетание «директива + источник» пишется в журнал API один раз — так за неделю
 * видно, что разрешить, прежде чем включать политику по-настоящему. Лимит запросов — в nginx.
 */
@ApiExcludeController()
@Controller('csp-report')
export class CspReportController {
  private readonly logger = new Logger('CSP');
  private readonly seen = new Set<string>();

  @Public()
  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  async report(@Req() req: Request): Promise<void> {
    const raw = await readBody(req);
    for (const v of parseCspReport(raw)) {
      const key = `${v.directive}|${v.blocked}`;
      if (this.seen.has(key) || this.seen.size > 500) continue;
      this.seen.add(key);
      this.logger.warn(`CSP report-only: ${v.directive} ← ${v.blocked || '(inline)'} на ${v.page}`);
    }
  }
}

/** Тело с типом application/csp-report парсер JSON не трогает — читаем поток сами (до 16 КБ) */
function readBody(req: Request): Promise<string> {
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length) return Promise.resolve(JSON.stringify(req.body));
  return new Promise((resolve) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size <= 16_384) chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(''));
  });
}

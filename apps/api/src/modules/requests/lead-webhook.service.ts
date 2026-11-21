import { Injectable, Logger } from '@nestjs/common';
import type { Request as DbRequest } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const PRIVATE_HOST =
  /^(localhost|.*\.local|.*\.internal|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:)/i;

/** Только https и внешний хост: вебхук задаёт админ, но запрос уходит с нашего сервера (защита от SSRF). */
export function validateWebhookUrl(raw: string): { ok: true; url: URL } | { ok: false; error: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, error: 'Неверный адрес' };
  }
  if (url.protocol !== 'https:') return { ok: false, error: 'Нужен адрес https://' };
  if (PRIVATE_HOST.test(url.hostname)) return { ok: false, error: 'Внутренние адреса запрещены' };
  return { ok: true, url };
}

/**
 * Новая заявка → POST JSON на вебхук CRM (настройка `lead_webhook_url` в «Интеграциях»).
 * Не блокирует ответ посетителю; ошибки только в лог.
 */
@Injectable()
export class LeadWebhookService {
  private readonly logger = new Logger(LeadWebhookService.name);
  private readonly siteUrl = (process.env.PUBLIC_SITE_URL?.trim().replace(/\/+$/, '') || 'https://yugaktsent.neeklo.ru');

  constructor(private readonly prisma: PrismaService) {}

  async getUrl(): Promise<string> {
    const row = await this.prisma.siteSetting.findUnique({ where: { key: 'lead_webhook_url' }, select: { value: true } });
    return String(row?.value ?? '').trim();
  }

  private async post(raw: string, body: unknown): Promise<{ ok: boolean; status?: number; error?: string }> {
    const v = validateWebhookUrl(raw);
    if (!v.ok) return { ok: false, error: v.error };
    try {
      const res = await fetch(v.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'YugAktsent-Leads/1.0' },
        body: JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
      });
      return res.ok ? { ok: true, status: res.status } : { ok: false, status: res.status, error: `CRM ответила ${res.status}` };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  payload(row: DbRequest) {
    return {
      event: 'request.created',
      id: row.id,
      type: row.type,
      name: row.name ?? null,
      phone: row.phone ?? null,
      email: (row as { email?: string | null }).email ?? null,
      comment: row.comment ?? null,
      blockId: row.blockId ?? null,
      listingId: row.listingId ?? null,
      sourceUrl: row.sourceUrl ?? null,
      utm: (row as { utm?: unknown }).utm ?? null,
      createdAt: row.createdAt,
      adminUrl: `${this.siteUrl}/admin/requests/${row.id}`,
    };
  }

  async notifyNewRequest(row: DbRequest): Promise<void> {
    const url = await this.getUrl();
    if (!url) return;
    const r = await this.post(url, this.payload(row));
    if (!r.ok) this.logger.warn(`Lead webhook failed for request ${row.id}: ${r.error ?? r.status}`);
  }

  async sendTest(): Promise<{ ok: boolean; status?: number; error?: string }> {
    const url = await this.getUrl();
    if (!url) return { ok: false, error: 'Адрес вебхука не задан' };
    return this.post(url, {
      event: 'test',
      id: 0,
      type: 'TEST',
      name: 'Проверка',
      phone: null,
      comment: 'Тестовая отправка из админки «Интеграции»',
      createdAt: new Date().toISOString(),
      adminUrl: `${this.siteUrl}/admin/integrations`,
    });
  }
}

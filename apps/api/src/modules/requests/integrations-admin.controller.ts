import { Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators';
import { PrismaService } from '../../prisma/prisma.service';
import { TelegramNotifyService } from './telegram-notify.service';
import { LeadWebhookService } from './lead-webhook.service';

const filled = (v?: string | null) => Boolean(v && v.trim());

/** Админка → «Интеграции»: состояние подключений и кнопки «Проверить». Секреты наружу не отдаются. */
@ApiTags('Admin / Integrations')
@ApiBearerAuth()
@Controller('admin/integrations')
export class IntegrationsAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramNotifyService,
    private readonly webhook: LeadWebhookService,
  ) {}

  @Get('status')
  @Roles('admin')
  @ApiOperation({ summary: 'Состояние интеграций (без значений секретов)' })
  async status() {
    const keys = [
      'telegram_bot_token',
      'telegram_login_bot_username',
      'yandex_maps_api_key',
      'yandex_metrika_id',
      'yandex_verification',
      'google_site_verification',
      'lead_webhook_url',
    ];
    const rows = await this.prisma.siteSetting.findMany({ where: { key: { in: keys } }, select: { key: true, value: true } });
    const v = Object.fromEntries(rows.map((r) => [r.key, r.value ?? '']));
    const [recipients, feedsTotal, feedsEnabled, feedsWithErrors, lastFeed] = await Promise.all([
      this.prisma.telegramNotifyRecipient.count({ where: { isActive: true } }),
      this.prisma.feedLink.count(),
      this.prisma.feedLink.count({ where: { isEnabled: true } }),
      this.prisma.feedLink.count({ where: { isEnabled: true, lastSyncError: { not: null } } }),
      this.prisma.feedLink.findFirst({ where: { lastSyncedAt: { not: null } }, orderBy: { lastSyncedAt: 'desc' }, select: { lastSyncedAt: true } }),
    ]);
    return {
      telegram: { tokenSet: filled(v.telegram_bot_token), recipients },
      maps: { keySet: filled(v.yandex_maps_api_key) },
      metrika: { id: (v.yandex_metrika_id || '').trim() || null },
      webmaster: { yandex: filled(v.yandex_verification), google: filled(v.google_site_verification) },
      webhook: { set: filled(v.lead_webhook_url) },
      feeds: { total: feedsTotal, enabled: feedsEnabled, withErrors: feedsWithErrors, lastSyncedAt: lastFeed?.lastSyncedAt ?? null },
    };
  }

  @Post('telegram/test')
  @Roles('admin')
  @ApiOperation({ summary: 'Проверить бота: getMe + тестовое сообщение получателям' })
  testTelegram() {
    return this.telegram.sendTest();
  }

  @Post('webhook/test')
  @Roles('admin')
  @ApiOperation({ summary: 'Отправить тестовую заявку на вебхук CRM' })
  testWebhook() {
    return this.webhook.sendTest();
  }
}

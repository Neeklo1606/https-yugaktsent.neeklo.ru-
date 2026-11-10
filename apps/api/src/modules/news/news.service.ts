import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NewsWorkflowStatus, Prisma } from '@prisma/client';
import { existsSync } from 'node:fs';
import { resolveMediaRoot } from '../../common/media-storage.util';
import { PrismaService } from '../../prisma/prisma.service';
import { parseFeedXml, slugFromSourceUrl } from './news-rss.parser';
import {
  detectImageExtension,
  diskPathFromPublicUrl,
  downloadTelegramMessagePhoto,
  MEDIA_PUBLIC_PREFIX,
  saveLocalMediaFile,
  verifyFileOnDisk,
} from './telegram-media-downloader';
import { createTelegramClientOptions } from './telegram-client-options';

const RSS_SETTING_KEY = 'home_news_rss_url';
const DEFAULT_TELEGRAM_LIMIT_PER_CHANNEL = 20;

@Injectable()
export class NewsService implements OnModuleInit {
  private readonly log = new Logger(NewsService.name);
  private readonly mediaRoot: string;
  private rssTimer?: NodeJS.Timeout;
  private telegramDailyTimer?: NodeJS.Timeout;
  private lastTelegramAutoSyncDay: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.mediaRoot = resolveMediaRoot(this.config.get<string>('MEDIA_ROOT'));
  }

  onModuleInit() {
    if (this.config.get<string>('NEWS_RSS_SYNC_DISABLE') === 'true') {
      this.log.log('RSS news sync disabled (NEWS_RSS_SYNC_DISABLE)');
      return;
    }
    const intervalMs = Number(this.config.get<string>('NEWS_RSS_SYNC_INTERVAL_MS') ?? 6 * 60 * 60 * 1000);
    const safeInterval = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 6 * 60 * 60 * 1000;
    this.rssTimer = setInterval(() => {
      this.syncFromRss().catch((e) =>
        this.log.warn(`Scheduled RSS news sync failed: ${e instanceof Error ? e.message : String(e)}`),
      );
    }, safeInterval);
    this.rssTimer.unref?.();

    if (this.config.get<string>('TELEGRAM_NEWS_AUTO_SYNC_DISABLE') !== 'true') {
      this.telegramDailyTimer = setInterval(() => {
        void this.runScheduledTelegramSync();
      }, 60 * 60 * 1000);
      this.telegramDailyTimer.unref?.();
      // Do not sync on API boot — only at 09:00 via the hourly timer (avoids hang on pm2 restart).
    }
  }

  /** Daily import at 09:00 local server time (draft unless channel has publishOnImport). */
  private async runScheduledTelegramSync(): Promise<void> {
    const now = new Date();
    if (now.getHours() !== 9) return;
    const dayKey = now.toISOString().slice(0, 10);
    if (this.lastTelegramAutoSyncDay === dayKey) return;
    this.lastTelegramAutoSyncDay = dayKey;
    try {
      const result = await this.syncFromTelegramChannels();
      this.log.log(`Scheduled Telegram news sync: ${JSON.stringify(result)}`);
    } catch (e) {
      this.log.warn(
        `Scheduled Telegram news sync failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  async findAll(
    page = 1,
    perPage = 20,
    publishedOnly = false,
    regionId?: number | null,
    opts?: {
      workflowStatus?: NewsWorkflowStatus | null;
      search?: string | null;
      includeDeleted?: boolean;
      telegramChannelId?: number | null;
    },
  ) {
    const where: Prisma.NewsWhereInput = publishedOnly
      ? { isPublished: true, deletedAt: null }
      : {};
    if (!opts?.includeDeleted) {
      where.deletedAt = null;
    }
    if (opts?.workflowStatus) {
      where.workflowStatus = opts.workflowStatus;
    }
    if (opts?.telegramChannelId) {
      where.telegramChannelId = opts.telegramChannelId;
    }
    const q = (opts?.search ?? '').trim();
    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { body: { contains: q, mode: 'insensitive' } },
        { source: { contains: q, mode: 'insensitive' } },
      ];
    }
    const regionFilter = this.normalizeRegionId(regionId);
    if (regionFilter != null) {
      if (publishedOnly) {
        where.OR = [{ regionId: regionFilter }, { regionId: null }];
      } else {
        where.regionId = regionFilter;
      }
    }
    const [data, total] = await Promise.all([
      this.prisma.news.findMany({
        where,
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.news.count({ where }),
    ]);
    return {
      data: await this.attachMediaToNewsRows(data),
      meta: { page, per_page: perPage, total, total_pages: Math.ceil(total / perPage) },
    };
  }

  async findByIdAdmin(id: number) {
    const row = await this.prisma.news.findFirst({
      where: { id, deletedAt: null },
    });
    if (!row) throw new NotFoundException(`News ${id} not found`);
    const [mapped] = await this.attachMediaToNewsRows([row]);
    return mapped ?? row;
  }

  async findBySlug(slug: string) {
    const row = await this.prisma.news.findFirst({
      where: { slug, isPublished: true, deletedAt: null },
    });
    if (!row) throw new NotFoundException(`News "${slug}" not found`);
    const [mapped] = await this.attachMediaToNewsRows([row]);
    return mapped ?? row;
  }

  async create(dto: {
    title: string;
    slug: string;
    body?: string;
    imageUrl?: string;
    source?: string;
    sourceUrl?: string;
    isPublished?: boolean;
    regionId?: number | null;
    mediaFileIds?: number[] | null;
  }) {
    const regionId = this.normalizeRegionId(dto.regionId);
    if (regionId != null) {
      await this.ensureRegionExists(regionId);
    }
    const created = await this.prisma.news.create({
      data: {
        title: dto.title,
        slug: dto.slug,
        body: dto.body ?? null,
        imageUrl: dto.imageUrl ?? null,
        regionId,
        source: dto.source ?? null,
        sourceUrl: dto.sourceUrl ?? null,
        isPublished: dto.isPublished ?? false,
        publishedAt: dto.isPublished ? new Date() : null,
      },
    });
    const mediaFileIds = this.normalizeMediaFileIds(dto.mediaFileIds);
    if (mediaFileIds.length > 0) {
      await this.linkNewsMedia(created.id, mediaFileIds);
    }
    const row = await this.prisma.news.findUnique({ where: { id: created.id } });
    const [mapped] = await this.attachMediaToNewsRows(row ? [row] : []);
    return mapped ?? created;
  }

  async update(
    id: number,
    dto: {
      title?: string;
      slug?: string;
      body?: string;
      imageUrl?: string;
      source?: string;
      sourceUrl?: string;
      isPublished?: boolean;
      regionId?: number | null;
      mediaFileIds?: number[] | null;
      rewrittenText?: string;
      originalText?: string;
      workflowStatus?: NewsWorkflowStatus;
      tags?: string[];
      seoTitle?: string | null;
      seoDescription?: string | null;
    },
  ) {
    const existing = await this.prisma.news.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`News ${id} not found`);

    const data: Record<string, unknown> = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.slug !== undefined) data.slug = dto.slug;
    if (dto.body !== undefined) data.body = dto.body;
    if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl;
    if (dto.regionId !== undefined) {
      const regionId = this.normalizeRegionId(dto.regionId);
      if (regionId != null) {
        await this.ensureRegionExists(regionId);
      }
      data.regionId = regionId;
    }
    if (dto.source !== undefined) data.source = dto.source;
    if (dto.sourceUrl !== undefined) data.sourceUrl = dto.sourceUrl;
    if (dto.isPublished !== undefined) {
      data.isPublished = dto.isPublished;
      if (dto.isPublished && !existing.publishedAt) {
        data.publishedAt = new Date();
      }
      if (dto.isPublished) {
        data.workflowStatus = 'PUBLISHED';
      }
    }
    if (dto.rewrittenText !== undefined) data.rewrittenText = dto.rewrittenText;
    if (dto.originalText !== undefined) data.originalText = dto.originalText;
    if (dto.workflowStatus !== undefined) data.workflowStatus = dto.workflowStatus;
    if (dto.tags !== undefined) data.tags = dto.tags;
    if (dto.seoTitle !== undefined) data.seoTitle = dto.seoTitle;
    if (dto.seoDescription !== undefined) data.seoDescription = dto.seoDescription;
    const mediaFileIds = dto.mediaFileIds !== undefined ? this.normalizeMediaFileIds(dto.mediaFileIds) : null;

    const updated = await this.prisma.news.update({ where: { id }, data });
    if (mediaFileIds != null) {
      await this.linkNewsMedia(id, mediaFileIds);
    }
    const row = await this.prisma.news.findUnique({ where: { id: updated.id } });
    const [mapped] = await this.attachMediaToNewsRows(row ? [row] : []);
    return mapped ?? updated;
  }

  async remove(id: number, soft = true) {
    const existing = await this.prisma.news.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException(`News ${id} not found`);
    if (soft) {
      await this.prisma.news.update({
        where: { id },
        data: { deletedAt: new Date(), isPublished: false, workflowStatus: 'DRAFT' },
      });
      return;
    }
    await this.prisma.news.delete({ where: { id } });
  }

  private async getHomeNewsRssUrl(): Promise<string> {
    const row = await this.prisma.siteSetting.findUnique({ where: { key: RSS_SETTING_KEY } });
    return (row?.value ?? '').trim();
  }

  /**
   * Импорт из RSS/Atom: новые записи по `sourceUrl`, без дублей.
   * URL — из тела запроса или настройки `home_news_rss_url` (группа «Главная» в админке).
   */
  async syncFromRss(urlOverride?: string | null) {
    const url = (urlOverride ?? '').trim() || (await this.getHomeNewsRssUrl());
    if (!url) {
      throw new BadRequestException(
        'Не задан URL ленты: укажите его в запросе или в настройках сайта (ключ home_news_rss_url).',
      );
    }
    if (!/^https?:\/\//i.test(url)) {
      throw new BadRequestException('URL ленты должен начинаться с http:// или https://');
    }

    let xml: string;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'YugAktsent-NewsSync/1.0 (+https://yugaktsent.neeklo.ru)' },
        redirect: 'follow',
        signal: AbortSignal.timeout(25_000),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      xml = await res.text();
    } catch (e) {
      this.log.warn(`RSS fetch failed for ${url}: ${e instanceof Error ? e.message : String(e)}`);
      throw new ServiceUnavailableException('Не удалось загрузить RSS-ленту');
    }

    const items = parseFeedXml(xml);
    if (items.length === 0) {
      throw new BadRequestException('В ответе не найдено элементов RSS/Atom или формат не распознан');
    }

    let imported = 0;
    let skipped = 0;
    for (const item of items) {
      const dup = await this.prisma.news.findFirst({
        where: { sourceUrl: item.sourceUrl },
        select: { id: true },
      });
      if (dup) {
        skipped += 1;
        continue;
      }
      const slug = slugFromSourceUrl(item.sourceUrl);
      const slugBusy = await this.prisma.news.findUnique({ where: { slug }, select: { id: true } });
      if (slugBusy) {
        skipped += 1;
        continue;
      }
      try {
        await this.prisma.news.create({
          data: {
            slug,
            title: item.title,
            body: item.body,
            imageUrl: item.imageUrl,
            source: 'RSS',
            sourceUrl: item.sourceUrl,
            isPublished: true,
            publishedAt: item.publishedAt ?? new Date(),
          },
        });
        imported += 1;
      } catch (e) {
        this.log.warn(`RSS row skip ${item.sourceUrl}: ${e instanceof Error ? e.message : String(e)}`);
        skipped += 1;
      }
    }

    return { imported, skipped, totalInFeed: items.length, feedUrl: url };
  }

  private async getTgSessionStringForParser(): Promise<string> {
    const env = (process.env.TG_SESSION_STRING ?? '').trim();
    if (env) return env;
    const row = await this.prisma.siteSetting.findUnique({
      where: { key: 'tg_news_mtproto_session' },
      select: { value: true },
    });
    return (row?.value ?? '').trim();
  }

  async getTelegramParserStatus() {
    const apiIdRaw = (process.env.TG_API_ID ?? '').trim();
    const apiHash = (process.env.TG_API_HASH ?? '').trim();
    const envSessionString = (process.env.TG_SESSION_STRING ?? '').trim();
    const apiId = Number(apiIdRaw);
    const apiIdOk = Number.isInteger(apiId) && apiId > 0;
    const apiHashOk = apiHash.length > 0;
    const [inDatabaseTotal, inDatabaseEnabled, mtprotoSessionRow] = await Promise.all([
      this.prisma.newsTelegramChannel.count(),
      this.prisma.newsTelegramChannel.count({ where: { isEnabled: true } }),
      this.prisma.siteSetting.findUnique({
        where: { key: 'tg_news_mtproto_session' },
        select: { value: true, updatedAt: true },
      }),
    ]);
    const dbSessionString = (mtprotoSessionRow?.value ?? '').trim();
    const sessionString = envSessionString || dbSessionString;
    const sessionOk = sessionString.length > 0;
    const sessionSource: 'env' | 'database' | 'none' = envSessionString
      ? 'env'
      : dbSessionString
        ? 'database'
        : 'none';
    const lastConnectedAt =
      dbSessionString && mtprotoSessionRow?.updatedAt
        ? mtprotoSessionRow.updatedAt.toISOString()
        : null;
    const envListCount = (process.env.TG_NEWS_CHANNELS ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean).length;
    const credentialsOk = apiIdOk && apiHashOk && sessionOk;
    const hasChannelSource = inDatabaseEnabled > 0 || envListCount > 0;
    const hints: string[] = [];
    if (!apiIdOk || !apiHashOk) {
      hints.push('На сервере в .env задайте TG_API_ID и TG_API_HASH (см. https://my.telegram.org).');
    }
    if (!sessionOk) {
      hints.push(
        'Задайте TG_SESSION_STRING в .env сервера или выполните вход по QR в блоке «Новости из Telegram» ниже (сессия сохранится в БД).',
      );
    }
    if (!hasChannelSource) {
      hints.push('Добавьте хотя бы один канал ниже (или список TG_NEWS_CHANNELS в env как запасной вариант).');
    }
    if (credentialsOk && hasChannelSource) {
      hints.push('Можно нажать «Импортировать сейчас» — новые посты попадут в раздел «Новости» без дублей.');
    }
    return {
      ready: credentialsOk && hasChannelSource,
      credentialsOk,
      credentials: { apiIdOk, apiHashOk, sessionOk },
      channels: {
        inDatabaseTotal,
        inDatabaseEnabled,
        envListCount,
      },
      telegramAuth: {
        connected: sessionOk,
        sessionSource,
        lastConnectedAt,
      },
      hints,
    };
  }

  listTelegramChannels() {
    return this.prisma.newsTelegramChannel.findMany({
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  }

  async createTelegramChannel(dto: {
    regionId: number;
    channelRef: string;
    label?: string | null;
    isEnabled?: boolean;
    limitPerRun?: number;
    publishOnImport?: boolean;
    sortOrder?: number;
  }) {
    const regionId = this.requireRegionId(dto.regionId);
    await this.ensureRegionExists(regionId);
    const channelRef = this.normalizeTelegramChannelRef(dto.channelRef);
    if (!channelRef) {
      throw new BadRequestException('Укажите канал: @username, ссылку на t.me или числовой id (для приватных).');
    }
    const limitPerRun = this.clampTelegramLimit(dto.limitPerRun ?? DEFAULT_TELEGRAM_LIMIT_PER_CHANNEL);
    try {
      return await this.prisma.newsTelegramChannel.create({
        data: {
          regionId,
          channelRef,
          label: dto.label?.trim() ? dto.label.trim() : null,
          isEnabled: dto.isEnabled ?? true,
          limitPerRun,
          publishOnImport: dto.publishOnImport ?? false,
          sortOrder: dto.sortOrder ?? 0,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BadRequestException('Этот канал уже есть в списке для выбранного города.');
      }
      throw e;
    }
  }

  async updateTelegramChannel(
    id: number,
    dto: {
      regionId?: number;
      channelRef?: string;
      label?: string | null;
      isEnabled?: boolean;
      limitPerRun?: number;
      publishOnImport?: boolean;
      sortOrder?: number;
    },
  ) {
    const existing = await this.prisma.newsTelegramChannel.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Канал ${id} не найден`);

    const data: Prisma.NewsTelegramChannelUpdateInput = {};
    if (dto.regionId !== undefined) {
      const regionId = this.requireRegionId(dto.regionId);
      await this.ensureRegionExists(regionId);
      data.region = { connect: { id: regionId } };
    }
    if (dto.channelRef !== undefined) {
      const channelRef = this.normalizeTelegramChannelRef(dto.channelRef);
      if (!channelRef) {
        throw new BadRequestException('Пустой идентификатор канала');
      }
      data.channelRef = channelRef;
    }
    if (dto.label !== undefined) data.label = dto.label?.trim() ? dto.label.trim() : null;
    if (dto.isEnabled !== undefined) data.isEnabled = dto.isEnabled;
    if (dto.limitPerRun !== undefined) data.limitPerRun = this.clampTelegramLimit(dto.limitPerRun);
    if (dto.publishOnImport !== undefined) data.publishOnImport = dto.publishOnImport;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;

    try {
      return await this.prisma.newsTelegramChannel.update({ where: { id }, data });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BadRequestException('Такой канал уже есть в списке для выбранного города.');
      }
      throw e;
    }
  }

  async deleteTelegramChannel(id: number) {
    const existing = await this.prisma.newsTelegramChannel.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException(`Канал ${id} не найден`);
    await this.prisma.newsTelegramChannel.delete({ where: { id } });
  }

  /**
   * Импорт новостей из Telegram-каналов через MTProto.
   * Источник каналов (по приоритету): одноразовый список `channels` в теле → включённые записи в БД
   * (можно сузить `onlyChannelIds`) → переменная окружения TG_NEWS_CHANNELS.
   * Env: TG_API_ID, TG_API_HASH; сессия: TG_SESSION_STRING в .env или site_settings tg_news_mtproto_session (QR в админке).
   */
  async syncFromTelegramChannels(input?: {
    channels?: string[] | null;
    limitPerChannel?: number | null;
    onlyChannelIds?: number[] | null;
  }) {
    const apiIdRaw = (process.env.TG_API_ID ?? '').trim();
    const apiHash = (process.env.TG_API_HASH ?? '').trim();
    const sessionString = await this.getTgSessionStringForParser();

    const apiId = Number(apiIdRaw);
    if (!Number.isInteger(apiId) || apiId <= 0 || !apiHash) {
      throw new BadRequestException(
        'TG_API_ID/TG_API_HASH не настроены на сервере. Получите их в https://my.telegram.org и добавьте в .env.',
      );
    }
    if (!sessionString) {
      throw new BadRequestException(
        'Нет MTProto-сессии: задайте TG_SESSION_STRING в .env или войдите по QR в админке → Новости.',
      );
    }

    const defaultLimit = this.clampTelegramLimit(input?.limitPerChannel ?? DEFAULT_TELEGRAM_LIMIT_PER_CHANNEL);
    const targets = await this.resolveTelegramSyncTargets(input, defaultLimit);
    if (targets.length === 0) {
      throw new BadRequestException(
        'Нет каналов для импорта: добавьте каналы в таблице ниже или задайте TG_NEWS_CHANNELS в env.',
      );
    }

    const { TelegramClient } = await import('telegram');
    const { StringSession } = await import('telegram/sessions');

    const session = new StringSession(sessionString);
    const client = new TelegramClient(session, apiId, apiHash, createTelegramClientOptions(3));

    let imported = 0;
    let skipped = 0;
    const byChannel: Array<{ channel: string; imported: number; skipped: number }> = [];
    try {
      await client.connect();
      const authorized = await client.checkAuthorization();
      if (!authorized) {
        throw new BadRequestException(
          'MTProto-сессия не авторизована. Обновите TG_SESSION_STRING на сервере.',
        );
      }

      for (const item of targets) {
        let channelImported = 0;
        let channelSkipped = 0;
        let telegramFolderId: number | null = null;
        try {
          const entity = await client.getEntity(item.ref);
          const messages = await client.getMessages(entity, { limit: item.limit });
          const groupedMessages = new Map<string, unknown[]>();
          for (const m of messages) {
            const key = this.telegramMessageGroupKey(m);
            if (!key) continue;
            const bucket = groupedMessages.get(key);
            if (bucket) bucket.push(m);
            else groupedMessages.set(key, [m]);
          }
          const usedGroups = new Set<string>();

          for (const msg of messages) {
            const text = this.telegramMessageText(msg);
            if (!text) {
              channelSkipped += 1;
              skipped += 1;
              continue;
            }
            const messageId = this.telegramMessageId(msg);
            const sourceUrl = this.telegramSourceUrl(item.ref, item.ref, messageId);
            if (!sourceUrl) {
              channelSkipped += 1;
              skipped += 1;
              continue;
            }
            const slug = this.telegramSlug(item.ref, messageId);
            const dupByTelegram =
              item.channelId && messageId
                ? await this.prisma.news.findFirst({
                    where: {
                      telegramChannelId: item.channelId,
                      telegramPostId: String(messageId),
                    },
                    select: { id: true },
                  })
                : null;
            if (dupByTelegram) {
              channelSkipped += 1;
              skipped += 1;
              continue;
            }
            const dupBySource = await this.prisma.news.findFirst({
              where: { sourceUrl },
              select: { id: true },
            });
            if (dupBySource) {
              channelSkipped += 1;
              skipped += 1;
              continue;
            }
            const dupBySlug = await this.prisma.news.findUnique({
              where: { slug },
              select: { id: true },
            });
            if (dupBySlug) {
              channelSkipped += 1;
              skipped += 1;
              continue;
            }

            const title = this.telegramTitle(text);
            const publishedAt = this.telegramMessageDate(msg) ?? new Date();
            const groupKey = this.telegramMessageGroupKey(msg);
            let mediaMessages: unknown[] = [msg];
            if (groupKey) {
              if (usedGroups.has(groupKey)) {
                channelSkipped += 1;
                skipped += 1;
                continue;
              }
              mediaMessages = groupedMessages.get(groupKey) ?? [msg];
              usedGroups.add(groupKey);
            }
            const savedPhotos = await this.trySaveTelegramPhotos(
              client,
              mediaMessages,
              item.ref,
              telegramFolderId,
            );
            const firstPhoto = savedPhotos[0] ?? null;
            if (firstPhoto?.folderId != null) {
              telegramFolderId = firstPhoto.folderId;
            }
            const created = await this.prisma.news.create({
              data: {
                slug,
                title,
                body: text,
                originalText: text,
                imageUrl: firstPhoto?.url ?? null,
                regionId: item.regionId ?? null,
                source: 'TELEGRAM_CHANNEL',
                sourceUrl,
                telegramPostId: messageId ? String(messageId) : null,
                telegramChannelId: item.channelId ?? null,
                workflowStatus: item.publishOnImport ? 'PUBLISHED' : 'NEW',
                isPublished: item.publishOnImport,
                publishedAt: item.publishOnImport ? publishedAt : null,
              },
            });
            for (const photo of savedPhotos) {
              await this.prisma.mediaFile
                .update({
                  where: { id: photo.mediaFileId },
                  data: { entityType: 'NEWS', entityId: created.id },
                })
                .catch((e) =>
                  this.log.warn(
                    `Failed to link Telegram media file ${photo.mediaFileId} to news ${created.id}: ${
                      e instanceof Error ? e.message : String(e)
                    }`,
                  ),
                );
            }
            channelImported += 1;
            imported += 1;
          }
        } catch (e) {
          this.log.warn(
            `Telegram channel sync failed for "${item.ref}": ${e instanceof Error ? e.message : String(e)}`,
          );
        }
        byChannel.push({ channel: item.ref, imported: channelImported, skipped: channelSkipped });
        if (item.channelId) {
          await this.prisma.newsTelegramChannel.update({
            where: { id: item.channelId },
            data: {
              lastSyncAt: new Date(),
              postsImportedCount: { increment: channelImported },
            },
          });
        }
      }
    } catch (e) {
      this.log.warn(`Telegram sync failed: ${e instanceof Error ? e.message : String(e)}`);
      if (e instanceof BadRequestException) throw e;
      throw new ServiceUnavailableException('Не удалось выполнить импорт из Telegram');
    } finally {
      await client.disconnect();
    }

    return {
      imported,
      skipped,
      channelsTotal: targets.length,
      defaultLimit,
      byChannel,
    };
  }

  /**
   * Дозагрузка / восстановление фото Telegram-новостей:
   * — imageUrl пустой;
   * — imageUrl указывает на отсутствующий файл;
   * — связанные media_files без файла на диске.
   */
  async backfillTelegramNewsPhotos(limitRaw?: number | null) {
    return this.repairTelegramNewsPhotos(limitRaw);
  }

  async repairTelegramNewsPhotos(limitRaw?: number | null) {
    const apiIdRaw = (process.env.TG_API_ID ?? '').trim();
    const apiHash = (process.env.TG_API_HASH ?? '').trim();
    const sessionString = await this.getTgSessionStringForParser();
    const apiId = Number(apiIdRaw);
    if (!Number.isInteger(apiId) || apiId <= 0 || !apiHash) {
      throw new BadRequestException('TG_API_ID/TG_API_HASH не настроены на сервере.');
    }
    if (!sessionString) {
      throw new BadRequestException('Нет MTProto-сессии для Telegram.');
    }

    const limit = Math.max(1, Math.min(200, Math.trunc(Number(limitRaw) || 30)));
    const candidates = await this.findTelegramNewsNeedingPhotoRepair(limit);
    if (candidates.length === 0) {
      return { scanned: 0, updated: 0, skipped: 0, failed: 0, filesRestored: 0 };
    }

    const { TelegramClient } = await import('telegram');
    const { StringSession } = await import('telegram/sessions');
    const session = new StringSession(sessionString);
    const client = new TelegramClient(session, apiId, apiHash, createTelegramClientOptions(5));

    let updated = 0;
    let skipped = 0;
    let failed = 0;
    let filesRestored = 0;
    const folderByChannel = new Map<string, number>();

    try {
      await client.connect();
      const authorized = await client.checkAuthorization();
      if (!authorized) {
        throw new BadRequestException('MTProto-сессия не авторизована.');
      }

      for (const row of candidates) {
        const parsed = this.parseTelegramPostUrl(row.sourceUrl ?? '');
        if (!parsed) {
          skipped += 1;
          continue;
        }
        try {
          const entity = await client.getEntity(parsed.channelRef);
          const loaded = await client.getMessages(entity, { ids: [parsed.messageId] });
          const msg = Array.isArray(loaded) ? loaded[0] : loaded;
          if (!msg) {
            skipped += 1;
            continue;
          }

          const groupKey = this.telegramMessageGroupKey(msg);
          let mediaMessages: unknown[] = [msg];
          if (groupKey) {
            const bucket = await client.getMessages(entity, { limit: 20 });
            mediaMessages = bucket.filter((m) => this.telegramMessageGroupKey(m) === groupKey);
            if (mediaMessages.length === 0) mediaMessages = [msg];
          }

          const knownFolderId = folderByChannel.get(parsed.channelRef) ?? null;
          const savedPhotos = await this.trySaveTelegramPhotos(
            client,
            mediaMessages,
            parsed.channelRef,
            knownFolderId,
            row.missingMedia.map((m) => m.url),
          );
          if (savedPhotos.length === 0) {
            skipped += 1;
            continue;
          }
          folderByChannel.set(parsed.channelRef, savedPhotos[0]!.folderId);

          for (const photo of savedPhotos) {
            await this.prisma.mediaFile.update({
              where: { id: photo.mediaFileId },
              data: {
                entityType: 'NEWS',
                entityId: row.id,
                url: photo.url,
                sizeBytes: BigInt(photo.sizeBytes),
              },
            });
            filesRestored += 1;
          }

          await this.prisma.news.update({
            where: { id: row.id },
            data: { imageUrl: savedPhotos[0]!.url },
          });
          updated += 1;
        } catch (e) {
          this.log.warn(
            `Telegram photo repair failed for news ${row.id} (${row.slug}): ${
              e instanceof Error ? e.message : String(e)
            }`,
          );
          failed += 1;
        }
      }
    } finally {
      await client.disconnect();
    }

    return {
      scanned: candidates.length,
      updated,
      skipped,
      failed,
      filesRestored,
    };
  }

  private localMediaFileMissing(url: string | null | undefined): boolean {
    if (!url || !url.startsWith(MEDIA_PUBLIC_PREFIX)) return false;
    try {
      const disk = diskPathFromPublicUrl(this.mediaRoot, url);
      return !verifyFileOnDisk(disk, 64);
    } catch {
      return true;
    }
  }

  private async findTelegramNewsNeedingPhotoRepair(limit: number) {
    const rows = await this.prisma.news.findMany({
      where: {
        source: 'TELEGRAM_CHANNEL',
        sourceUrl: { not: null },
      },
      orderBy: [{ id: 'desc' }],
      take: Math.min(limit * 4, 400),
      select: {
        id: true,
        slug: true,
        sourceUrl: true,
        imageUrl: true,
      },
    });

    const out: Array<{
      id: number;
      slug: string;
      sourceUrl: string;
      missingMedia: Array<{ id: number; url: string }>;
    }> = [];

    for (const row of rows) {
      if (!row.sourceUrl) continue;
      const media = await this.prisma.mediaFile.findMany({
        where: { entityType: 'NEWS', entityId: row.id },
        select: { id: true, url: true },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      });
      const missingMedia = media.filter((m) => this.localMediaFileMissing(m.url));
      const imageMissing = !row.imageUrl || row.imageUrl.trim() === '' || this.localMediaFileMissing(row.imageUrl);
      if (!imageMissing && missingMedia.length === 0) continue;
      out.push({
        id: row.id,
        slug: row.slug,
        sourceUrl: row.sourceUrl,
        missingMedia: missingMedia.length > 0 ? missingMedia : [{ id: 0, url: row.imageUrl ?? '' }].filter((m) => m.url),
      });
      if (out.length >= limit) break;
    }

    return out;
  }

  private clampTelegramLimit(n: number): number {
    if (!Number.isFinite(n)) return DEFAULT_TELEGRAM_LIMIT_PER_CHANNEL;
    return Math.max(1, Math.min(100, Math.trunc(n)));
  }

  /** @username, ссылка t.me/… или числовой id. */
  private normalizeTelegramChannelRef(raw: string): string {
    const t = raw.trim();
    if (!t) return '';
    const urlMatch = t.match(/(?:https?:\/\/)?(?:t(?:elegram)?\.me|telegram\.me)\/([^/?#]+)/i);
    if (urlMatch) {
      const seg = urlMatch[1];
      if (/^-?\d+$/.test(seg)) return seg;
      const name = seg.startsWith('@') ? seg.slice(1) : seg;
      return `@${name.toLowerCase()}`;
    }
    if (/^-?\d+$/.test(t)) return t;
    const uname = t.startsWith('@') ? t.slice(1) : t;
    if (!uname) return '';
    return `@${uname.toLowerCase()}`;
  }

  private async resolveTelegramSyncTargets(
    input: { channels?: string[] | null; onlyChannelIds?: number[] | null } | undefined,
    defaultLimit: number,
  ): Promise<
    Array<{
      ref: string;
      limit: number;
      publishOnImport: boolean;
      regionId: number | null;
      channelId: number | null;
    }>
  > {
    const fromBody = (input?.channels ?? [])
      .map((c) => this.normalizeTelegramChannelRef(c))
      .filter(Boolean);
    if (fromBody.length > 0) {
      return fromBody.map((ref) => ({
        ref,
        limit: defaultLimit,
        publishOnImport: false,
        regionId: null,
        channelId: null,
      }));
    }

    const where: Prisma.NewsTelegramChannelWhereInput = { isEnabled: true };
    if (input?.onlyChannelIds?.length) {
      where.id = { in: input.onlyChannelIds };
    }
    const rows = await this.prisma.newsTelegramChannel.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    if (rows.length > 0) {
      return rows.map((r) => ({
        ref: this.normalizeTelegramChannelRef(r.channelRef),
        limit: this.clampTelegramLimit(r.limitPerRun ?? defaultLimit),
        publishOnImport: r.publishOnImport,
        regionId: r.regionId,
        channelId: r.id,
      }));
    }

    const envList = (process.env.TG_NEWS_CHANNELS ?? '')
      .split(',')
      .map((v) => this.normalizeTelegramChannelRef(v))
      .filter(Boolean);
    return envList.map((ref) => ({
      ref,
      limit: defaultLimit,
      publishOnImport: false,
      regionId: null,
      channelId: null,
    }));
  }

  private telegramMessageText(msg: unknown): string | null {
    const value =
      msg && typeof msg === 'object' && 'message' in msg
        ? (msg as { message?: unknown }).message
        : null;
    if (typeof value !== 'string') return null;
    const text = value.trim();
    return text.length > 0 ? text : null;
  }

  private telegramMessageId(msg: unknown): number {
    const value =
      msg && typeof msg === 'object' && 'id' in msg
        ? (msg as { id?: unknown }).id
        : null;
    return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 0;
  }

  private telegramMessageDate(msg: unknown): Date | null {
    const value =
      msg && typeof msg === 'object' && 'date' in msg
        ? (msg as { date?: unknown }).date
        : null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    return null;
  }

  private telegramSourceUrl(channel: string, fallbackChannel: string, messageId: number): string | null {
    if (!messageId) return null;
    const clean = channel.replace(/^@/, '').trim() || fallbackChannel.replace(/^@/, '').trim();
    if (!clean) return null;
    return `https://t.me/${clean}/${messageId}`;
  }

  private telegramSlug(channel: string, messageId: number): string {
    const clean = channel
      .toLowerCase()
      .replace(/^@/, '')
      .replace(/[^a-z0-9_]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
    const id = Math.max(0, Math.trunc(messageId));
    return `tg-${clean || 'channel'}-${id}`;
  }

  private telegramTitle(text: string): string {
    const line = text.split('\n').map((v) => v.trim()).find(Boolean) || 'Telegram news';
    return line.length > 140 ? `${line.slice(0, 137)}...` : line;
  }

  private async trySaveTelegramPhoto(
    client: { downloadMedia?: (msg: unknown, opts?: Record<string, unknown>) => Promise<unknown> },
    msg: unknown,
    channelRef: string,
    messageId: number,
    knownFolderId: number | null,
    reusePublicUrl?: string | null,
  ): Promise<{ url: string; mediaFileId: number; folderId: number; sizeBytes: number } | null> {
    try {
      const buffer = await downloadTelegramMessagePhoto(client, msg);
      if (!buffer) return null;

      const ext = detectImageExtension(buffer);
      const reuseUrl =
        reusePublicUrl && reusePublicUrl.startsWith(MEDIA_PUBLIC_PREFIX) && this.localMediaFileMissing(reusePublicUrl)
          ? reusePublicUrl
          : null;
      const saved = await saveLocalMediaFile(this.mediaRoot, buffer, {
        publicUrl: reuseUrl,
        ext,
      });

      const folderId = knownFolderId ?? (await this.ensureTelegramFolder(channelRef));
      const existing = reuseUrl
        ? await this.prisma.mediaFile.findFirst({
            where: { url: reuseUrl },
            select: { id: true },
          })
        : null;

      const media = existing
        ? await this.prisma.mediaFile.update({
            where: { id: existing.id },
            data: {
              kind: 'PHOTO',
              sizeBytes: BigInt(saved.sizeBytes),
              folderId,
              originalFilename: `tg-${this.telegramFolderSuffix(channelRef)}-${messageId}${ext}`,
            },
          })
        : await this.prisma.mediaFile.create({
            data: {
              kind: 'PHOTO',
              url: saved.url,
              originalFilename: `tg-${this.telegramFolderSuffix(channelRef)}-${messageId}${ext}`,
              sizeBytes: BigInt(saved.sizeBytes),
              folderId,
              uploadedBy: null,
            },
          });

      return { url: saved.url, mediaFileId: media.id, folderId, sizeBytes: saved.sizeBytes };
    } catch (e) {
      this.log.warn(
        `Telegram photo save failed for ${channelRef}/${messageId}: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    }
  }

  private async trySaveTelegramPhotos(
    client: { downloadMedia?: (msg: unknown, opts?: Record<string, unknown>) => Promise<unknown> },
    messages: unknown[],
    channelRef: string,
    knownFolderId: number | null,
    reusePublicUrls: string[] = [],
  ): Promise<Array<{ url: string; mediaFileId: number; folderId: number; sizeBytes: number }>> {
    const out: Array<{ url: string; mediaFileId: number; folderId: number; sizeBytes: number }> = [];
    let folderId = knownFolderId;
    let reuseIdx = 0;
    for (const msg of messages) {
      const messageId = this.telegramMessageId(msg);
      const reuse = reusePublicUrls[reuseIdx] ?? null;
      const saved = await this.trySaveTelegramPhoto(client, msg, channelRef, messageId, folderId, reuse);
      if (!saved) continue;
      folderId = saved.folderId;
      reuseIdx += 1;
      out.push(saved);
    }
    return out;
  }

  private async ensureTelegramFolder(channelRef: string): Promise<number> {
    const name = `ТГ-${this.telegramFolderSuffix(channelRef)}`;
    const existing = await this.prisma.mediaFolder.findFirst({
      where: { parentId: null, isTrash: false, name },
      select: { id: true },
    });
    if (existing) return existing.id;
    try {
      const created = await this.prisma.mediaFolder.create({
        data: { parentId: null, name, isTrash: false },
        select: { id: true },
      });
      return created.id;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const retry = await this.prisma.mediaFolder.findFirst({
          where: { parentId: null, isTrash: false, name },
          select: { id: true },
        });
        if (retry) return retry.id;
      }
      throw e;
    }
  }

  private telegramFolderSuffix(channelRef: string): string {
    const raw = channelRef.replace(/^@/, '').trim().toLowerCase();
    const clean = raw
      .replace(/[^a-zа-яё0-9_-]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
    return clean || 'kanal';
  }

  private parseTelegramPostUrl(url: string): { channelRef: string; messageId: number } | null {
    const trimmed = (url ?? '').trim();
    const m = trimmed.match(/^https?:\/\/t\.me\/([^/?#]+)\/(\d+)(?:[/?#].*)?$/i);
    if (!m) return null;
    const channelRef = this.normalizeTelegramChannelRef(m[1] ?? '');
    const messageId = Number(m[2]);
    if (!channelRef || !Number.isInteger(messageId) || messageId <= 0) return null;
    return { channelRef, messageId };
  }

  private telegramMessageGroupKey(msg: unknown): string | null {
    if (!msg || typeof msg !== 'object' || !('groupedId' in msg)) return null;
    const raw = (msg as { groupedId?: unknown }).groupedId;
    if (raw == null) return null;
    if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'bigint') return String(raw);
    if (typeof raw === 'object' && raw != null && 'toString' in raw && typeof raw.toString === 'function') {
      const v = raw.toString();
      return v && v !== '[object Object]' ? v : null;
    }
    return null;
  }

  private normalizeMediaFileIds(value: unknown): number[] {
    if (!Array.isArray(value)) return [];
    const set = new Set<number>();
    for (const item of value) {
      const n = Number(item);
      if (!Number.isInteger(n) || n <= 0) continue;
      set.add(n);
    }
    return Array.from(set);
  }

  private async linkNewsMedia(newsId: number, mediaFileIds: number[]): Promise<void> {
    const existing = await this.prisma.news.findUnique({
      where: { id: newsId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException(`News ${newsId} not found`);

    const files =
      mediaFileIds.length > 0
        ? await this.prisma.mediaFile.findMany({
            where: { id: { in: mediaFileIds } },
            select: { id: true, url: true },
          })
        : [];
    if (files.length !== mediaFileIds.length) {
      throw new BadRequestException('Часть выбранных медиафайлов не найдена.');
    }

    await this.prisma.mediaFile.updateMany({
      where: {
        entityType: 'NEWS',
        entityId: newsId,
        ...(mediaFileIds.length > 0 ? { id: { notIn: mediaFileIds } } : {}),
      },
      data: { entityType: null, entityId: null },
    });

    if (mediaFileIds.length > 0) {
      await this.prisma.mediaFile.updateMany({
        where: { id: { in: mediaFileIds } },
        data: { entityType: 'NEWS', entityId: newsId },
      });
    }

    const fileById = new Map(files.map((f) => [f.id, f]));
    const primary = mediaFileIds.map((id) => fileById.get(id)).find((x) => !!x)?.url ?? null;
    await this.prisma.news.update({
      where: { id: newsId },
      data: { imageUrl: primary },
    });
  }

  private async attachMediaToNewsRows<T extends { id: number; imageUrl: string | null }>(
    rows: T[],
  ): Promise<Array<T & { mediaFiles: Array<{ id: number; url: string }> }>> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const media = await this.prisma.mediaFile.findMany({
      where: {
        entityType: 'NEWS',
        entityId: { in: ids },
      },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      select: { id: true, entityId: true, url: true },
    });
    const byNews = new Map<number, Array<{ id: number; url: string }>>();
    for (const m of media) {
      if (m.entityId == null) continue;
      const arr = byNews.get(m.entityId) ?? [];
      arr.push({ id: m.id, url: m.url });
      byNews.set(m.entityId, arr);
    }
    return rows.map((row) => {
      const mediaFiles = byNews.get(row.id) ?? [];
      const fallbackImage = mediaFiles[0]?.url ?? row.imageUrl ?? null;
      return { ...row, imageUrl: fallbackImage, mediaFiles };
    });
  }

  private normalizeRegionId(value: unknown): number | null {
    if (value == null || value === '') return null;
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) return null;
    return n;
  }

  private requireRegionId(value: unknown): number {
    const regionId = this.normalizeRegionId(value);
    if (regionId == null) {
      throw new BadRequestException('Выберите город (regionId).');
    }
    return regionId;
  }

  private async ensureRegionExists(regionId: number): Promise<void> {
    const row = await this.prisma.feedRegion.findUnique({
      where: { id: regionId },
      select: { id: true },
    });
    if (!row) {
      throw new BadRequestException('Выбранный город не найден.');
    }
  }
}

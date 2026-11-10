import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ListingKind, ListingStatus, ListingVisibility } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { FeedFetcherService } from './feed-fetcher.service';
import { FeedProcessorService } from './feed-processor.service';
import {
  FEED_IMPORT_QUEUE,
  FEED_IMPORT_JOB_RUN,
} from './feed-import.constants';
import type { FeedImportBatchJob } from './feed-import.types';
import { BlocksService } from '../blocks/blocks.service';
import { SitemapService } from '../sitemap/sitemap.service';
import { getParityTargets, parityPercent } from './feed-parity.util';

export interface ImportProgress {
  step: string;
  detail?: string;
  percent: number;
  processedItems?: number;
  totalItems?: number;
}

const REQUIRED_FEED_FILES = [
  'rooms',
  'finishings',
  'buildingtypes',
  'regions',
  'subways',
  'builders',
  'blocks',
  'buildings',
  'apartments',
] as const;

@Injectable()
export class FeedImportService implements OnModuleInit {
  private readonly logger = new Logger(FeedImportService.name);
  private currentProgress: ImportProgress | null = null;
  private stuckBatchWatchdog?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly fetcher: FeedFetcherService,
    private readonly processor: FeedProcessorService,
    private readonly config: ConfigService,
    private readonly blocks: BlocksService,
    private readonly sitemap: SitemapService,
    @InjectQueue(FEED_IMPORT_QUEUE)
    private readonly feedImportQueue: Queue,
  ) {}

  async onModuleInit() {
    void this.recoverStuckBatches('startup').catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`Startup stuck-batch recovery failed: ${msg}`);
    });
    this.scheduleStuckBatchWatchdog();

    if (process.env.FEED_IMPORT_CRON_REGISTER === 'false') {
      this.logger.log('Feed import cron registration skipped (FEED_IMPORT_CRON_REGISTER=false)');
      return;
    }

    if (this.config.get('FEED_IMPORT_DISABLE_REPEAT') === 'true') {
      this.logger.log('Repeatable feed import cron disabled (FEED_IMPORT_DISABLE_REPEAT)');
      return;
    }
    const pattern =
      this.config.get<string>('FEED_IMPORT_CRON') || '0 4 * * 1';
    const cronTz = this.config.get<string>('FEED_IMPORT_CRON_TZ') || 'Europe/Moscow';
    const regionCodes = await this.resolveCronRegionCodes();
    if (!regionCodes.length) {
      this.logger.warn('No valid regions resolved for repeatable import cron registration');
      return;
    }
    try {
      for (const regionCode of regionCodes) {
        await this.feedImportQueue.add(
          FEED_IMPORT_JOB_RUN,
          { regionCode },
          {
            repeat: { pattern, tz: cronTz },
            jobId: `feed-import-repeat-${regionCode}`,
          },
        );
      }
      this.logger.log(
        `Registered BullMQ weekly import: pattern="${pattern}" tz="${cronTz}" regions=${regionCodes.join(',')}`,
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`Could not register repeatable feed import (Redis unavailable?): ${msg}`);
    }
  }

  getProgress(): ImportProgress | null {
    return this.currentProgress;
  }

  /**
   * Ручной запуск: создаёт import_batch и ставит задачу в BullMQ.
   */
  async triggerImport(regionCode: string, triggeredBy?: string) {
    const code = this.normalizeRegionCode(regionCode);
    await this.assertNoOverlappingImport(code);
    const payload = await this.createPendingBatch(code, triggeredBy);
    await this.feedImportQueue.add(FEED_IMPORT_JOB_RUN, payload, {
      removeOnComplete: { count: 50 },
      attempts: 3,
      backoff: { type: 'exponential', delay: 60_000 },
    });
    return { batchId: payload.batchId, status: 'QUEUED' as const };
  }

  async triggerImportForEnabledRegions(triggeredBy?: string) {
    const rows = await this.prisma.feedRegion.findMany({
      where: { isEnabled: true, baseUrl: { not: null } },
      orderBy: { id: 'asc' },
      select: { code: true, baseUrl: true },
    });
    const importableRows = rows.filter((r) => r.baseUrl?.trim() && this.isRegionImportAllowed(r.code));
    if (!importableRows.length) throw new NotFoundException('Нет включённых регионов с настроенным фидом');

    const queued: Array<{ region: string; batchId: number }> = [];
    const skipped: Array<{ region: string; reason: string }> = [];
    for (const row of importableRows) {
      const code = this.normalizeRegionCode(row.code);
      try {
        const result = await this.triggerImport(code, triggeredBy);
        queued.push({ region: code, batchId: result.batchId });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        skipped.push({ region: code, reason: msg });
      }
    }
    return {
      status: 'QUEUED',
      queued,
      skipped,
      total: importableRows.length,
    };
  }

  async listFeedSources() {
    const rows = await this.prisma.feedRegion.findMany({
      orderBy: { id: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        baseUrl: true,
        isEnabled: true,
        lastImportedAt: true,
      },
    });
    return rows.map((r) => {
      const baseUrl = r.baseUrl?.trim() || null;
      const allowed = this.isRegionImportAllowed(r.code);
      return {
        id: r.id,
        code: this.normalizeRegionCode(r.code).toUpperCase(),
        name: r.name,
        enabled: r.isEnabled,
        baseUrl,
        canImport: r.isEnabled && Boolean(baseUrl) && allowed,
        reason: !baseUrl
          ? 'Feed URL не настроен'
          : !allowed
            ? 'Региональный фид пока недоступен'
            : null,
        lastImportedAt: r.lastImportedAt,
        files: REQUIRED_FEED_FILES.map((name) => ({
          name,
          required: true,
          url: baseUrl ? `${baseUrl.replace(/\/+$/, '')}/${name}.json` : null,
        })),
      };
    });
  }

  async triggerImportForRegions(regionCodes: string[], triggeredBy?: string) {
    const requested = Array.from(new Set(regionCodes.map((code) => this.normalizeRegionCode(code)).filter(Boolean)));
    if (!requested.length) throw new BadRequestException('Выберите хотя бы один регион для импорта');

    const rows = await this.prisma.feedRegion.findMany({
      where: { code: { in: requested } },
      orderBy: { id: 'asc' },
      select: { code: true, baseUrl: true, isEnabled: true },
    });
    const byCode = new Map(rows.map((r) => [this.normalizeRegionCode(r.code), r]));
    const queued: Array<{ region: string; batchId: number }> = [];
    const skipped: Array<{ region: string; reason: string }> = [];

    for (const code of requested) {
      const row = byCode.get(code);
      if (!row) {
        skipped.push({ region: code, reason: 'Регион не найден' });
        continue;
      }
      if (!row.isEnabled) {
        skipped.push({ region: code, reason: 'Регион выключен' });
        continue;
      }
      if (!row.baseUrl?.trim()) {
        skipped.push({ region: code, reason: 'Feed URL не настроен' });
        continue;
      }
      if (!this.isRegionImportAllowed(code)) {
        skipped.push({ region: code, reason: 'Региональный фид пока недоступен' });
        continue;
      }
      try {
        const result = await this.triggerImport(code, triggeredBy);
        queued.push({ region: code, batchId: result.batchId });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        skipped.push({ region: code, reason: msg });
      }
    }

    if (!queued.length) {
      throw new BadRequestException(`Не удалось поставить импорт в очередь: ${skipped.map((s) => `${s.region}: ${s.reason}`).join('; ')}`);
    }
    return { status: 'QUEUED' as const, queued, skipped, total: requested.length };
  }

  /**
   * Планировщик (вторник и т.д.): при отсутствии активного импорта создаёт batch и выполняет импорт в воркере.
   */
  async runScheduledImport(regionCode: string) {
    const region = await this.prisma.feedRegion.findUnique({
      where: { code: regionCode },
    });
    if (!region) {
      this.logger.error(`Scheduled import: region not found: ${regionCode}`);
      return;
    }
    if (!region.baseUrl?.trim()) {
      this.logger.warn(`Scheduled import skipped: feed URL is not configured for ${regionCode}`);
      return;
    }
    if (!this.isRegionImportAllowed(regionCode)) {
      this.logger.warn(`Scheduled import skipped: feed is not allowed for ${regionCode}`);
      return;
    }

    const running = await this.prisma.importBatch.findFirst({
      where: { regionId: region.id, status: 'RUNNING' },
    });
    if (running) {
      this.logger.warn(
        `Scheduled import skipped: import already running (batch ${running.id})`,
      );
      return;
    }

    const batch = await this.prisma.importBatch.create({
      data: {
        regionId: region.id,
        status: 'PENDING',
        triggeredBy: null,
      },
    });

    await this.executeBatch({
      batchId: batch.id,
      regionId: region.id,
      regionCode,
    });
  }

  private async createPendingBatch(
    regionCode: string,
    triggeredBy?: string,
  ): Promise<FeedImportBatchJob> {
    const region = await this.prisma.feedRegion.findUnique({
      where: { code: regionCode },
    });
    if (!region) {
      throw new NotFoundException(`Region not found: ${regionCode}`);
    }
    if (!region.baseUrl?.trim()) {
      throw new BadRequestException(`Feed URL is not configured for region: ${regionCode}`);
    }
    if (!this.isRegionImportAllowed(regionCode)) {
      throw new BadRequestException(`Feed is not available for region: ${regionCode}`);
    }

    const running = await this.prisma.importBatch.findFirst({
      where: { regionId: region.id, status: 'RUNNING' },
    });
    if (running) {
      throw new ConflictException('Import already running');
    }

    const batch = await this.prisma.importBatch.create({
      data: {
        regionId: region.id,
        status: 'PENDING',
        triggeredBy: triggeredBy || null,
      },
    });

    return { batchId: batch.id, regionId: region.id, regionCode };
  }

  /**
   * Выполняет импорт для уже созданного batch (вызывается из BullMQ worker).
   */
  async executeBatch({
    batchId,
    regionId,
    regionCode,
  }: FeedImportBatchJob): Promise<void> {
    const stats: Record<string, unknown> = {};
    const errors: string[] = [];

    try {
      this.setProgress('Downloading about.json', undefined, 5);

      await this.prisma.importBatch.update({
        where: { id: batchId },
        data: { status: 'RUNNING', startedAt: new Date() },
      });

      const about = await this.fetcher.fetchAbout(regionCode);
      await this.ensureBatchIsRunning(batchId);
      const exportedAt = about[0]?.exported_at;

      await this.prisma.importBatch.update({
        where: { id: batchId },
        data: { feedExportedAt: exportedAt ? new Date(exportedAt) : null },
      });

      const fileMap = new Map(about.map((e) => [e.name, e.url]));

      const refFiles = [
        { name: 'rooms', process: (d: any[]) => this.processor.processRooms(d) },
        { name: 'finishings', process: (d: any[]) => this.processor.processFinishings(d) },
        {
          name: 'buildingtypes',
          process: (d: any[]) => this.processor.processBuildingTypes(d),
        },
        { name: 'regions', process: (d: any[]) => this.processor.processDistricts(d, regionId) },
        { name: 'subways', process: (d: any[]) => this.processor.processSubways(d, regionId) },
        { name: 'builders', process: (d: any[]) => this.processor.processBuilders(d, regionId) },
      ];

      for (let i = 0; i < refFiles.length; i++) {
        const rf = refFiles[i];
        const url = fileMap.get(rf.name);
        if (!url) {
          errors.push(`Missing feed file: ${rf.name}`);
          continue;
        }

        this.setProgress(`Processing ${rf.name}`, url, 10 + i * 3);
        try {
          const data = await this.fetcher.fetchFeedFile(url);
          await this.ensureBatchIsRunning(batchId);
          stats[`${rf.name}_upserted`] = await rf.process(data);
          await this.ensureBatchIsRunning(batchId);
        } catch (err: any) {
          errors.push(`${rf.name}: ${err.message}`);
          this.logger.error(`Error processing ${rf.name}: ${err.message}`);
        }
      }

      const blocksUrl = fileMap.get('blocks');
      if (blocksUrl) {
        this.setProgress('Processing blocks', blocksUrl, 30);
        try {
          const blocksData = await this.fetcher.fetchFeedFile(blocksUrl);
          await this.ensureBatchIsRunning(batchId);
          stats.blocks_in_feed = Array.isArray(blocksData) ? blocksData.length : 0;
          stats.blocks_upserted = await this.processor.processBlocks(blocksData, regionId);
          await this.ensureBatchIsRunning(batchId);
        } catch (err: unknown) {
          errors.push(`blocks: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      const buildingsUrl = fileMap.get('buildings');
      if (buildingsUrl) {
        this.setProgress('Processing buildings', buildingsUrl, 45);
        try {
          const buildingsData = await this.fetcher.fetchFeedFile(buildingsUrl);
          await this.ensureBatchIsRunning(batchId);
          stats.buildings_in_feed = Array.isArray(buildingsData) ? buildingsData.length : 0;
          stats.buildings_upserted =
            await this.processor.processBuildings(buildingsData, regionId);
          await this.ensureBatchIsRunning(batchId);
        } catch (err: unknown) {
          errors.push(`buildings: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      const apartmentsUrl = fileMap.get('apartments');
      if (apartmentsUrl) {
        this.setProgress('Downloading apartments', apartmentsUrl, 60);
        try {
          const aptData = await this.fetcher.fetchFeedFile(apartmentsUrl);
          await this.ensureBatchIsRunning(batchId);
          stats.apartments_in_feed = Array.isArray(aptData) ? aptData.length : 0;
          this.setProgress('Processing apartments', `0/${aptData.length} квартир обработано`, 65, {
            processedItems: 0,
            totalItems: aptData.length,
          });
          const previousFeedApartmentCount = await this.getPreviousFeedApartmentCount(regionId);
          const markSoldMinRatio = Number(this.config.get('FEED_MARK_SOLD_MIN_RATIO') || 0.85);
          const aptResult = await this.processor.processApartments(aptData, regionId, {
            onBatchProgress: async ({ processed, total }) => {
              await this.ensureBatchIsRunning(batchId);
              this.setProgress(
                'Processing apartments',
                `${processed}/${total} квартир обработано`,
                this.apartmentProgressPercent(processed, total),
                { processedItems: processed, totalItems: total },
              );
            },
            previousFeedApartmentCount,
            markSoldMinRatio,
          });
          stats.apartments_upserted = aptResult.upserted;
          stats.apartments_marked_sold = aptResult.markedSold;
          if (aptResult.markSoldSkipped) {
            stats.mark_sold_skipped = true;
            errors.push(aptResult.markSoldSkipReason ?? 'markSold skipped (truncated feed guard)');
          }
          await this.ensureBatchIsRunning(batchId);
        } catch (err: unknown) {
          await this.rethrowIfBatchStopped(batchId, err);
          errors.push(`apartments: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      this.setProgress('Deriving block statuses', undefined, 95);
      try {
        await this.ensureBatchIsRunning(batchId);
        stats.block_statuses_updated =
          await this.processor.deriveBlockStatuses(regionId);
      } catch (err: unknown) {
        errors.push(`block_statuses: ${err instanceof Error ? err.message : String(err)}`);
      }

      this.setProgress('Finalizing', undefined, 98);

      const aptInFeed =
        typeof stats.apartments_in_feed === 'number' ? stats.apartments_in_feed : 0;
      const prevFeedCount = await this.getPreviousFeedApartmentCount(regionId);
      const minRatio = Number(this.config.get('FEED_MARK_SOLD_MIN_RATIO') || 0.85);
      const degraded =
        stats.mark_sold_skipped === true ||
        (prevFeedCount != null &&
          aptInFeed > 0 &&
          aptInFeed < Math.floor(prevFeedCount * minRatio)) ||
        errors.some((e) => e.startsWith('apartments:'));

      stats.degraded = degraded;
      stats.integrity_checkpoint = degraded ? 'QUARANTINED' : 'PASSED';
      stats.healthy_import =
        !degraded &&
        aptInFeed > 0 &&
        stats.mark_sold_skipped !== true &&
        !errors.some((e) => e.startsWith('apartments:'));

      try {
        await this.refreshCatalogSearchCache();
        await this.blocks.invalidateCatalogCache();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`catalog_mv_refresh: ${msg}`);
        this.logger.warn(`catalog_apartment_active_mv refresh failed: ${msg}`);
      }

      if (degraded) {
        stats.last_imported_at_skipped = true;
      }

      await this.prisma.importBatch.update({
        where: { id: batchId },
        data: {
          status: 'COMPLETED',
          finishedAt: new Date(),
          stats: {
            ...stats,
            errors,
            hasWarnings: errors.length > 0 || degraded,
          },
        },
      });

      if (!degraded) {
        await this.prisma.feedRegion.update({
          where: { id: regionId },
          data: { lastImportedAt: new Date() },
        });
        if (this.config.get('SITEMAP_AUTO_REGENERATE') !== 'false') {
          void this.sitemap.generateAll(`post_import_batch_${batchId}`).catch((e: unknown) => {
            const msg = e instanceof Error ? e.message : String(e);
            this.logger.warn(`Post-import sitemap regeneration failed: ${msg}`);
          });
        }
      } else {
        this.logger.error(
          `Import batch ${batchId} QUARANTINED (degraded) — lastImportedAt not updated, status mutations blocked`,
        );
      }

      this.setProgress('Completed', JSON.stringify(stats), 100);
      this.logger.log(`Import batch ${batchId} completed: ${JSON.stringify(stats)}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      this.logger.error(`Import batch ${batchId} failed: ${msg}`, stack);

      const current = await this.prisma.importBatch.findUnique({ where: { id: batchId }, select: { status: true, errorMessage: true } });
      if (current?.status !== 'FAILED') {
        await this.prisma.importBatch.update({
          where: { id: batchId },
          data: {
            status: 'FAILED',
            finishedAt: new Date(),
            errorMessage: msg,
            stats: { ...stats, errors: [...errors, msg] },
          },
        });
      }

      this.setProgress('Failed', msg, 0);
    }
  }

  async stopBatch(id: number, reason = 'Stopped manually') {
    const batch = await this.prisma.importBatch.findUnique({
      where: { id },
      include: { region: { select: { code: true } } },
    });
    if (!batch) throw new NotFoundException('Import batch not found');
    if (batch.status === 'COMPLETED' || batch.status === 'FAILED') {
      return { stopped: false, status: batch.status, reason: 'Batch already finished' };
    }

    const removedJobs = await this.removeQueuedJobsForBatch(id, batch.region.code);
    await this.prisma.importBatch.update({
      where: { id },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        errorMessage: reason,
      },
    });
    this.setProgress('Failed', reason, 0);
    return { stopped: true, batchId: id, removedJobs };
  }

  async deleteBatch(id: number) {
    const batch = await this.prisma.importBatch.findUnique({
      where: { id },
      include: { region: { select: { code: true } } },
    });
    if (!batch) throw new NotFoundException('Import batch not found');
    if (batch.status === 'RUNNING') {
      throw new BadRequestException('Сначала остановите импорт, затем удалите запрос');
    }
    const removedJobs = await this.removeQueuedJobsForBatch(id, batch.region.code);
    await this.prisma.importBatch.delete({ where: { id } });
    return { deleted: true, batchId: id, removedJobs };
  }

  async stopActiveImports(reason = 'Stopped manually') {
    const batches = await this.prisma.importBatch.findMany({
      where: { status: { in: ['PENDING', 'RUNNING'] } },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });
    const stopped = [];
    for (const batch of batches) {
      stopped.push(await this.stopBatch(batch.id, reason));
    }
    return { stopped };
  }

  /** Auto-fail PENDING/RUNNING batches older than FEED_HEALTH_STUCK_MINUTES (startup + periodic watchdog). */
  async recoverStuckBatches(source: 'startup' | 'watchdog' = 'startup') {
    if (this.config.get('FEED_STUCK_RECOVERY_DISABLE') === 'true') {
      return { recovered: [], skipped: true as const };
    }

    const stuckMinutes = Number(this.config.get('FEED_HEALTH_STUCK_MINUTES') || 120);
    const stuckCutoff = new Date(Date.now() - stuckMinutes * 60_000);

    const stuck = await this.prisma.importBatch.findMany({
      where: {
        status: { in: ['PENDING', 'RUNNING'] },
        OR: [
          { startedAt: { lt: stuckCutoff } },
          { startedAt: null, createdAt: { lt: stuckCutoff } },
        ],
      },
      select: { id: true, status: true, startedAt: true, createdAt: true },
      orderBy: { id: 'asc' },
    });

    if (!stuck.length) {
      return { recovered: [], skipped: false as const };
    }

    const reason = `Auto-recovered (${source}): import stuck > ${stuckMinutes} min`;
    const recovered = [];
    for (const batch of stuck) {
      try {
        const result = await this.stopBatch(batch.id, reason);
        recovered.push(result);
        this.logger.warn(
          `Recovered stuck import batch #${batch.id} [${batch.status}] via ${source}`,
        );
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.error(`Failed to recover import batch #${batch.id}: ${msg}`);
      }
    }
    return { recovered, skipped: false as const };
  }

  private scheduleStuckBatchWatchdog() {
    if (this.config.get('FEED_STUCK_RECOVERY_DISABLE') === 'true') return;

    const intervalMs = Number(this.config.get('FEED_STUCK_RECOVERY_INTERVAL_MS') ?? 15 * 60 * 1000);
    const safeInterval =
      Number.isFinite(intervalMs) && intervalMs >= 60_000 ? intervalMs : 15 * 60 * 1000;

    this.stuckBatchWatchdog = setInterval(() => {
      void this.recoverStuckBatches('watchdog').catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn(`Watchdog stuck-batch recovery failed: ${msg}`);
      });
    }, safeInterval);
    this.stuckBatchWatchdog.unref?.();
    this.logger.log(`Stuck import watchdog every ${Math.round(safeInterval / 60_000)} min`);
  }

  /**
   * Отчёт «фид TrendAgent vs БД» для сопоставления с витриной (например, msk.trendagent.ru).
   * Тяжёлый apartments.json целиком не качаем — только about + blocks; число квартир во фиде уточняйте по последнему импорту или локальной копии фида.
   */
  async feedVsDbDiagnostics(regionCodeRaw: string) {
    const regionCode = (regionCodeRaw || 'msk').toLowerCase();
    const region = await this.prisma.feedRegion.findFirst({
      where: { code: { equals: regionCode, mode: 'insensitive' } },
    });
    if (!region) {
      throw new NotFoundException(`Регион не найден: ${regionCode}`);
    }

    const about = await this.fetcher.fetchAbout(regionCode);
    const fileMap = new Map(about.map((e) => [e.name, e.url]));
    const exportedAt = about[0]?.exported_at ?? null;

    let blocksInFeed: number | null = null;
    let blocksFeedError: string | null = null;
    const blocksUrl = fileMap.get('blocks');
    if (blocksUrl) {
      try {
        const blocksData = await this.fetcher.fetchFeedFile<unknown[]>(blocksUrl);
        blocksInFeed = Array.isArray(blocksData) ? blocksData.length : null;
      } catch (e: unknown) {
        blocksFeedError = e instanceof Error ? e.message : String(e);
      }
    }

    const apartmentsUrl = fileMap.get('apartments') ?? null;

    const [
      listingsActivePublished,
      listingsWithBlock,
      listingsBlockIdNull,
      blocksInDbRegion,
      lastCompleted,
    ] = await Promise.all([
      this.prisma.listing.count({
        where: {
          regionId: region.id,
          kind: ListingKind.APARTMENT,
          status: ListingStatus.ACTIVE,
          isPublished: true,
        },
      }),
      this.prisma.listing.count({
        where: {
          regionId: region.id,
          kind: ListingKind.APARTMENT,
          status: ListingStatus.ACTIVE,
          isPublished: true,
          blockId: { not: null },
        },
      }),
      this.prisma.listing.count({
        where: {
          regionId: region.id,
          kind: ListingKind.APARTMENT,
          status: ListingStatus.ACTIVE,
          isPublished: true,
          blockId: null,
        },
      }),
      this.prisma.block.count({ where: { regionId: region.id } }),
      this.prisma.importBatch.findFirst({
        where: { regionId: region.id, status: 'COMPLETED' },
        orderBy: { finishedAt: 'desc' },
        select: { id: true, finishedAt: true, feedExportedAt: true, stats: true },
      }),
    ]);

    const importStats = lastCompleted?.stats as Record<string, unknown> | null | undefined;
    const apartmentsUpsertedLast =
      typeof importStats?.apartments_upserted === 'number'
        ? importStats.apartments_upserted
        : null;
    const blocksUpsertedLast =
      typeof importStats?.blocks_upserted === 'number' ? importStats.blocks_upserted : null;

    /** Как публичный GET /blocks/catalog-counts (дефолт витрины). */
    const catalogCountsVitrine = await this.blocks.countCatalog({
      region_id: region.id,
      require_active_listings: true,
    });
    /** Все ЖК региона с квартирами по тем же правилам лотов, без требования «есть активные квартиры у ЖК». */
    const catalogCountsRelaxed = await this.blocks.countCatalog({
      region_id: region.id,
      require_active_listings: false,
    });

    const listingStatusBreakdown = await this.prisma.listing.groupBy({
      by: ['status'],
      where: { regionId: region.id, kind: ListingKind.APARTMENT },
      _count: { _all: true },
    });

    const distinctBlocksWithListings = await this.prisma.listing.groupBy({
      by: ['blockId'],
      where: {
        regionId: region.id,
        kind: ListingKind.APARTMENT,
        status: ListingStatus.ACTIVE,
        isPublished: true,
        blockId: { not: null },
      },
    });
    const distinctBlockCount = distinctBlocksWithListings.filter((g) => g.blockId != null).length;

    const explanations: string[] = [];
    if (listingsBlockIdNull > 0) {
      explanations.push(
        `В БД ${listingsBlockIdNull} активных опубликованных квартир без привязки к ЖК (block_id = null). Такие лоты не попадают в публичный счётчик «X квартир в Y ЖК», потому что Y считается только по связанным ЖК.`,
      );
    }
    explanations.push(
      'Счётчик витрины сайта (GET /blocks/catalog-counts) учитывает только квартиры, у которых есть связанный ЖК в регионе, и только ЖК с хотя бы одной такой квартирой (require_active_listings).',
    );
    explanations.push(
      'Числа на msk.trendagent.ru могут включать другой набор статусов/географии или полный объём фида до фильтрации — сравнивайте с blocksInFeed и apartments_upserted последнего импорта.',
    );
    if (blocksInFeed != null && blocksInFeed > catalogCountsVitrine.blocks) {
      explanations.push(
        `Во фиде ${blocksInFeed} записей ЖК, на витрине (как у TrendAgent по смыслу «ЖК с офферами») ${catalogCountsVitrine.blocks} ЖК — часть ЖК в БД без активных опубликованных квартир не попадает в счётчик главной.`,
      );
    }
    if (
      catalogCountsRelaxed.apartments > catalogCountsVitrine.apartments ||
      catalogCountsRelaxed.blocks > catalogCountsVitrine.blocks
    ) {
      explanations.push(
        `Счётчик главной = vitrine_catalog_counts (require_active_listings). Без него было бы квартир: ${catalogCountsRelaxed.apartments}, ЖК: ${catalogCountsRelaxed.blocks} — сравнивайте с этим, если нужно понять «все лоты в регионе».`,
      );
    }

    return {
      generatedAt: new Date().toISOString(),
      region: {
        id: region.id,
        code: region.code,
        name: region.name,
        lastImportedAt: region.lastImportedAt,
      },
      feedAbout: {
        exported_at: exportedAt,
        files: about.map((e) => ({ name: e.name, url: e.url, scope: e.scope })),
      },
      feedProbe: {
        blocks_json_count: blocksInFeed,
        blocks_json_error: blocksFeedError,
        apartments_json_url: apartmentsUrl,
        note:
          'Полный размер массива apartments.json не запрашивается здесь (слишком тяжело для HTTP). Смотрите apartments_upserted последнего успешного импорта или скачайте фид локально (FEED_LOCAL_DIR).',
      },
      database: {
        blocks_total_in_db: blocksInDbRegion,
        listings_apartment_active_published: listingsActivePublished,
        listings_with_block_id: listingsWithBlock,
        listings_block_id_null: listingsBlockIdNull,
        distinct_blocks_having_listings: distinctBlockCount,
      },
      vitrine_catalog_counts: catalogCountsVitrine,
      catalog_counts_relaxed: catalogCountsRelaxed,
      listing_status_breakdown_apartments: listingStatusBreakdown.map((r) => ({
        status: r.status,
        count: r._count._all,
      })),
      last_completed_import: lastCompleted
        ? {
            batch_id: lastCompleted.id,
            finished_at: lastCompleted.finishedAt,
            feed_exported_at: lastCompleted.feedExportedAt,
            stats: lastCompleted.stats,
            apartments_upserted: apartmentsUpsertedLast,
            blocks_upserted: blocksUpsertedLast,
          }
        : null,
      explanations,
    };
  }

  /**
   * Лёгкая проверка доступности фида по региону:
   * - доступен ли about.json
   * - присутствуют ли обязательные файлы в about
   * - удалось ли прочитать blocks.json и сколько в нём записей
   */
  async probeRegionFeed(regionCodeRaw: string) {
    const regionCode = this.normalizeRegionCode(regionCodeRaw);
    const requiredFiles = ['blocks', 'buildings', 'apartments', 'regions', 'subways', 'builders'] as const;
    const warnings: string[] = [];

    try {
      const about = await this.fetcher.fetchAbout(regionCode);
      const fileMap = new Map(about.map((e) => [e.name, e.url]));
      const availableFiles = Array.from(fileMap.keys()).sort();
      const missingRequired = requiredFiles.filter((name) => !fileMap.has(name));

      let blocksCount: number | null = null;
      let blocksReadError: string | null = null;
      const blocksUrl = fileMap.get('blocks');
      if (blocksUrl) {
        try {
          const blocksData = await this.fetcher.fetchFeedFile<unknown[]>(blocksUrl);
          blocksCount = Array.isArray(blocksData) ? blocksData.length : null;
        } catch (e: unknown) {
          blocksReadError = e instanceof Error ? e.message : String(e);
          warnings.push(`Не удалось прочитать blocks.json: ${blocksReadError}`);
        }
      }

      if (missingRequired.length) {
        warnings.push(`В about.json отсутствуют обязательные файлы: ${missingRequired.join(', ')}`);
      }

      return {
        region: regionCode,
        ok: missingRequired.length === 0 && !blocksReadError,
        exportedAt: about[0]?.exported_at ?? null,
        filesTotal: about.length,
        availableFiles,
        missingRequired,
        blocksCount,
        blocksReadError,
        warnings,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        region: regionCode,
        ok: false,
        exportedAt: null,
        filesTotal: 0,
        availableFiles: [],
        missingRequired: requiredFiles,
        blocksCount: null,
        blocksReadError: msg,
        warnings: [`about.json недоступен: ${msg}`],
      };
    }
  }

  async getHistory(regionId?: number, page = 1, perPage = 20) {
    const where = regionId ? { regionId } : {};
    const [data, total] = await Promise.all([
      this.prisma.importBatch.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
        include: {
          region: { select: { code: true, name: true } },
          user: { select: { id: true, fullName: true, email: true } },
        },
      }),
      this.prisma.importBatch.count({ where }),
    ]);
    return {
      data,
      meta: {
        page,
        per_page: perPage,
        total,
        total_pages: Math.ceil(total / perPage),
      },
    };
  }

  private setProgress(
    step: string,
    detail?: string,
    percent = 0,
    extra: Partial<Pick<ImportProgress, 'processedItems' | 'totalItems'>> = {},
  ) {
    this.currentProgress = { step, detail, percent, ...extra };
  }

  private apartmentProgressPercent(processed: number, total: number): number {
    if (total <= 0) return 65;
    return Math.min(94, Math.max(65, Math.round(65 + (processed / total) * 29)));
  }

  private async ensureBatchIsRunning(batchId: number) {
    const batch = await this.prisma.importBatch.findUnique({
      where: { id: batchId },
      select: { status: true, errorMessage: true },
    });
    if (!batch || batch.status !== 'RUNNING') {
      throw new Error(batch?.errorMessage || 'Import stopped manually');
    }
  }

  private async rethrowIfBatchStopped(batchId: number, err: unknown) {
    const batch = await this.prisma.importBatch.findUnique({
      where: { id: batchId },
      select: { status: true, errorMessage: true },
    });
    if (!batch || batch.status !== 'RUNNING') {
      throw new Error(batch?.errorMessage || (err instanceof Error ? err.message : 'Import stopped manually'));
    }
  }

  private async removeQueuedJobsForBatch(batchId: number, regionCode: string): Promise<number> {
    const jobs = await this.feedImportQueue.getJobs(['waiting', 'delayed', 'paused']);
    let removed = 0;
    for (const job of jobs) {
      const data = job.data as Partial<FeedImportBatchJob> & { regionCode?: string };
      const matchesBatch = data.batchId === batchId;
      const matchesRegion = !data.batchId && this.normalizeRegionCode(data.regionCode || '') === this.normalizeRegionCode(regionCode);
      if (!matchesBatch && !matchesRegion) continue;
      try {
        await job.remove();
        removed++;
      } catch (e: unknown) {
        this.logger.warn(`Could not remove feed import job ${job.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return removed;
  }

  async refreshCatalogSearchCache() {
    await this.prisma.$executeRawUnsafe(
      'REFRESH MATERIALIZED VIEW catalog_apartment_active_mv',
    );
    return { refreshed: true, view: 'catalog_apartment_active_mv' as const };
  }

  private normalizeRegionCode(regionCode: string): string {
    return String(regionCode || 'msk').trim().toLowerCase();
  }

  private parseConfiguredRegionCodes(): string[] {
    const rawList = this.config.get<string>('TRENDAGENT_REGIONS')?.trim();
    const fallback = this.config.get<string>('TRENDAGENT_DEFAULT_REGION') || 'msk';
    const source = rawList && rawList.length > 0 ? rawList : fallback;
    const items = source
      .split(/[\s,;]+/)
      .map((s) => this.normalizeRegionCode(s))
      .filter(Boolean);
    return Array.from(new Set(items));
  }

  private async resolveCronRegionCodes(): Promise<string[]> {
    const configured = this.parseConfiguredRegionCodes();
    if (!configured.length) return [];

    if (configured.includes('all')) {
      const allEnabled = await this.prisma.feedRegion.findMany({
        where: { isEnabled: true, baseUrl: { not: null } },
        orderBy: { id: 'asc' },
        select: { code: true, baseUrl: true },
      });
      return allEnabled
        .filter((r) => r.baseUrl?.trim() && this.isRegionImportAllowed(r.code))
        .map((r) => this.normalizeRegionCode(r.code));
    }

    const rows = await this.prisma.feedRegion.findMany({
      where: { code: { in: configured } },
      select: { code: true, baseUrl: true },
    });
    const existing = new Set(rows.map((r) => this.normalizeRegionCode(r.code)));
    const importable = new Set(rows.filter((r) => r.baseUrl?.trim() && this.isRegionImportAllowed(r.code)).map((r) => this.normalizeRegionCode(r.code)));
    const missing = configured.filter((code) => !existing.has(code));
    if (missing.length) {
      this.logger.warn(`Skip unknown TRENDAGENT_REGIONS codes: ${missing.join(', ')}`);
    }
    const withoutFeed = configured.filter((code) => existing.has(code) && !importable.has(code));
    if (withoutFeed.length) {
      this.logger.warn(`Skip TRENDAGENT_REGIONS without feed URL: ${withoutFeed.join(', ')}`);
    }
    return configured.filter((code) => importable.has(code));
  }

  private allowedImportRegionCodes(): Set<string> {
    const raw = this.config.get<string>('FEED_IMPORT_ALLOWED_REGIONS') || 'msk';
    return new Set(
      raw
        .split(/[\s,;]+/)
        .map((code) => this.normalizeRegionCode(code))
        .filter(Boolean),
    );
  }

  private isRegionImportAllowed(regionCode: string): boolean {
    return this.allowedImportRegionCodes().has(this.normalizeRegionCode(regionCode));
  }

  private async assertNoOverlappingImport(regionCode: string): Promise<void> {
    const region = await this.prisma.feedRegion.findUnique({ where: { code: regionCode } });
    if (!region) return;

    const running = await this.prisma.importBatch.count({
      where: { regionId: region.id, status: { in: ['RUNNING', 'PENDING'] } },
    });
    if (running > 0) {
      throw new ConflictException(`Import already queued or running for ${regionCode}`);
    }

    try {
      const [active, waiting] = await Promise.all([
        this.feedImportQueue.getJobs(['active']),
        this.feedImportQueue.getJobs(['waiting', 'delayed']),
      ]);
      const pending = [...active, ...waiting].some((job) => {
        const data = job.data as { regionCode?: string; batchId?: number };
        return data?.regionCode === regionCode || job.id?.includes(regionCode);
      });
      if (pending) {
        throw new ConflictException(`BullMQ job already pending for ${regionCode}`);
      }
    } catch (e) {
      if (e instanceof ConflictException) throw e;
    }
  }

  private async getPreviousFeedApartmentCount(regionId: number): Promise<number | null> {
    const batches = await this.prisma.importBatch.findMany({
      where: { regionId, status: 'COMPLETED' },
      orderBy: { finishedAt: 'desc' },
      take: 15,
      select: { stats: true },
    });
    for (const batch of batches) {
      if (!batch.stats || typeof batch.stats !== 'object') continue;
      const n = (batch.stats as Record<string, unknown>).apartments_in_feed;
      if (typeof n === 'number' && n > 0) return n;
    }
    return null;
  }

  /**
   * Forensic-сравнение TrendAgent feed vs БД с integrity score.
   * @param includeApartmentsCount — загрузить apartments.json целиком (тяжело, только для ручного аудита)
   */
  async getFeedIntegrityReport(regionCodeRaw: string, includeApartmentsCount = false) {
    const regionCode = this.normalizeRegionCode(regionCodeRaw);
    const region = await this.prisma.feedRegion.findFirst({
      where: { code: { equals: regionCode, mode: 'insensitive' } },
    });
    if (!region) throw new NotFoundException(`Регион не найден: ${regionCode}`);

    const about = await this.fetcher.fetchAbout(regionCode);
    const fileMap = new Map(about.map((e) => [e.name, e.url]));
    const exportedAt = about[0]?.exported_at ?? null;

    let blocksInFeed: number | null = null;
    let buildingsInFeed: number | null = null;
    let apartmentsInFeed: number | null = null;
    let feedCountErrors: string[] = [];

    const blocksUrl = fileMap.get('blocks');
    if (blocksUrl) {
      try {
        const r = await this.fetcher.countFeedArrayEntries(blocksUrl);
        blocksInFeed = r.count;
      } catch (e: unknown) {
        feedCountErrors.push(`blocks: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const buildingsUrl = fileMap.get('buildings');
    if (buildingsUrl) {
      try {
        const r = await this.fetcher.countFeedArrayEntries(buildingsUrl);
        buildingsInFeed = r.count;
      } catch (e: unknown) {
        feedCountErrors.push(`buildings: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    if (includeApartmentsCount) {
      const apartmentsUrl = fileMap.get('apartments');
      if (apartmentsUrl) {
        try {
          const r = await this.fetcher.countFeedArrayEntries(apartmentsUrl);
          apartmentsInFeed = r.count;
        } catch (e: unknown) {
          feedCountErrors.push(`apartments: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    const [
      buildersDb,
      blocksDb,
      buildingsDb,
      listingBreakdown,
      orphanApartments,
      soldFeedApartments,
      catalogEligible,
      blocksWithListings,
      lastCompleted,
      recentCompletedBatches,
    ] = await Promise.all([
      this.prisma.builder.count({ where: { regionId: region.id } }),
      this.prisma.block.count({ where: { regionId: region.id } }),
      this.prisma.building.count({ where: { regionId: region.id } }),
      this.prisma.listing.groupBy({
        by: ['status'],
        where: { regionId: region.id, kind: ListingKind.APARTMENT, dataSource: 'FEED' },
        _count: { _all: true },
      }),
      this.prisma.listing.count({
        where: {
          regionId: region.id,
          kind: ListingKind.APARTMENT,
          dataSource: 'FEED',
          status: ListingStatus.ACTIVE,
          isPublished: true,
          blockId: null,
        },
      }),
      this.prisma.listing.count({
        where: {
          regionId: region.id,
          kind: ListingKind.APARTMENT,
          dataSource: 'FEED',
          status: ListingStatus.SOLD,
        },
      }),
      this.prisma.listing.count({
        where: {
          regionId: region.id,
          kind: ListingKind.APARTMENT,
          dataSource: 'FEED',
          status: { in: [ListingStatus.ACTIVE, ListingStatus.RESERVED] },
          isPublished: true,
          blockId: { not: null },
          price: { gte: 100_000 },
        },
      }),
      this.prisma.listing.groupBy({
        by: ['blockId'],
        where: {
          regionId: region.id,
          kind: ListingKind.APARTMENT,
          status: { in: [ListingStatus.ACTIVE, ListingStatus.RESERVED] },
          isPublished: true,
          blockId: { not: null },
        },
      }),
      this.prisma.importBatch.findFirst({
        where: { regionId: region.id, status: 'COMPLETED' },
        orderBy: { finishedAt: 'desc' },
        select: { id: true, finishedAt: true, feedExportedAt: true, stats: true },
      }),
      this.prisma.importBatch.findMany({
        where: { regionId: region.id, status: 'COMPLETED' },
        orderBy: { finishedAt: 'desc' },
        take: 20,
        select: { id: true, finishedAt: true, stats: true },
      }),
    ]);

    const lastFullImport = recentCompletedBatches.find((b) => {
      const n = (b.stats as Record<string, unknown> | null)?.apartments_in_feed;
      return typeof n === 'number' && n > 0;
    }) ?? null;

    const activePublished = listingBreakdown
      .filter((r) => r.status === ListingStatus.ACTIVE || r.status === ListingStatus.RESERVED)
      .reduce((s, r) => s + r._count._all, 0);

    const importStats = lastCompleted?.stats as Record<string, unknown> | null | undefined;
    const lastImportApartmentsInFeed =
      typeof importStats?.apartments_in_feed === 'number' ? importStats.apartments_in_feed : null;
    const lastImportUpserted =
      typeof importStats?.apartments_upserted === 'number' ? importStats.apartments_upserted : null;

    const expectedApartments =
      apartmentsInFeed ?? lastImportApartmentsInFeed ?? null;

    const vitrine = await this.blocks.countCatalog({
      region_id: region.id,
      require_active_listings: true,
    });

    const vitrineBlocks = blocksWithListings.filter((g) => g.blockId != null).length;

    const explanations: string[] = [];
    if (soldFeedApartments > 0 && expectedApartments && activePublished < expectedApartments * 0.5) {
      explanations.push(
        `В БД ${soldFeedApartments.toLocaleString('ru-RU')} FEED-квартир со статусом SOLD при ${activePublished.toLocaleString('ru-RU')} ACTIVE — возможен массовый markSold после усечённого/частичного импорта (см. stats.mark_sold_skipped).`,
      );
    }
    if (orphanApartments > 0) {
      explanations.push(
        `${orphanApartments} активных квартир без block_id — не попадают в vitrine catalog-counts.`,
      );
    }
    explanations.push(
      'Публичный счётчик (14917-тип) = ACTIVE+RESERVED, isPublished, block_id NOT NULL. TrendAgent ~67k — все записи apartments.json без фильтра витрины.',
    );
    if (blocksInFeed != null && blocksInFeed > vitrine.blocks) {
      explanations.push(
        `Во фиде ${blocksInFeed} ЖК, на витрине ${vitrine.blocks} — ЖК без активных опубликованных квартир скрыты (require_active_listings).`,
      );
    }

    const apartmentIntegrityPct =
      expectedApartments && expectedApartments > 0
        ? Math.round((activePublished / expectedApartments) * 1000) / 10
        : null;
    const blockIntegrityPct =
      blocksInFeed && blocksInFeed > 0
        ? Math.round((vitrine.blocks / blocksInFeed) * 1000) / 10
        : null;

    let integrityScore = 100;
    if (apartmentIntegrityPct != null) integrityScore = Math.min(integrityScore, apartmentIntegrityPct);
    if (blockIntegrityPct != null) integrityScore = Math.min(integrityScore, blockIntegrityPct);
    if (orphanApartments > 100) integrityScore -= 5;
    if (soldFeedApartments > activePublished) integrityScore -= 10;
    integrityScore = Math.max(0, Math.round(integrityScore * 10) / 10);

    return {
      generatedAt: new Date().toISOString(),
      region: {
        id: region.id,
        code: region.code,
        name: region.name,
        lastImportedAt: region.lastImportedAt,
      },
      feed: {
        exported_at: exportedAt,
        blocks_in_feed: blocksInFeed,
        buildings_in_feed: buildingsInFeed,
        apartments_in_feed: apartmentsInFeed ?? lastImportApartmentsInFeed,
        apartments_count_source: apartmentsInFeed != null ? 'live_fetch' : 'last_import_stats',
        feed_count_errors: feedCountErrors,
      },
      database: {
        builders: buildersDb,
        blocks: blocksDb,
        buildings: buildingsDb,
        listings_feed_by_status: listingBreakdown.map((r) => ({
          status: r.status,
          count: r._count._all,
        })),
        active_published: activePublished,
        sold: soldFeedApartments,
        orphan_apartments: orphanApartments,
        catalog_eligible: catalogEligible,
        blocks_with_active_listings: vitrineBlocks,
      },
      vitrine_catalog_counts: vitrine,
      last_completed_import: lastCompleted
        ? {
            batch_id: lastCompleted.id,
            finished_at: lastCompleted.finishedAt,
            feed_exported_at: lastCompleted.feedExportedAt,
            stats: lastCompleted.stats,
            apartments_in_feed: lastImportApartmentsInFeed,
            apartments_upserted: lastImportUpserted,
          }
        : null,
      last_full_import: lastFullImport
        ? {
            batch_id: lastFullImport.id,
            finished_at: lastFullImport.finishedAt,
            apartments_in_feed: (lastFullImport.stats as Record<string, unknown>)?.apartments_in_feed ?? null,
          }
        : null,
      comparison: {
        apartments_feed_vs_active_db: {
          feed_expected: expectedApartments,
          db_active_published: activePublished,
          delta: expectedApartments != null ? expectedApartments - activePublished : null,
        },
        apartments_feed_vs_vitrine: {
          feed_expected: expectedApartments,
          vitrine_apartments: vitrine.apartments,
          delta: expectedApartments != null ? expectedApartments - vitrine.apartments : null,
        },
        blocks_feed_vs_db: {
          feed: blocksInFeed,
          db: blocksDb,
          delta: blocksInFeed != null ? blocksInFeed - blocksDb : null,
        },
        blocks_feed_vs_vitrine: {
          feed: blocksInFeed,
          vitrine: vitrine.blocks,
          delta: blocksInFeed != null ? blocksInFeed - vitrine.blocks : null,
        },
      },
      integrity_score: integrityScore,
      integrity_percent: {
        apartments: apartmentIntegrityPct,
        blocks: blockIntegrityPct,
      },
      explanations,
    };
  }

  /**
   * Быстрая сводка здоровья фидов для /admin/system и /admin/feed-import/health.
   * Без тяжёлых HTTP-проб фида — только БД + очередь BullMQ.
   */
  async getHealthSummary() {
    const staleHours = Number(this.config.get('FEED_HEALTH_STALE_HOURS') || 200);
    const stuckMinutes = Number(this.config.get('FEED_HEALTH_STUCK_MINUTES') || 120);
    const now = Date.now();
    const staleCutoff = new Date(now - staleHours * 3_600_000);
    const stuckCutoff = new Date(now - stuckMinutes * 60_000);
    const dayAgo = new Date(now - 86_400_000);

    const enabledRegions = await this.prisma.feedRegion.findMany({
      where: { isEnabled: true, baseUrl: { not: null } },
      orderBy: { id: 'asc' },
      select: { id: true, code: true, name: true, lastImportedAt: true, baseUrl: true },
    });

    const importableRegions = enabledRegions.filter(
      (r) => r.baseUrl?.trim() && this.isRegionImportAllowed(r.code),
    );

    const staleRegions = importableRegions.filter(
      (r) => !r.lastImportedAt || r.lastImportedAt < staleCutoff,
    );

    const [
      runningBatches,
      failedLast24h,
      orphanApartments,
      recentCompleted,
      duplicateRows,
      degradedLast7d,
    ] = await Promise.all([
      this.prisma.importBatch.findMany({
        where: { status: 'RUNNING' },
        include: { region: { select: { code: true, name: true } } },
      }),
      this.prisma.importBatch.count({
        where: { status: 'FAILED', createdAt: { gte: dayAgo } },
      }),
      this.prisma.listing.count({
        where: {
          kind: ListingKind.APARTMENT,
          status: ListingStatus.ACTIVE,
          isPublished: true,
          blockId: null,
        },
      }),
      this.prisma.importBatch.findMany({
        where: { status: 'COMPLETED', finishedAt: { gte: dayAgo } },
        orderBy: { finishedAt: 'desc' },
        take: 30,
        include: { region: { select: { code: true } } },
      }),
      this.prisma.$queryRaw<Array<{ region_id: number; external_id: string; cnt: bigint }>>`
        SELECT region_id, external_id, COUNT(*)::bigint AS cnt
        FROM listings
        WHERE external_id IS NOT NULL AND external_id <> ''
        GROUP BY region_id, external_id
        HAVING COUNT(*) > 1
        LIMIT 10
      `,
      this.prisma.importBatch.count({
        where: {
          status: 'COMPLETED',
          finishedAt: { gte: new Date(now - 7 * 86_400_000) },
          stats: { path: ['degraded'], equals: true },
        },
      }),
    ]);

    const stuckBatches = runningBatches.filter(
      (b) => b.startedAt != null && b.startedAt < stuckCutoff,
    );

    const incompleteImports = recentCompleted.filter((b) => {
      const stats = b.stats as Record<string, unknown> | null;
      const errors = stats?.errors;
      return Array.isArray(errors) && errors.length > 0;
    });

    let queue: {
      waiting: number;
      active: number;
      delayed: number;
      failed: number;
    } | null = null;
    try {
      const [waiting, active, delayed, failed] = await Promise.all([
        this.feedImportQueue.getWaitingCount(),
        this.feedImportQueue.getActiveCount(),
        this.feedImportQueue.getDelayedCount(),
        this.feedImportQueue.getFailedCount(),
      ]);
      queue = { waiting, active, delayed, failed };
    } catch {
      queue = null;
    }

    type FeedHealthIssue = {
      kind: string;
      severity: 'critical' | 'warning' | 'info';
      messageRu: string;
    };
    const issues: FeedHealthIssue[] = [];

    if (staleRegions.length) {
      issues.push({
        kind: 'stale_sync',
        severity: 'warning',
        messageRu: `Устаревший импорт (> ${staleHours}ч): ${staleRegions.map((r) => r.code).join(', ')}`,
      });
    }
    if (stuckBatches.length) {
      issues.push({
        kind: 'stuck_batch',
        severity: 'critical',
        messageRu: `Зависшие импорты (RUNNING > ${stuckMinutes} мин): ${stuckBatches.map((b) => `#${b.id}`).join(', ')}`,
      });
    }
    if (failedLast24h > 0) {
      issues.push({
        kind: 'failed_imports',
        severity: 'warning',
        messageRu: `Неудачных импортов за 24ч: ${failedLast24h}`,
      });
    }
    if (incompleteImports.length) {
      issues.push({
        kind: 'incomplete_import',
        severity: 'warning',
        messageRu: `Частичных импортов за 24ч (COMPLETED с ошибками): ${incompleteImports.length}`,
      });
    }
    if (orphanApartments > 0) {
      issues.push({
        kind: 'orphan_apartments',
        severity: 'warning',
        messageRu: `Квартир без ЖК (block_id=null): ${orphanApartments}`,
      });
    }
    if (duplicateRows.length > 0) {
      issues.push({
        kind: 'duplicate_external_id',
        severity: 'critical',
        messageRu: `Дубликаты external_id в listings: ${duplicateRows.length} групп`,
      });
    }
    if (queue?.failed && queue.failed > 0) {
      issues.push({
        kind: 'queue_failed_jobs',
        severity: 'warning',
        messageRu: `Неудачных задач в очереди BullMQ: ${queue.failed}`,
      });
    }
    if (degradedLast7d > 0) {
      issues.push({
        kind: 'degraded_import',
        severity: 'critical',
        messageRu: `Деградированных импортов за 7 дней (quarantine): ${degradedLast7d}`,
      });
    }

    const integrityMinScore = Number(this.config.get('FEED_INTEGRITY_MIN_SCORE') || 85);
    const cronPattern = this.config.get<string>('FEED_IMPORT_CRON') || '0 4 * * 1';
    const cronTz = this.config.get<string>('FEED_IMPORT_CRON_TZ') || 'Europe/Moscow';
    const cronDisabled = this.config.get('FEED_IMPORT_DISABLE_REPEAT') === 'true';

    const criticalCount = issues.filter((i) => i.severity === 'critical').length;

    const catalogListingWhere = {
      kind: ListingKind.APARTMENT,
      status: { in: [ListingStatus.ACTIVE, ListingStatus.RESERVED] as ListingStatus[] },
      isPublished: true,
      visibility: ListingVisibility.PUBLIC,
      blockId: { not: null },
    };

    const regionHealth = await Promise.all(
      enabledRegions.map(async (r) => {
        const [apartments, blocks] = await Promise.all([
          this.prisma.listing.count({ where: { regionId: r.id, ...catalogListingWhere } }),
          this.prisma.block.count({
            where: {
              regionId: r.id,
              listings: { some: catalogListingWhere },
            },
          }),
        ]);
        const isStale =
          this.isRegionImportAllowed(r.code) &&
          (!r.lastImportedAt || r.lastImportedAt < staleCutoff);
        const targets = getParityTargets(r.code, this.config);
        const aptParity = parityPercent(apartments, targets.donorApartments);
        const blkParity = parityPercent(blocks, targets.donorBlocks);
        return {
          code: r.code,
          name: r.name,
          lastImportedAt: r.lastImportedAt,
          catalogApartments: apartments,
          catalogBlocks: blocks,
          isStale,
          importAllowed: this.isRegionImportAllowed(r.code),
          parityPercent: { apartments: aptParity, blocks: blkParity },
          parityTargets: targets,
        };
      }),
    );

    const parityMin = Number(this.config.get('FEED_PARITY_MIN_PERCENT') || 90);
    for (const rh of regionHealth) {
      if (!rh.importAllowed) continue;
      const aptPct = rh.parityPercent.apartments;
      const blkPct = rh.parityPercent.blocks;
      if (aptPct != null && aptPct < parityMin) {
        issues.push({
          kind: 'parity_drift_apartments',
          severity: 'warning',
          messageRu: `Parity drift ${rh.code}: квартиры ${aptPct}% (min ${parityMin}%)`,
        });
      }
      if (blkPct != null && blkPct < parityMin) {
        issues.push({
          kind: 'parity_drift_blocks',
          severity: 'warning',
          messageRu: `Parity drift ${rh.code}: ЖК ${blkPct}% (min ${parityMin}%)`,
        });
      }
    }

    const sitemapMetrics = this.sitemap.getMetrics();
    const sitemapGeneratedAt = sitemapMetrics.lastGeneration?.generatedAt
      ? new Date(sitemapMetrics.lastGeneration.generatedAt).getTime()
      : null;
    const sitemapStaleDays = Number(this.config.get('SITEMAP_STALE_DAYS') || 8);
    if (!sitemapGeneratedAt) {
      issues.push({
        kind: 'sitemap_missing',
        severity: 'warning',
        messageRu: 'Sitemap не сгенерирован — индексация может быть неполной',
      });
    } else if (sitemapGeneratedAt < now - sitemapStaleDays * 86_400_000) {
      issues.push({
        kind: 'sitemap_stale',
        severity: 'warning',
        messageRu: `Sitemap устарел (> ${sitemapStaleDays} дн.) — запустите regen в Feed Import`,
      });
    }

    const aptInSitemap = sitemapMetrics.lastGeneration?.counts?.apartments ?? 0;
    const totalCatalogApartments = regionHealth.reduce((s, r) => s + r.catalogApartments, 0);
    if (aptInSitemap > 0 && totalCatalogApartments > 0) {
      const ratio = aptInSitemap / totalCatalogApartments;
      if (ratio < 0.9) {
        issues.push({
          kind: 'sitemap_coverage_drift',
          severity: 'warning',
          messageRu: `Sitemap coverage drift: ${aptInSitemap.toLocaleString('ru-RU')} URL vs ${totalCatalogApartments.toLocaleString('ru-RU')} в каталоге`,
        });
      }
    }

    const completedBatchCount = await this.prisma.importBatch.count({
      where: { status: 'COMPLETED' },
    });
    const snapshotWarn = Number(this.config.get('FEED_SNAPSHOT_RETENTION_WARN') || 400);
    if (completedBatchCount > snapshotWarn) {
      issues.push({
        kind: 'snapshot_retention',
        severity: 'info',
        messageRu: `История импортов: ${completedBatchCount} batch (рекомендуется архив > ${snapshotWarn})`,
      });
    }

    return {
      generatedAt: new Date().toISOString(),
      ok: criticalCount === 0 && stuckBatches.length === 0,
      staleThresholdHours: staleHours,
      regions: {
        enabled: importableRegions.length,
        stale: staleRegions.map((r) => ({
          code: r.code,
          name: r.name,
          lastImportedAt: r.lastImportedAt,
        })),
        health: regionHealth,
      },
      batches: {
        running: runningBatches.length,
        stuck: stuckBatches.map((b) => ({
          id: b.id,
          regionCode: b.region.code,
          startedAt: b.startedAt,
        })),
        failedLast24h,
        incompleteLast24h: incompleteImports.length,
      },
      dataIntegrity: {
        orphanApartments,
        duplicateExternalIdGroups: duplicateRows.map((r) => ({
          regionId: r.region_id,
          externalId: r.external_id,
          count: Number(r.cnt),
        })),
      },
      queue,
      issues,
      governance: {
        cronPattern,
        cronTz,
        cronDisabled,
        weeklyOnlyPolicy: cronPattern.includes('* * 1') || cronPattern.includes('* * 0'),
        overlapProtection: true,
        degradedQuarantine: true,
        markSoldMinRatio: Number(this.config.get('FEED_MARK_SOLD_MIN_RATIO') || 0.85),
        integrityMinScore,
        degradedImportsLast7d: degradedLast7d,
        legacyShellCron: 'deploy/cron-feed-import.sh (emergency fallback only — remove duplicate 6h crons)',
      },
      recentIncomplete: incompleteImports.slice(0, 5).map((b) => ({
        batchId: b.id,
        regionCode: b.region?.code ?? null,
        finishedAt: b.finishedAt,
        errorCount: Array.isArray((b.stats as Record<string, unknown> | null)?.errors)
          ? ((b.stats as { errors: string[] }).errors.length)
          : 0,
      })),
    };
  }
}

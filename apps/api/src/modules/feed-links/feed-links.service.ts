import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { gunzipSync } from 'node:zlib';
import { isIP } from 'node:net';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateFeedLinkDto } from './dto/create-feed-link.dto';
import { UpdateFeedLinkDto } from './dto/update-feed-link.dto';
import { MarkFeedSyncedDto } from './dto/mark-feed-synced.dto';

const FEED_LINK_INCLUDE = {
  region: { select: { id: true, code: true, name: true } },
} as const;

@Injectable()
export class FeedLinksService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllAdmin(opts?: { regionId?: number; enabledOnly?: boolean }) {
    return this.prisma.feedLink.findMany({
      where: {
        ...(opts?.regionId ? { regionId: opts.regionId } : {}),
        ...(opts?.enabledOnly ? { isEnabled: true } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      include: FEED_LINK_INCLUDE,
    });
  }

  async findOne(id: number) {
    const row = await this.prisma.feedLink.findUnique({
      where: { id },
      include: FEED_LINK_INCLUDE,
    });
    if (!row) throw new NotFoundException('Фид не найден');
    return row;
  }

  async createAdmin(dto: CreateFeedLinkDto) {
    await this.assertRegion(dto.regionId);
    const name = dto.name.trim();
    const feedUrl = dto.feedUrl.trim();
    if (!name) throw new BadRequestException('Название не может быть пустым');
    if (!feedUrl) throw new BadRequestException('URL фида не может быть пустым');
    this.assertFeedUrl(feedUrl);

    try {
      return await this.prisma.feedLink.create({
        data: {
          regionId: dto.regionId,
          name,
          feedUrl,
          blockName: dto.blockName?.trim() || null,
          provider: dto.provider?.trim() || 'profitbase',
          isEnabled: dto.isEnabled ?? true,
          sortOrder: dto.sortOrder ?? 0,
          mediaMode: dto.mediaMode ?? 'remote',
        },
        include: FEED_LINK_INCLUDE,
      });
    } catch (err: unknown) {
      if (this.isUniqueViolation(err)) {
        throw new ConflictException('Фид с таким URL уже существует');
      }
      throw err;
    }
  }

  async updateAdmin(id: number, dto: UpdateFeedLinkDto) {
    await this.findOne(id);
    if (dto.regionId !== undefined) await this.assertRegion(dto.regionId);

    const data: Record<string, unknown> = {};
    if (dto.regionId !== undefined) data.regionId = dto.regionId;
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('Название не может быть пустым');
      data.name = name;
    }
    if (dto.feedUrl !== undefined) {
      const feedUrl = dto.feedUrl.trim();
      if (!feedUrl) throw new BadRequestException('URL фида не может быть пустым');
      this.assertFeedUrl(feedUrl);
      data.feedUrl = feedUrl;
    }
    if (dto.blockName !== undefined) data.blockName = dto.blockName?.trim() || null;
    if (dto.provider !== undefined) data.provider = dto.provider.trim() || 'profitbase';
    if (dto.isEnabled !== undefined) data.isEnabled = dto.isEnabled;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.mediaMode !== undefined) data.mediaMode = dto.mediaMode;

    try {
      return await this.prisma.feedLink.update({
        where: { id },
        data,
        include: FEED_LINK_INCLUDE,
      });
    } catch (err: unknown) {
      if (this.isUniqueViolation(err)) {
        throw new ConflictException('Фид с таким URL уже существует');
      }
      throw err;
    }
  }

  async deleteAdmin(id: number) {
    await this.findOne(id);
    await this.prisma.feedLink.delete({ where: { id } });
  }

  async markSynced(id: number, stats?: MarkFeedSyncedDto) {
    await this.findOne(id);
    return this.prisma.feedLink.update({
      where: { id },
      data: {
        lastSyncedAt: new Date(),
        ...(stats?.status !== undefined ? { lastSyncStatus: stats.status } : {}),
        ...(stats?.total !== undefined ? { lastSyncTotal: stats.total } : {}),
        ...(stats?.created !== undefined ? { lastSyncCreated: stats.created } : {}),
        ...(stats?.updated !== undefined ? { lastSyncUpdated: stats.updated } : {}),
        ...(stats?.errors !== undefined ? { lastSyncErrors: stats.errors } : {}),
        // Успешный прогон стирает старую ошибку
        ...(stats?.errorMessage !== undefined
          ? { lastSyncError: stats.errorMessage.slice(0, 1000) || null }
          : stats?.status === 'ok' || stats?.status === 'empty'
            ? { lastSyncError: null }
            : {}),
      },
      include: FEED_LINK_INCLUDE,
    });
  }

  async probe(id: number) {
    const link = await this.findOne(id);
    const started = Date.now();
    let res: Response;
    try {
      res = await fetch(link.feedUrl, { signal: AbortSignal.timeout(60_000) });
    } catch (err) {
      return {
        ok: false,
        httpStatus: 0,
        offerCount: 0,
        durationMs: Date.now() - started,
        error: `Источник не отвечает: ${err instanceof Error ? (err.cause as Error | undefined)?.message ?? err.message : 'ошибка сети'}`,
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        httpStatus: res.status,
        offerCount: 0,
        durationMs: Date.now() - started,
        error: `HTTP ${res.status}`,
      };
    }
    let buf = Buffer.from(await res.arrayBuffer());
    // Profitbase отдаёт выгрузку ЦИАН gzip-файлом без Content-Encoding
    if (buf[0] === 0x1f && buf[1] === 0x8b) buf = gunzipSync(buf);
    const xml = buf.toString('utf8');
    const { format, count } = FeedLinksService.countLots(xml);
    return {
      ok: count > 0,
      httpStatus: res.status,
      offerCount: count,
      format,
      durationMs: Date.now() - started,
      bytes: buf.length,
      ...(count > 0 ? {} : { error: 'В файле нет лотов или формат не распознан' }),
    };
  }

  /** Число лотов в выгрузке: Profitbase/JCAT — <offer>, ЦИАН — <object>, ДомКлик — <flat> */
  static countLots(xml: string): { format: string; count: number } {
    const offers = (xml.match(/<offer[\s>]/g) ?? []).length;
    if (offers > 0) return { format: /<realty-feed/i.test(xml.slice(0, 2000)) ? 'profitbase/jcat' : 'xml', count: offers };
    const objects = (xml.match(/<object[\s>]/g) ?? []).length;
    if (objects > 0) return { format: 'cian', count: objects };
    const flats = (xml.match(/<flat[\s>]/g) ?? []).length;
    if (flats > 0) return { format: 'domclick', count: flats };
    return { format: 'unknown', count: 0 };
  }

  private async assertRegion(regionId: number) {
    const region = await this.prisma.feedRegion.findUnique({ where: { id: regionId } });
    if (!region) throw new NotFoundException('Регион не найден');
  }

  private assertFeedUrl(url: string) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException('Некорректный URL фида');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new BadRequestException('URL фида должен начинаться с http:// или https://');
    }
    // Сервер сам скачивает фид — внутренние адреса запрещены, иначе через форму можно опросить локальные службы
    if (FeedLinksService.isPrivateHost(parsed.hostname)) {
      throw new BadRequestException('URL фида должен вести на внешний сайт');
    }
  }

  static isPrivateHost(hostname: string): boolean {
    const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
    if (isIP(h) === 4) {
      const [a, b] = h.split('.').map(Number);
      return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
    }
    if (isIP(h) === 6) return h === '::1' || h === '::' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80') || h.startsWith('::ffff:');
    return false;
  }

  private isUniqueViolation(err: unknown) {
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    );
  }
}

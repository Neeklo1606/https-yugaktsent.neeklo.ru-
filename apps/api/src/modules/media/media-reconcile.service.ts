import { existsSync, mkdirSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isLocalMediaUrl } from '../../common/listing-media-urls.util';
import { resolveMediaRoot } from '../../common/media-storage.util';
import { PrismaService } from '../../prisma/prisma.service';
import { MediaService } from './media.service';

export type BrokenListingRef = {
  listingId: number;
  kind: string;
  missingUrls: string[];
};

export type MediaReconcileReport = {
  scannedAt: string;
  mediaRoot: string;
  storage: Awaited<ReturnType<MediaService['getStorageHealth']>>;
  dbMediaFiles: number;
  dbMissingOnDisk: number;
  listingLocalRefs: number;
  listingMissingFiles: number;
  brokenListings: BrokenListingRef[];
  remotePhotoListings: number;
};

@Injectable()
export class MediaReconcileService {
  private readonly log = new Logger(MediaReconcileService.name);
  private readonly mediaRoot: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    config: ConfigService,
  ) {
    this.mediaRoot = resolveMediaRoot(config.get<string>('MEDIA_ROOT'));
  }

  fileExists(url: string): boolean {
    try {
      const disk = this.media.diskPathFromPublicUrl(url);
      return existsSync(disk);
    } catch {
      return false;
    }
  }

  /** Scan manual listing photo fields that reference local `/uploads/media/`. */
  async scanBrokenListingRefs(limit = 100): Promise<BrokenListingRef[]> {
    const broken: BrokenListingRef[] = [];

    const houses = await this.prisma.listingHouse.findMany({
      where: {
        OR: [
          { photoUrl: { startsWith: '/uploads/media/' } },
          { photoUrl: { startsWith: 'http' } },
        ],
      },
      include: { listing: { select: { kind: true } } },
      take: limit * 4,
    });

    for (const row of houses) {
      const urls: string[] = [];
      if (row.photoUrl && isLocalMediaUrl(row.photoUrl)) urls.push(row.photoUrl);
      const extras = row.extraPhotoUrls;
      if (Array.isArray(extras)) {
        for (const u of extras) {
          if (typeof u === 'string' && isLocalMediaUrl(u)) urls.push(u);
        }
      }
      const missing = [...new Set(urls)].filter((u) => !this.fileExists(u));
      if (missing.length) {
        broken.push({
          listingId: row.listingId,
          kind: row.listing.kind,
          missingUrls: missing,
        });
      }
      if (broken.length >= limit) break;
    }

    return broken;
  }

  async buildReport(listingSample = 50): Promise<MediaReconcileReport> {
    const [storage, dbMediaFiles, integrity, brokenListings, remotePhotoListings] =
      await Promise.all([
        this.media.getStorageHealth(),
        this.prisma.mediaFile.count(),
        this.media.getIntegritySnapshot(200),
        this.scanBrokenListingRefs(listingSample),
        this.prisma.listingHouse.count({
          where: { photoUrl: { startsWith: 'http' } },
        }),
      ]);

    const listingLocalRefs = brokenListings.reduce((n, b) => n + b.missingUrls.length, 0);

    return {
      scannedAt: new Date().toISOString(),
      mediaRoot: this.mediaRoot,
      storage,
      dbMediaFiles,
      dbMissingOnDisk: integrity.missingOnDisk,
      listingLocalRefs,
      listingMissingFiles: listingLocalRefs,
      brokenListings,
      remotePhotoListings,
    };
  }

  /**
   * Re-download remote `http(s)` house photos into persistent storage and rewrite DB URLs.
   * Does not recover wizard uploads that only ever existed on disk.
   */
  async rehydrateRemoteHousePhotos(limit = 20): Promise<{
    attempted: number;
    updated: number;
    failed: number;
  }> {
    const rows = await this.prisma.listingHouse.findMany({
      where: { photoUrl: { startsWith: 'http' } },
      take: limit,
      select: { listingId: true, photoUrl: true, extraPhotoUrls: true },
    });

    let updated = 0;
    let failed = 0;

    for (const row of rows) {
      const attempted = await this.rehydrateOneHouse(row.listingId, row.photoUrl, row.extraPhotoUrls);
      if (attempted.ok) updated += 1;
      else failed += 1;
    }

    return { attempted: rows.length, updated, failed };
  }

  private async rehydrateOneHouse(
    listingId: number,
    mainUrl: string | null,
    extras: unknown,
  ): Promise<{ ok: boolean }> {
    try {
      const newMain = mainUrl?.startsWith('http') ? await this.downloadToMedia(mainUrl) : null;
      const extraList = Array.isArray(extras) ? extras.filter((u): u is string => typeof u === 'string') : [];
      const newExtras: string[] = [];
      for (const url of extraList) {
        if (!url.startsWith('http')) {
          newExtras.push(url);
          continue;
        }
        const local = await this.downloadToMedia(url);
        if (local) newExtras.push(local);
      }

      if (!newMain && newExtras.length === 0) return { ok: false };

      await this.prisma.listingHouse.update({
        where: { listingId },
        data: {
          ...(newMain ? { photoUrl: newMain } : {}),
          ...(newExtras.length ? { extraPhotoUrls: newExtras } : {}),
        },
      });
      return { ok: true };
    } catch (e) {
      this.log.warn(
        `rehydrate house ${listingId}: ${e instanceof Error ? e.message : String(e)}`,
      );
      return { ok: false };
    }
  }

  private async downloadToMedia(remoteUrl: string): Promise<string | null> {
    const res = await fetch(remoteUrl, {
      signal: AbortSignal.timeout(30_000),
      headers: { 'User-Agent': 'YugAktsent-MediaReconcile/1.0' },
    });
    if (!res.ok) return null;

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 64) return null;

    const ct = res.headers.get('content-type') ?? 'image/jpeg';
    const ext =
      ct.includes('png') ? '.png' : ct.includes('webp') ? '.webp' : ct.includes('gif') ? '.gif' : '.jpg';
    const fname = `${randomUUID()}${ext}`;
    const publicUrl = `/uploads/media/${fname}`;
    const disk = this.media.diskPathFromPublicUrl(publicUrl);
    mkdirSync(dirname(disk), { recursive: true });
    await fs.writeFile(disk, buf);
    return publicUrl;
  }
}

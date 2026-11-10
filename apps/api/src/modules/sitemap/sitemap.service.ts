import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ListingKind, ListingStatus, ListingVisibility } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  SitemapChunkMeta,
  SitemapGenerationReport,
  SitemapMetrics,
  SitemapUrlEntry,
} from './sitemap.types';

const STATE_FILENAME = 'sitemap-state.json';

const PUBLIC_LISTING_WHERE = {
  visibility: ListingVisibility.PUBLIC,
  isPublished: true,
  status: { in: [ListingStatus.ACTIVE, ListingStatus.RESERVED] as ListingStatus[] },
};

@Injectable()
export class SitemapService {
  private readonly logger = new Logger(SitemapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  getSiteUrl(): string {
    return (
      this.config.get<string>('PUBLIC_SITE_URL') ||
      this.config.get<string>('VITE_PUBLIC_SITE_URL') ||
      'https://yugaktsent.neeklo.ru'
    ).replace(/\/+$/, '');
  }

  getOutputDir(): string {
    const configured = this.config.get<string>('SITEMAP_OUTPUT_DIR');
    if (configured?.trim()) return configured.trim();
    return join(process.cwd(), 'sitemaps');
  }

  getChunkSize(): number {
    const n = Number(this.config.get('SITEMAP_CHUNK_SIZE') || 5000);
    return Math.max(500, Math.min(50_000, n));
  }

  getMetrics(): SitemapMetrics {
    const outputDir = this.getOutputDir();
    const siteUrl = this.getSiteUrl();
    const indexUrl = `${siteUrl}/api/v1/sitemap/sitemap-index.xml`;
    let lastGeneration: SitemapGenerationReport | null = null;
    let chunkFiles: string[] = [];

    const statePath = join(outputDir, STATE_FILENAME);
    if (existsSync(statePath)) {
      try {
        lastGeneration = JSON.parse(readFileSync(statePath, 'utf8')) as SitemapGenerationReport;
      } catch {
        lastGeneration = null;
      }
    }

    if (existsSync(outputDir)) {
      chunkFiles = readdirSync(outputDir)
        .filter((f) => f.endsWith('.xml') && f !== 'sitemap-index.xml')
        .sort();
    }

    return {
      lastGeneration,
      outputDir,
      siteUrl,
      indexUrl,
      chunkFiles,
      totalUrls: lastGeneration?.counts.total ?? null,
    };
  }

  readFileForServe(filename: string, acceptGzip: boolean): { body: Buffer; contentType: string; encoding?: string } {
    const safe = this.sanitizeFilename(filename);
    const outputDir = this.getOutputDir();
    const gzipPath = join(outputDir, `${safe}.gz`);
    const xmlPath = join(outputDir, safe);

    if (acceptGzip && existsSync(gzipPath)) {
      return {
        body: readFileSync(gzipPath),
        contentType: 'application/xml',
        encoding: 'gzip',
      };
    }
    if (existsSync(xmlPath)) {
      return { body: readFileSync(xmlPath), contentType: 'application/xml' };
    }
    throw new NotFoundException(`Sitemap file not found: ${safe}`);
  }

  async generateAll(reason = 'manual'): Promise<SitemapGenerationReport> {
    const started = Date.now();
    const siteUrl = this.getSiteUrl();
    const outputDir = this.getOutputDir();
    const chunkSize = this.getChunkSize();
    const writeGzip = this.config.get('SITEMAP_GZIP') !== 'false';

    mkdirSync(outputDir, { recursive: true });
    this.cleanOldChunks(outputDir);

    const chunks: SitemapChunkMeta[] = [];
    const indexEntries: SitemapUrlEntry[] = [];

    const staticUrls = this.staticPageUrls(siteUrl);
    const staticChunk = this.writeUrlset(outputDir, 'static-pages.xml', staticUrls, writeGzip);
    chunks.push(staticChunk);
    indexEntries.push({ loc: `${siteUrl}/api/v1/sitemap/${staticChunk.filename}` });

    const complexResult = await this.generateComplexChunks(outputDir, siteUrl, chunkSize, writeGzip);
    chunks.push(...complexResult.chunks);
    indexEntries.push(...complexResult.indexEntries);

    const apartmentResult = await this.generateApartmentChunks(outputDir, siteUrl, chunkSize, writeGzip);
    chunks.push(...apartmentResult.chunks);
    indexEntries.push(...apartmentResult.indexEntries);

    const listingResult = await this.generateListingChunks(outputDir, siteUrl, chunkSize, writeGzip);
    chunks.push(...listingResult.chunks);
    indexEntries.push(...listingResult.indexEntries);

    const indexXml = this.buildSitemapIndex(indexEntries);
    const indexPath = join(outputDir, 'sitemap-index.xml');
    writeFileSync(indexPath, indexXml, 'utf8');
    if (writeGzip) {
      writeFileSync(`${indexPath}.gz`, gzipSync(Buffer.from(indexXml, 'utf8')));
    }

    this.writeRobotsHint(outputDir, siteUrl);

    const report: SitemapGenerationReport = {
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      siteUrl,
      outputDir,
      reason,
      chunks,
      counts: {
        static: staticUrls.length,
        complexes: complexResult.total,
        apartments: apartmentResult.total,
        listings: listingResult.total,
        total:
          staticUrls.length +
          complexResult.total +
          apartmentResult.total +
          listingResult.total,
      },
      indexFile: 'sitemap-index.xml',
    };

    writeFileSync(join(outputDir, STATE_FILENAME), JSON.stringify(report, null, 2), 'utf8');
    this.logger.log(
      `Sitemap generated: ${report.counts.total} URLs in ${report.durationMs}ms (${chunks.length} chunks)`,
    );
    return report;
  }

  private sanitizeFilename(name: string): string {
    const base = name.replace(/\\/g, '/').split('/').pop() ?? name;
    if (!/^[a-z0-9._-]+\.xml$/i.test(base)) {
      throw new NotFoundException('Invalid sitemap filename');
    }
    return base;
  }

  private cleanOldChunks(outputDir: string): void {
    if (!existsSync(outputDir)) return;
    for (const f of readdirSync(outputDir)) {
      if (
        f.endsWith('.xml') ||
        f.endsWith('.xml.gz') ||
        f.endsWith('.gz') ||
        f === STATE_FILENAME ||
        f === 'robots-sitemap.txt'
      ) {
        try {
          unlinkSync(join(outputDir, f));
        } catch {
          /* ignore */
        }
      }
    }
  }

  private staticPageUrls(siteUrl: string): SitemapUrlEntry[] {
    const paths = [
      '/',
      '/catalog',
      '/catalog/apartments',
      '/catalog/houses',
      '/catalog/land',
      '/catalog/commercial',
      '/map',
      '/belgorod',
      '/news',
      '/contacts',
      '/about',
      '/privacy',
    ];
    return paths.map((p) => ({
      loc: `${siteUrl}${p}`,
      changefreq: p === '/' ? 'daily' : 'weekly',
      priority: p === '/' ? '1.0' : p === '/belgorod' ? '0.75' : '0.7',
    }));
  }

  private async generateComplexChunks(
    outputDir: string,
    siteUrl: string,
    chunkSize: number,
    writeGzip: boolean,
  ): Promise<{ chunks: SitemapChunkMeta[]; indexEntries: SitemapUrlEntry[]; total: number }> {
    const listingWhere = {
      ...PUBLIC_LISTING_WHERE,
      kind: ListingKind.APARTMENT,
    };

    const allRows = await this.prisma.block.findMany({
      where: {
        slug: { not: '' },
        listings: { some: listingWhere },
      },
      select: {
        id: true,
        slug: true,
        updatedAt: true,
        _count: { select: { listings: { where: listingWhere } } },
      },
    });

    allRows.sort((a, b) => {
      const diff = b._count.listings - a._count.listings;
      return diff !== 0 ? diff : a.id - b.id;
    });

    const chunks: SitemapChunkMeta[] = [];
    const indexEntries: SitemapUrlEntry[] = [];
    let total = 0;
    let chunkIndex = 0;

    for (let offset = 0; offset < allRows.length; offset += chunkSize) {
      const slice = allRows.slice(offset, offset + chunkSize);
      const urls: SitemapUrlEntry[] = slice.map((b) => {
        const count = b._count.listings;
        const priority = count >= 100 ? '0.9' : count >= 20 ? '0.85' : '0.8';
        return {
          loc: `${siteUrl}/complex/${encodeURIComponent(b.slug)}`,
          lastmod: b.updatedAt.toISOString().slice(0, 10),
          changefreq: 'weekly' as const,
          priority,
        };
      });

      chunkIndex += 1;
      const filename = `complexes-${chunkIndex}.xml`;
      chunks.push(this.writeUrlset(outputDir, filename, urls, writeGzip));
      indexEntries.push({ loc: `${siteUrl}/api/v1/sitemap/${filename}` });
      total += urls.length;
    }

    return { chunks, indexEntries, total };
  }

  private async generateApartmentChunks(
    outputDir: string,
    siteUrl: string,
    chunkSize: number,
    writeGzip: boolean,
  ): Promise<{ chunks: SitemapChunkMeta[]; indexEntries: SitemapUrlEntry[]; total: number }> {
    const chunks: SitemapChunkMeta[] = [];
    const indexEntries: SitemapUrlEntry[] = [];
    let total = 0;
    let chunkIndex = 0;
    let cursor = 0;

    while (true) {
      const rows = await this.prisma.listing.findMany({
        where: {
          ...(cursor > 0 ? { id: { gt: cursor } } : {}),
          ...PUBLIC_LISTING_WHERE,
          kind: ListingKind.APARTMENT,
          blockId: { not: null },
        },
        select: { id: true, updatedAt: true },
        orderBy: { id: 'asc' },
        take: chunkSize,
      });
      if (!rows.length) break;

      const urls: SitemapUrlEntry[] = rows.map((l) => ({
        loc: `${siteUrl}/apartment/${l.id}`,
        lastmod: l.updatedAt.toISOString().slice(0, 10),
        changefreq: 'daily',
        priority: '0.8',
      }));

      chunkIndex += 1;
      const filename = `apartments-${chunkIndex}.xml`;
      chunks.push(this.writeUrlset(outputDir, filename, urls, writeGzip));
      indexEntries.push({ loc: `${siteUrl}/api/v1/sitemap/${filename}` });
      total += urls.length;
      cursor = rows[rows.length - 1].id;
      if (rows.length < chunkSize) break;
    }

    return { chunks, indexEntries, total };
  }

  private async generateListingChunks(
    outputDir: string,
    siteUrl: string,
    chunkSize: number,
    writeGzip: boolean,
  ): Promise<{ chunks: SitemapChunkMeta[]; indexEntries: SitemapUrlEntry[]; total: number }> {
    const chunks: SitemapChunkMeta[] = [];
    const indexEntries: SitemapUrlEntry[] = [];
    let total = 0;
    let chunkIndex = 0;
    let cursor = 0;

    while (true) {
      const rows = await this.prisma.listing.findMany({
        where: {
          ...(cursor > 0 ? { id: { gt: cursor } } : {}),
          ...PUBLIC_LISTING_WHERE,
          kind: { not: ListingKind.APARTMENT },
        },
        select: { id: true, updatedAt: true },
        orderBy: { id: 'asc' },
        take: chunkSize,
      });
      if (!rows.length) break;

      const urls: SitemapUrlEntry[] = rows.map((l) => ({
        loc: `${siteUrl}/listing/${l.id}`,
        lastmod: l.updatedAt.toISOString().slice(0, 10),
        changefreq: 'weekly',
        priority: '0.75',
      }));

      chunkIndex += 1;
      const filename = `listings-${chunkIndex}.xml`;
      chunks.push(this.writeUrlset(outputDir, filename, urls, writeGzip));
      indexEntries.push({ loc: `${siteUrl}/api/v1/sitemap/${filename}` });
      total += urls.length;
      cursor = rows[rows.length - 1].id;
      if (rows.length < chunkSize) break;
    }

    return { chunks, indexEntries, total };
  }

  private writeUrlset(
    outputDir: string,
    filename: string,
    urls: SitemapUrlEntry[],
    writeGzip: boolean,
  ): SitemapChunkMeta {
    const xml = this.buildUrlset(urls);
    const xmlPath = join(outputDir, filename);
    writeFileSync(xmlPath, xml, 'utf8');
    const xmlBytes = Buffer.byteLength(xml, 'utf8');
    let gzipBytes: number | undefined;
    if (writeGzip) {
      const gz = gzipSync(Buffer.from(xml, 'utf8'));
      writeFileSync(`${xmlPath}.gz`, gz);
      gzipBytes = gz.length;
    }
    return { filename, urlCount: urls.length, xmlBytes, gzipBytes };
  }

  private buildUrlset(urls: SitemapUrlEntry[]): string {
    const body = urls
      .map((u) => {
        const parts = [`    <loc>${this.escapeXml(u.loc)}</loc>`];
        if (u.lastmod) parts.push(`    <lastmod>${u.lastmod}</lastmod>`);
        if (u.changefreq) parts.push(`    <changefreq>${u.changefreq}</changefreq>`);
        if (u.priority) parts.push(`    <priority>${u.priority}</priority>`);
        return `  <url>\n${parts.join('\n')}\n  </url>`;
      })
      .join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
  }

  private buildSitemapIndex(entries: SitemapUrlEntry[]): string {
    const body = entries
      .map(
        (e) => `  <sitemap>
    <loc>${this.escapeXml(e.loc)}</loc>
  </sitemap>`,
      )
      .join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</sitemapindex>
`;
  }

  private writeRobotsHint(outputDir: string, siteUrl: string): void {
    const indexUrl = `${siteUrl}/api/v1/sitemap/sitemap-index.xml`;
    writeFileSync(
      join(outputDir, 'robots-sitemap.txt'),
      `Sitemap: ${indexUrl}\n`,
      'utf8',
    );
  }

  private escapeXml(s: string): string {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

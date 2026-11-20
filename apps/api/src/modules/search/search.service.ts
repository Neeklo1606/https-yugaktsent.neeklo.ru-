import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BlocksService } from '../blocks/blocks.service';
import { QueryBlocksDto } from '../blocks/dto/query-blocks.dto';
import { CatalogMeilisearchService } from '../meilisearch/catalog-meilisearch.service';
import { isGenericComplexQuery, normalizeSearchQuery, searchQueryVariants } from '../../common/search-query.util';

export type CatalogHintsResult = {
  complexes: Array<{
    id: number;
    slug: string;
    name: string;
    districtName: string | null;
    metroName: string | null;
    imageUrl: string | null;
  }>;
  metro: Array<{ id: number; name: string }>;
  districts: Array<{ id: number; name: string }>;
  streets: Array<{
    address: string;
    blockId: number;
    blockSlug: string;
    blockName: string;
  }>;
};

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blocks: BlocksService,
    private readonly catalogSearch: CatalogMeilisearchService,
  ) {}

  async catalogHints(regionId: number, rawQ: string, limit = 15): Promise<CatalogHintsResult> {
    const q = normalizeSearchQuery(rawQ);
    const take = Math.min(Math.max(limit, 1), 30);
    if (isGenericComplexQuery(rawQ)) {
      return { complexes: await this.listRegionComplexes(regionId, take), metro: [], districts: [], streets: [] };
    }
    if (q.length < 2) {
      return { complexes: [], metro: [], districts: [], streets: [] };
    }

    const queryDto: QueryBlocksDto = {
      region_id: regionId,
      search: q,
      page: 1,
      per_page: take,
      require_active_listings: true,
    };

    const select = {
      id: true,
      slug: true,
      name: true,
      district: { select: { name: true } },
      images: { orderBy: { sortOrder: 'asc' as const }, take: 1, select: { url: true } },
      subways: {
        orderBy: { distanceTime: 'asc' as const },
        take: 1,
        select: { subway: { select: { name: true } } },
      },
    } as const;

    let complexRows: Array<{
      id: number;
      slug: string;
      name: string;
      district: { name: string } | null;
      images: Array<{ url: string }>;
      subways: Array<{ subway: { name: string } }>;
    }> = [];

    const useMeili = this.catalogSearch.isEnabled();
    const meiliIds = useMeili ? await this.catalogSearch.searchBlockIds(regionId, q, take * 4) : null;

    if (useMeili && meiliIds !== null) {
      const { where, noMatch } = await this.blocks.buildCatalogBlockWhere({ ...queryDto, search: undefined });
      if (!noMatch && meiliIds.length > 0) {
        const rows = await this.prisma.block.findMany({
          where: { AND: [where, { id: { in: meiliIds } }] },
          take: take * 4,
          orderBy: { name: 'asc' },
          select,
        });
        const rank = new Map(meiliIds.map((id, i) => [id, i]));
        complexRows = [...rows]
          .sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999))
          .slice(0, take);
      }
    } else {
      const { where, noMatch } = await this.blocks.buildCatalogBlockWhere(queryDto);
      if (!noMatch) {
        complexRows = await this.prisma.block.findMany({
          where,
          take,
          orderBy: { name: 'asc' },
          select,
        });
      }
    }

    const [metroRows, districtRows, addressRows] = await Promise.all([
      this.prisma.subway.findMany({
        where: {
          regionId,
          OR: searchQueryVariants(q).map((variant) => ({
            name: { contains: variant, mode: 'insensitive' as const },
          })),
        },
        select: { id: true, name: true },
        take,
        orderBy: { name: 'asc' },
      }),
      this.prisma.district.findMany({
        where: {
          regionId,
          OR: searchQueryVariants(q).map((variant) => ({
            name: { contains: variant, mode: 'insensitive' as const },
          })),
        },
        select: { id: true, name: true },
        take,
        orderBy: { name: 'asc' },
      }),
      this.prisma.blockAddress.findMany({
        where: {
          address: { contains: q, mode: 'insensitive' },
          block: { regionId },
        },
        take: take * 3,
        select: {
          address: true,
          block: { select: { id: true, slug: true, name: true } },
        },
      }),
    ]);

    const seenAddr = new Set<string>();
    const streets: CatalogHintsResult['streets'] = [];
    const normalizeAddr = (a: string) => a.trim().replace(/\s+/g, ' ').toLowerCase();
    for (const r of addressRows) {
      const key = normalizeAddr(r.address);
      if (seenAddr.has(key)) continue;
      seenAddr.add(key);
      streets.push({
        address: r.address,
        blockId: r.block.id,
        blockSlug: r.block.slug,
        blockName: r.block.name,
      });
      if (streets.length >= take) break;
    }

    return {
      complexes: complexRows.map((b) => ({
        id: b.id,
        slug: b.slug,
        name: b.name,
        districtName: b.district?.name ?? null,
        metroName: b.subways[0]?.subway.name ?? null,
        imageUrl: b.images[0]?.url ?? null,
      })),
      metro: metroRows,
      districts: districtRows,
      streets,
    };
  }

  /** Все ЖК региона с продающимися лотами — ответ на «жк», «новостройки». */
  private async listRegionComplexes(regionId: number, take: number): Promise<CatalogHintsResult['complexes']> {
    const { where, noMatch } = await this.blocks.buildCatalogBlockWhere({
      region_id: regionId,
      page: 1,
      per_page: take,
      require_active_listings: true,
    });
    if (noMatch) return [];
    const rows = await this.prisma.block.findMany({
      where,
      take,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        slug: true,
        name: true,
        district: { select: { name: true } },
        images: { orderBy: { sortOrder: 'asc' as const }, take: 1, select: { url: true } },
        subways: { orderBy: { distanceTime: 'asc' as const }, take: 1, select: { subway: { select: { name: true } } } },
      },
    });
    return rows.map((b) => ({
      id: b.id,
      slug: b.slug,
      name: b.name,
      districtName: b.district?.name ?? null,
      metroName: b.subways[0]?.subway.name ?? null,
      imageUrl: b.images[0]?.url ?? null,
    }));
  }
}

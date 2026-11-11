import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  BlockStatus,
  DataSource,
  ListingKind,
  ListingStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { QueryBlocksDto } from './dto/query-blocks.dto';
import { CreateBlockDto } from './dto/create-block.dto';
import { catalogBlockWhereToSql } from './catalog-block-where-sql';
import { CacheService } from '../../common/cache/cache.service';
import { GeoSpatialService } from '../geo/geo-spatial.service';
import { CatalogMeilisearchService } from '../meilisearch/catalog-meilisearch.service';
import { normalizeSearchQuery } from '../../common/search-query.util';
import {
  buildBlockChessboardResponse,
  CHESSBOARD_LISTING_KIND,
  CHESSBOARD_LISTING_STATUSES,
} from './blocks-chessboard.util';
import type { ChessboardBlockResponse } from '@lg/shared';

type BlockPublicDetailPayload = Prisma.BlockGetPayload<{
  include: {
    region: true;
    district: true;
    builder: true;
    addresses: true;
    images: true;
    subways: { include: { subway: true } };
    buildings: { include: { buildingType: true; addresses: true } };
  };
}>;

type PublicBlockDetail = BlockPublicDetailPayload & {
  _count: { listings: number };
  listingPriceMin: number | null;
  listingPriceMax: number | null;
};

function intersectBlockIdFilter(current: Prisma.BlockWhereInput['id'], ids: number[]): number[] {
  if (!current || typeof current !== 'object' || !('in' in current)) {
    return ids;
  }
  const existing = (current as { in: number[] }).in;
  if (!Array.isArray(existing) || existing.length === 0) return ids;
  const s = new Set(ids);
  return existing.filter((id) => s.has(id));
}

const PUBLIC_LISTING_STATUSES = [ListingStatus.ACTIVE, ListingStatus.RESERVED] as const;

/** Любой опубликованный тип объявления (коттеджи/дома в apartments.json импортируются как HOUSE). */
const PUBLIC_CATALOG_LISTING_KINDS: ListingKind[] = [
  ListingKind.APARTMENT,
  ListingKind.HOUSE,
  ListingKind.LAND,
  ListingKind.COMMERCIAL,
  ListingKind.PARKING,
];

function parseDeadlineFilterTokens(deadlineRaw: string): Array<{ kind: 'year' | 'month' | 'quarter' | 'completed' | 'exact'; value: string }> {
  return deadlineRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((v) => {
      const low = v.toLowerCase();
      if (low === 'сдан') return { kind: 'completed' as const, value: v };
      if (/^\d{4}$/.test(v)) return { kind: 'year' as const, value: v };
      if (/^\d{4}\s+\d{2}$/.test(v)) return { kind: 'month' as const, value: v };
      if (/^Q[1-4]\s+\d{4}$/i.test(v)) return { kind: 'quarter' as const, value: v.toUpperCase() };
      if (/^\d{4}\s+Q[1-4]$/i.test(v)) {
        const parts = v.toUpperCase().split(/\s+/);
        return { kind: 'quarter' as const, value: `${parts[1]} ${parts[0]}` };
      }
      if (/^[кk][1-4]\s+\d{4}$/i.test(v)) {
        const parts = v.toUpperCase().replace('К','K').split(/\s+/);
        return { kind: 'quarter' as const, value: `${parts[0].replace('K','Q')} ${parts[1]}` };
      }
      if (/^\d{4}\s+[кk][1-4]$/i.test(v)) {
        const parts = v.toUpperCase().replace('К','K').split(/\s+/);
        return { kind: 'quarter' as const, value: `${parts[1].replace('K','Q')} ${parts[0]}` };
      }
      return { kind: 'exact' as const, value: v };
    });
}
@Injectable()
export class BlocksService {
  private readonly logger = new Logger(BlocksService.name);
  private catalogMvAvailable: boolean | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly geo: GeoSpatialService,
    private readonly catalogSearch: CatalogMeilisearchService,
  ) {}


  private buildDeadlineWhere(deadlineRaw: string): Prisma.BlockWhereInput | null {
    const tokens = parseDeadlineFilterTokens(deadlineRaw);
    if (tokens.length === 0) return null;

    const ors: Prisma.BlockWhereInput[] = [];

    for (const t of tokens) {
      if (t.kind === 'completed') {
        ors.push({ status: BlockStatus.COMPLETED });
        continue;
      }
      if (t.kind === 'year') {
        const y = Number.parseInt(t.value, 10);
        if (Number.isFinite(y)) {
          const from = new Date(Date.UTC(y, 0, 1, 0, 0, 0));
          const to = new Date(Date.UTC(y + 1, 0, 1, 0, 0, 0));
          ors.push({ buildings: { some: { deadlineKey: { gte: from, lt: to } } } });
        }
        continue;
      }
      if (t.kind === 'month') {
        const m = t.value.match(/^(\d{4})\s+(\d{2})$/);
        if (m) {
          const y = Number.parseInt(m[1], 10);
          const mm = Number.parseInt(m[2], 10);
          if (mm >= 1 && mm <= 12) {
            const from = new Date(Date.UTC(y, mm - 1, 1, 0, 0, 0));
            const to = new Date(Date.UTC(mm === 12 ? y + 1 : y, mm === 12 ? 0 : mm, 1, 0, 0, 0));
            ors.push({ buildings: { some: { deadlineKey: { gte: from, lt: to } } } });
          }
        }
        continue;
      }
      if (t.kind === 'quarter') {
        const m = t.value.match(/^Q([1-4])\s+(\d{4})$/);
        if (m) {
          const q = Number.parseInt(m[1], 10);
          const y = Number.parseInt(m[2], 10);
          const startMonth = (q - 1) * 3;
          const from = new Date(Date.UTC(y, startMonth, 1, 0, 0, 0));
          const to = new Date(Date.UTC(startMonth + 3 >= 12 ? y + 1 : y, (startMonth + 3) % 12, 1, 0, 0, 0));
          ors.push({ buildings: { some: { deadlineKey: { gte: from, lt: to } } } });
        }
        continue;
      }
      // exact: match computed deadline label stored on block? fallback to building.deadlineKey string equality not possible.
      // We treat exact as a raw string match against buildings.deadlineKey formatted in UI elsewhere isn't stored.
      // Keep for future, currently ignored.
    }

    if (ors.length === 0) return null;
    return { OR: ors };
  }

  /**
   * Shared block filters for catalog list, counts, and stats.
   * Returns `noMatch: true` when price filter excludes all blocks.
   */
  async buildCatalogBlockWhere(query: QueryBlocksDto): Promise<{
    where: Prisma.BlockWhereInput;
    noMatch: boolean;
  }> {
    const {
      region_id, district_id, builder_id, subway_id, status, search,
      price_min, price_max,
      area_min, area_max, floor_min, floor_max,
      district_names, subway_names, builder_names,
      is_promoted, sales_start_from, sales_start_to, block_slugs, require_active_listings,
      geo_lat, geo_lng, geo_radius_m, geo_polygon, geo_preset,
      rooms,
      deadline,
      finishing,
    } = query;

    const where: Prisma.BlockWhereInput = {};
    if (region_id) where.regionId = region_id;
    if (district_id) where.districtId = district_id;
    if (builder_id) where.builderId = builder_id;
    if (status && Object.values(BlockStatus).includes(status as BlockStatus)) {
      where.status = status as BlockStatus;
    }

    const geoRes = await this.geo.resolveGeoBlockIds({
      region_id,
      geo_lat,
      geo_lng,
      geo_radius_m,
      geo_polygon,
      geo_preset,
    });
    if (geoRes.noMatch) {
      return { where: {}, noMatch: true };
    }
    if (geoRes.ids) {
      where.id = { in: geoRes.ids };
    }

    if (search?.trim()) {
      const q = normalizeSearchQuery(search);
      if (q) {
        let meiliIds: number[] | null = null;
        if (region_id && this.catalogSearch.isEnabled()) {
          meiliIds = await this.catalogSearch.searchBlockIds(region_id, q, 2000);
        }
        if (meiliIds !== null) {
          const merged = intersectBlockIdFilter(where.id, meiliIds);
          if (merged.length === 0) {
            return { where: {}, noMatch: true };
          }
          where.id = { in: merged };
        } else {
          where.OR = [
            { name: { contains: q, mode: Prisma.QueryMode.insensitive } },
            { addresses: { some: { address: { contains: q, mode: Prisma.QueryMode.insensitive } } } },
            { district: { name: { contains: q, mode: Prisma.QueryMode.insensitive } } },
            { builder: { name: { contains: q, mode: Prisma.QueryMode.insensitive } } },
            { subways: { some: { subway: { name: { contains: q, mode: Prisma.QueryMode.insensitive } } } } },
          ];
        }
      }
    }
    if (subway_id) {
      where.subways = { some: { subwayId: subway_id } };
    }

    if (district_names) {
      const names = district_names.split(',').map((n) => n.trim()).filter(Boolean);
      if (names.length) {
        const clause: Prisma.BlockWhereInput = {
          OR: names.map((name) => ({ district: { name: { contains: name, mode: Prisma.QueryMode.insensitive } } })),
        };
        where.AND = Array.isArray(where.AND) ? [...where.AND, clause] : [clause];
      }
    }
    if (builder_names) {
      const names = builder_names.split(',').map((n) => n.trim()).filter(Boolean);
      if (names.length) {
        const clause: Prisma.BlockWhereInput = {
          OR: names.map((name) => ({ builder: { name: { contains: name, mode: Prisma.QueryMode.insensitive } } })),
        };
        where.AND = Array.isArray(where.AND) ? [...where.AND, clause] : [clause];
      }
    }
    if (subway_names) {
      const names = subway_names.split(',').map((n) => n.trim()).filter(Boolean);
      if (names.length) {
        const clause: Prisma.BlockWhereInput = {
          OR: names.map((name) => ({ subways: { some: { subway: { name: { contains: name, mode: Prisma.QueryMode.insensitive } } } } })),
        };
        where.AND = Array.isArray(where.AND) ? [...where.AND, clause] : [clause];
      }
    }

    if (is_promoted === true) {
      where.isPromoted = true;
    }

    if (block_slugs?.trim()) {
      const slugs = block_slugs
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (slugs.length) {
        where.slug = { in: slugs };
      }
    }

    if (sales_start_from || sales_start_to) {
      const range: Prisma.DateTimeNullableFilter = { not: null };
      if (sales_start_from) {
        const from = new Date(`${sales_start_from}T00:00:00.000Z`);
        if (!Number.isNaN(from.getTime())) range.gte = from;
      }
      if (sales_start_to) {
        const to = new Date(`${sales_start_to}T23:59:59.999Z`);
        if (!Number.isNaN(to.getTime())) range.lte = to;
      }
      where.salesStartDate = range;
    }

    if (deadline && deadline.trim()) {
      const dw = this.buildDeadlineWhere(deadline);
      if (dw) {
        where.AND = Array.isArray(where.AND) ? [...where.AND, dw] : [dw];
      }
    }

    if (require_active_listings === true) {
      where.listings = {
        some: {
          status: { in: [...PUBLIC_LISTING_STATUSES] },
          kind: { in: PUBLIC_CATALOG_LISTING_KINDS },
          isPublished: true,
        },
      };
    }


    const roomCategories = this.parseRoomCategories(rooms);
    if (roomCategories.length) {
      const roomTypeIds = await this.resolveRoomTypeIdsByCategories(roomCategories);
      if (roomTypeIds.length === 0) {
        return { where, noMatch: true };
      }
      const listingWhere: Prisma.ListingWhereInput = {
        status: { in: [...PUBLIC_LISTING_STATUSES] },
        kind: ListingKind.APARTMENT,
        isPublished: true,
        apartment: {
          is: {
            roomTypeId: { in: roomTypeIds },
          },
        },
      };
      if (region_id) {
        listingWhere.regionId = region_id;
      }
      const grouped = await this.prisma.listing.groupBy({
        by: ['blockId'],
        where: listingWhere,
      });
      const blockIds = grouped.map((g) => g.blockId).filter((id): id is number => id != null);
      if (blockIds.length === 0) {
        return { where, noMatch: true };
      }
      where.id = { in: intersectBlockIdFilter(where.id, blockIds) };
      if ((where.id as { in?: number[] } | undefined)?.in?.length === 0) {
        return { where, noMatch: true };
      }
    }

    if (price_min != null || price_max != null) {
      const priceFilter: Prisma.DecimalNullableFilter = { not: null, gt: 0 };
      if (price_min != null) priceFilter.gte = price_min;
      if (price_max != null) priceFilter.lte = price_max;
      const priceWhere: Prisma.ListingWhereInput = {
        status: { in: [...PUBLIC_LISTING_STATUSES] },
        kind: ListingKind.APARTMENT,
        price: priceFilter,
        isPublished: true,
        ...(region_id ? { block: { regionId: region_id } } : {}),
      };

      const qualifying = await this.prisma.listing.groupBy({
        by: ['blockId'],
        where: priceWhere,
      });
      let priceFilteredBlockIds = qualifying
        .map((r) => r.blockId)
        .filter((id): id is number => id != null);

      const curIn =
        where.id && typeof where.id === 'object' && 'in' in where.id
          ? (where.id as { in: number[] }).in
          : undefined;
      if (curIn?.length) {
        const set = new Set(priceFilteredBlockIds);
        priceFilteredBlockIds = curIn.filter((id) => set.has(id));
      }

      if (priceFilteredBlockIds.length === 0) {
        return { where, noMatch: true };
      }
      where.id = { in: priceFilteredBlockIds };
    }


    if (area_min != null || area_max != null) {
      const areaWhere: Prisma.ListingWhereInput = {
        status: { in: [...PUBLIC_LISTING_STATUSES] },
        kind: ListingKind.APARTMENT,
        isPublished: true,
        apartment: {
          is: {
            areaTotal: {
              not: null,
              ...(area_min != null ? { gte: area_min } : {}),
              ...(area_max != null ? { lte: area_max } : {}),
            } as Prisma.DecimalNullableFilter,
          },
        },
        ...(region_id ? { block: { regionId: region_id } } : {}),
      };
      const areaRows = await this.prisma.listing.groupBy({ by: ['blockId'], where: areaWhere });
      const areaIds = areaRows.map((r) => r.blockId).filter((id): id is number => id != null);
      if (areaIds.length === 0) return { where, noMatch: true };
      where.id = { in: intersectBlockIdFilter(where.id, areaIds) };
      if ((where.id as { in?: number[] } | undefined)?.in?.length === 0) return { where, noMatch: true };
    }

    if (floor_min != null || floor_max != null) {
      const floorWhere: Prisma.ListingWhereInput = {
        status: { in: [...PUBLIC_LISTING_STATUSES] },
        kind: ListingKind.APARTMENT,
        isPublished: true,
        apartment: {
          is: {
            floor: {
              not: null,
              ...(floor_min != null ? { gte: floor_min } : {}),
              ...(floor_max != null ? { lte: floor_max } : {}),
            } as Prisma.IntNullableFilter,
          },
        },
        ...(region_id ? { block: { regionId: region_id } } : {}),
      };
      const floorRows = await this.prisma.listing.groupBy({ by: ['blockId'], where: floorWhere });
      const floorIds = floorRows.map((r) => r.blockId).filter((id): id is number => id != null);
      if (floorIds.length === 0) return { where, noMatch: true };
      where.id = { in: intersectBlockIdFilter(where.id, floorIds) };
      if ((where.id as { in?: number[] } | undefined)?.in?.length === 0) return { where, noMatch: true };
    }

    const finishingIds = this.parseCommaSeparatedIds(finishing);
    if (finishingIds.length) {
      const finishingWhere: Prisma.ListingWhereInput = {
        status: { in: [...PUBLIC_LISTING_STATUSES] },
        kind: ListingKind.APARTMENT,
        isPublished: true,
        apartment: {
          is: {
            finishingId: { in: finishingIds },
          },
        },
        ...(region_id ? { block: { regionId: region_id } } : {}),
      };
      const finRows = await this.prisma.listing.groupBy({ by: ['blockId'], where: finishingWhere });
      const finBlockIds = finRows.map((r) => r.blockId).filter((id): id is number => id != null);
      if (finBlockIds.length === 0) return { where, noMatch: true };
      where.id = { in: intersectBlockIdFilter(where.id, finBlockIds) };
      if ((where.id as { in?: number[] } | undefined)?.in?.length === 0) return { where, noMatch: true };
    }

    return { where, noMatch: false };
  }

  /** Count blocks + active apartment listings matching the same filters as GET /blocks */
  async countCatalog(query: QueryBlocksDto): Promise<{ blocks: number; apartments: number }> {
    const cacheKey = this.makeCacheKey('api:catalog:counts:', query);
    const cached = await this.cache.getJson<{ blocks: number; apartments: number }>(cacheKey);
    if (cached) return cached;

    const { where, noMatch } = await this.buildCatalogBlockWhere(query);
    if (noMatch) {
      const empty = { blocks: 0, apartments: 0 };
      await this.cache.setJson(cacheKey, empty, 60);
      return empty;
    }

    const listingWhere: Prisma.ListingWhereInput = {
      status: { in: [...PUBLIC_LISTING_STATUSES] },
      kind: ListingKind.APARTMENT,
      isPublished: true,
      ...(query.region_id != null ? { regionId: query.region_id } : {}),
      block: where,
    };

    const apartmentParts: Prisma.ListingApartmentWhereInput[] = [];
    const roomCategories = this.parseRoomCategories(query.rooms);
    if (roomCategories.length) {
      const roomTypeIds = await this.resolveRoomTypeIdsByCategories(roomCategories);
      if (roomTypeIds.length === 0) {
        const empty = { blocks: 0, apartments: 0 };
        await this.cache.setJson(cacheKey, empty, 60);
        return empty;
      }
      apartmentParts.push({ roomTypeId: { in: roomTypeIds } });
    }
    const finishingIds = this.parseCommaSeparatedIds(query.finishing);
    if (finishingIds.length) apartmentParts.push({ finishingId: { in: finishingIds } });
    if (query.area_min != null) apartmentParts.push({ areaTotal: { gte: query.area_min } });
    if (query.area_max != null) apartmentParts.push({ areaTotal: { lte: query.area_max } });
    if (query.floor_min != null) apartmentParts.push({ floor: { gte: query.floor_min } });
    if (query.floor_max != null) apartmentParts.push({ floor: { lte: query.floor_max } });
    if (apartmentParts.length) {
      listingWhere.apartment = { AND: apartmentParts };
    }

    if (query.price_min != null || query.price_max != null) {
      const priceFilter: Prisma.DecimalNullableFilter = { not: null, gt: 0 };
      if (query.price_min != null) priceFilter.gte = query.price_min;
      if (query.price_max != null) priceFilter.lte = query.price_max;
      listingWhere.price = priceFilter;
    }

    const listingTotal = await this.prisma.listing.count({ where: listingWhere });

    const grouped = await this.prisma.listing.groupBy({
      by: ['blockId'],
      where: listingWhere,
    });
    const blocksWithListings = grouped.filter((g) => g.blockId != null).length;

    const result = { blocks: blocksWithListings, apartments: listingTotal };
    await this.cache.setJson(cacheKey, result, 60);
    return result;
  }

  async findAll(query: QueryBlocksDto) {
    const cacheKey = this.makeCacheKey('api:catalog:blocks:', query);
    const cached = await this.cache.getJson<{
      data: unknown[];
      meta: { page: number; per_page: number; total: number; total_pages: number };
    }>(cacheKey);
    if (cached) return cached;

    const { page = 1, per_page = 20, sort } = query;

    const { where, noMatch } = await this.buildCatalogBlockWhere(query);
    if (noMatch) {
      const empty = { data: [], meta: { page, per_page, total: 0, total_pages: 0 } };
      await this.cache.setJson(cacheKey, empty, 45);
      return empty;
    }

    const listInclude = {
      region: { select: { id: true, code: true, name: true } },
      district: { select: { id: true, name: true } },
      builder: { select: { id: true, name: true } },
      addresses: { orderBy: { sortOrder: 'asc' as const } },
      images: { orderBy: { sortOrder: 'asc' as const }, take: 3 },
      subways: {
        include: { subway: { select: { id: true, name: true } } },
        orderBy: { distanceTime: 'asc' as const },
        take: 3,
      },
      buildings: {
        select: { id: true, name: true, deadline: true, deadlineKey: true },
        orderBy: { deadlineKey: 'asc' as const },
        take: 8,
      },
      _count: {
        select: {
          listings: {
            // «В продаже» = ACTIVE + RESERVED. Совпадает с layouts на сайте.
            where: {
              status: { in: [ListingStatus.ACTIVE, ListingStatus.RESERVED] },
              kind: { in: PUBLIC_CATALOG_LISTING_KINDS },
              isPublished: true,
            },
          },
        },
      },
    } satisfies Prisma.BlockInclude;

    const total = await this.prisma.block.count({ where });
    if (total === 0) {
      const empty = { data: [], meta: { page, per_page, total: 0, total_pages: 0 } };
      await this.cache.setJson(cacheKey, empty, 45);
      return empty;
    }

    const isPriceSort = sort === 'price_asc' || sort === 'price_desc';

    let rows: Awaited<ReturnType<typeof this.prisma.block.findMany>>;
    let priceByBlock: Map<number, { min: number; max: number }>;

    if (isPriceSort) {
      const whereSql = catalogBlockWhereToSql(where);
      const skip = (page - 1) * per_page;
      const listingAgg = Prisma.sql`
        SELECT block_id, MIN(price) AS min_p, MAX(price) AS max_p
        FROM listings
        WHERE status = ${ListingStatus.ACTIVE}::"ListingStatus"
          AND kind IN (${Prisma.join(PUBLIC_CATALOG_LISTING_KINDS.map((k) => Prisma.sql`${k}::"ListingKind"`))})
          AND is_published = true
          AND price IS NOT NULL
        GROUP BY block_id
      `;

      if (whereSql != null) {
        const pageRows =
          sort === 'price_asc'
            ? await this.prisma.$queryRaw<{ id: number; min_p: unknown; max_p: unknown }[]>`
                SELECT b.id, lp.min_p, lp.max_p
                FROM blocks b
                LEFT JOIN (${listingAgg}) lp ON lp.block_id = b.id
                WHERE ${whereSql}
                ORDER BY lp.min_p ASC NULLS LAST, b.id ASC
                LIMIT ${per_page} OFFSET ${skip}
              `
            : await this.prisma.$queryRaw<{ id: number; min_p: unknown; max_p: unknown }[]>`
                SELECT b.id, lp.min_p, lp.max_p
                FROM blocks b
                LEFT JOIN (${listingAgg}) lp ON lp.block_id = b.id
                WHERE ${whereSql}
                ORDER BY lp.min_p DESC NULLS LAST, b.id ASC
                LIMIT ${per_page} OFFSET ${skip}
              `;

        priceByBlock = new Map();
        for (const r of pageRows) {
          if (r.min_p != null && r.max_p != null) {
            priceByBlock.set(r.id, { min: Number(r.min_p), max: Number(r.max_p) });
          }
        }
        const pageIds = pageRows.map((r) => r.id);
        if (!pageIds.length) {
          return {
            data: [],
            meta: { page, per_page, total, total_pages: Math.ceil(total / per_page) },
          };
        }
        const fetched = await this.prisma.block.findMany({
          where: { id: { in: pageIds } },
          include: listInclude,
        });
        const byId = new Map(fetched.map((b) => [b.id, b]));
        rows = pageIds.map((id) => byId.get(id)).filter((b): b is NonNullable<typeof b> => b != null);
      } else {
        const idRows = await this.prisma.block.findMany({
          where,
          select: { id: true },
        });
        const ids = idRows.map((r) => r.id);
        priceByBlock = await this.listingPriceBoundsByBlockIds(ids);
        const dir = sort === 'price_asc' ? 1 : -1;
        const sortedIds = [...ids].sort((a, b) => {
          const pa = priceByBlock.get(a)?.min;
          const pb = priceByBlock.get(b)?.min;
          const na = pa == null ? (dir === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY) : pa;
          const nb = pb == null ? (dir === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY) : pb;
          if (na !== nb) return (na - nb) * dir;
          return a - b;
        });
        const pageIds = sortedIds.slice((page - 1) * per_page, page * per_page);
        if (!pageIds.length) {
          return {
            data: [],
            meta: { page, per_page, total, total_pages: Math.ceil(total / per_page) },
          };
        }
        const fetched = await this.prisma.block.findMany({
          where: { id: { in: pageIds } },
          include: listInclude,
        });
        const byId = new Map(fetched.map((b) => [b.id, b]));
        rows = pageIds.map((id) => byId.get(id)).filter((b): b is NonNullable<typeof b> => b != null);
      }
    } else {
      const orderBy = this.parseSort(sort);
      rows = await this.prisma.block.findMany({
        where,
        orderBy,
        skip: (page - 1) * per_page,
        take: per_page,
        include: listInclude,
      });
      priceByBlock = await this.listingPriceBoundsByBlockIds(rows.map((b) => b.id));
    }

    const blockIds = rows.map((b) => b.id);
    const [priceRangeByBlock, scenicByBlock] = await Promise.all([
      this.listingPriceRangesByBlockIds(blockIds),
      this.listingScenicCountByBlockIds(blockIds),
    ]);

    const data = rows.map((b) => {
      const p = priceByBlock.get(b.id);
      return {
        ...b,
        listingPriceMin: p?.min ?? null,
        listingPriceMax: p?.max ?? null,
        priceRanges: priceRangeByBlock.get(b.id) ?? [],
        scenicCount: scenicByBlock.get(b.id) ?? null,
      };
    });

    const result = {
      data,
      meta: { page, per_page, total, total_pages: Math.ceil(total / per_page) },
    };
    await this.cache.setJson(cacheKey, result, 45);
    return result;
  }

  /**
   * Минимальная «вменяемая» цена объекта в рублях. Всё, что меньше — мусор из фида,
   * не должно попадать в агрегаты «от …» и в фасеты каталога.
   */
  private static readonly MIN_REASONABLE_PRICE_RUB = 100_000;

  private async listingPriceBoundsByBlockIds(
    blockIds: number[],
  ): Promise<Map<number, { min: number; max: number }>> {
    const map = new Map<number, { min: number; max: number }>();
    if (!blockIds.length) return map;
    const minPrice = BlocksService.MIN_REASONABLE_PRICE_RUB;
    if (await this.isCatalogMvAvailable()) {
      try {
        const rows = await this.prisma.$queryRaw<
          Array<{ block_id: number; min_p: unknown; max_p: unknown }>
        >`
          SELECT mv.block_id, MIN(mv.price) AS min_p, MAX(mv.price) AS max_p
          FROM catalog_apartment_active_mv mv
          WHERE mv.block_id IN (${Prisma.join(blockIds)})
            AND mv.price >= ${minPrice}
          GROUP BY mv.block_id
        `;
        for (const row of rows) {
          if (row.block_id == null || row.min_p == null) continue;
          map.set(Number(row.block_id), {
            min: Number(row.min_p),
            max: row.max_p != null ? Number(row.max_p) : Number(row.min_p),
          });
        }
        return map;
      } catch (e: unknown) {
        this.logger.warn(`MV price bounds fallback to base tables: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    const agg = await this.prisma.listing.groupBy({
      by: ['blockId'],
      where: {
        blockId: { in: blockIds },
        status: ListingStatus.ACTIVE,
        kind: { in: PUBLIC_CATALOG_LISTING_KINDS },
        price: { gte: minPrice },
        isPublished: true,
      },
      _min: { price: true },
      _max: { price: true },
    });
    for (const row of agg) {
      if (row.blockId == null || row._min.price == null) continue;
      map.set(row.blockId, {
        min: Number(row._min.price),
        max: row._max.price != null ? Number(row._max.price) : Number(row._min.price),
      });
    }
    return map;
  }

  private async listingScenicCountByBlockIds(blockIds: number[]): Promise<Map<number, number>> {
    const map = new Map<number, number>();
    if (!blockIds.length) return map;
    if (!(await this.isCatalogMvAvailable())) return map;
    try {
      const rows = await this.prisma.$queryRaw<Array<{ block_id: number; cnt: bigint }>>`
        SELECT mv.block_id, COUNT(*)::bigint AS cnt
        FROM catalog_apartment_active_mv mv
        INNER JOIN listing_apartments la ON la.listing_id = mv.listing_id
        INNER JOIN room_types rt ON rt.id = la.room_type_id
        WHERE mv.block_id IN (${Prisma.join(blockIds)})
          AND (
            lower(rt.name) LIKE '%вид%'
            OR lower(coalesce(rt.name_one, '')) LIKE '%вид%'
            OR lower(coalesce(rt.name, '')) LIKE '%панорам%'
          )
        GROUP BY mv.block_id
      `;
      for (const row of rows) {
        map.set(Number(row.block_id), Number(row.cnt));
      }
    } catch (e: unknown) {
      this.logger.warn(
        `MV scenic count skipped: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    return map;
  }

  private roomBandSortKey(rooms: number): number {
    return rooms === 21 ? 2.5 : rooms;
  }

  private async roomTypeCategoryMap(): Promise<Map<number, number>> {
    const roomTypes = await this.prisma.roomType.findMany({
      select: { id: true, name: true, nameOne: true },
    });
    const rtToCat = new Map<number, number>();
    for (const rt of roomTypes) {
      const cat = this.roomCategoryFromName(rt.nameOne ?? rt.name);
      if (cat != null) rtToCat.set(rt.id, cat);
    }
    return rtToCat;
  }

  private aggregateListingPriceRanges(
    rows: Array<{ block_id: number; room_type_id: number; min_p: unknown }>,
    rtToCat: Map<number, number>,
  ): Map<number, Array<{ rooms: number; priceMin: number }>> {
    const map = new Map<number, Array<{ rooms: number; priceMin: number }>>();
    const minPrice = BlocksService.MIN_REASONABLE_PRICE_RUB;
    const byBlock = new Map<number, Map<number, number>>();
    for (const row of rows) {
      const blockId = Number(row.block_id);
      const rooms = rtToCat.get(Number(row.room_type_id));
      if (rooms == null || row.min_p == null) continue;
      const priceMin = Number(row.min_p);
      if (!Number.isFinite(priceMin) || priceMin < minPrice) continue;
      if (!byBlock.has(blockId)) byBlock.set(blockId, new Map());
      const inner = byBlock.get(blockId)!;
      const prev = inner.get(rooms);
      if (prev == null || priceMin < prev) inner.set(rooms, priceMin);
    }
    for (const [blockId, inner] of byBlock) {
      map.set(
        blockId,
        Array.from(inner.entries())
          .map(([rooms, priceMin]) => ({ rooms, priceMin }))
          .sort((a, b) => this.roomBandSortKey(a.rooms) - this.roomBandSortKey(b.rooms)),
      );
    }
    return map;
  }

  private async listingPriceRangesByBlockIds(
    blockIds: number[],
  ): Promise<Map<number, Array<{ rooms: number; priceMin: number }>>> {
    const map = new Map<number, Array<{ rooms: number; priceMin: number }>>();
    if (!blockIds.length) return map;

    const rtToCat = await this.roomTypeCategoryMap();
    const minPrice = BlocksService.MIN_REASONABLE_PRICE_RUB;

    if (await this.isCatalogMvAvailable()) {
      try {
        const rows = await this.prisma.$queryRaw<
          Array<{ block_id: number; room_type_id: number; min_p: unknown }>
        >`
          SELECT block_id, room_type_id, MIN(price) AS min_p
          FROM catalog_apartment_active_mv
          WHERE block_id IN (${Prisma.join(blockIds)})
            AND price >= ${minPrice}
            AND room_type_id IS NOT NULL
          GROUP BY block_id, room_type_id
        `;
        for (const [blockId, ranges] of this.aggregateListingPriceRanges(rows, rtToCat)) {
          map.set(blockId, ranges);
        }
      } catch (e: unknown) {
        this.logger.warn(
          `MV price ranges skipped: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    const missingIds = blockIds.filter((id) => (map.get(id)?.length ?? 0) === 0);
    if (missingIds.length === 0) return map;

    try {
      const rows = await this.prisma.$queryRaw<
        Array<{ block_id: number; room_type_id: number; min_p: unknown }>
      >`
        SELECT l.block_id, la.room_type_id, MIN(l.price) AS min_p
        FROM listings l
        INNER JOIN listing_apartments la ON la.listing_id = l.id
        WHERE l.block_id IN (${Prisma.join(missingIds)})
          AND l.status IN ('ACTIVE'::"ListingStatus", 'RESERVED'::"ListingStatus")
          AND l.kind = 'APARTMENT'::"ListingKind"
          AND l.is_published = true
          AND l.price >= ${minPrice}
          AND la.room_type_id IS NOT NULL
        GROUP BY l.block_id, la.room_type_id
      `;
      for (const [blockId, ranges] of this.aggregateListingPriceRanges(rows, rtToCat)) {
        if (ranges.length > 0) map.set(blockId, ranges);
      }
    } catch (e: unknown) {
      this.logger.warn(
        `Base-table price ranges fallback failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    return map;
  }

  private async isCatalogMvAvailable(): Promise<boolean> {
    if (this.catalogMvAvailable != null) return this.catalogMvAvailable;
    try {
      const rows = await this.prisma.$queryRaw<Array<{ reg: string | null }>>`
        SELECT to_regclass('public.catalog_apartment_active_mv') AS reg
      `;
      this.catalogMvAvailable = Boolean(rows[0]?.reg);
    } catch {
      this.catalogMvAvailable = false;
    }
    return this.catalogMvAvailable;
  }



  private parseCommaSeparatedIds(raw?: string): number[] {
    if (!raw?.trim()) return [];
    return Array.from(
      new Set(
        raw
          .split(',')
          .map((s) => Number.parseInt(s.trim(), 10))
          .filter((n) => Number.isFinite(n)),
      ),
    );
  }

  private parseRoomCategories(raw?: string): number[] {
    if (!raw) return [];
    return Array.from(
      new Set(
        raw
          .split(',')
          .map((s) => Number.parseInt(s.trim(), 10))
          .filter((n) => Number.isFinite(n) && n >= 0 && n <= 4),
      ),
    );
  }

  /** Room band key for price rows: 0 studio, 1 one-room, 2 euro-2, 21 classic 2-room, 3+ … */
  private roomCategoryFromName(name?: string | null): number | null {
    const n = (name ?? '').toLowerCase().replace(/\s+/g, '');
    if (!n) return null;
    if (n.includes('студ')) return 0;
    if (n.includes('2е') || n.includes('2e') || n.includes('евро')) return 2;
    if (n.includes('1-к') || n.includes('1к') || /^1/.test(n)) return 1;
    if (n.includes('3-к') || n.includes('3к') || /^3/.test(n)) return 3;
    if (n.includes('4') || n.includes('5')) return 4;
    if (n.includes('2-к') || n.includes('2к') || /^2/.test(n)) return 21;
    const m = n.match(/(\d)/);
    if (m) {
      const r = Number.parseInt(m[1], 10);
      if (r === 2) return 21;
      return r > 4 ? 4 : r;
    }
    return null;
  }

  private async resolveRoomTypeIdsByCategories(categories: number[]): Promise<number[]> {
    if (categories.length === 0) return [];
    const roomTypes = await this.prisma.roomType.findMany({
      select: { id: true, name: true, nameOne: true },
    });
    const wanted = new Set(categories);
    const ids: number[] = [];
    for (const rt of roomTypes) {
      const band = this.roomCategoryFromName(rt.nameOne ?? rt.name);
      // 21 (классическая 2-к) — отдельная строка только в ценах; фильтр «2» включает и евро-, и обычные двушки
      const cat = band === 21 ? 2 : band;
      if (cat != null && wanted.has(cat)) ids.push(rt.id);
    }
    return Array.from(new Set(ids));
  }

  async invalidateCatalogCache() {
    await Promise.all([
      this.cache.delByPrefix('api:catalog:'),
      this.cache.delByPrefix('api:block:detail:'),
      this.cache.delByPrefix('api:block:chessboard:'),
    ]);
  }

  private makeCacheKey(prefix: string, query: QueryBlocksDto): string {
    const entries = Object.entries(query as Record<string, unknown>)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .sort(([a], [b]) => a.localeCompare(b));
    return `${prefix}${JSON.stringify(entries)}`;
  }

  private readonly blockPublicDetailInclude = {
    region: true,
    district: true,
    builder: true,
    addresses: { orderBy: { sortOrder: 'asc' as const } },
    images: { orderBy: { sortOrder: 'asc' as const } },
    subways: {
      include: { subway: true },
      orderBy: { distanceTime: 'asc' as const },
    },
    buildings: {
      include: { buildingType: true, addresses: true },
      orderBy: { name: 'asc' as const },
    },
  } satisfies Prisma.BlockInclude;

  private async listingActiveCountByBlockIds(
    blockIds: number[],
  ): Promise<Map<number, number>> {
    const map = new Map<number, number>();
    if (!blockIds.length) return map;
    if (await this.isCatalogMvAvailable()) {
      try {
        const rows = await this.prisma.$queryRaw<Array<{ block_id: number; cnt: bigint }>>`
          SELECT mv.block_id, COUNT(*)::bigint AS cnt
          FROM catalog_apartment_active_mv mv
          WHERE mv.block_id IN (${Prisma.join(blockIds)})
          GROUP BY mv.block_id
        `;
        for (const row of rows) {
          map.set(Number(row.block_id), Number(row.cnt));
        }
        if (map.size > 0) return map;
      } catch (e: unknown) {
        this.logger.warn(
          `MV listing count fallback: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    const rows = await this.prisma.listing.groupBy({
      by: ['blockId'],
      where: {
        blockId: { in: blockIds },
        status: { in: [ListingStatus.ACTIVE, ListingStatus.RESERVED] },
        kind: { in: PUBLIC_CATALOG_LISTING_KINDS },
        isPublished: true,
      },
      _count: { _all: true },
    });
    for (const row of rows) {
      if (row.blockId == null) continue;
      map.set(row.blockId, row._count._all);
    }
    return map;
  }

  private async enrichPublicBlockDetail(block: BlockPublicDetailPayload): Promise<PublicBlockDetail> {
    const [prices, counts] = await Promise.all([
      this.listingPriceBoundsByBlockIds([block.id]),
      this.listingActiveCountByBlockIds([block.id]),
    ]);
    const p = prices.get(block.id);
    return {
      ...block,
      _count: { listings: counts.get(block.id) ?? 0 },
      listingPriceMin: p?.min ?? null,
      listingPriceMax: p?.max ?? null,
    };
  }

  async findOne(id: number): Promise<PublicBlockDetail> {
    const cacheKey = `api:block:detail:id:${id}`;
    const cached = await this.cache.getJson<PublicBlockDetail>(cacheKey);
    if (cached) return cached;

    const block = await this.prisma.block.findUnique({
      where: { id },
      include: this.blockPublicDetailInclude,
    });
    if (!block) throw new NotFoundException('Block not found');
    const result = await this.enrichPublicBlockDetail(block);
    await this.cache.setJson(cacheKey, result, 90);
    return result;
  }

  async findBySlug(slug: string): Promise<PublicBlockDetail> {
    const cacheKey = `api:block:detail:slug:${slug}`;
    const cached = await this.cache.getJson<PublicBlockDetail>(cacheKey);
    if (cached) return cached;

    const block = await this.prisma.block.findUnique({
      where: { slug },
      include: this.blockPublicDetailInclude,
    });
    if (!block) throw new NotFoundException('Block not found');
    const result = await this.enrichPublicBlockDetail(block);
    await this.cache.setJson(cacheKey, result, 90);
    return result;
  }

  /** Precomputed chessboard matrix per building (grid[][] source of truth for frontend). */
  async getChessboard(idOrSlug: string): Promise<ChessboardBlockResponse> {
    const cacheKey = `api:block:chessboard:${idOrSlug}`;
    const cached = await this.cache.getJson<ChessboardBlockResponse>(cacheKey);
    if (cached) return cached;

    const block = /^\d+$/.test(idOrSlug)
      ? await this.prisma.block.findUnique({
          where: { id: Number.parseInt(idOrSlug, 10) },
          include: { buildings: { orderBy: { name: 'asc' } } },
        })
      : await this.prisma.block.findUnique({
          where: { slug: idOrSlug },
          include: { buildings: { orderBy: { name: 'asc' } } },
        });
    if (!block) throw new NotFoundException('Block not found');

    const listings = await this.prisma.listing.findMany({
      where: {
        blockId: block.id,
        kind: CHESSBOARD_LISTING_KIND,
        visibility: 'PUBLIC',
        isPublished: true,
        status: { in: CHESSBOARD_LISTING_STATUSES },
      },
      select: {
        id: true,
        buildingId: true,
        price: true,
        status: true,
        apartment: {
          select: {
            floor: true,
            number: true,
            areaTotal: true,
            areaKitchen: true,
            planUrl: true,
            buildingName: true,
            roomType: { select: { name: true, nameOne: true } },
            finishing: { select: { name: true } },
          },
        },
      },
      orderBy: [{ apartment: { floor: 'desc' } }, { id: 'asc' }],
    });

    const result = buildBlockChessboardResponse(block, listings);
    await this.cache.setJson(cacheKey, result, 120);
    return result;
  }

  private parseBlockStatus(raw?: string): BlockStatus {
    if (raw && Object.values(BlockStatus).includes(raw as BlockStatus)) {
      return raw as BlockStatus;
    }
    return BlockStatus.BUILDING;
  }

  private parseSalesStartDate(raw?: string | null): Date | null {
    if (raw === undefined || raw === null || raw === '') return null;
    const d = new Date(`${raw}T00:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  private parseDataSource(raw?: string): DataSource {
    if (raw && Object.values(DataSource).includes(raw as DataSource)) {
      return raw as DataSource;
    }
    return DataSource.MANUAL;
  }

  async create(dto: CreateBlockDto) {
    const slug = dto.slug || this.generateSlug(dto.name);
    const created = await this.prisma.block.create({
      data: {
        regionId: dto.regionId,
        name: dto.name,
        slug,
        description: dto.description,
        districtId: dto.districtId,
        builderId: dto.builderId,
        status: this.parseBlockStatus(dto.status),
        latitude: dto.latitude,
        longitude: dto.longitude,
        isPromoted: dto.isPromoted ?? false,
        salesStartDate: this.parseSalesStartDate(dto.salesStartDate),
        dataSource: this.parseDataSource(dto.dataSource),
      },
    });
    if (dto.address?.trim()) await this.setMainAddress(created.id, dto.address);
    await this.invalidateCatalogCache();
    return created;
  }

  async update(id: number, dto: Partial<CreateBlockDto>) {
    await this.findOne(id);
    const updated = await this.prisma.block.update({
      where: { id },
      data: {
        ...(dto.slug !== undefined && dto.slug !== '' && { slug: dto.slug }),
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.districtId !== undefined && { districtId: dto.districtId }),
        ...(dto.builderId !== undefined && { builderId: dto.builderId }),
        ...(dto.status !== undefined && { status: this.parseBlockStatus(dto.status) }),
        ...(dto.latitude !== undefined && { latitude: dto.latitude }),
        ...(dto.longitude !== undefined && { longitude: dto.longitude }),
        ...(dto.isPromoted !== undefined && { isPromoted: dto.isPromoted }),
        ...(dto.salesStartDate !== undefined && {
          salesStartDate: this.parseSalesStartDate(dto.salesStartDate),
        }),
        ...(dto.dataSource !== undefined && { dataSource: this.parseDataSource(dto.dataSource) }),
      },
    });
    if (dto.address !== undefined) await this.setMainAddress(id, dto.address);
    await this.invalidateCatalogCache();
    return updated;
  }

  /** Основной адрес ЖК (первая строка block_addresses); пустая строка — удалить */
  private async setMainAddress(blockId: number, raw: string) {
    const address = raw.trim().replace(/\s+/g, ' ');
    const main = await this.prisma.blockAddress.findFirst({ where: { blockId }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
    if (!address) {
      if (main) await this.prisma.blockAddress.delete({ where: { id: main.id } });
      return;
    }
    if (main) {
      if (main.address !== address) await this.prisma.blockAddress.update({ where: { id: main.id }, data: { address } });
    } else {
      await this.prisma.blockAddress.create({ data: { blockId, address, sortOrder: 0 } });
    }
  }

  /**
   * Обложка ЖК по ссылке из фида. Файл не скачиваем: по решению о хранении
   * медиа изображения остаются на стороне поставщика, у нас только адрес.
   * Повторный вызов с тем же адресом ничего не меняет.
   */
  async setCoverImage(blockId: number, url: string) {
    const block = await this.prisma.block.findUnique({ where: { id: blockId } });
    if (!block) throw new NotFoundException(`ЖК ${blockId} не найден`);

    const existing = await this.prisma.blockImage.findFirst({
      where: { blockId, kind: 'RENDER' },
      orderBy: { sortOrder: 'asc' },
    });

    if (existing) {
      if (existing.url === url) return existing;
      return this.prisma.blockImage.update({
        where: { id: existing.id },
        data: { url },
      });
    }

    return this.prisma.blockImage.create({
      data: { blockId, url, kind: 'RENDER', sortOrder: 0 },
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.block.delete({ where: { id } });
    await this.invalidateCatalogCache();
    return { deleted: true };
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[а-яё]/gi, (c) => {
        const map: Record<string, string> = {
          а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh',
          з: 'z', и: 'i', й: 'j', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
          п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c',
          ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu',
          я: 'ya',
        };
        return map[c.toLowerCase()] || c;
      })
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private parseSort(sort?: string) {
    switch (sort) {
      case 'name_asc': return { name: 'asc' as const };
      case 'name_desc': return { name: 'desc' as const };
      case 'created_desc': return { createdAt: 'desc' as const };
      case 'sales_start_asc': return { salesStartDate: 'asc' as const };
      default: return { name: 'asc' as const };
    }
  }

  async listDeadlines(regionId: number): Promise<string[]> {
    // Distinct deadline tokens for UI filters: `YYYY Qn` plus optional `Сдан`.
    const buildings = await this.prisma.building.findMany({
      where: {
        block: { regionId },
        OR: [{ deadlineKey: { not: null } }, { deadline: { not: null } }],
      },
      select: { deadlineKey: true, deadline: true },
    });

    const tokenSet = new Set<string>();

    for (const b of buildings) {
      const raw = (b.deadlineKey ?? b.deadline) as unknown;
      if (!raw) continue;
      const dt = raw instanceof Date ? raw : new Date(String(raw));
      if (Number.isNaN(dt.getTime())) continue;
      const q = Math.ceil((dt.getMonth() + 1) / 3);
      const y = dt.getFullYear();
      const nowY = new Date().getFullYear();
      // Guard against trash years from bad sources.
      if (y < nowY - 1 || y > nowY + 15) continue;
      tokenSet.add(`${y} Q${q}`);
    }

    const hasCompleted = await this.prisma.block.count({ where: { regionId, status: BlockStatus.COMPLETED } });
    if (hasCompleted > 0) tokenSet.add('Сдан');

    const toks = Array.from(tokenSet);
    toks.sort((a, b) => {
      const la = a.toLowerCase();
      const lb = b.toLowerCase();
      if (la === 'сдан' && lb === 'сдан') return 0;
      if (la === 'сдан') return 1;
      if (lb === 'сдан') return -1;
      const ma = a.match(/^(\d{4})\s+Q([1-4])$/i);
      const mb = b.match(/^(\d{4})\s+Q([1-4])$/i);
      if (ma && mb) {
        const ya = Number(ma[1]);
        const yb = Number(mb[1]);
        if (ya !== yb) return ya - yb;
        return Number(ma[2]) - Number(mb[2]);
      }
      if (ma) return -1;
      if (mb) return 1;
      return a.localeCompare(b, 'ru');
    });

    return toks;
  }

}

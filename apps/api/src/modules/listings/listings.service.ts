import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, $Enums } from '@prisma/client';
import {
  resolveRoomListingTypeIds,
  type ListingWizardUiKind,
  type WizardServerPayload,
} from '@lg/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { GeoSpatialService } from '../geo/geo-spatial.service';
import { QueryListingsDto } from './dto/query-listings.dto';
import type {
  CreateManualApartmentDto,
  UpdateManualApartmentDto,
} from './dto/manual-apartment.dto';
import type { CreateManualHouseDto, UpdateManualHouseDto } from './dto/manual-house.dto';
import type { CreateManualLandDto, UpdateManualLandDto } from './dto/manual-land.dto';
import type {
  CreateManualCommercialDto,
  UpdateManualCommercialDto,
} from './dto/manual-commercial.dto';
import type {
  CreateManualParkingDto,
  UpdateManualParkingDto,
} from './dto/manual-parking.dto';
import type { ManualSellerDto } from './dto/manual-seller.dto';
import { ListingsGovernanceService } from './listings-governance.service';
import { ListingsPromotionService } from './listings-promotion.service';
import { effectivePromotion, isListingStale } from '@lg/shared';

const MEDIA_LIB_PREFIX = '/uploads/media/';
type ActorContext = { userId: string; role: string };
type SellerCarrier = { seller?: ManualSellerDto | null };

function assertPositiveNumber(value: number | null | undefined, label: string) {
  if (value == null || value <= 0) {
    throw new BadRequestException(`${label}: укажите значение больше 0`);
  }
}

function assertMediaLibraryUrl(u: string | undefined | null, label: string) {
  if (u == null || u === '') return;
  if (!u.startsWith(MEDIA_LIB_PREFIX)) {
    throw new BadRequestException(
      `${label}: разрешены только ссылки из медиатеки (${MEDIA_LIB_PREFIX}…)`,
    );
  }
}

function validateManualApartmentMedia(apt: {
  planUrl?: string | null;
  finishingPhotoUrl?: string | null;
  extraPhotoUrls?: unknown;
}) {
  assertMediaLibraryUrl(apt.planUrl ?? undefined, 'Планировка');
  assertMediaLibraryUrl(apt.finishingPhotoUrl ?? undefined, 'Фото отделки');
  if (apt.extraPhotoUrls == null) return;
  if (!Array.isArray(apt.extraPhotoUrls)) {
    throw new BadRequestException('extraPhotoUrls: ожидается массив строк');
  }
  if (apt.extraPhotoUrls.length > 24) {
    throw new BadRequestException('Не более 24 дополнительных фото');
  }
  let i = 0;
  for (const u of apt.extraPhotoUrls) {
    i++;
    if (typeof u !== 'string') {
      throw new BadRequestException(`Дополнительное фото #${i}: неверный формат`);
    }
    assertMediaLibraryUrl(u, `Дополнительное фото #${i}`);
  }
}

function validateManualGalleryMedia(data: {
  photoUrl?: string | null;
  extraPhotoUrls?: unknown;
}, label: string) {
  assertMediaLibraryUrl(data.photoUrl ?? undefined, `${label}: основное фото`);
  if (data.extraPhotoUrls == null) return;
  if (!Array.isArray(data.extraPhotoUrls)) {
    throw new BadRequestException(`${label}: extraPhotoUrls ожидается массив строк`);
  }
  if (data.extraPhotoUrls.length > 24) {
    throw new BadRequestException(`${label}: не более 24 дополнительных фото`);
  }
  let i = 0;
  for (const u of data.extraPhotoUrls) {
    i += 1;
    if (typeof u !== 'string') {
      throw new BadRequestException(`${label}: дополнительное фото #${i} имеет неверный формат`);
    }
    assertMediaLibraryUrl(u, `${label}: дополнительное фото #${i}`);
  }
}

@Injectable()
export class ListingsService implements OnModuleInit {
  private readonly logger = new Logger(ListingsService.name);
  private expireTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly geo: GeoSpatialService,
    private readonly governance: ListingsGovernanceService,
    private readonly promotions: ListingsPromotionService,
  ) {}

  onModuleInit() {
    if (process.env.LISTINGS_EXPIRE_DISABLE === 'true') {
      this.logger.log('Published listings expiration disabled (LISTINGS_EXPIRE_DISABLE)');
      return;
    }
    const intervalMs = Number(process.env.LISTINGS_EXPIRE_INTERVAL_MS ?? 6 * 60 * 60 * 1000);
    this.expireOldPublishedListings().catch((e) =>
      this.logger.warn(`Initial published listings expiration failed: ${e instanceof Error ? e.message : String(e)}`),
    );
    this.expireTimer = setInterval(() => {
      this.expireOldPublishedListings().catch((e) =>
        this.logger.warn(`Scheduled published listings expiration failed: ${e instanceof Error ? e.message : String(e)}`),
      );
    }, Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 6 * 60 * 60 * 1000);
    this.expireTimer.unref?.();
  }

  async findAll(query: QueryListingsDto, actor?: ActorContext) {
    if (!actor) query = sanitizePublicListingsQuery(query);
    await this.expireOldPublishedListings();
    await this.promotions.expireStalePromotions(50);
    const page = query.page ?? 1;
    const per_page = query.per_page ?? 20;
    const where = await this.buildWhere(query, { admin: Boolean(actor) || query.admin_view });
    if (actor) {
      this.governance.applyOwnershipScope(where, actor, query.scope);
    }
    if (query.owner_user_id) {
      where.ownerUserId = query.owner_user_id;
    }
    if (query.stale_only) {
      const staleCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      where.lastActivityAt = { lt: staleCutoff };
      where.visibility = { in: ['PUBLIC', 'HIDDEN'] };
    }
    const isPublicCatalog =
      !actor &&
      !query.admin_view &&
      query.visibility !== 'REVIEW' &&
      query.visibility !== 'REJECTED' &&
      query.visibility !== 'ARCHIVED';
    const orderBy = this.parseSort(query.sort, {
      promotionRank: this.promotions.usesPromotionRanking(query.sort, { publicCatalog: isPublicCatalog }),
    });

    const baseInclude = {
      apartment: {
        include: {
          roomType: true,
          finishing: true,
          buildingType: true,
        },
      },
      house: true,
      land: true,
      commercial: true,
      parking: true,
      block: { select: { name: true, slug: true } },
      building: { select: { name: true } },
      builder: { select: { name: true } },
      region: { select: { code: true, name: true } },
      seller: true,
        ownerUser: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            avatarUrl: true,
            role: true,
            agentProfile: { select: { slug: true } },
          },
        },
    } satisfies Prisma.ListingInclude;

    const include: Prisma.ListingInclude =
      actor && query.admin_view
        ? { ...baseInclude, wizardSnapshot: { select: { isPendingRevision: true } } }
        : baseInclude;

    const [data, total] = await Promise.all([
      this.prisma.listing.findMany({
        where,
        orderBy,
        skip: (page - 1) * per_page,
        take: per_page,
        include,
      }),
      this.prisma.listing.count({ where }),
    ]);

    const moderationActions = [
      'moderation_approve',
      'moderation_reject',
      'moderation_request_changes',
      'moderation_archive',
      'moderation_restore',
    ] as const;

    const lastModerationByListing = new Map<
      number,
      {
        action: string;
        note: string | null;
        createdAt: Date;
        user: { fullName: string | null; email: string | null } | null;
      }
    >();

    if (actor && query.admin_view && data.length > 0) {
      const history = await this.prisma.listingEditHistory.findMany({
        where: {
          listingId: { in: data.map((r) => r.id) },
          action: { in: [...moderationActions] },
        },
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { fullName: true, email: true } } },
      });
      for (const h of history) {
        if (!lastModerationByListing.has(h.listingId)) {
          lastModerationByListing.set(h.listingId, h);
        }
      }
    }

    return {
      data: data.map((row) => {
        const snap = 'wizardSnapshot' in row ? row.wizardSnapshot : null;
        const { wizardSnapshot: _snap, ...rest } = row as typeof row & {
          wizardSnapshot?: { isPendingRevision: boolean } | null;
        };
        const publicRow = actor ? rest : stripPrivateListingFields(rest);
        return {
          ...publicRow,
          isStale: isListingStale(row.lastActivityAt),
          isPendingRevision: snap?.isPendingRevision ?? false,
          lastModeratorAction: lastModerationByListing.get(row.id) ?? null,
          promotion: effectivePromotion(
            row.promotionTier,
            row.promotedUntil,
            row.vipPriority,
            row.boostScore,
          ),
        };
      }),
      meta: { page, per_page, total, total_pages: Math.ceil(total / per_page) },
    };
  }

  async findOne(id: number, opts?: { authenticated?: boolean; role?: string }) {
    await this.expireOldPublishedListings();
    const staff = isStaffRole(opts?.role);
    const listing = await this.prisma.listing.findUnique({
      where: staff
        ? { id }
        : {
            id,
            isPublished: true,
            visibility: 'PUBLIC',
            status: { in: [$Enums.ListingStatus.ACTIVE, $Enums.ListingStatus.RESERVED, $Enums.ListingStatus.SOLD] },
          },
      include: {
        apartment: {
          include: {
            roomType: true,
            finishing: true,
            buildingType: true,
            banks: true,
            contracts: true,
          },
        },
        house: true,
        land: true,
        commercial: true,
        parking: true,
        block: {
          include: {
            addresses: { orderBy: { sortOrder: 'asc' } },
            images: { orderBy: { sortOrder: 'asc' }, take: 4 },
            subways: {
              include: { subway: { select: { id: true, name: true } } },
              orderBy: { distanceTime: 'asc' },
              take: 3,
            },
          },
        },
        building: true,
        builder: { select: { id: true, name: true } },
        district: true,
        region: true,
        seller: true,
        ownerUser: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true,
            avatarUrl: true,
            role: true,
            agentProfile: { select: { slug: true } },
          },
        },
        ...(staff
          ? { wizardSnapshot: { select: { payload: true } } }
          : {}),
      },
    });
    if (!listing) throw new NotFoundException('Listing not found');

    const media = await this.prisma.mediaFile.findMany({
      where: { entityType: 'listing', entityId: id },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      select: { id: true, url: true, kind: true, sortOrder: true },
    });

    const { wizardSnapshot, ...listingRest } = listing as typeof listing & {
      wizardSnapshot?: { payload: unknown } | null;
    };
    const wizardUiKind =
      staff && listing.kind === 'APARTMENT'
        ? await this.inferApartmentWizardUiKind(listingRest, wizardSnapshot?.payload)
        : undefined;

    return this.governance.enrichPublicContact(
      {
        ...(staff ? listingRest : stripPrivateListingFields(listingRest)),
        mediaFiles: media,
        ...(wizardUiKind ? { wizardUiKind } : {}),
      },
      staff,
    );
  }

  private async expireOldPublishedListings() {
    const publishedBefore = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = await this.prisma.listing.updateMany({
      where: {
        isPublished: true,
        publishedAt: { lt: publishedBefore },
        status: { in: ['ACTIVE', 'RESERVED', 'DRAFT'] },
        dataSource: { not: 'FEED' },
      },
      data: {
        status: 'INACTIVE',
        isPublished: false,
      },
    });
    if (result.count > 0) {
      this.logger.log(`Moved ${result.count} expired listings to INACTIVE`);
    }
  }

  private publicationPatch(status?: $Enums.ListingStatus, isPublished?: boolean) {
    const patch: Prisma.ListingUpdateInput = { lastActivityAt: new Date() };
    if (status !== undefined) patch.status = status;
    if (isPublished !== undefined) {
      patch.isPublished = isPublished;
      if (isPublished) patch.publishedAt = new Date();
    }
    if (status === 'INACTIVE') {
      patch.isPublished = false;
      patch.visibility = 'ARCHIVED';
      patch.archivedAt = new Date();
    }
    if (isPublished === true) {
      patch.visibility = 'PUBLIC';
      patch.archivedAt = null;
    } else if (isPublished === false && status !== 'DRAFT' && status !== 'INACTIVE') {
      patch.visibility = 'HIDDEN';
    }
    if (status === 'DRAFT') patch.visibility = 'DRAFT';
    return patch;
  }

  private manualHouseTitle(h: { bedrooms?: number; settlement?: string; districtName?: string }) {
    const parts = ['Дом'];
    if (h.bedrooms != null && h.bedrooms > 0) parts.push(`${h.bedrooms} комн.`);
    if (h.settlement?.trim()) parts.push(h.settlement.trim());
    else if (h.districtName?.trim()) parts.push(h.districtName.trim());
    return parts.join(', ');
  }

  /** Shared catalog filters for list endpoints and viewport prototype (Iter 10). */
  async buildCatalogListingWhere(
    query: QueryListingsDto,
  ): Promise<{ where: Prisma.ListingWhereInput; noMatch: boolean }> {
    const where = await this.buildWhere(query);
    const idFilter = where.id;
    if (
      idFilter &&
      typeof idFilter === 'object' &&
      'lt' in idFilter &&
      (idFilter as { lt: number }).lt === 0
    ) {
      return { where, noMatch: true };
    }
    return { where, noMatch: false };
  }

  private async buildWhere(
    query: QueryListingsDto,
    opts?: { admin?: boolean },
  ): Promise<Prisma.ListingWhereInput> {
    const where: Prisma.ListingWhereInput = {};

    if (query.region_id != null) where.regionId = query.region_id;

    const geoRes = await this.geo.resolveGeoBlockIds({
      region_id: query.region_id,
      geo_lat: query.geo_lat,
      geo_lng: query.geo_lng,
      geo_radius_m: query.geo_radius_m,
      geo_polygon: query.geo_polygon,
      geo_preset: query.geo_preset,
    });
    if (geoRes.noMatch) {
      where.id = { lt: 0 };
      return where;
    }
    const geoIds = geoRes.ids;
    if (geoIds && query.block_id != null && !geoIds.includes(query.block_id)) {
      where.id = { lt: 0 };
      return where;
    }
    if (query.kind) where.kind = query.kind as $Enums.ListingKind;
    if (query.statuses?.trim()) {
      const statusList = query.statuses
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0) as $Enums.ListingStatus[];
      if (statusList.length === 1) {
        where.status = statusList[0];
      } else if (statusList.length > 1) {
        where.status = { in: statusList };
      }
    } else if (query.status) {
      where.status = query.status as $Enums.ListingStatus;
    } else {
      where.status = { in: [$Enums.ListingStatus.ACTIVE, $Enums.ListingStatus.RESERVED] };
    }
    if (query.visibility) {
      where.visibility = query.visibility as $Enums.ListingVisibility;
    }
    if (query.is_published !== undefined) {
      where.isPublished = query.is_published;
    } else if (!opts?.admin) {
      where.visibility = 'PUBLIC';
      where.isPublished = true;
    }
    if (query.has_geo) {
      where.lat = { not: null };
      where.lng = { not: null };
    }
    if (query.data_source) where.dataSource = query.data_source as $Enums.DataSource;
    if (query.external_id_prefix?.trim()) {
      where.externalId = { startsWith: query.external_id_prefix.trim() };
    }
    if (query.builder_id != null) where.builderId = query.builder_id;
    if (query.district_id != null) where.districtId = query.district_id;
    if (query.district_names?.trim() && query.kind !== 'HOUSE') {
      const names = query.district_names.split(',').map(s => s.trim()).filter(Boolean);
      if (names.length > 0) {
        const districts = await this.prisma.district.findMany({
          where: { regionId: query.region_id, name: { in: names } },
          select: { id: true },
        });
        const ids = districts.map(d => d.id);
        if (ids.length > 0) {
          where.districtId = { in: ids };
        } else {
          where.id = { lt: 0 }; // no matching districts
        }
      }
    }

    const priceFilter: Prisma.DecimalNullableFilter<'Listing'> = {};
    if (query.price_min != null || query.price_max != null) {
      priceFilter.not = null;
      priceFilter.gt = 0;
    }
    if (query.price_min != null) priceFilter.gte = query.price_min;
    if (query.price_max != null) priceFilter.lte = query.price_max;
    if (Object.keys(priceFilter).length) where.price = priceFilter;

    if (query.subway_id != null) {
      where.block = {
        ...(query.block_id != null
          ? { id: query.block_id }
          : geoIds
            ? { id: { in: geoIds } }
            : {}),
        subways: { some: { subwayId: query.subway_id } },
      };
    } else if (query.block_id != null) {
      where.blockId = query.block_id;
    } else if (geoIds) {
      where.blockId = { in: geoIds };
    }

    const apartmentParts = await this.buildApartmentWhereParts(query);
    const listingAndBuckets: Prisma.ListingWhereInput[] = [];
    if (apartmentParts.length) {
      listingAndBuckets.push({ apartment: { AND: apartmentParts } });
    }
    const marketClause = this.apartmentMarketWhereClause(query.apartment_market, query.kind);
    if (marketClause) listingAndBuckets.push(marketClause);
    if (query.apartment_category === 'room' || query.apartment_category === 'standard') {
      const roomTypeIds = await this.resolveRoomListingTypeIds();
      listingAndBuckets.push(this.apartmentCategoryWhere(query.apartment_category, roomTypeIds));
    }
    if (listingAndBuckets.length) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        ...listingAndBuckets,
      ];
    }

    if (query.house_category === 'dacha' || query.house_category === 'standard') {
      const houseCat = this.houseCategoryWhere(query.house_category);
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        houseCat,
      ];
    }

    if (query.kind === 'HOUSE') {
      const houseParts = this.buildHouseWhereParts(query);
      if (houseParts.length) {
        where.house = { AND: houseParts };
      }
    }

    // Land filters
    if (query.kind === 'LAND') {
      const landParts: Prisma.ListingLandWhereInput[] = [];
      if (query.area_total_min != null || query.area_total_max != null) {
        const landArea: Prisma.DecimalNullableFilter<'ListingLand'> = {};
        if (query.area_total_min != null) landArea.gte = new Prisma.Decimal(query.area_total_min);
        if (query.area_total_max != null) landArea.lte = new Prisma.Decimal(query.area_total_max);
        landParts.push({ areaSotki: landArea });
      }
      const landCats = this.parseStringList(query.land_categories);
      if (landCats.length) landParts.push({ landCategory: { in: landCats } });
      if (landParts.length) where.land = { AND: landParts };
    }

    // Commercial filters
    if (query.kind === 'COMMERCIAL') {
      const commParts: Prisma.ListingCommercialWhereInput[] = [];
      if (query.area_total_min != null || query.area_total_max != null) {
        const commArea: Prisma.DecimalNullableFilter<'ListingCommercial'> = {};
        if (query.area_total_min != null) commArea.gte = new Prisma.Decimal(query.area_total_min);
        if (query.area_total_max != null) commArea.lte = new Prisma.Decimal(query.area_total_max);
        commParts.push({ area: commArea });
      }
      const commTypes = this.parseStringList(query.commercial_types).filter((t): t is $Enums.CommercialType =>
        (['OFFICE', 'RETAIL', 'WAREHOUSE', 'RESTAURANT', 'OTHER'] as string[]).includes(t),
      );
      if (commTypes.length) commParts.push({ commercialType: { in: commTypes } });
      if (commParts.length) where.commercial = { AND: commParts };
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      const searchOr: Prisma.ListingWhereInput[] = [
        { title: { contains: term, mode: 'insensitive' } },
        { address: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
        { block: { name: { contains: term, mode: 'insensitive' } } },
        { apartment: { blockName: { contains: term, mode: 'insensitive' } } },
        { house: { settlement: { contains: term, mode: 'insensitive' } } },
        { house: { street: { contains: term, mode: 'insensitive' } } },
        { house: { districtName: { contains: term, mode: 'insensitive' } } },
        { house: { synonyms: { contains: term, mode: 'insensitive' } } },
      ];
      const id = Number.parseInt(term, 10);
      if (Number.isFinite(id) && String(id) === term) searchOr.push({ id });
      where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), { OR: searchOr }];
    }

    return where;
  }

  private canManageAllSellers(role?: string): boolean {
    return role === 'admin' || role === 'editor' || role === 'manager';
  }

  private normalizeSellerData(seller?: ManualSellerDto | null) {
    if (!seller) return null;
    const data = {
      fullName: seller.fullName?.trim() || null,
      phone: seller.phone?.trim() || null,
      phoneAlt: seller.phoneAlt?.trim() || null,
      email: seller.email?.trim() || null,
      address: seller.address?.trim() || null,
      notes: seller.notes?.trim() || null,
    };
    return Object.values(data).some((v) => v !== null) ? data : null;
  }

  private async assertSellerAccess(sellerId: number, actorUserId?: string, actorRole?: string) {
    if (this.canManageAllSellers(actorRole)) return;
    if (!actorUserId) throw new ForbiddenException('Нет доступа к продавцу');
    const seller = await this.prisma.seller.findUnique({
      where: { id: sellerId },
      select: { id: true, createdById: true },
    });
    if (!seller) throw new BadRequestException('Продавец не найден');
    if (seller.createdById !== actorUserId) {
      throw new ForbiddenException('Нет доступа к продавцу');
    }
  }

  private async resolveSellerListingCreate(
    dto: SellerCarrier,
    actorUserId?: string,
    actorRole?: string,
  ): Promise<Pick<Prisma.ListingUncheckedCreateInput, 'sellerId'>> {
    const seller = dto.seller;
    if (!seller) return {};
    if (seller.sellerId != null) {
      await this.assertSellerAccess(seller.sellerId, actorUserId, actorRole);
      return { sellerId: seller.sellerId };
    }
    const data = this.normalizeSellerData(seller);
    if (!data) return {};
    const created = await this.prisma.seller.create({
      data: {
        ...data,
        ...(actorUserId ? { createdBy: { connect: { id: actorUserId } } } : {}),
        ...(actorUserId ? { updatedBy: { connect: { id: actorUserId } } } : {}),
      },
      select: { id: true },
    });
    return { sellerId: created.id };
  }

  private async resolveSellerListingUpdate(
    listingId: number,
    dto: SellerCarrier,
    actorUserId?: string,
    actorRole?: string,
  ): Promise<{ patch: Pick<Prisma.ListingUpdateInput, 'seller'>; touched: boolean }> {
    if (dto.seller === undefined) return { patch: {}, touched: false };
    if (dto.seller === null) return { patch: { seller: { disconnect: true } }, touched: true };
    const seller = dto.seller;

    if (seller.sellerId !== undefined) {
      if (seller.sellerId === null) {
        return { patch: { seller: { disconnect: true } }, touched: true };
      }
      await this.assertSellerAccess(seller.sellerId, actorUserId, actorRole);
      return { patch: { seller: { connect: { id: seller.sellerId } } }, touched: true };
    }

    const data = this.normalizeSellerData(seller);
    if (!data) return { patch: {}, touched: false };

    const current = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { sellerId: true },
    });
    if (current?.sellerId) {
      await this.assertSellerAccess(current.sellerId, actorUserId, actorRole);
      await this.prisma.seller.update({
        where: { id: current.sellerId },
        data: {
          ...data,
          ...(actorUserId ? { updatedBy: { connect: { id: actorUserId } } } : {}),
        },
      });
      return { patch: {}, touched: true };
    }

    return {
      patch: {
        seller: {
          create: {
            ...data,
            ...(actorUserId ? { createdBy: { connect: { id: actorUserId } } } : {}),
            ...(actorUserId ? { updatedBy: { connect: { id: actorUserId } } } : {}),
          },
        },
      },
      touched: true,
    };
  }

  /** Фильтр новостройка/вторичка для объявлений-квартир (публичный query apartment_market). */
  private apartmentMarketWhereClause(
    raw: string | undefined,
    kind: string | undefined,
  ): Prisma.ListingWhereInput | undefined {
    if (!raw?.trim()) return undefined;
    if (kind != null && kind !== '' && kind !== 'APARTMENT') return undefined;
    const norm = raw.trim().toLowerCase();
    if (norm === 'secondary') {
      return {
        OR: [
          { apartment: { marketSegment: 'SECONDARY' } },
          { AND: [{ blockId: null }, { apartment: { marketSegment: null } }] },
        ],
      };
    }
    if (norm === 'new_building') {
      return {
        OR: [
          { apartment: { marketSegment: 'NEW_BUILDING' } },
          { AND: [{ blockId: { not: null } }, { apartment: { marketSegment: null } }] },
        ],
      };
    }
    return undefined;
  }

  private async resolveRoomListingTypeIds(): Promise<number[]> {
    const rows = await this.prisma.roomType.findMany({
      select: { id: true, name: true, nameOne: true, crmId: true },
    });
    return resolveRoomListingTypeIds(
      rows.map((rt) => ({
        id: rt.id,
        name: rt.name,
        nameOne: rt.nameOne,
        crmId: rt.crmId,
      })),
    );
  }

  private async inferApartmentWizardUiKind(
    listing: {
      apartment?: { roomTypeId?: number | null } | null;
    },
    snapshotPayload?: unknown,
  ): Promise<'APARTMENT' | 'ROOM'> {
    const snapKind = (snapshotPayload as WizardServerPayload | undefined)?.kind;
    if (snapKind === 'ROOM' || snapKind === 'APARTMENT') return snapKind;
    const roomListingIds = await this.resolveRoomListingTypeIds();
    const rtId = listing.apartment?.roomTypeId;
    if (rtId != null && roomListingIds.includes(rtId)) return 'ROOM';
    return 'APARTMENT';
  }

  private async applyApartmentWizardUiKind(
    listingId: number,
    uiKind: 'APARTMENT' | 'ROOM',
    aptPatch: Prisma.ListingApartmentUpdateInput,
    actorUserId?: string,
  ): Promise<void> {
    const roomListingIds = await this.resolveRoomListingTypeIds();
    if (uiKind === 'ROOM' && roomListingIds.length) {
      aptPatch.roomType = { connect: { id: roomListingIds[0]! } };
    } else if (uiKind === 'APARTMENT') {
      const current = await this.prisma.listingApartment.findUnique({
        where: { listingId },
        select: { roomTypeId: true },
      });
      if (
        current?.roomTypeId != null &&
        roomListingIds.includes(current.roomTypeId)
      ) {
        aptPatch.roomType = { disconnect: true };
      }
    }

    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      include: {
        apartment: true,
        seller: true,
        ownerUser: { select: { id: true } },
      },
    });
    if (!listing) return;

    const snap = await this.prisma.listingWizardSnapshot.findUnique({
      where: { listingId },
      select: { payload: true, wizardStep: true },
    });
    const prev = (snap?.payload as WizardServerPayload | undefined) ?? undefined;
    const payload: WizardServerPayload = prev ?? {
      kind: uiKind,
      regionId: listing.regionId,
      blockId: listing.blockId != null ? String(listing.blockId) : '',
      address: listing.address ?? '',
      lat: listing.lat != null ? String(listing.lat) : '',
      lng: listing.lng != null ? String(listing.lng) : '',
      price: listing.price != null ? String(listing.price) : '',
      ownerUserId: listing.ownerUserId,
      ownerMode: listing.ownerUserId ? 'self' : 'agency',
      publishAction: 'draft',
      apartment: {},
      house: {},
      land: {},
      commercial: {},
      parking: {},
      mainPhotoUrl: '',
      extraPhotoUrls: [],
      planUrl: '',
      seller: {
        fullName: listing.seller?.fullName ?? '',
        phone: listing.seller?.phone ?? '',
        email: listing.seller?.email ?? '',
        address: listing.seller?.address ?? '',
      },
    };
    payload.kind = uiKind as ListingWizardUiKind;

    await this.prisma.listingWizardSnapshot.upsert({
      where: { listingId },
      create: {
        listingId,
        payload: payload as unknown as Prisma.InputJsonValue,
        wizardStep: snap?.wizardStep ?? 4,
        updatedByUserId: actorUserId ?? null,
      },
      update: {
        payload: payload as unknown as Prisma.InputJsonValue,
        updatedByUserId: actorUserId ?? null,
      },
    });
  }

  /** Split HOUSE listings into «дачи» vs «дома» (wizard kind=DACHA). */
  private houseCategoryWhere(category: 'dacha' | 'standard'): Prisma.ListingWhereInput {
    const isDacha: Prisma.ListingWhereInput = {
      wizardSnapshot: { payload: { path: ['kind'], equals: 'DACHA' } },
    };
    return category === 'dacha' ? isDacha : { NOT: isDacha };
  }

  /** Split APARTMENT listings into «комнаты» vs «квартиры» (feed crm 100 + wizard kind=ROOM). */
  private apartmentCategoryWhere(
    category: 'room' | 'standard',
    roomTypeIds: number[],
  ): Prisma.ListingWhereInput {
    const isRoom: Prisma.ListingWhereInput[] = [
      { wizardSnapshot: { payload: { path: ['kind'], equals: 'ROOM' } } },
    ];
    if (roomTypeIds.length) {
      isRoom.unshift({ apartment: { roomTypeId: { in: roomTypeIds } } });
    }
    const roomClause: Prisma.ListingWhereInput = { OR: isRoom };
    return category === 'room' ? roomClause : { NOT: roomClause };
  }

  private async buildApartmentWhereParts(query: QueryListingsDto): Promise<Prisma.ListingApartmentWhereInput[]> {
    const parts: Prisma.ListingApartmentWhereInput[] = [];

    const roomTypeIds = this.parseIdList(query.room_type_ids);
    if (roomTypeIds?.length) {
      parts.push({ roomTypeId: { in: roomTypeIds } });
    } else {
      // rooms param is room-category list (0=studio,1=1к,2=2к...) same as blocks API
      const roomCatIds = await this.parseRoomCategoryIds(query.rooms);
      if (roomCatIds?.length) parts.push({ roomTypeId: { in: roomCatIds } });
    }

    const finishingIds = this.parseIdList(query.finishing);
    if (finishingIds?.length) parts.push({ finishingId: { in: finishingIds } });

    const buildingTypeIds = this.parseIdList(query.building_type);
    if (buildingTypeIds?.length) parts.push({ buildingTypeId: { in: buildingTypeIds } });

    if (query.floor_min != null) {
      parts.push({ floor: { gte: query.floor_min } });
    }
    if (query.floor_max != null) {
      parts.push({ floor: { lte: query.floor_max } });
    }

    // Only apply apartment area filter when not filtering by a non-apartment kind
    // (HOUSE/LAND/COMMERCIAL have their own area filters applied separately)
    if (query.kind == null || query.kind === 'APARTMENT') {
      if (query.area_total_min != null) {
        parts.push({ areaTotal: { gte: query.area_total_min } });
      }
      if (query.area_total_max != null) {
        parts.push({ areaTotal: { lte: query.area_total_max } });
      }
    }

    if (query.area_kitchen_min != null) {
      parts.push({ areaKitchen: { gte: query.area_kitchen_min } });
    }
    if (query.area_kitchen_max != null) {
      parts.push({ areaKitchen: { lte: query.area_kitchen_max } });
    }

    if (query.not_first_floor) {
      parts.push({ floor: { gt: 1 } });
    }

    if (query.not_last_floor) {
      parts.push({
        floor: { lt: this.prisma.listingApartment.fields.floorsTotal },
      });
    }

    return parts;
  }

  private buildHouseWhereParts(query: QueryListingsDto): Prisma.ListingHouseWhereInput[] {
    const parts: Prisma.ListingHouseWhereInput[] = [];

    if (query.area_total_min != null || query.area_total_max != null) {
      const areaTotal: Prisma.DecimalNullableFilter<'ListingHouse'> = {};
      if (query.area_total_min != null) areaTotal.gte = new Prisma.Decimal(query.area_total_min);
      if (query.area_total_max != null) areaTotal.lte = new Prisma.Decimal(query.area_total_max);
      parts.push({ areaTotal });
    }

    if (query.house_land_min != null || query.house_land_max != null) {
      const areaLand: Prisma.DecimalNullableFilter<'ListingHouse'> = {};
      if (query.house_land_min != null) areaLand.gte = new Prisma.Decimal(query.house_land_min);
      if (query.house_land_max != null) areaLand.lte = new Prisma.Decimal(query.house_land_max);
      parts.push({ areaLand });
    }

    if (query.distance_min != null || query.distance_max != null) {
      const distanceToCity: Prisma.IntNullableFilter<'ListingHouse'> = {};
      if (query.distance_min != null) distanceToCity.gte = query.distance_min;
      if (query.distance_max != null) distanceToCity.lte = query.distance_max;
      parts.push({ distanceToCity });
    }

    const roomCategories = this.parseNumberList(query.rooms).filter((n) => n >= 1 && n <= 4);
    if (roomCategories.length) {
      const exact = roomCategories.filter((n) => n >= 1 && n <= 3);
      const roomOr: Prisma.ListingHouseWhereInput[] = [];
      if (exact.length) roomOr.push({ bedrooms: { in: exact } });
      if (roomCategories.includes(4)) roomOr.push({ bedrooms: { gte: 4 } });
      if (roomOr.length) parts.push({ OR: roomOr });
    }

    const directions = new Set(
      this.parseStringList(query.house_directions ?? query.directions),
    );
    const directionOr: Prisma.ListingHouseWhereInput[] = [];
    if (directions.has('south')) directionOr.push({ directionSouth: true });
    if (directions.has('north')) directionOr.push({ directionNorth: true });
    if (directions.has('east')) directionOr.push({ directionEast: true });
    if (directions.has('west')) directionOr.push({ directionWest: true });
    if (directionOr.length) parts.push({ OR: directionOr });

    const locations = new Set(this.parseStringList(query.house_location));
    const locationOr: Prisma.ListingHouseWhereInput[] = [];
    if (locations.has('belgorod_district')) locationOr.push({ inBelgorodDistrict: true });
    if (locations.has('belgorod_region')) locationOr.push({ inBelgorodRegion: true });
    if (locationOr.length) parts.push({ OR: locationOr });

    const materials = this.parseStringList(query.house_materials);
    if (materials.length) parts.push({ material: { in: materials } });

    const districtNames = query.district_names
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (districtNames?.length) {
      parts.push({ districtName: { in: this.expandHouseDistrictNameFilter(districtNames) } });
    }

    return parts;
  }

  /** Совпадение «Белгородский район» в UI и «Белгородский» в CRM / DB.sql. */
  private expandHouseDistrictNameFilter(names: string[]): string[] {
    const out = new Set<string>();
    for (const raw of names) {
      const n = raw.trim();
      if (!n) continue;
      out.add(n);
      const base = n.replace(/\s+район\s*$/i, '').trim();
      if (base && base !== n) out.add(base);
      if (!/район\s*$/i.test(n) && base) {
        out.add(`${base} район`);
      }
    }
    return [...out];
  }

  /** Convert room-category numbers (0=studio,1=1к…4=4+) to roomType IDs from DB.
   *  Frontend always sends category values 0-4, NEVER raw room_type IDs.
   *  Map: 0→Студии, 1→1к, 2→2к, 3→3к, 4→4к+
   */
  private roomCategoryFromName(name?: string | null): number | null {
    const n = (name ?? '').toLowerCase();
    if (!n) return null;
    if (n.includes('студ')) return 0;
    const m = n.match(/(\d)/);
    if (m) {
      const r = Number.parseInt(m[1], 10);
      return r > 4 ? 4 : r;
    }
    return null;
  }

  private async parseRoomCategoryIds(raw?: string): Promise<number[] | undefined> {
    if (!raw?.trim()) return undefined;
    const categories = Array.from(
      new Set(
        raw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n >= 0 && n <= 4),
      ),
    );
    if (!categories.length) return undefined;

    const roomTypes = await this.prisma.roomType.findMany({
      select: { id: true, name: true, nameOne: true },
    });
    const wanted = new Set(categories);
    const ids: number[] = [];
    for (const rt of roomTypes) {
      const cat = this.roomCategoryFromName(rt.nameOne ?? rt.name);
      if (cat != null && wanted.has(cat)) ids.push(rt.id);
    }
    return ids.length ? Array.from(new Set(ids)) : undefined;
  }

  private parseIdList(raw?: string): number[] | undefined {
    if (!raw?.trim()) return undefined;
    const ids = this.parseNumberList(raw);
    return ids.length ? ids : undefined;
  }

  private parseNumberList(raw?: string): number[] {
    if (!raw?.trim()) return [];
    return raw
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !Number.isNaN(n));
  }

  private parseStringList(raw?: string): string[] {
    if (!raw?.trim()) return [];
    return raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }

  private parseSort(
    sort?: string,
    opts?: { promotionRank?: boolean },
  ): Prisma.ListingOrderByWithRelationInput | Prisma.ListingOrderByWithRelationInput[] {
    if (opts?.promotionRank) {
      return [
        { vipPriority: 'desc' },
        { boostScore: 'desc' },
        { lastActivityAt: 'desc' },
        { createdAt: 'desc' },
        { id: 'asc' },
      ];
    }
    switch (sort) {
      case 'price_asc':
        return { price: 'asc' };
      case 'price_desc':
        return { price: 'desc' };
      case 'area_asc':
        return { apartment: { areaTotal: 'asc' } };
      case 'area_desc':
        return { apartment: { areaTotal: 'desc' } };
      case 'floor_asc':
        return { apartment: { floor: 'asc' } };
      case 'floor_desc':
        return { apartment: { floor: 'desc' } };
      case 'created_desc':
        return { createdAt: 'desc' };
      default:
        return { createdAt: 'desc' };
    }
  }

  async createManualApartment(dto: CreateManualApartmentDto, actorUserId?: string, actorRole?: string) {
    const region = await this.prisma.feedRegion.findUnique({
      where: { id: dto.regionId },
      select: { id: true },
    });
    if (!region) throw new BadRequestException('Регион не найден');

    if (dto.blockId != null) {
      const block = await this.prisma.block.findUnique({
        where: { id: dto.blockId },
        select: { id: true, regionId: true },
      });
      if (!block) throw new BadRequestException('ЖК не найден');
      if (block.regionId !== dto.regionId) {
        throw new BadRequestException('ЖК относится к другому региону');
      }
    }

    const base = this.governance.manualCreateFields(actorUserId, actorRole, {
      status: dto.status,
      isPublished: dto.isPublished,
    });
    const status = (dto.status ?? 'DRAFT') as $Enums.ListingStatus;
    const a = dto.apartment;
    validateManualApartmentMedia(a);

    const marketSegment: $Enums.ApartmentMarketSegment =
      a.marketSegment === 'NEW_BUILDING' || a.marketSegment === 'SECONDARY'
        ? (a.marketSegment as $Enums.ApartmentMarketSegment)
        : dto.blockId != null
          ? 'NEW_BUILDING'
          : 'SECONDARY';

    const uiKind = dto.wizardUiKind ?? 'APARTMENT';
    let roomTypeId = a.roomTypeId ?? null;
    if (uiKind === 'ROOM') {
      const roomListingIds = await this.resolveRoomListingTypeIds();
      if (roomListingIds.length) roomTypeId = roomListingIds[0]!;
    }

    const created = await this.prisma.listing.create({
      data: {
        regionId: dto.regionId,
        kind: 'APARTMENT',
        blockId: dto.blockId ?? null,
        ...base,
        price: new Prisma.Decimal(dto.price),
        currency: 'RUB',
        status,
        dataSource: 'MANUAL',
        isPublished: dto.isPublished ?? false,
        publishedAt: dto.isPublished ? new Date() : null,
        address: dto.address?.trim() || dto.seller?.address?.trim() || null,
        lat: dto.lat ?? null,
        lng: dto.lng ?? null,
        ...(await this.resolveSellerListingCreate(dto, actorUserId, actorRole)),
        apartment: {
          create: {
            areaTotal: new Prisma.Decimal(a.areaTotal),
            areaKitchen:
              a.areaKitchen != null ? new Prisma.Decimal(a.areaKitchen) : null,
            floor: a.floor ?? null,
            floorsTotal: a.floorsTotal ?? null,
            roomTypeId,
            finishingId: a.finishingId ?? null,
            planUrl: a.planUrl ?? null,
            finishingPhotoUrl: a.finishingPhotoUrl ?? null,
            extraPhotoUrls:
              a.extraPhotoUrls != null && a.extraPhotoUrls.length > 0
                ? (a.extraPhotoUrls as Prisma.InputJsonValue)
                : undefined,
            blockAddress: a.blockAddress ?? null,
            buildingName: a.buildingName ?? null,
            number: a.number ?? null,
            marketSegment,
          },
        },
      },
      include: {
        apartment: { include: { roomType: true, finishing: true } },
        block: { select: { id: true, name: true, slug: true } },
        region: { select: { id: true, code: true, name: true } },
        seller: true,
      },
    });

    if (uiKind === 'ROOM') {
      await this.applyApartmentWizardUiKind(created.id, 'ROOM', {}, actorUserId);
    }

    return created;
  }

  async createManualHouse(dto: CreateManualHouseDto, actorUserId?: string, actorRole?: string) {
    const region = await this.prisma.feedRegion.findUnique({
      where: { id: dto.regionId },
      select: { id: true },
    });
    if (!region) throw new BadRequestException('Регион не найден');

    if (dto.blockId != null) {
      const block = await this.prisma.block.findUnique({
        where: { id: dto.blockId },
        select: { id: true, regionId: true },
      });
      if (!block) throw new BadRequestException('ЖК не найден');
      if (block.regionId !== dto.regionId) {
        throw new BadRequestException('ЖК относится к другому региону');
      }
    }

    const base = this.governance.manualCreateFields(actorUserId, actorRole, {
      status: dto.status,
      isPublished: dto.isPublished,
    });
    const status = (dto.status ?? 'DRAFT') as $Enums.ListingStatus;
    const h = dto.house;
    assertPositiveNumber(h.areaTotal, 'Площадь дома');
    validateManualGalleryMedia(h, 'Дом');

    return this.prisma.listing.create({
      data: {
        regionId: dto.regionId,
        kind: 'HOUSE',
        blockId: dto.blockId ?? null,
        ...base,
        price: new Prisma.Decimal(dto.price),
        currency: 'RUB',
        status,
        dataSource: 'MANUAL',
        isPublished: dto.isPublished ?? false,
        isHot: dto.isHot ?? false,
        publishedAt: dto.isPublished ? new Date() : null,
        title: this.manualHouseTitle(h),
        address: dto.address?.trim() || dto.seller?.address?.trim() || null,
        description: dto.description?.trim() || null,
        lat: dto.lat ?? null,
        lng: dto.lng ?? null,
        ...(await this.resolveSellerListingCreate(dto, actorUserId, actorRole)),
        house: {
          create: {
            houseType: h.houseType ?? null,
            material: h.material?.trim() || null,
            areaTotal: h.areaTotal != null ? new Prisma.Decimal(h.areaTotal) : null,
            areaLiving: h.areaLiving != null ? new Prisma.Decimal(h.areaLiving) : null,
            areaKitchen: h.areaKitchen != null ? new Prisma.Decimal(h.areaKitchen) : null,
            areaLand: h.areaLand != null ? new Prisma.Decimal(h.areaLand) : null,
            floorsCount: h.floorsCount ?? null,
            bedrooms: h.bedrooms ?? null,
            bathrooms: h.bathrooms ?? null,
            districtName: h.districtName?.trim() || null,
            settlement: h.settlement?.trim() || null,
            street: h.street?.trim() || null,
            houseNumber: h.houseNumber?.trim() || null,
            synonyms: h.synonyms?.trim() || null,
            distanceToCity: h.distanceToCity ?? null,
            directionSouth: h.directionSouth ?? false,
            directionNorth: h.directionNorth ?? false,
            directionEast: h.directionEast ?? false,
            directionWest: h.directionWest ?? false,
            inBelgorodDistrict: h.inBelgorodDistrict ?? true,
            inBelgorodRegion: h.inBelgorodRegion ?? true,
            hasGarage: h.hasGarage ?? null,
            yearBuilt: h.yearBuilt ?? null,
            photoUrl: h.photoUrl ?? null,
            extraPhotoUrls:
              h.extraPhotoUrls != null && h.extraPhotoUrls.length > 0
                ? (h.extraPhotoUrls as Prisma.InputJsonValue)
                : undefined,
          },
        },
      },
      include: {
        house: true,
        block: { select: { id: true, name: true, slug: true } },
        region: { select: { id: true, code: true, name: true } },
        seller: true,
      },
    });
  }

  async createManualLand(dto: CreateManualLandDto, actorUserId?: string, actorRole?: string) {
    const region = await this.prisma.feedRegion.findUnique({
      where: { id: dto.regionId },
      select: { id: true },
    });
    if (!region) throw new BadRequestException('Регион не найден');

    if (dto.blockId != null) {
      const block = await this.prisma.block.findUnique({
        where: { id: dto.blockId },
        select: { id: true, regionId: true },
      });
      if (!block) throw new BadRequestException('ЖК не найден');
      if (block.regionId !== dto.regionId) {
        throw new BadRequestException('ЖК относится к другому региону');
      }
    }

    const base = this.governance.manualCreateFields(actorUserId, actorRole, {
      status: dto.status,
      isPublished: dto.isPublished,
    });
    const status = (dto.status ?? 'DRAFT') as $Enums.ListingStatus;
    const l = dto.land;
    assertPositiveNumber(l.areaSotki, 'Площадь участка');
    validateManualGalleryMedia(l, 'Участок');

    return this.prisma.listing.create({
      data: {
        regionId: dto.regionId,
        kind: 'LAND',
        blockId: dto.blockId ?? null,
        ...base,
        price: new Prisma.Decimal(dto.price),
        currency: 'RUB',
        status,
        dataSource: 'MANUAL',
        isPublished: dto.isPublished ?? false,
        publishedAt: dto.isPublished ? new Date() : null,
        address: dto.address?.trim() || dto.seller?.address?.trim() || null,
        lat: dto.lat ?? null,
        lng: dto.lng ?? null,
        ...(await this.resolveSellerListingCreate(dto, actorUserId, actorRole)),
        land: {
          create: {
            areaSotki: l.areaSotki != null ? new Prisma.Decimal(l.areaSotki) : null,
            landCategory: l.landCategory ?? null,
            cadastralNumber: l.cadastralNumber ?? null,
            hasCommunications: l.hasCommunications ?? null,
            photoUrl: l.photoUrl ?? null,
            extraPhotoUrls:
              l.extraPhotoUrls != null && l.extraPhotoUrls.length > 0
                ? (l.extraPhotoUrls as Prisma.InputJsonValue)
                : undefined,
          },
        },
      },
      include: {
        land: true,
        block: { select: { id: true, name: true, slug: true } },
        region: { select: { id: true, code: true, name: true } },
        seller: true,
      },
    });
  }

  async createManualCommercial(dto: CreateManualCommercialDto, actorUserId?: string, actorRole?: string) {
    const region = await this.prisma.feedRegion.findUnique({
      where: { id: dto.regionId },
      select: { id: true },
    });
    if (!region) throw new BadRequestException('Регион не найден');

    if (dto.blockId != null) {
      const block = await this.prisma.block.findUnique({
        where: { id: dto.blockId },
        select: { id: true, regionId: true },
      });
      if (!block) throw new BadRequestException('ЖК не найден');
      if (block.regionId !== dto.regionId) {
        throw new BadRequestException('ЖК относится к другому региону');
      }
    }

    const base = this.governance.manualCreateFields(actorUserId, actorRole, {
      status: dto.status,
      isPublished: dto.isPublished,
    });
    const status = (dto.status ?? 'DRAFT') as $Enums.ListingStatus;
    const c = dto.commercial;
    assertPositiveNumber(c.area, 'Площадь помещения');
    validateManualGalleryMedia(c, 'Коммерция');

    return this.prisma.listing.create({
      data: {
        regionId: dto.regionId,
        kind: 'COMMERCIAL',
        blockId: dto.blockId ?? null,
        ...base,
        price: new Prisma.Decimal(dto.price),
        currency: 'RUB',
        status,
        dataSource: 'MANUAL',
        isPublished: dto.isPublished ?? false,
        publishedAt: dto.isPublished ? new Date() : null,
        address: dto.address?.trim() || dto.seller?.address?.trim() || null,
        lat: dto.lat ?? null,
        lng: dto.lng ?? null,
        ...(await this.resolveSellerListingCreate(dto, actorUserId, actorRole)),
        commercial: {
          create: {
            commercialType: c.commercialType ?? null,
            area: c.area != null ? new Prisma.Decimal(c.area) : null,
            floor: c.floor ?? null,
            hasSeparateEntrance: c.hasSeparateEntrance ?? null,
            photoUrl: c.photoUrl ?? null,
            extraPhotoUrls:
              c.extraPhotoUrls != null && c.extraPhotoUrls.length > 0
                ? (c.extraPhotoUrls as Prisma.InputJsonValue)
                : undefined,
          },
        },
      },
      include: {
        commercial: true,
        block: { select: { id: true, name: true, slug: true } },
        region: { select: { id: true, code: true, name: true } },
        seller: true,
      },
    });
  }

  async createManualParking(dto: CreateManualParkingDto, actorUserId?: string, actorRole?: string) {
    const region = await this.prisma.feedRegion.findUnique({
      where: { id: dto.regionId },
      select: { id: true },
    });
    if (!region) throw new BadRequestException('Регион не найден');

    if (dto.blockId != null) {
      const block = await this.prisma.block.findUnique({
        where: { id: dto.blockId },
        select: { id: true, regionId: true },
      });
      if (!block) throw new BadRequestException('ЖК не найден');
      if (block.regionId !== dto.regionId) {
        throw new BadRequestException('ЖК относится к другому региону');
      }
    }

    const base = this.governance.manualCreateFields(actorUserId, actorRole, {
      status: dto.status,
      isPublished: dto.isPublished,
    });
    const status = (dto.status ?? 'DRAFT') as $Enums.ListingStatus;
    const p = dto.parking;
    assertPositiveNumber(p.area, 'Площадь машино-места');
    validateManualGalleryMedia(p, 'Паркинг');

    return this.prisma.listing.create({
      data: {
        regionId: dto.regionId,
        kind: 'PARKING',
        blockId: dto.blockId ?? null,
        ...base,
        price: new Prisma.Decimal(dto.price),
        currency: 'RUB',
        status,
        dataSource: 'MANUAL',
        isPublished: dto.isPublished ?? false,
        publishedAt: dto.isPublished ? new Date() : null,
        address: dto.address?.trim() || dto.seller?.address?.trim() || null,
        lat: dto.lat ?? null,
        lng: dto.lng ?? null,
        ...(await this.resolveSellerListingCreate(dto, actorUserId, actorRole)),
        parking: {
          create: {
            parkingType: p.parkingType ?? null,
            area: p.area != null ? new Prisma.Decimal(p.area) : null,
            floor: p.floor ?? null,
            number: p.number ?? null,
            photoUrl: p.photoUrl ?? null,
            extraPhotoUrls:
              p.extraPhotoUrls != null && p.extraPhotoUrls.length > 0
                ? (p.extraPhotoUrls as Prisma.InputJsonValue)
                : undefined,
          },
        },
      },
      include: {
        parking: true,
        block: { select: { id: true, name: true, slug: true } },
        region: { select: { id: true, code: true, name: true } },
        seller: true,
      },
    });
  }

  async updateManualApartment(id: number, dto: UpdateManualApartmentDto, actorUserId?: string, actorRole?: string) {
    const row = await this.requireManualListing(id, actorUserId, actorRole);

    if (dto.apartment) {
      validateManualApartmentMedia(dto.apartment);
    }

    if (dto.blockId !== undefined && dto.blockId != null) {
      const block = await this.prisma.block.findUnique({
        where: { id: dto.blockId },
        select: { id: true, regionId: true },
      });
      if (!block) throw new BadRequestException('ЖК не найден');
      if (block.regionId !== row.regionId) {
        throw new BadRequestException('ЖК относится к другому региону');
      }
    }

    const listingPatch: Prisma.ListingUpdateInput = this.publicationPatch(
      dto.status as $Enums.ListingStatus | undefined,
      dto.isPublished,
    );
    if (dto.price !== undefined) listingPatch.price = new Prisma.Decimal(dto.price);
    if (dto.blockId !== undefined) {
      if (dto.blockId === null) {
        listingPatch.block = { disconnect: true };
      } else {
        listingPatch.block = { connect: { id: dto.blockId } };
      }
    }
    const sellerUpdate = await this.resolveSellerListingUpdate(id, dto, actorUserId, actorRole);
    Object.assign(listingPatch, sellerUpdate.patch);

    const aptPatch: Prisma.ListingApartmentUpdateInput = {};
    if (dto.apartment) {
      const p = dto.apartment;
      if (p.areaTotal !== undefined) aptPatch.areaTotal = new Prisma.Decimal(p.areaTotal);
      if (p.areaKitchen !== undefined) {
        aptPatch.areaKitchen =
          p.areaKitchen != null ? new Prisma.Decimal(p.areaKitchen) : null;
      }
      if (p.floor !== undefined) aptPatch.floor = p.floor;
      if (p.floorsTotal !== undefined) aptPatch.floorsTotal = p.floorsTotal;
      if (p.roomTypeId !== undefined) {
        aptPatch.roomType =
          p.roomTypeId == null ? { disconnect: true } : { connect: { id: p.roomTypeId } };
      }
      if (p.finishingId !== undefined) {
        aptPatch.finishing =
          p.finishingId == null ? { disconnect: true } : { connect: { id: p.finishingId } };
      }
      if (p.planUrl !== undefined) aptPatch.planUrl = p.planUrl;
      if (p.finishingPhotoUrl !== undefined) aptPatch.finishingPhotoUrl = p.finishingPhotoUrl;
      if (p.extraPhotoUrls !== undefined) {
        aptPatch.extraPhotoUrls =
          p.extraPhotoUrls != null && p.extraPhotoUrls.length > 0
            ? (p.extraPhotoUrls as Prisma.InputJsonValue)
            : Prisma.DbNull;
      }
      if (p.blockAddress !== undefined) aptPatch.blockAddress = p.blockAddress;
      if (p.buildingName !== undefined) aptPatch.buildingName = p.buildingName;
      if (p.number !== undefined) aptPatch.number = p.number;
      if (p.marketSegment !== undefined) aptPatch.marketSegment = p.marketSegment;
    }

    if (dto.wizardUiKind) {
      await this.applyApartmentWizardUiKind(id, dto.wizardUiKind, aptPatch, actorUserId);
    }

    const hasListing = Object.keys(listingPatch).length > 0;
    const hasApt = Object.keys(aptPatch).length > 0;
    if (!hasListing && !hasApt && !sellerUpdate.touched && !dto.wizardUiKind) {
      throw new BadRequestException('Укажите хотя бы одно поле для обновления');
    }
    if (!hasListing && !hasApt && sellerUpdate.touched && !dto.wizardUiKind) {
      return this.findOne(id, { authenticated: true });
    }

    const updated = await this.prisma.listing.update({
      where: { id },
      data: {
        ...listingPatch,
        ...(Object.keys(aptPatch).length > 0 ? { apartment: { update: aptPatch } } : {}),
      },
      include: {
        apartment: { include: { roomType: true, finishing: true } },
        block: { select: { id: true, name: true, slug: true } },
        region: { select: { id: true, code: true, name: true } },
        seller: true,
      },
    });

    if (!hasListing && !hasApt && dto.wizardUiKind) {
      return this.findOne(id, { authenticated: true });
    }

    return updated;
  }

  async updateManualHouse(id: number, dto: UpdateManualHouseDto, actorUserId?: string, actorRole?: string) {
    const row = await this.requireManualListing(id, actorUserId, actorRole);
    const current = await this.prisma.listing.findUnique({
      where: { id },
      select: { id: true, kind: true },
    });
    if (!current || current.kind !== 'HOUSE') {
      throw new BadRequestException('Операция доступна только для ручных домов (MANUAL + HOUSE)');
    }
    if (dto.house) {
      validateManualGalleryMedia(dto.house, 'Дом');
    }

    if (dto.blockId !== undefined && dto.blockId != null) {
      const block = await this.prisma.block.findUnique({
        where: { id: dto.blockId },
        select: { id: true, regionId: true },
      });
      if (!block) throw new BadRequestException('ЖК не найден');
      if (block.regionId !== row.regionId) {
        throw new BadRequestException('ЖК относится к другому региону');
      }
    }

    const listingPatch: Prisma.ListingUpdateInput = this.publicationPatch(
      dto.status as $Enums.ListingStatus | undefined,
      dto.isPublished,
    );
    if (dto.price !== undefined) listingPatch.price = new Prisma.Decimal(dto.price);
    if (dto.address !== undefined) listingPatch.address = dto.address?.trim() || null;
    if (dto.description !== undefined) listingPatch.description = dto.description?.trim() || null;
    if (dto.isHot !== undefined) listingPatch.isHot = dto.isHot;
    if (dto.blockId !== undefined) {
      if (dto.blockId === null) {
        listingPatch.block = { disconnect: true };
      } else {
        listingPatch.block = { connect: { id: dto.blockId } };
      }
    }
    const sellerUpdate = await this.resolveSellerListingUpdate(id, dto, actorUserId, actorRole);
    Object.assign(listingPatch, sellerUpdate.patch);

    const housePatch: Prisma.ListingHouseUpdateInput = {};
    if (dto.house) {
      const h = dto.house;
      if (h.houseType !== undefined) housePatch.houseType = h.houseType;
      if (h.material !== undefined) housePatch.material = h.material?.trim() || null;
      if (h.areaTotal !== undefined) {
        housePatch.areaTotal = h.areaTotal != null ? new Prisma.Decimal(h.areaTotal) : null;
      }
      if (h.areaLiving !== undefined) {
        housePatch.areaLiving = h.areaLiving != null ? new Prisma.Decimal(h.areaLiving) : null;
      }
      if (h.areaKitchen !== undefined) {
        housePatch.areaKitchen = h.areaKitchen != null ? new Prisma.Decimal(h.areaKitchen) : null;
      }
      if (h.areaLand !== undefined) {
        housePatch.areaLand = h.areaLand != null ? new Prisma.Decimal(h.areaLand) : null;
      }
      if (h.floorsCount !== undefined) housePatch.floorsCount = h.floorsCount;
      if (h.bedrooms !== undefined) housePatch.bedrooms = h.bedrooms;
      if (h.bathrooms !== undefined) housePatch.bathrooms = h.bathrooms;
      if (h.districtName !== undefined) housePatch.districtName = h.districtName?.trim() || null;
      if (h.settlement !== undefined) housePatch.settlement = h.settlement?.trim() || null;
      if (h.street !== undefined) housePatch.street = h.street?.trim() || null;
      if (h.houseNumber !== undefined) housePatch.houseNumber = h.houseNumber?.trim() || null;
      if (h.synonyms !== undefined) housePatch.synonyms = h.synonyms?.trim() || null;
      if (h.distanceToCity !== undefined) housePatch.distanceToCity = h.distanceToCity;
      if (h.directionSouth !== undefined) housePatch.directionSouth = h.directionSouth ?? false;
      if (h.directionNorth !== undefined) housePatch.directionNorth = h.directionNorth ?? false;
      if (h.directionEast !== undefined) housePatch.directionEast = h.directionEast ?? false;
      if (h.directionWest !== undefined) housePatch.directionWest = h.directionWest ?? false;
      if (h.inBelgorodDistrict !== undefined) housePatch.inBelgorodDistrict = h.inBelgorodDistrict ?? true;
      if (h.inBelgorodRegion !== undefined) housePatch.inBelgorodRegion = h.inBelgorodRegion ?? true;
      if (h.hasGarage !== undefined) housePatch.hasGarage = h.hasGarage;
      if (h.yearBuilt !== undefined) housePatch.yearBuilt = h.yearBuilt;
      if (h.photoUrl !== undefined) housePatch.photoUrl = h.photoUrl;
      if (h.extraPhotoUrls !== undefined) {
        housePatch.extraPhotoUrls =
          h.extraPhotoUrls != null && h.extraPhotoUrls.length > 0
            ? (h.extraPhotoUrls as Prisma.InputJsonValue)
            : Prisma.DbNull;
      }
    }

    const hasListing = Object.keys(listingPatch).length > 0;
    const hasHouse = Object.keys(housePatch).length > 0;
    if (!hasListing && !hasHouse && !sellerUpdate.touched) {
      throw new BadRequestException('Укажите хотя бы одно поле для обновления');
    }
    if (!hasListing && !hasHouse && sellerUpdate.touched) return this.findOne(id);

    return this.prisma.listing.update({
      where: { id },
      data: {
        ...listingPatch,
        ...(hasHouse ? { house: { update: housePatch } } : {}),
      },
      include: {
        house: true,
        block: { select: { id: true, name: true, slug: true } },
        region: { select: { id: true, code: true, name: true } },
        seller: true,
      },
    });
  }

  async updateManualLand(id: number, dto: UpdateManualLandDto, actorUserId?: string, actorRole?: string) {
    const row = await this.requireManualListing(id, actorUserId, actorRole);
    const current = await this.prisma.listing.findUnique({
      where: { id },
      select: { id: true, kind: true },
    });
    if (!current || current.kind !== 'LAND') {
      throw new BadRequestException('Операция доступна только для ручных участков (MANUAL + LAND)');
    }
    if (dto.land) {
      validateManualGalleryMedia(dto.land, 'Участок');
    }

    if (dto.blockId !== undefined && dto.blockId != null) {
      const block = await this.prisma.block.findUnique({
        where: { id: dto.blockId },
        select: { id: true, regionId: true },
      });
      if (!block) throw new BadRequestException('ЖК не найден');
      if (block.regionId !== row.regionId) {
        throw new BadRequestException('ЖК относится к другому региону');
      }
    }

    const listingPatch: Prisma.ListingUpdateInput = this.publicationPatch(
      dto.status as $Enums.ListingStatus | undefined,
      dto.isPublished,
    );
    if (dto.price !== undefined) listingPatch.price = new Prisma.Decimal(dto.price);
    if (dto.blockId !== undefined) {
      if (dto.blockId === null) {
        listingPatch.block = { disconnect: true };
      } else {
        listingPatch.block = { connect: { id: dto.blockId } };
      }
    }
    const sellerUpdate = await this.resolveSellerListingUpdate(id, dto, actorUserId, actorRole);
    Object.assign(listingPatch, sellerUpdate.patch);

    const landPatch: Prisma.ListingLandUpdateInput = {};
    if (dto.land) {
      const l = dto.land;
      if (l.areaSotki !== undefined) {
        landPatch.areaSotki = l.areaSotki != null ? new Prisma.Decimal(l.areaSotki) : null;
      }
      if (l.landCategory !== undefined) landPatch.landCategory = l.landCategory;
      if (l.cadastralNumber !== undefined) landPatch.cadastralNumber = l.cadastralNumber;
      if (l.hasCommunications !== undefined) landPatch.hasCommunications = l.hasCommunications;
      if (l.photoUrl !== undefined) landPatch.photoUrl = l.photoUrl;
      if (l.extraPhotoUrls !== undefined) {
        landPatch.extraPhotoUrls =
          l.extraPhotoUrls != null && l.extraPhotoUrls.length > 0
            ? (l.extraPhotoUrls as Prisma.InputJsonValue)
            : Prisma.DbNull;
      }
    }

    const hasListing = Object.keys(listingPatch).length > 0;
    const hasLand = Object.keys(landPatch).length > 0;
    if (!hasListing && !hasLand && !sellerUpdate.touched) {
      throw new BadRequestException('Укажите хотя бы одно поле для обновления');
    }
    if (!hasListing && !hasLand && sellerUpdate.touched) return this.findOne(id);

    return this.prisma.listing.update({
      where: { id },
      data: {
        ...listingPatch,
        ...(hasLand ? { land: { update: landPatch } } : {}),
      },
      include: {
        land: true,
        block: { select: { id: true, name: true, slug: true } },
        region: { select: { id: true, code: true, name: true } },
        seller: true,
      },
    });
  }

  async updateManualCommercial(id: number, dto: UpdateManualCommercialDto, actorUserId?: string, actorRole?: string) {
    const row = await this.requireManualListing(id, actorUserId, actorRole);
    const current = await this.prisma.listing.findUnique({
      where: { id },
      select: { id: true, kind: true },
    });
    if (!current || current.kind !== 'COMMERCIAL') {
      throw new BadRequestException('Операция доступна только для ручной коммерции (MANUAL + COMMERCIAL)');
    }

    if (dto.commercial) {
      validateManualGalleryMedia(dto.commercial, 'Коммерция');
    }

    if (dto.blockId !== undefined && dto.blockId != null) {
      const block = await this.prisma.block.findUnique({
        where: { id: dto.blockId },
        select: { id: true, regionId: true },
      });
      if (!block) throw new BadRequestException('ЖК не найден');
      if (block.regionId !== row.regionId) {
        throw new BadRequestException('ЖК относится к другому региону');
      }
    }

    const listingPatch: Prisma.ListingUpdateInput = this.publicationPatch(
      dto.status as $Enums.ListingStatus | undefined,
      dto.isPublished,
    );
    if (dto.price !== undefined) listingPatch.price = new Prisma.Decimal(dto.price);
    if (dto.blockId !== undefined) {
      if (dto.blockId === null) {
        listingPatch.block = { disconnect: true };
      } else {
        listingPatch.block = { connect: { id: dto.blockId } };
      }
    }
    const sellerUpdate = await this.resolveSellerListingUpdate(id, dto, actorUserId, actorRole);
    Object.assign(listingPatch, sellerUpdate.patch);

    const commercialPatch: Prisma.ListingCommercialUpdateInput = {};
    if (dto.commercial) {
      const c = dto.commercial;
      if (c.commercialType !== undefined) commercialPatch.commercialType = c.commercialType;
      if (c.area !== undefined) {
        commercialPatch.area = c.area != null ? new Prisma.Decimal(c.area) : null;
      }
      if (c.floor !== undefined) commercialPatch.floor = c.floor;
      if (c.hasSeparateEntrance !== undefined) {
        commercialPatch.hasSeparateEntrance = c.hasSeparateEntrance;
      }
      if (c.photoUrl !== undefined) commercialPatch.photoUrl = c.photoUrl;
      if (c.extraPhotoUrls !== undefined) {
        commercialPatch.extraPhotoUrls =
          c.extraPhotoUrls != null && c.extraPhotoUrls.length > 0
            ? (c.extraPhotoUrls as Prisma.InputJsonValue)
            : Prisma.JsonNull;
      }
    }

    const hasListing = Object.keys(listingPatch).length > 0;
    const hasCommercial = Object.keys(commercialPatch).length > 0;
    if (!hasListing && !hasCommercial && !sellerUpdate.touched) {
      throw new BadRequestException('Укажите хотя бы одно поле для обновления');
    }
    if (!hasListing && !hasCommercial && sellerUpdate.touched) return this.findOne(id);

    return this.prisma.listing.update({
      where: { id },
      data: {
        ...listingPatch,
        ...(hasCommercial ? { commercial: { update: commercialPatch } } : {}),
      },
      include: {
        commercial: true,
        block: { select: { id: true, name: true, slug: true } },
        region: { select: { id: true, code: true, name: true } },
        seller: true,
      },
    });
  }

  async updateManualParking(id: number, dto: UpdateManualParkingDto, actorUserId?: string, actorRole?: string) {
    const row = await this.requireManualListing(id, actorUserId, actorRole);
    const current = await this.prisma.listing.findUnique({
      where: { id },
      select: { id: true, kind: true },
    });
    if (!current || current.kind !== 'PARKING') {
      throw new BadRequestException('Операция доступна только для ручного паркинга (MANUAL + PARKING)');
    }

    if (dto.parking) {
      validateManualGalleryMedia(dto.parking, 'Паркинг');
    }

    if (dto.blockId !== undefined && dto.blockId != null) {
      const block = await this.prisma.block.findUnique({
        where: { id: dto.blockId },
        select: { id: true, regionId: true },
      });
      if (!block) throw new BadRequestException('ЖК не найден');
      if (block.regionId !== row.regionId) {
        throw new BadRequestException('ЖК относится к другому региону');
      }
    }

    const listingPatch: Prisma.ListingUpdateInput = this.publicationPatch(
      dto.status as $Enums.ListingStatus | undefined,
      dto.isPublished,
    );
    if (dto.price !== undefined) listingPatch.price = new Prisma.Decimal(dto.price);
    if (dto.blockId !== undefined) {
      if (dto.blockId === null) {
        listingPatch.block = { disconnect: true };
      } else {
        listingPatch.block = { connect: { id: dto.blockId } };
      }
    }
    const sellerUpdate = await this.resolveSellerListingUpdate(id, dto, actorUserId, actorRole);
    Object.assign(listingPatch, sellerUpdate.patch);

    const parkingPatch: Prisma.ListingParkingUpdateInput = {};
    if (dto.parking) {
      const p = dto.parking;
      if (p.parkingType !== undefined) parkingPatch.parkingType = p.parkingType;
      if (p.area !== undefined) {
        parkingPatch.area = p.area != null ? new Prisma.Decimal(p.area) : null;
      }
      if (p.floor !== undefined) parkingPatch.floor = p.floor;
      if (p.number !== undefined) parkingPatch.number = p.number;
      if (p.photoUrl !== undefined) parkingPatch.photoUrl = p.photoUrl;
      if (p.extraPhotoUrls !== undefined) {
        parkingPatch.extraPhotoUrls =
          p.extraPhotoUrls != null && p.extraPhotoUrls.length > 0
            ? (p.extraPhotoUrls as Prisma.InputJsonValue)
            : Prisma.JsonNull;
      }
    }

    const hasListing = Object.keys(listingPatch).length > 0;
    const hasParking = Object.keys(parkingPatch).length > 0;
    if (!hasListing && !hasParking && !sellerUpdate.touched) {
      throw new BadRequestException('Укажите хотя бы одно поле для обновления');
    }
    if (!hasListing && !hasParking && sellerUpdate.touched) return this.findOne(id);

    return this.prisma.listing.update({
      where: { id },
      data: {
        ...listingPatch,
        ...(hasParking ? { parking: { update: parkingPatch } } : {}),
      },
      include: {
        parking: true,
        block: { select: { id: true, name: true, slug: true } },
        region: { select: { id: true, code: true, name: true } },
        seller: true,
      },
    });
  }

  async deleteManualListing(id: number, actorUserId?: string, actorRole?: string) {
    await this.requireManualListing(id, actorUserId, actorRole);
    await this.prisma.listing.delete({ where: { id } });
    return { deleted: true, id };
  }

  async updateAdminListing(
    id: number,
    dto: { status?: 'DRAFT' | 'ACTIVE' | 'SOLD' | 'RESERVED' | 'INACTIVE'; isPublished?: boolean },
  ) {
    if (dto.status === undefined && dto.isPublished === undefined) {
      throw new BadRequestException('Укажите хотя бы одно поле: status или isPublished');
    }
    const exists = await this.prisma.listing.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!exists) throw new NotFoundException('Объявление не найдено');
    const nextStatus = dto.isPublished === true && dto.status === undefined && exists.status === 'INACTIVE'
      ? 'ACTIVE'
      : dto.status;

    return this.prisma.listing.update({
      where: { id },
      data: {
        ...this.publicationPatch(nextStatus, dto.isPublished),
      },
      include: {
        apartment: { include: { roomType: true, finishing: true } },
        house: true,
        land: true,
        commercial: true,
        parking: true,
        block: { select: { id: true, name: true, slug: true } },
        region: { select: { id: true, code: true, name: true } },
      },
    });
  }

  async listAssignableAgents() {
    return this.prisma.user.findMany({
      where: {
        isActive: true,
        role: { in: ['agent', 'manager', 'editor', 'admin'] },
      },
      orderBy: [{ role: 'asc' }, { fullName: 'asc' }, { email: 'asc' }],
      select: { id: true, fullName: true, email: true, role: true },
    });
  }

  async transferManualListing(
    id: number,
    targetUserId: string,
    actorUserId?: string,
    actorRole?: string,
  ) {
    const row = await this.requireManualListing(id, actorUserId, actorRole);
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, role: true, isActive: true },
    });
    if (!target || !target.isActive || !['agent', 'manager', 'editor', 'admin'].includes(target.role)) {
      throw new BadRequestException('Выбранный сотрудник не может получить объект');
    }

    const previousExternalId = row.externalId ?? `listing-${id}`;
    const stripped = previousExternalId.replace(/^manual-[0-9a-f-]{36}-/i, '');
    const externalId = `${this.agentExternalIdPrefix(target.id)}${stripped || `listing-${id}`}`;

    return this.prisma.listing.update({
      where: { id },
      data: {
        externalId,
        ownerUserId: target.id,
        lastActivityAt: new Date(),
      },
      include: {
        apartment: { include: { roomType: true, finishing: true } },
        house: true,
        land: true,
        commercial: true,
        parking: true,
        block: { select: { id: true, name: true, slug: true } },
        region: { select: { id: true, code: true, name: true } },
      },
    });
  }

  private agentExternalIdPrefix(userId: string) {
    return `manual-${userId}-`;
  }

  private assertAgentCanManage(rowExternalId: string | null, actorUserId?: string, actorRole?: string) {
    this.governance.assertAgentCanManage(
      { externalId: rowExternalId, ownerUserId: null },
      actorUserId,
      actorRole,
    );
  }

  private async requireManualListing(id: number, actorUserId?: string, actorRole?: string) {
    const row = await this.prisma.listing.findUnique({
      where: { id },
      select: { id: true, dataSource: true, regionId: true, externalId: true, ownerUserId: true },
    });
    if (!row) throw new NotFoundException('Объявление не найдено');
    if (row.dataSource !== 'MANUAL') {
      throw new BadRequestException('Доступно только для ручных объявлений (MANUAL)');
    }
    this.governance.assertAgentCanManage(row, actorUserId, actorRole);
    return row;
  }
}



/** Roles allowed to see unpublished listings and private seller data. */
const STAFF_ROLES = new Set(['admin', 'editor', 'manager', 'agent']);
export function isStaffRole(role?: string | null): boolean {
  return Boolean(role && STAFF_ROLES.has(role));
}

const PUBLIC_STATUSES = new Set(['ACTIVE', 'RESERVED', 'SOLD']);
export const PUBLIC_LISTINGS_MAX_PER_PAGE = 100;

/**
 * Anonymous catalog requests must never widen visibility: admin-only filters are dropped,
 * statuses are limited to sellable/sold ones and page size is capped (audit B3).
 */
export function sanitizePublicListingsQuery(query: QueryListingsDto): QueryListingsDto {
  const q: QueryListingsDto = Object.assign(Object.create(Object.getPrototypeOf(query)), query);
  q.admin_view = undefined;
  q.visibility = undefined;
  q.owner_user_id = undefined;
  q.stale_only = undefined;
  q.scope = undefined;
  q.is_published = undefined;
  if (q.status && !PUBLIC_STATUSES.has(q.status)) q.status = 'ACTIVE';
  if (q.statuses) {
    const allowed = q.statuses
      .split(',')
      .map((x) => x.trim())
      .filter((x) => PUBLIC_STATUSES.has(x));
    q.statuses = allowed.length ? allowed.join(',') : undefined;
  }
  if (q.per_page && q.per_page > PUBLIC_LISTINGS_MAX_PER_PAGE) q.per_page = PUBLIC_LISTINGS_MAX_PER_PAGE;
  return q;
}

/** Removes seller PII and internal fields from a listing returned to anonymous visitors (audit B2). */
export function stripPrivateListingFields<T extends Record<string, unknown>>(row: T): T {
  const { seller: _seller, sellerId: _sellerId, moderationNote: _note, ownerUser, ...rest } = row as T & {
    seller?: unknown;
    sellerId?: unknown;
    moderationNote?: unknown;
    ownerUser?: (Record<string, unknown> & { email?: unknown }) | null;
  };
  const safeOwner = ownerUser ? { ...ownerUser, email: undefined } : ownerUser;
  return { ...rest, seller: null, sellerId: null, ...(ownerUser !== undefined ? { ownerUser: safeOwner } : {}) } as unknown as T;
}

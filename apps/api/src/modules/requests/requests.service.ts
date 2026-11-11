import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { Prisma, RequestEventType, RequestStatus, RequestType, CrmMessageType } from '@prisma/client';
import { compareSlaPriority, computeSlaState, SlaState, analyzeRequestTimeline } from '@lg/shared';
import { CrmAttributionService } from './crm-attribution.service';
import { CrmLifecycleService } from './crm-lifecycle.service';
import { CrmOutcomeQualityService } from './crm-outcome-quality.service';
import { CrmForecastService } from './crm-forecast.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { RequestEventsService } from './request-events.service';
import { assertStatusTransition } from './request-status';
import { TelegramNotifyService } from './telegram-notify.service';
import { AttentionRoutingService } from '../crm-notifications/attention-routing.service';
import { CrmCommunicationService } from '../crm-communication/crm-communication.service';

const assignedUserSelect = {
  id: true,
  email: true,
  fullName: true,
  role: true,
} as const;

const listSelect = {
  id: true,
  name: true,
  phone: true,
  email: true,
  type: true,
  status: true,
  comment: true,
  sourceUrl: true,
  blockId: true,
  listingId: true,
  telegramSent: true,
  consentVersion: true,
  consentAt: true,
  utm: true,
  createdAt: true,
  lastActivityAt: true,
  interactionCount: true,
  assignedTo: true,
  assignedUser: { select: assignedUserSelect },
} as const;

type RequestListRow = Prisma.RequestGetPayload<{ select: typeof listSelect }>;

function enrichRow<T extends RequestListRow>(row: T) {
  const sla = computeSlaState(row);
  return { ...row, ...sla };
}

@Injectable()
export class RequestsService {
  private readonly logger = new Logger(RequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramNotify: TelegramNotifyService,
    private readonly events: RequestEventsService,
    private readonly attention: AttentionRoutingService,
    private readonly attribution: CrmAttributionService,
    private readonly lifecycle: CrmLifecycleService,
    private readonly outcomeQuality: CrmOutcomeQualityService,
    private readonly forecast: CrmForecastService,
    @Inject(forwardRef(() => CrmCommunicationService))
    private readonly communication: CrmCommunicationService,
  ) {}

  async create(dto: CreateRequestDto, userId?: string | null) {
    // Ловушка для ботов: людям поле не видно. Отвечаем как обычно, но ничего не сохраняем.
    if (dto.website && dto.website.trim() !== '') {
      this.logger.warn('Request honeypot triggered — dropped');
      return { id: 0 };
    }
    const type = this.resolveType(dto.type);
    const now = new Date();
    const utmEntries = Object.entries({
      utm_source: dto.utmSource,
      utm_medium: dto.utmMedium,
      utm_campaign: dto.utmCampaign,
      utm_content: dto.utmContent,
      utm_term: dto.utmTerm,
    }).filter(([, v]) => typeof v === 'string' && v.trim() !== '');
    const utm = utmEntries.length ? Object.fromEntries(utmEntries) : undefined;
    const duplicateWarning = dto.phone
      ? await this.findRecentDuplicatePhone(dto.phone)
      : null;
    const row = await this.prisma.request.create({
      data: {
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
        type,
        status: RequestStatus.NEW,
        blockId: dto.blockId,
        listingId: dto.listingId,
        sourceUrl: dto.sourceUrl,
        comment: dto.comment,
        consentVersion: dto.consentVersion,
        consentAt: now,
        ...(utm ? { utm } : {}),
        lastActivityAt: now,
        ...(userId ? { userId } : {}),
      } as Prisma.RequestCreateInput,
    });

    await this.events.append(row.id, RequestEventType.CREATED, {
      toStatus: RequestStatus.NEW,
      actorId: userId ?? null,
      note: dto.comment ?? null,
    });

    const buyerToken = this.communication.generateBuyerToken();
    void this.communication.bootstrapForRequest(row, buyerToken).catch((e) => {
      this.logger.warn(
        `Communication thread bootstrap failed for request ${row.id}: ${e instanceof Error ? e.message : String(e)}`,
      );
    });

    if (await this.telegramNotify.isConfigured()) {
      void (async () => {
        try {
          const ok = await this.telegramNotify.notifyNewRequest(row);
          if (ok) {
            await this.prisma.request.update({
              where: { id: row.id },
              data: { telegramSent: true },
            });
          }
        } catch (e) {
          this.logger.warn(
            `Telegram notify failed for request ${row.id}: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      })();
    }

    // Публичный ответ — только то, что нужно форме: без служебных полей и чужих заявок
    return {
      id: row.id,
      buyerToken,
      ...(duplicateWarning
        ? { duplicateWarning: { messageRu: 'Заявка с этим номером уже есть — менеджер свяжется с вами.' } }
        : {}),
    };
  }

  private normalizePhoneDigits(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('8')) return `7${digits.slice(1)}`;
    return digits;
  }

  private async findRecentDuplicatePhone(
    phone: string,
  ): Promise<{ recentRequestId: number; messageRu: string } | null> {
    const normalized = this.normalizePhoneDigits(phone);
    if (normalized.length < 10) return null;
    const since = new Date(Date.now() - 48 * 3_600_000);
    const recent = await this.prisma.request.findMany({
      where: {
        createdAt: { gte: since },
        phone: { not: '' },
        status: { not: RequestStatus.SPAM },
      },
      select: { id: true, phone: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 40,
    });
    const match = recent.find(
      (r) => r.phone && this.normalizePhoneDigits(r.phone) === normalized,
    );
    if (!match) return null;
    return {
      recentRequestId: match.id,
      messageRu: `Недавно уже была заявка #${match.id} с этим номером (${match.createdAt.toLocaleString('ru-RU')})`,
    };
  }

  async findByUserId(userId: string, take = 100) {
    return this.prisma.request.findMany({
      where: { userId } as Prisma.RequestWhereInput,
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        type: true,
        status: true,
        blockId: true,
        listingId: true,
        sourceUrl: true,
        comment: true,
        createdAt: true,
        lastActivityAt: true,
      },
    });
  }

  async findAll(
    status?: string,
    assignedTo?: string,
    search?: string,
    page = 1,
    perPage = 20,
    sort = 'priority',
    slaFilter?: string,
  ) {
    const where: Prisma.RequestWhereInput = {};
    if (status !== undefined && status !== '') {
      where.status = this.parseStatus(status);
    }
    if (assignedTo === 'none') {
      where.assignedTo = null;
    } else if (assignedTo) {
      where.assignedTo = assignedTo;
    }
    const q = search?.trim();
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { comment: { contains: q, mode: 'insensitive' } },
        ...(Number.isFinite(Number(q)) ? [{ id: Number(q) }] : []),
      ];
    }

    const needsSlaSort = sort === 'priority' || slaFilter === 'overdue' || slaFilter === 'stale';

    if (needsSlaSort) {
      const rows = await this.prisma.request.findMany({
        where,
        select: listSelect,
      });
      let enriched = rows.map(enrichRow);
      if (slaFilter === 'overdue') {
        enriched = enriched.filter((r) => r.slaState === SlaState.OVERDUE);
      } else if (slaFilter === 'stale') {
        enriched = enriched.filter((r) => r.slaState === SlaState.STALE);
      }
      enriched.sort((a, b) => compareSlaPriority(a, b));
      const total = enriched.length;
      const data = enriched.slice((page - 1) * perPage, page * perPage);
      return {
        data,
        meta: {
          page,
          per_page: perPage,
          total,
          total_pages: Math.ceil(total / perPage) || 1,
          sort,
        },
      };
    }

    const orderBy: Prisma.RequestOrderByWithRelationInput =
      sort === 'activity'
        ? { lastActivityAt: 'asc' }
        : { createdAt: 'desc' };

    const [rows, total] = await Promise.all([
      this.prisma.request.findMany({
        where,
        orderBy,
        skip: (page - 1) * perPage,
        take: perPage,
        select: listSelect,
      }),
      this.prisma.request.count({ where }),
    ]);

    return {
      data: rows.map(enrichRow),
      meta: {
        page,
        per_page: perPage,
        total,
        total_pages: Math.ceil(total / perPage) || 1,
        sort,
      },
    };
  }

  async findOne(id: number) {
    const row = await this.prisma.request.findUnique({
      where: { id },
      include: {
        assignedUser: { select: assignedUserSelect },
        events: {
          orderBy: { createdAt: 'asc' },
          include: { actor: { select: assignedUserSelect } },
        },
      },
    });
    if (!row) {
      throw new NotFoundException(`Request ${id} not found`);
    }

    const [block, listing] = await Promise.all([
      row.blockId
        ? this.prisma.block.findUnique({
            where: { id: row.blockId },
            select: { id: true, name: true, slug: true },
          })
        : null,
      row.listingId
        ? this.prisma.listing.findUnique({
            where: { id: row.listingId },
            select: { id: true, title: true, kind: true, status: true },
          })
        : null,
    ]);

    const sla = computeSlaState(row);
    const timelineHints = analyzeRequestTimeline(
      {
        id: row.id,
        status: row.status,
        assignedTo: row.assignedTo,
        createdAt: row.createdAt,
        lastActivityAt: row.lastActivityAt,
      },
      row.events,
    );
    const { attribution, hints: attributionHints } =
      await this.attribution.getRequestAttributionContext(row.id);
    const [lifecycleHints, qualityHints, riskHints] = await Promise.all([
      this.lifecycle.getRequestLifecycleHints(row.id),
      this.outcomeQuality.getRequestQualityHints(row.id),
      this.forecast.getRequestRiskHints(row.id),
    ]);
    return {
      ...row,
      block,
      listing,
      ...sla,
      timelineHints,
      attribution,
      attributionHints,
      lifecycleHints,
      qualityHints,
      riskHints,
    };
  }

  async listAssignees() {
    return this.prisma.user.findMany({
      where: {
        role: { in: ['manager', 'agent', 'editor', 'admin'] },
        isActive: true,
      },
      orderBy: [{ role: 'asc' }, { fullName: 'asc' }, { email: 'asc' }],
      select: {
        id: true,
        role: true,
        fullName: true,
        email: true,
      },
    });
  }

  async getWorkload() {
    const openStatuses: RequestStatus[] = [
      RequestStatus.NEW,
      RequestStatus.IN_PROGRESS,
      RequestStatus.CONTACTED,
      RequestStatus.VIEWING_SCHEDULED,
      RequestStatus.NEGOTIATION,
    ];

    const rows = await this.prisma.request.findMany({
      where: { status: { in: openStatuses } },
      select: {
        id: true,
        status: true,
        assignedTo: true,
        lastActivityAt: true,
        createdAt: true,
        assignedUser: { select: assignedUserSelect },
      },
    });

    type Bucket = {
      assigneeId: string | null;
      assigneeName: string;
      role: string | null;
      assigned: number;
      overdue: number;
      stale: number;
      active: number;
    };

    const buckets = new Map<string, Bucket>();
    const unassignedKey = '__unassigned__';

    for (const r of rows) {
      const key = r.assignedTo ?? unassignedKey;
      if (!buckets.has(key)) {
        buckets.set(key, {
          assigneeId: r.assignedTo,
          assigneeName:
            r.assignedUser?.fullName ??
            r.assignedUser?.email ??
            (r.assignedTo ? r.assignedTo : 'Не назначены'),
          role: r.assignedUser?.role ?? null,
          assigned: 0,
          overdue: 0,
          stale: 0,
          active: 0,
        });
      }
      const b = buckets.get(key)!;
      b.assigned += 1;
      const sla = computeSlaState(r);
      if (sla.slaState === SlaState.OVERDUE) b.overdue += 1;
      else if (sla.slaState === SlaState.STALE) b.stale += 1;
      else b.active += 1;
    }

    const managers = [...buckets.values()]
      .filter((b) => b.assigneeId !== null)
      .sort((a, b) => b.overdue - a.overdue || b.stale - a.stale || b.assigned - a.assigned);

    const unassigned = buckets.get(unassignedKey) ?? {
      assigneeId: null,
      assigneeName: 'Не назначены',
      role: null,
      assigned: 0,
      overdue: 0,
      stale: 0,
      active: 0,
    };

    const totals = {
      open: rows.length,
      overdue: rows.filter((r) => computeSlaState(r).slaState === SlaState.OVERDUE).length,
      stale: rows.filter((r) => computeSlaState(r).slaState === SlaState.STALE).length,
    };

    return { managers, unassigned, totals };
  }

  async updateStatus(
    id: number,
    status: string,
    assignedTo?: string | null,
    actorId?: string | null,
  ) {
    const existing = await this.prisma.request.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Request ${id} not found`);
    }

    const nextStatus = this.parseStatus(status);
    try {
      assertStatusTransition(existing.status, nextStatus);
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'Invalid transition');
    }

    const data: { status: RequestStatus; assignedTo?: string | null } = {
      status: nextStatus,
    };
    const prevAssignee = existing.assignedTo;
    if (assignedTo !== undefined) {
      data.assignedTo = assignedTo;
    }

    const updated = await this.prisma.request.update({
      where: { id },
      data,
      include: {
        assignedUser: { select: assignedUserSelect },
      },
    });

    if (existing.status !== nextStatus) {
      const statusEv = await this.events.append(id, RequestEventType.STATUS_CHANGED, {
        actorId: actorId ?? null,
        fromStatus: existing.status,
        toStatus: nextStatus,
      });
      if (nextStatus === RequestStatus.CONTACTED) {
        await this.events.append(id, RequestEventType.CONTACTED, { actorId: actorId ?? null });
      }
      if (nextStatus === RequestStatus.VIEWING_SCHEDULED) {
        await this.events.append(id, RequestEventType.VIEWING_SCHEDULED, { actorId: actorId ?? null });
      }
      this.attention.onStatusChanged(
        { ...updated, lastActivityAt: updated.lastActivityAt, createdAt: existing.createdAt },
        existing.status,
        nextStatus,
        actorId,
        statusEv.id,
      );
    }

    if (assignedTo !== undefined && assignedTo !== prevAssignee && assignedTo) {
      const assignEv = await this.events.append(id, RequestEventType.ASSIGNED, {
        actorId: actorId ?? null,
        note: assignedTo,
      });
      void this.communication.ensureThreadForRequest(id).then((thread) =>
        this.communication.syncAssigneeParticipant(thread.id, assignedTo),
      );
      this.attention.onAssigned(
        { ...updated, lastActivityAt: updated.lastActivityAt, createdAt: existing.createdAt },
        prevAssignee,
        assignedTo,
        actorId,
        assignEv.id,
      );
    }

    return { ...updated, ...computeSlaState(updated) };
  }

  async addNote(id: number, note: string, actorId?: string | null) {
    const trimmed = note.trim();
    if (!trimmed) {
      throw new BadRequestException('Note cannot be empty');
    }
    const existing = await this.prisma.request.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Request ${id} not found`);
    }
    const noteEv = await this.events.append(id, RequestEventType.NOTE_ADDED, {
      actorId: actorId ?? null,
      note: trimmed,
    });
    void this.communication.ensureThreadForRequest(id).then((thread) =>
      this.communication.appendMessage({
        threadId: thread.id,
        type: CrmMessageType.NOTE,
        body: trimmed,
        actorId: actorId ?? null,
        requestId: id,
        syncTimeline: false,
      }),
    );
    this.attention.onNoteAdded(
      {
        id: existing.id,
        name: existing.name,
        phone: existing.phone,
        status: existing.status,
        assignedTo: existing.assignedTo,
        lastActivityAt: new Date(),
        createdAt: existing.createdAt,
      },
      actorId,
      noteEv.id,
      trimmed,
    );
    return this.findOne(id);
  }

  async logTelegramClaim(requestId: number, actorUserId: string) {
    await this.events.append(requestId, RequestEventType.ASSIGNED, {
      actorId: actorUserId,
      note: 'Принято через Telegram',
    });
  }

  private resolveType(raw?: string): RequestType {
    if (raw === undefined || raw === '') {
      return RequestType.CONSULTATION;
    }
    if (!Object.values(RequestType).includes(raw as RequestType)) {
      throw new BadRequestException(`Invalid request type: ${raw}`);
    }
    return raw as RequestType;
  }

  private parseStatus(raw: string): RequestStatus {
    if (!Object.values(RequestStatus).includes(raw as RequestStatus)) {
      throw new BadRequestException(`Invalid request status: ${raw}`);
    }
    return raw as RequestStatus;
  }
}

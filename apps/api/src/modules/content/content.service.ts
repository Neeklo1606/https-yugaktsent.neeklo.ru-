import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Logger,
  OnModuleInit,
  PayloadTooLargeException,
} from '@nestjs/common';
import { NavigationItem, Prisma, SiteSetting } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMortgageBankDto } from './dto/create-mortgage-bank.dto';
import { UpdateMortgageBankDto } from './dto/update-mortgage-bank.dto';
import type { ExpertProfileDto } from './dto/update-experts.dto';
import {
  DEFAULT_DEMO_NEWS,
  DEFAULT_HOMEPAGE_SITE_SETTINGS,
  DEFAULT_INTEGRATION_SITE_SETTINGS,
  DEFAULT_SEO_SITE_SETTINGS,
  DEFAULT_SEO_LANDING_SETTINGS,
  INTEGRATIONS_SITE_SETTINGS_GROUP,
} from './content-defaults';

type NavItemTree = NavigationItem & { children: NavItemTree[] };

const homepageDefaultsByKey = new Map(DEFAULT_HOMEPAGE_SITE_SETTINGS.map((r) => [r.key, r]));
const integrationDefaultsByKey = new Map(DEFAULT_INTEGRATION_SITE_SETTINGS.map((r) => [r.key, r]));
const integrationKeys = new Set(integrationDefaultsByKey.keys());
const settingDefaultsByKey = new Map([...homepageDefaultsByKey, ...integrationDefaultsByKey]);
/** Эксперты (/experts/:slug) — один JSON в site_settings; правится только через /admin/content/experts. */
const EXPERTS_SETTING_KEY = 'experts_json';
const EXPERTS_SETTING_GROUP = 'experts';
/** Express по умолчанию режет тело на 100 КБ; держим запас и не даём раздуть строку в БД. */
const EXPERTS_JSON_MAX_CHARS = 200_000;
const hiddenSettingsKeys = new Set(['telegram_notify_chat_id', 'tg_news_mtproto_session', EXPERTS_SETTING_KEY]);


@Injectable()
export class ContentService implements OnModuleInit {
  private readonly logger = new Logger(ContentService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.ensureHomepageSiteSettings();
    await this.ensureSeoSiteSettings();
    await this.ensureSeoLandingSettings();
    await this.ensureIntegrationSiteSettings();
    if (process.env.SEED_DEMO_NEWS === '1') {
      await this.ensureDemoNewsIfEmpty();
      await this.ensureDemoNewsCovers();
    } else {
      await this.unpublishUntouchedDemoNews();
    }
  }

  /** Создаёт строки site_settings для главной, если их ещё нет (прод без prisma seed). */
  private async ensureHomepageSiteSettings() {
    for (const row of DEFAULT_HOMEPAGE_SITE_SETTINGS) {
      await this.prisma.siteSetting.upsert({
        where: { key: row.key },
        update: {},
        create: row,
      });
    }
    this.logger.log('Homepage site_settings ensured');
  }

  /** SEO title/description/OG — без seed на проде ключи могут отсутствовать. */
  private async ensureSeoSiteSettings() {
    for (const row of DEFAULT_SEO_SITE_SETTINGS) {
      await this.prisma.siteSetting.upsert({
        where: { key: row.key },
        update: {},
        create: row,
      });
    }
    this.logger.log('SEO site_settings ensured');
  }

  /** Telegram и др.: строки в БД, правки только из админки (не .env). */
  private async ensureIntegrationSiteSettings() {
    for (const row of DEFAULT_INTEGRATION_SITE_SETTINGS) {
      await this.prisma.siteSetting.upsert({
        where: { key: row.key },
        update: {},
        create: row,
      });
    }
    this.logger.log('Integration site_settings ensured');
  }

  /** Если таблица news пуста — демо-статьи как в шаблоне (главная + /admin/news). */
  private async ensureDemoNewsIfEmpty() {
    const n = await this.prisma.news.count();
    if (n > 0) return;
    const now = new Date();
    for (let i = 0; i < DEFAULT_DEMO_NEWS.length; i++) {
      const article = DEFAULT_DEMO_NEWS[i];
      const publishedAt = new Date(now);
      publishedAt.setDate(publishedAt.getDate() - (DEFAULT_DEMO_NEWS.length - i));
      await this.prisma.news.create({
        data: {
          slug: article.slug,
          title: article.title,
          body: article.body,
          source: article.source,
          imageUrl: article.imageUrl,
          isPublished: true,
          publishedAt,
        },
      });
    }
    this.logger.log(`Seeded ${DEFAULT_DEMO_NEWS.length} demo news (DB was empty)`);
  }

  /**
   * Демо-статьи шаблона LiveGrid (про Москву) не должны висеть на сайте клиента.
   * Снимаем с публикации только нетронутые: тот же slug и тот же заголовок, что в шаблоне.
   * Ничего не удаляем — статью можно вернуть из админки.
   */
  private async unpublishUntouchedDemoNews() {
    let total = 0;
    for (const article of DEFAULT_DEMO_NEWS) {
      const r = await this.prisma.news.updateMany({
        where: { slug: article.slug, title: article.title, isPublished: true },
        data: { isPublished: false },
      });
      total += r.count;
    }
    if (total > 0) this.logger.warn(`Unpublished ${total} untouched template demo news`);
  }

  /** Обложки демо-новостей: пусто, внешний CDN (picsum) или старый URL → локальные `/news/covers/*`. */
  private async ensureDemoNewsCovers() {
    for (const article of DEFAULT_DEMO_NEWS) {
      if (!article.imageUrl) continue;
      const r = await this.prisma.news.updateMany({
        where: {
          slug: article.slug,
          OR: [
            { imageUrl: null },
            { imageUrl: '' },
            { imageUrl: { contains: 'picsum.photos' } },
          ],
        },
        data: { imageUrl: article.imageUrl },
      });
      if (r.count > 0) {
        this.logger.log(`News cover set: ${article.slug}`);
      }
    }
  }

  private async loadAllSettingsGrouped(): Promise<Record<string, SiteSetting[]>> {
    const rows = await this.prisma.siteSetting.findMany({
      where: {
        key: { notIn: [...hiddenSettingsKeys] },
      },
      orderBy: [{ groupName: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
    });
    const grouped: Record<string, SiteSetting[]> = {};
    for (const row of rows) {
      if (!grouped[row.groupName]) {
        grouped[row.groupName] = [];
      }
      grouped[row.groupName].push(row);
    }
    return grouped;
  }

  private omitIntegrationsGroup(
    grouped: Record<string, SiteSetting[]>,
  ): Record<string, SiteSetting[]> {
    const { [INTEGRATIONS_SITE_SETTINGS_GROUP]: _removed, ...rest } = grouped;
    return rest;
  }

  /** Публичный API: без группы integrations (токены и т.д.). */
  async getSettingsPublic() {
    return this.omitIntegrationsGroup(await this.loadAllSettingsGrouped());
  }

  /** Админка: редактор не видит группу integrations. */
  async getSettingsForAdminRole(role: string) {
    const grouped = await this.loadAllSettingsGrouped();
    if (role === 'admin') return grouped;
    return this.omitIntegrationsGroup(grouped);
  }

  private async ensureSeoLandingSettings() {
    for (const row of DEFAULT_SEO_LANDING_SETTINGS) {
      await this.prisma.siteSetting.upsert({
        where: { key: row.key },
        update: {},
        create: row,
      });
    }
    this.logger.log('SEO landing site_settings ensured');
  }

  /** CMS-managed SEO copy for catalog filter landings (district / metro / region). */
  async resolveSeoLanding(params: {
    regionId?: number;
    regionName?: string;
    district?: string;
    subway?: string;
  }) {
    const keys = [
      'seo_landing_district_intro',
      'seo_landing_subway_intro',
      'seo_landing_region_intro',
      'seo_landing_faq_json',
    ];
    if (params.district?.trim()) {
      keys.push(`seo_landing_district_${slugifyLandingKey(params.district)}`);
    }
    if (params.subway?.trim()) {
      keys.push(`seo_landing_subway_${slugifyLandingKey(params.subway)}`);
    }
    if (params.regionId != null) {
      keys.push(`seo_landing_region_${params.regionId}`);
    }

    const rows = await this.prisma.siteSetting.findMany({
      where: { key: { in: keys } },
      select: { key: true, value: true },
    });
    const map = new Map(rows.map((r) => [r.key, r.value]));

    const regionSuffix = params.regionName?.trim()
      ? ` в ${params.regionName.trim()}`
      : '';
    const vars: Record<string, string> = {
      district: params.district?.trim() ?? '',
      subway: params.subway?.trim() ?? '',
      region: params.regionName?.trim() ?? '',
      regionSuffix,
    };

    const applyTemplate = (raw: string | undefined, fallback: string) => {
      const tpl = raw?.trim() || fallback;
      return tpl.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
    };

    let intro = '';
    let kind: 'district' | 'subway' | 'region' | 'catalog' = 'catalog';

    if (params.district?.trim()) {
      kind = 'district';
      const override = map.get(`seo_landing_district_${slugifyLandingKey(params.district)}`);
      intro = applyTemplate(
        override,
        applyTemplate(map.get('seo_landing_district_intro'), DEFAULT_SEO_LANDING_SETTINGS[0].value),
      );
    } else if (params.subway?.trim()) {
      kind = 'subway';
      const override = map.get(`seo_landing_subway_${slugifyLandingKey(params.subway)}`);
      intro = applyTemplate(
        override,
        applyTemplate(map.get('seo_landing_subway_intro'), DEFAULT_SEO_LANDING_SETTINGS[1].value),
      );
    } else if (params.regionId != null) {
      kind = 'region';
      const override = map.get(`seo_landing_region_${params.regionId}`);
      intro = applyTemplate(
        override,
        applyTemplate(map.get('seo_landing_region_intro'), DEFAULT_SEO_LANDING_SETTINGS[2].value),
      );
    }

    let faq: Array<{ q: string; a: string }> = [];
    try {
      const raw = map.get('seo_landing_faq_json') ?? DEFAULT_SEO_LANDING_SETTINGS[3].value;
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        faq = parsed
          .filter((x): x is { q: string; a: string } => typeof x?.q === 'string' && typeof x?.a === 'string')
          .slice(0, 8);
      }
    } catch {
      faq = [];
    }

    return { kind, intro: intro.trim(), faq };
  }

  /** Уведомления о заявках: значения из site_settings (не из env). */

  async getBotContacts() {
    const [email, address, workHours, phoneMain] = await Promise.all([
      this.prisma.siteSetting.findUnique({ where: { key: 'contacts_email' }, select: { value: true } }),
      this.prisma.siteSetting.findUnique({ where: { key: 'contacts_address' }, select: { value: true } }),
      this.prisma.siteSetting.findUnique({ where: { key: 'contacts_work_hours' }, select: { value: true } }),
      this.prisma.siteSetting.findUnique({ where: { key: 'phone_main' }, select: { value: true } }),
    ]);

    return {
      phone: phoneMain?.value?.trim() || '',
      email: email?.value?.trim() || 'info@yugaktsent.ru',
      address: address?.value?.trim() || '',
      workHours: workHours?.value?.trim() || 'пн–пт 9:00–18:00',
      siteUrl: (process.env.PUBLIC_SITE_URL?.trim().replace(/\/+$/, '') || 'https://yugaktsent.neeklo.ru'),
      contactsUrl: `${(process.env.PUBLIC_SITE_URL?.trim().replace(/\/+$/, '') || 'https://yugaktsent.neeklo.ru')}/contacts`,
    };
  }

  /** Ключ для загрузки виджета карт в браузере (не секрет сервера; хранится в integrations). */
  async getYandexMapsPublicConfig(): Promise<{ apiKey: string | null }> {
    const row = await this.prisma.siteSetting.findUnique({
      where: { key: 'yandex_maps_api_key' },
      select: { value: true },
    });
    const v = row?.value?.trim();
    return { apiKey: v && v.length > 0 ? v : null };
  }

  async getTelegramBotToken(): Promise<string> {
    const row = await this.prisma.siteSetting.findUnique({
      where: { key: 'telegram_bot_token' },
      select: { value: true },
    });
    return String(row?.value ?? '').trim();
  }

  async updateSettings(
    data: { key: string; value: string }[],
    ctx: { requesterRole: string; returnMode: 'public' | 'admin' },
  ) {
    const filtered = data.filter(({ key }) => {
      // JSON экспертов — только через валидируемый PUT /admin/content/experts
      if (key === EXPERTS_SETTING_KEY) return false;
      if (!integrationKeys.has(key)) return true;
      return ctx.requesterRole === 'admin';
    });

    await this.prisma.$transaction(
      filtered.map(({ key, value }) => {
        const base = settingDefaultsByKey.get(key);
        if (base) {
          return this.prisma.siteSetting.upsert({
            where: { key },
            update: { value },
            create: { ...base, value },
          });
        }
        return this.prisma.siteSetting.update({
          where: { key },
          data: { value },
        });
      }),
    );

    if (ctx.returnMode === 'public') {
      return this.getSettingsPublic();
    }
    return this.getSettingsForAdminRole(ctx.requesterRole);
  }

  /* ─── Эксперты ─── */

  private async readExpertsRow(): Promise<{ experts: ExpertProfileDto[] | null; updatedAt: Date | null }> {
    const row = await this.prisma.siteSetting.findUnique({
      where: { key: EXPERTS_SETTING_KEY },
      select: { value: true, updatedAt: true },
    });
    if (!row?.value?.trim()) return { experts: null, updatedAt: null };
    try {
      const parsed = JSON.parse(row.value) as unknown;
      if (!Array.isArray(parsed)) return { experts: null, updatedAt: row.updatedAt };
      return { experts: parsed as ExpertProfileDto[], updatedAt: row.updatedAt };
    } catch {
      this.logger.error('site_settings.experts_json is not valid JSON; falling back to defaults');
      return { experts: null, updatedAt: row.updatedAt };
    }
  }

  /** Админка: полный список как сохранён. experts=null — ещё ничего не сохраняли, фронт берёт встроенные данные. */
  async getExpertsAdmin() {
    return this.readExpertsRow();
  }

  /**
   * Публичный список: только опубликованные страницы и только то, что видно на странице
   * (без скрытых ссылок/видео, неопубликованных гайдов, обложки и служебных полей).
   */
  async getExpertsPublic() {
    const { experts, updatedAt } = await this.readExpertsRow();
    if (!experts) return { experts: null, updatedAt: null };
    const isHttp = (u?: string) => !!u && /^https?:\/\//i.test(u.trim());
    return {
      updatedAt,
      experts: experts
        .filter((e) => e?.published === true)
        .map((e) => ({
          slug: e.slug,
          fullName: e.fullName,
          role: e.role,
          experience: e.experience || undefined,
          city: e.city || undefined,
          photoUrl: e.photoUrl || undefined,
          summary: e.summary || undefined,
          intro: e.intro,
          about: e.about ?? [],
          projects: (e.projects ?? []).map(({ id, title, description }) => ({ id, title, description })),
          links: (e.links ?? [])
            .filter((l) => l.visible && isHttp(l.url))
            .map(({ id, type, title, handle, url }) => ({ id, type, title, handle, url, visible: true })),
          videos: (e.videos ?? [])
            .filter((v) => v.visible && isHttp(v.url))
            .map(({ id, title, url, previewUrl, priority }) => ({ id, title, url, previewUrl, priority, visible: true })),
          guides: (e.guides ?? [])
            .filter((g) => g.published && isHttp(g.fileUrl))
            .map(({ id, title, description, fileUrl }) => ({ id, title, description, fileUrl, published: true })),
          phones: (e.phones ?? []).map(({ id, label, value, note }) => ({ id, label, value, note })),
          address: e.address || undefined,
          primaryCta: e.primaryCta,
          showOnTeamPage: e.showOnTeamPage === true,
          seo: { title: e.seo?.title ?? '', description: e.seo?.description ?? '' },
          published: true,
        })),
    };
  }

  async updateExperts(experts: ExpertProfileDto[], userId?: string) {
    const slugs = new Set<string>();
    for (const e of experts) {
      if (slugs.has(e.slug)) throw new BadRequestException(`Адрес /experts/${e.slug} занят другим экспертом`);
      slugs.add(e.slug);
    }
    const value = JSON.stringify(experts);
    if (value.length > EXPERTS_JSON_MAX_CHARS) {
      throw new PayloadTooLargeException('Слишком большой объём данных экспертов');
    }
    await this.prisma.siteSetting.upsert({
      where: { key: EXPERTS_SETTING_KEY },
      update: { value, updatedBy: userId ?? null },
      create: {
        key: EXPERTS_SETTING_KEY,
        value,
        groupName: EXPERTS_SETTING_GROUP,
        label: 'Эксперты (JSON, редактируется в разделе «Эксперты»)',
        fieldType: 'TEXTAREA',
        sortOrder: 0,
        updatedBy: userId ?? null,
      },
    });
    return this.getExpertsAdmin();
  }

  async getPageBlocks(slug: string) {
    return this.prisma.contentBlock.findMany({
      where: { pageSlug: slug, isVisible: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: {
        fields: {
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        },
        items: {
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          include: {
            fields: {
              orderBy: [{ id: 'asc' }],
            },
          },
        },
      },
    });
  }

  async getNavigation(location: string) {
    const menu = await this.prisma.navigationMenu.findUnique({
      where: { location },
      include: {
        items: {
          where: { isVisible: true },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        },
      },
    });
    if (!menu) {
      throw new NotFoundException(`Navigation menu "${location}" not found`);
    }
    const tree = this.buildNavigationTree(menu.items as NavigationItem[]);
    return {
      id: menu.id,
      location: menu.location,
      label: menu.label,
      updatedAt: menu.updatedAt,
      items: tree,
    };
  }

  private buildNavigationTree(flat: NavigationItem[]): NavItemTree[] {
    const nodes = new Map<number, NavItemTree>();
    for (const item of flat) {
      nodes.set(item.id, { ...item, children: [] });
    }
    const roots: NavItemTree[] = [];
    for (const item of flat) {
      const node = nodes.get(item.id)!;
      if (item.parentId == null) {
        roots.push(node);
      } else {
        const parent = nodes.get(item.parentId);
        if (parent) {
          parent.children.push(node);
        } else {
          roots.push(node);
        }
      }
    }
    this.sortNavTree(roots);
    return roots;
  }

  private sortNavTree(nodes: NavItemTree[]) {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    for (const n of nodes) {
      if (n.children.length) {
        this.sortNavTree(n.children);
      }
    }
  }

  async getBanks(activeOnly = true) {
    return this.prisma.mortgageBank.findMany({
      where: activeOnly ? { isActive: true } : {},
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  }

  async createBank(dto: CreateMortgageBankDto) {
    return this.prisma.mortgageBank.create({
      data: {
        name: dto.name,
        rateFrom: this.toDecimal(dto.rateFrom),
        rateTo: this.toDecimal(dto.rateTo),
        logoUrl: dto.logoUrl ?? null,
        url: dto.url ?? null,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updateBank(id: number, dto: UpdateMortgageBankDto) {
    await this.ensureBankExists(id);
    const data: Prisma.MortgageBankUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.rateFrom !== undefined) data.rateFrom = this.toDecimal(dto.rateFrom);
    if (dto.rateTo !== undefined) data.rateTo = this.toDecimal(dto.rateTo);
    if (dto.logoUrl !== undefined) data.logoUrl = dto.logoUrl;
    if (dto.url !== undefined) data.url = dto.url;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (Object.keys(data).length === 0) {
      return this.prisma.mortgageBank.findUniqueOrThrow({ where: { id } });
    }
    return this.prisma.mortgageBank.update({ where: { id }, data });
  }

  async deleteBank(id: number) {
    await this.ensureBankExists(id);
    await this.prisma.mortgageBank.delete({ where: { id } });
  }

  private async ensureBankExists(id: number) {
    const row = await this.prisma.mortgageBank.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!row) {
      throw new NotFoundException(`Mortgage bank ${id} not found`);
    }
  }

  private toDecimal(value: number | undefined): Prisma.Decimal | null {
    if (value === undefined) {
      return null;
    }
    return new Prisma.Decimal(value);
  }
}

function slugifyLandingKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

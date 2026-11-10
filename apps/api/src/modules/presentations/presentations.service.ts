import { Injectable, NotFoundException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import type PDFKit from 'pdfkit';
import { ListingKind } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  formatPdfFooterContact,
  formatPdfHeaderAgentLine,
  listingPdfParamRows,
  formatPdfBrandContacts,
  formatPdfMoney,
  PDF_BORDER,
  PDF_BRAND_COLOR,
  PDF_GRAPHITE,
  PDF_SURFACE,
  PDF_TEXT_DARK,
  PDF_TEXT_MUTED,
  resolveGeoPoint,
  yandexStaticMapImageUrl,
  type PdfAgentContact,
  type PdfBrand,
} from './presentation-pdf';
import type { ListingPresentationPayload, PresentationPayload } from './presentation.types';

export type { ListingPresentationPayload, PresentationPayload } from './presentation.types';

function listingKindLabel(kind: ListingKind): string {
  const m: Record<ListingKind, string> = {
    APARTMENT: 'Квартира',
    HOUSE: 'Дом',
    LAND: 'Участок',
    COMMERCIAL: 'Коммерция',
    PARKING: 'Машиноместо',
  };
  return m[kind] ?? String(kind);
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–')
    .replace(/&laquo;/gi, '«')
    .replace(/&raquo;/gi, '»')
    .replace(/&hellip;/gi, '…');
}

function normalizeDescription(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  const decoded = decodeHtmlEntities(raw);
  const withBreaks = decoded
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n');
  const text = withBreaks
    .replace(/<[^>]+>/g, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  return text.length > 0 ? text : null;
}

/** «1 кв. 2027» — так же, как срок сдачи подписан в карточках каталога. */
function quarterLabel(value: Date | null | undefined): string | null {
  if (!value || Number.isNaN(value.getTime())) return null;
  return `${Math.ceil((value.getUTCMonth() + 1) / 3)} кв. ${value.getUTCFullYear()}`;
}

function roomLabel(raw: string | null | undefined): string {
  const t = (raw ?? '').toLowerCase();
  if (t.includes('студ')) return 'Студии';
  const m = t.match(/\b(\d)\b/);
  if (m) return `${m[1]}-комн.`;
  return 'Другие';
}

function extraPhotoUrlsFromJson(j: unknown): string[] {
  if (!Array.isArray(j)) return [];
  return j.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
}

function dedupeUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    const k = u.trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

@Injectable()
export class PresentationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getBySlug(slug: string): Promise<PresentationPayload> {
    const block = await this.prisma.block.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        builder: { select: { name: true } },
        addresses: { take: 1, orderBy: { id: 'asc' }, select: { address: true } },
        images: { take: 1, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: { url: true } },
        subways: {
          take: 1,
          orderBy: [{ distanceTime: 'asc' }, { id: 'asc' }],
          select: {
            distanceTime: true,
            subway: { select: { name: true } },
          },
        },
        buildings: {
          where: { deadline: { not: null } },
          orderBy: { deadline: 'asc' },
          select: { deadline: true },
        },
      },
    });
    if (!block) throw new NotFoundException('Block not found');

    const listings = await this.prisma.listing.findMany({
      where: {
        blockId: block.id,
        kind: 'APARTMENT',
        status: 'ACTIVE',
        isPublished: true,
      },
      select: {
        price: true,
        builder: { select: { name: true } },
        apartment: {
          select: {
            roomType: { select: { name: true } },
          },
        },
      },
      orderBy: { price: 'asc' },
    });

    const metro = block.subways[0]
      ? `${block.subways[0].subway.name}${block.subways[0].distanceTime != null ? ` · ${block.subways[0].distanceTime} мин` : ''}`
      : null;
    const priceValues = listings
      .map((x) => (x.price == null ? null : Number(x.price)))
      .filter((v): v is number => v != null && Number.isFinite(v) && v > 0);
    const roomMixMap = new Map<string, { label: string; count: number; priceFrom: number | null }>();
    for (const row of listings) {
      const label = roomLabel(row.apartment?.roomType?.name);
      const price = row.price == null ? null : Number(row.price);
      const current = roomMixMap.get(label);
      if (!current) {
        roomMixMap.set(label, { label, count: 1, priceFrom: Number.isFinite(price ?? NaN) ? (price as number) : null });
        continue;
      }
      current.count += 1;
      if (price != null && Number.isFinite(price) && (current.priceFrom == null || price < current.priceFrom)) {
        current.priceFrom = price;
      }
    }
    const roomMix = Array.from(roomMixMap.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    const deadlineValues = block.buildings
      .map((x) => x.deadline)
      .filter((d): d is Date => d instanceof Date && !Number.isNaN(d.getTime()));
    const deadlineFrom = quarterLabel(deadlineValues[0] ?? null);
    const deadlineTo = quarterLabel(deadlineValues[deadlineValues.length - 1] ?? null);
    const deadline =
      deadlineFrom && deadlineTo
        ? deadlineFrom === deadlineTo
          ? deadlineFrom
          : `с ${deadlineFrom} до ${deadlineTo}`
        : deadlineFrom ?? null;
    const fallbackBuilder =
      listings
        .map((x) => x.builder?.name?.trim() ?? '')
        .find((name) => name.length > 0) ?? null;

    return {
      slug: block.slug,
      name: block.name,
      description: normalizeDescription(block.description),
      imageUrl: block.images[0]?.url ?? null,
      address: block.addresses[0]?.address ?? null,
      metro,
      builder: block.builder?.name ?? fallbackBuilder,
      deadline,
      availableApartments: listings.length,
      priceFrom: priceValues.length ? Math.min(...priceValues) : null,
      priceTo: priceValues.length ? Math.max(...priceValues) : null,
      roomMix,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Презентация ЖК одним файлом: обложка с фотографией комплекса,
   * цена и ключевые факты, прайс по комнатности, описание и контакты.
   *
   * Рисуем вручную по координатам, а не потоком текста: иначе обложка
   * во всю ширину страницы и подвал в фирменном цвете не сверстать.
   */
  async generatePdf(slug: string, creatorUserId?: string): Promise<Buffer> {
    const p = await this.getBySlug(slug);
    const [contact, brand] = await Promise.all([
      this.resolvePdfAgentContact(creatorUserId),
      this.loadPdfBrand(),
    ]);
    const { doc, chunks } = this.createPdfDoc();

    const W = doc.page.width;
    const M = 48;
    const contentW = W - M * 2;

    // ── Обложка ───────────────────────────────────────────────────────────
    const coverH = 300;
    const cover = p.imageUrl ? await this.fetchImageBuffer(p.imageUrl) : null;
    doc.rect(0, 0, W, coverH).fill(PDF_GRAPHITE);
    if (cover) {
      doc.save();
      doc.rect(0, 0, W, coverH).clip();
      try {
        doc.image(cover, 0, 0, { cover: [W, coverH], align: 'center', valign: 'center' });
      } catch {
        /* битое фото — остаётся графитовая подложка */
      }
      doc.restore();
    }

    // Затемнение градиентом, а не сплошной плашкой: ровный край поперёк
    // фотографии выглядит как брак печати.
    const bottomShade = doc.linearGradient(0, coverH - 190, 0, coverH);
    bottomShade.stop(0, PDF_GRAPHITE, 0).stop(0.55, PDF_GRAPHITE, 0.6).stop(1, PDF_GRAPHITE, 0.92);
    doc.rect(0, coverH - 190, W, 190).fill(bottomShade);

    const topShade = doc.linearGradient(0, 0, 0, 96);
    topShade.stop(0, PDF_GRAPHITE, 0.6).stop(1, PDF_GRAPHITE, 0);
    doc.rect(0, 0, W, 96).fill(topShade);

    doc.font('Bold').fontSize(13).fillColor('#FFFFFF').text(brand.name, M, 24, { lineBreak: false });
    if (brand.tagline) {
      doc.font('Regular').fontSize(8).fillColor('#FFFFFF', 0.8).text(brand.tagline, M, 41, {
        lineBreak: false,
      });
    }
    doc
      .font('Regular')
      .fontSize(8)
      .fillColor('#FFFFFF', 0.8)
      .text('ПРЕЗЕНТАЦИЯ КОМПЛЕКСА', M, 28, { width: contentW, align: 'right' });

    const subParts = [p.address, p.builder].filter(Boolean) as string[];
    const nameY = subParts.length > 0 ? coverH - 112 : coverH - 86;
    doc.font('Bold').fontSize(26).fillColor('#FFFFFF', 1).text(p.name, M, nameY, {
      width: contentW,
      height: 68,
      ellipsis: true,
    });
    if (subParts.length > 0) {
      doc
        .font('Regular')
        .fontSize(11)
        .fillColor('#FFFFFF', 0.85)
        .text(subParts.join('   ·   '), M, coverH - 42, { width: contentW, lineBreak: false });
    }
    doc.fillOpacity(1);

    // ── Цена и объём предложения ──────────────────────────────────────────
    let y = coverH + 32;
    if (p.priceFrom != null) {
      doc.font('Regular').fontSize(9).fillColor(PDF_TEXT_MUTED).text('СТОИМОСТЬ', M, y, { lineBreak: false });
      doc.font('Bold').fontSize(24).fillColor(PDF_BRAND_COLOR).text(
        p.priceTo != null && p.priceTo !== p.priceFrom
          ? `от ${formatPdfMoney(p.priceFrom)}`
          : formatPdfMoney(p.priceFrom),
        M,
        y + 14,
        { width: contentW * 0.6 },
      );
      if (p.priceTo != null && p.priceTo !== p.priceFrom) {
        doc
          .font('Regular')
          .fontSize(10)
          .fillColor(PDF_TEXT_MUTED)
          .text(`до ${formatPdfMoney(p.priceTo)}`, M, doc.y + 2, { width: contentW * 0.6 });
      }
    }
    if (p.availableApartments > 0) {
      doc
        .font('Bold')
        .fontSize(24)
        .fillColor(PDF_TEXT_DARK)
        .text(String(p.availableApartments), M, y + 14, { width: contentW, align: 'right' });
      doc
        .font('Regular')
        .fontSize(9)
        .fillColor(PDF_TEXT_MUTED)
        .text('квартир в продаже', M, y + 44, { width: contentW, align: 'right' });
    }

    y = Math.max(y + 76, doc.y + 18);
    doc.moveTo(M, y).lineTo(W - M, y).strokeColor(PDF_BORDER).lineWidth(1).stroke();
    y += 22;

    // ── Ключевые факты в две колонки ──────────────────────────────────────
    const facts: Array<[string, string]> = [];
    if (p.builder) facts.push(['Застройщик', p.builder]);
    if (p.deadline) facts.push(['Срок сдачи', p.deadline]);
    if (p.address) facts.push(['Адрес', p.address]);
    if (p.metro) facts.push(['Транспорт', p.metro]);
    if (facts.length > 0) {
      const colW = contentW / 2 - 12;
      facts.forEach(([label, value], i) => {
        const cx = M + (i % 2) * (colW + 24);
        const cy = y + Math.floor(i / 2) * 46;
        doc.font('Regular').fontSize(8).fillColor(PDF_TEXT_MUTED).text(label.toUpperCase(), cx, cy, {
          width: colW,
          lineBreak: false,
        });
        doc.font('Bold').fontSize(11).fillColor(PDF_TEXT_DARK).text(value, cx, cy + 13, {
          width: colW,
          height: 26,
          ellipsis: true,
        });
      });
      y += Math.ceil(facts.length / 2) * 46 + 8;
    }

    // ── Прайс по комнатности ──────────────────────────────────────────────
    if (p.roomMix.length > 0) {
      doc.font('Bold').fontSize(12).fillColor(PDF_TEXT_DARK).text('Квартиры в продаже', M, y);
      y = doc.y + 10;

      const rowH = 26;
      const rows = p.roomMix.slice(0, 7);
      rows.forEach((row, i) => {
        if (i % 2 === 0) doc.rect(M, y - 6, contentW, rowH).fill(PDF_SURFACE);
        doc.font('Regular').fontSize(10).fillColor(PDF_TEXT_DARK).text(row.label, M + 12, y, {
          width: contentW * 0.4,
          lineBreak: false,
        });
        doc
          .font('Regular')
          .fontSize(10)
          .fillColor(PDF_TEXT_MUTED)
          .text(`${row.count} шт.`, M + contentW * 0.45, y, { width: contentW * 0.2, lineBreak: false });
        doc
          .font('Bold')
          .fontSize(10)
          .fillColor(PDF_BRAND_COLOR)
          .text(
            row.priceFrom != null ? `от ${formatPdfMoney(row.priceFrom)}` : 'цена по запросу',
            M,
            y,
            { width: contentW - 12, align: 'right' },
          );
        y += rowH;
      });
      y += 10;
    }

    // ── Описание: столько, сколько влезает до подвала ─────────────────────
    const footerTop = doc.page.height - 86;
    if (p.description?.trim() && y < footerTop - 70) {
      doc.font('Bold').fontSize(12).fillColor(PDF_TEXT_DARK).text('О комплексе', M, y);
      y = doc.y + 6;
      doc.font('Regular').fontSize(10).fillColor('#374151').text(p.description.trim(), M, y, {
        width: contentW,
        height: footerTop - y - 14,
        ellipsis: true,
        align: 'left',
        lineGap: 2,
      });
    }

    // Блок призыва перед подвалом: иначе у комплексов без описания
    // нижняя половина листа остаётся пустой. Строки кладём друг под друга —
    // прижатые к правому краю контакты наезжали на длинный подзаголовок.
    const ctaH = 96;
    const ctaTop = doc.page.height - 62 - ctaH - 16;
    if (y < ctaTop - 12) {
      doc.rect(M, ctaTop, contentW, ctaH).fill(PDF_SURFACE);
      doc
        .font('Bold')
        .fontSize(13)
        .fillColor(PDF_TEXT_DARK)
        .text('Подберём квартиру в этом комплексе', M + 20, ctaTop + 20, {
          width: contentW - 40,
          lineBreak: false,
        });
      doc
        .font('Regular')
        .fontSize(10)
        .fillColor(PDF_TEXT_MUTED)
        .text('Свободные планировки и актуальные условия застройщика', M + 20, ctaTop + 40, {
          width: contentW - 40,
          lineBreak: false,
        });
      const ctaLine = [brand.phone, brand.email].filter(Boolean).join('   ·   ');
      if (ctaLine) {
        doc
          .font('Bold')
          .fontSize(11)
          .fillColor(PDF_BRAND_COLOR)
          .text(ctaLine, M + 20, ctaTop + 62, { width: contentW - 40, lineBreak: false });
      }
    }

    this.drawPdfBrandFooter(doc, brand, contact, p.slug);
    return this.pdfFinish(doc, chunks);
  }

  /** Реквизиты компании из настроек сайта; выдуманных значений не подставляем. */
  private async loadPdfBrand(): Promise<PdfBrand> {
    const keys = [
      'company_name',
      'site_tagline',
      'phone_main',
      'email',
      'contacts_email',
      'address',
      'contacts_address',
      'public_site_url',
      'site_logo_url',
    ];
    let map = new Map<string, string>();
    try {
      const rows = await this.prisma.siteSetting.findMany({
        where: { key: { in: keys } },
        select: { key: true, value: true },
      });
      map = new Map(rows.map((r) => [r.key, (r.value ?? '').trim()]));
    } catch {
      // Настройки недоступны — печатаем презентацию без реквизитов
    }
    const pick = (...k: string[]) => k.map((x) => map.get(x)).find((v) => v && v.length > 0) ?? null;

    const siteUrl = (pick('public_site_url') ?? process.env.PUBLIC_SITE_URL ?? '')
      .replace(/^https?:\/\//, '')
      .replace(/\/+$/, '');

    return {
      name: pick('company_name') ?? 'Агентство недвижимости',
      tagline: pick('site_tagline'),
      phone: pick('phone_main'),
      email: pick('email', 'contacts_email'),
      address: pick('address', 'contacts_address'),
      siteUrl: siteUrl.length > 0 ? siteUrl : null,
      logoUrl: pick('site_logo_url'),
    };
  }

  /** Фирменная плашка внизу страницы: контакты компании и менеджера. */
  private drawPdfBrandFooter(
    doc: PDFKit.PDFDocument,
    brand: PdfBrand,
    contact: PdfAgentContact | null,
    slug?: string,
  ): void {
    const W = doc.page.width;
    const M = 48;
    const h = 62;
    const top = doc.page.height - h;
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    doc.rect(0, top, W, h).fill(PDF_BRAND_COLOR);

    const agentLine = formatPdfFooterContact(contact);
    doc
      .font('Bold')
      .fontSize(10)
      .fillColor('#FFFFFF')
      .text(agentLine ? `Ваш менеджер: ${agentLine}` : brand.name, M, top + 14, {
        width: W - M * 2,
        lineBreak: false,
      });

    const contacts = formatPdfBrandContacts(brand);
    if (contacts) {
      doc
        .font('Regular')
        .fontSize(9)
        .fillColor('#FFFFFF', 0.85)
        .text(contacts, M, top + 31, { width: W - M * 2, lineBreak: false });
    }

    const link = brand.siteUrl && slug ? `${brand.siteUrl}/complex/${slug}` : null;
    doc
      .font('Regular')
      .fontSize(8)
      .fillColor('#FFFFFF', 0.6)
      .text(link ?? new Date().toLocaleDateString('ru-RU'), M, top + 24, {
        width: W - M * 2,
        align: 'right',
        lineBreak: false,
      });

    doc.page.margins.bottom = savedBottom;
  }

  private siteBase(): string {
    return (process.env.PUBLIC_SITE_URL ?? '').replace(/\/+$/, '');
  }

  private toAbsoluteUrl(url: string): string {
    const u = url.trim();
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    return `${this.siteBase()}${u.startsWith('/') ? '' : '/'}${u}`;
  }

  private async fetchImageBuffer(url: string): Promise<Buffer | null> {
    try {
      const abs = this.toAbsoluteUrl(url);
      const res = await fetch(abs, { redirect: 'follow' });
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch {
      return null;
    }
  }

  async getListingPresentation(listingId: number): Promise<ListingPresentationPayload> {
    // Public endpoint: only published listings may be rendered (audit B1).
    const row = await this.prisma.listing.findFirst({
      where: {
        id: listingId,
        isPublished: true,
        visibility: 'PUBLIC',
        status: { in: ['ACTIVE', 'RESERVED', 'SOLD'] },
      },
      include: {
        apartment: { include: { roomType: true, finishing: true } },
        house: true,
        land: true,
        commercial: true,
        parking: true,
        region: true,
        district: true,
        builder: true,
        block: { select: { name: true, slug: true, latitude: true, longitude: true } },
      },
    });
    if (!row) throw new NotFoundException('Listing not found');
    if (!row.isPublished || row.status !== 'ACTIVE') {
      throw new NotFoundException('Listing not available');
    }

    const media = await this.prisma.mediaFile.findMany({
      where: { entityType: 'listing', entityId: listingId },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });

    const rawPhotos: string[] = [];
    const rawPlans: string[] = [];
    for (const m of media) {
      const u = m.url?.trim();
      if (!u) continue;
      if (m.kind === 'PLAN') rawPlans.push(u);
      else if (m.kind === 'PHOTO') rawPhotos.push(u);
    }

    if (row.kind === 'APARTMENT' && row.apartment) {
      const a = row.apartment;
      if (a.planUrl?.trim()) rawPlans.push(a.planUrl.trim());
      if (a.finishingPhotoUrl?.trim()) rawPhotos.push(a.finishingPhotoUrl.trim());
      rawPhotos.push(...extraPhotoUrlsFromJson(a.extraPhotoUrls));
    }
    if (row.kind === 'HOUSE' && row.house) {
      const h = row.house;
      if (h.photoUrl?.trim()) rawPhotos.push(h.photoUrl.trim());
      rawPhotos.push(...extraPhotoUrlsFromJson(h.extraPhotoUrls));
    }
    if (row.kind === 'LAND' && row.land) {
      const land = row.land;
      if (land.photoUrl?.trim()) rawPhotos.push(land.photoUrl.trim());
      rawPhotos.push(...extraPhotoUrlsFromJson(land.extraPhotoUrls));
    }

    const planUrls = dedupeUrls(rawPlans);
    const photoUrls = dedupeUrls(rawPhotos.filter((u) => !planUrls.includes(u)));

    const kl = listingKindLabel(row.kind);
    let subtitle: string | null = null;
    switch (row.kind) {
      case 'APARTMENT': {
        const a = row.apartment;
        if (a) {
          const parts: string[] = [];
          if (a.roomType?.name?.trim()) parts.push(a.roomType.name.trim());
          if (a.areaTotal != null && Number(a.areaTotal) > 0) parts.push(`${Number(a.areaTotal)} м²`);
          if (a.floor != null)
            parts.push(`этаж ${a.floor}${a.floorsTotal != null ? ` из ${a.floorsTotal}` : ''}`);
          subtitle = parts.length ? parts.join(' · ') : null;
        }
        break;
      }
      case 'HOUSE': {
        const h = row.house;
        if (h?.areaTotal != null && Number(h.areaTotal) > 0) subtitle = `${Number(h.areaTotal)} м²`;
        break;
      }
      case 'LAND': {
        const land = row.land;
        if (land?.areaSotki != null && Number(land.areaSotki) > 0)
          subtitle = `${Number(land.areaSotki)} сот.`;
        break;
      }
      case 'COMMERCIAL': {
        const c = row.commercial;
        if (c?.area != null && Number(c.area) > 0) subtitle = `${Number(c.area)} м²`;
        break;
      }
      case 'PARKING': {
        const pk = row.parking;
        if (pk?.area != null && Number(pk.area) > 0) subtitle = `${Number(pk.area)} м²`;
        break;
      }
      default:
        break;
    }

    const titleFallback = subtitle ? `${kl} · ${subtitle}` : kl;
    const title = row.title?.trim() || titleFallback;

    const price =
      row.price != null && Number.isFinite(Number(row.price)) ? Number(row.price) : null;

    const geo = resolveGeoPoint({
      lat: row.lat,
      lng: row.lng,
      blockLat: row.block?.latitude,
      blockLng: row.block?.longitude,
    });

    return {
      listingId: row.id,
      kind: row.kind,
      kindLabel: kl,
      title,
      description: normalizeDescription(row.description),
      price,
      address: row.address?.trim() ?? null,
      region: row.region?.name ?? null,
      district: row.district?.name ?? null,
      builder: row.builder?.name ?? null,
      blockName: row.block?.name ?? null,
      blockSlug: row.block?.slug ?? null,
      subtitle,
      photoUrls,
      planUrls,
      latitude: geo?.lat ?? null,
      longitude: geo?.lng ?? null,
      generatedAt: new Date().toISOString(),
    };
  }

  /** Контакты агента/создателя PDF (имя, телефон, email). */
  async resolvePdfAgentContact(
    creatorUserId?: string,
    listingOwnerUserId?: string | null,
  ): Promise<PdfAgentContact | null> {
    const userId = creatorUserId ?? listingOwnerUserId ?? undefined;
    if (!userId) return null;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        fullName: true,
        phone: true,
        email: true,
        agencyProfile: { select: { displayName: true, phone: true, email: true } },
      },
    });
    if (!user) return null;

    const name =
      user.fullName?.trim() ||
      user.agencyProfile?.displayName?.trim() ||
      null;
    const phone = user.phone?.trim() || user.agencyProfile?.phone?.trim() || null;
    const email = user.email?.trim() || user.agencyProfile?.email?.trim() || null;

    if (!name && !phone && !email) return null;
    return { name, phone, email };
  }

  private pdfFonts(): { regular: string; bold: string } {
    return {
      regular: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
      bold: '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    };
  }

  private createPdfDoc(): { doc: PDFKit.PDFDocument; chunks: Buffer[] } {
    const { regular, bold } = this.pdfFonts();
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    doc.registerFont('Regular', regular);
    doc.registerFont('Bold', bold);
    doc.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    return { doc, chunks };
  }

  private pdfFinish(doc: PDFKit.PDFDocument, chunks: Buffer[]): Promise<Buffer> {
    doc.end();
    return new Promise<Buffer>((resolve, reject) => {
      doc.once('end', () => resolve(Buffer.concat(chunks)));
      doc.once('error', reject);
    });
  }

  private drawPdfBrandHeader(
    doc: PDFKit.PDFDocument,
    contact: PdfAgentContact | null,
    brand: PdfBrand,
  ): number {
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const y0 = doc.y;

    doc.font('Bold').fontSize(16).fillColor(PDF_BRAND_COLOR).text(brand.name, left, y0, { lineBreak: false });
    if (brand.tagline) {
      doc.font('Regular').fontSize(8).fillColor(PDF_TEXT_MUTED).text(brand.tagline, left, y0 + 18, {
        lineBreak: false,
      });
    }

    const agentLine = formatPdfHeaderAgentLine(contact);
    if (agentLine) {
      doc.font('Regular').fontSize(9).fillColor(PDF_TEXT_DARK).text(agentLine, left, y0, {
        width: right - left,
        align: 'right',
      });
    }

    const headerBottom = Math.max(y0 + 32, doc.y);
    doc
      .moveTo(left, headerBottom + 6)
      .lineTo(right, headerBottom + 6)
      .strokeColor('#E5E7EB')
      .lineWidth(1)
      .stroke();
    doc.y = headerBottom + 14;
    return doc.y;
  }

  private drawPdfFooterBar(
    doc: PDFKit.PDFDocument,
    contact: PdfAgentContact | null,
    brand: PdfBrand,
  ): void {
    const agent = formatPdfFooterContact(contact);
    const line = agent ? `По вопросам: ${agent}` : formatPdfBrandContacts(brand);
    if (!line) return;
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const bottom = doc.page.height - doc.page.margins.bottom;
    doc
      .font('Regular')
      .fontSize(8)
      .fillColor(PDF_TEXT_MUTED)
      .text(line, left, bottom - 28, { width: right - left, align: 'center' });
  }

  private drawPdfParamTable(doc: PDFKit.PDFDocument, rows: ReturnType<typeof listingPdfParamRows>): void {
    const left = doc.page.margins.left;
    const colW = (doc.page.width - doc.page.margins.left - doc.page.margins.right) / 2;
    for (const row of rows) {
      const y = doc.y;
      doc.font('Regular').fontSize(9).fillColor(PDF_TEXT_MUTED).text(row.label, left, y, {
        width: colW - 8,
        lineBreak: false,
      });
      doc.font('Regular').fontSize(10).fillColor(PDF_TEXT_DARK).text(row.value, left + colW, y, {
        width: colW,
      });
      doc.moveDown(0.35);
    }
  }

  private async renderListingPdfFirstPage(
    doc: PDFKit.PDFDocument,
    p: ListingPresentationPayload,
    contact: PdfAgentContact | null,
    brand: PdfBrand,
  ): Promise<void> {
    this.drawPdfBrandHeader(doc, contact, brand);
    const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const heroUrl = p.photoUrls[0];
    if (heroUrl) {
      const hero = await this.fetchImageBuffer(heroUrl);
      if (hero) {
        try {
          doc.image(hero, { width: contentWidth, height: 200 });
          doc.moveDown(0.6);
        } catch {
          /* skip broken hero */
        }
      }
    }

    doc.font('Bold').fontSize(18).fillColor(PDF_BRAND_COLOR).text(p.title, { align: 'left' });
    doc.moveDown(0.35);
    if (p.price != null && Number.isFinite(p.price)) {
      doc
        .font('Bold')
        .fontSize(16)
        .fillColor(PDF_TEXT_DARK)
        .text(`${new Intl.NumberFormat('ru-RU').format(Math.trunc(p.price))} ₽`);
      doc.moveDown(0.5);
    }

    doc.font('Bold').fontSize(11).fillColor(PDF_BRAND_COLOR).text('Параметры');
    doc.moveDown(0.3);
    this.drawPdfParamTable(doc, listingPdfParamRows(p));

    if (p.description?.trim()) {
      doc.moveDown(0.4);
      doc.font('Bold').fontSize(11).fillColor(PDF_BRAND_COLOR).text('Описание');
      doc.moveDown(0.2);
      doc.font('Regular').fontSize(10).fillColor(PDF_TEXT_DARK).text(p.description.trim());
    }

    if (p.latitude != null && p.longitude != null) {
      const mapBuf = await this.fetchImageBuffer(yandexStaticMapImageUrl(p.latitude, p.longitude));
      doc.moveDown(0.5);
      doc.font('Bold').fontSize(11).fillColor(PDF_BRAND_COLOR).text('Расположение');
      doc.moveDown(0.25);
      if (mapBuf) {
        try {
          doc.image(mapBuf, { width: contentWidth, height: 140 });
        } catch {
          doc.font('Regular').fontSize(9).fillColor(PDF_TEXT_MUTED).text(p.address ?? 'Карта недоступна');
        }
      } else if (p.address) {
        doc.font('Regular').fontSize(10).fillColor(PDF_TEXT_DARK).text(p.address);
      }
    }

    this.drawPdfFooterBar(doc, contact, brand);
  }

  async generateListingPdf(listingId: number, creatorUserId?: string): Promise<Buffer> {
    const row = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { ownerUserId: true },
    });
    const p = await this.getListingPresentation(listingId);
    const [contact, brand] = await Promise.all([
      this.resolvePdfAgentContact(creatorUserId, row?.ownerUserId),
      this.loadPdfBrand(),
    ]);

    const { doc, chunks } = this.createPdfDoc();
    await this.renderListingPdfFirstPage(doc, p, contact, brand);

    const fit = { fit: [500, 700] as [number, number] };

    const plans = p.planUrls.slice(0, 10);
    for (let i = 0; i < plans.length; i++) {
      const url = plans[i];
      const buf = await this.fetchImageBuffer(url);
      doc.addPage();
      this.drawPdfBrandHeader(doc, contact, brand);
      doc.font('Bold').fontSize(13).fillColor(PDF_BRAND_COLOR).text(`Планировка (${i + 1}/${plans.length})`);
      doc.moveDown(0.4);
      if (buf) {
        try {
          doc.image(buf, fit);
        } catch {
          doc.font('Regular').fontSize(10).fillColor(PDF_TEXT_MUTED).text('Не удалось встроить изображение.');
        }
      } else {
        doc.font('Regular').fontSize(10).fillColor(PDF_TEXT_MUTED).text('Изображение недоступно по ссылке.');
      }
      this.drawPdfFooterBar(doc, contact, brand);
    }

    const photos = p.photoUrls.slice(1, 15);
    for (let i = 0; i < photos.length; i++) {
      const url = photos[i];
      const buf = await this.fetchImageBuffer(url);
      doc.addPage();
      this.drawPdfBrandHeader(doc, contact, brand);
      doc.font('Bold').fontSize(13).fillColor(PDF_BRAND_COLOR).text(`Фото (${i + 2}/${p.photoUrls.length})`);
      doc.moveDown(0.4);
      if (buf) {
        try {
          doc.image(buf, fit);
        } catch {
          doc.font('Regular').fontSize(10).fillColor(PDF_TEXT_MUTED).text('Не удалось встроить изображение.');
        }
      } else {
        doc.font('Regular').fontSize(10).fillColor(PDF_TEXT_MUTED).text('Изображение недоступно по ссылке.');
      }
      this.drawPdfFooterBar(doc, contact, brand);
    }

    return this.pdfFinish(doc, chunks);
  }
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CollectionItemKind, Prisma } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CollectionsService {
  constructor(private readonly prisma: PrismaService) {}
  private readonly maxItems = 5;

  async list(userId: string) {
    return this.prisma.userCollection.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { items: true } } },
    });
  }

  async create(userId: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) throw new BadRequestException('Укажите название');
    return this.prisma.userCollection.create({
      data: { userId, name: trimmed },
    });
  }

  async getOne(userId: string, id: string) {
    const col = await this.prisma.userCollection.findFirst({
      where: { id, userId },
      include: {
        items: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!col) throw new NotFoundException('Подборка не найдена');

    const items = await Promise.all(
      col.items.map(async (it) => {
        if (it.kind === CollectionItemKind.BLOCK) {
          const b = await this.prisma.block.findUnique({
            where: { id: it.entityId },
            select: { name: true, slug: true },
          });
          return {
            id: it.id,
            kind: it.kind,
            entityId: it.entityId,
            title: b?.name ?? `ЖК #${it.entityId}`,
            slug: b?.slug ?? null,
          };
        }
        const l = await this.prisma.listing.findUnique({
          where: { id: it.entityId },
          select: { id: true, kind: true },
        });
        return {
          id: it.id,
          kind: it.kind,
          entityId: it.entityId,
          title: l ? `Объявление #${l.id}` : `Лот #${it.entityId}`,
          listingKind: l?.kind ?? null,
        };
      }),
    );

    return { id: col.id, name: col.name, shareToken: col.shareToken, createdAt: col.createdAt, updatedAt: col.updatedAt, items };
  }

  async remove(userId: string, id: string) {
    const res = await this.prisma.userCollection.deleteMany({ where: { id, userId } });
    if (res.count === 0) throw new NotFoundException('Подборка не найдена');
  }

  async update(userId: string, id: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) throw new BadRequestException('Укажите название');
    const updated = await this.prisma.userCollection.updateMany({
      where: { id, userId },
      data: { name: trimmed },
    });
    if (updated.count === 0) throw new NotFoundException('Подборка не найдена');
    return this.prisma.userCollection.findFirst({
      where: { id, userId },
      include: { _count: { select: { items: true } } },
    });
  }

  async addItem(userId: string, collectionId: string, kind: CollectionItemKind, entityId: number) {
    const col = await this.prisma.userCollection.findFirst({
      where: { id: collectionId, userId },
      select: { id: true },
    });
    if (!col) throw new NotFoundException('Подборка не найдена');

    const existingCount = await this.prisma.userCollectionItem.count({ where: { collectionId } });
    if (existingCount >= this.maxItems) {
      throw new BadRequestException(`В подборке может быть не больше ${this.maxItems} объектов`);
    }

    if (kind === CollectionItemKind.BLOCK) {
      const b = await this.prisma.block.findUnique({ where: { id: entityId }, select: { id: true } });
      if (!b) throw new BadRequestException('ЖК не найден');
    } else {
      const l = await this.prisma.listing.findUnique({ where: { id: entityId }, select: { id: true } });
      if (!l) throw new BadRequestException('Объявление не найдено');
    }

    try {
      return await this.prisma.userCollectionItem.create({
        data: { collectionId, kind, entityId },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Объект уже в этой подборке');
      }
      throw e;
    }
  }

  async removeItem(userId: string, collectionId: string, itemId: string) {
    const col = await this.prisma.userCollection.findFirst({
      where: { id: collectionId, userId },
      select: { id: true },
    });
    if (!col) throw new NotFoundException('Подборка не найдена');
    const res = await this.prisma.userCollectionItem.deleteMany({
      where: { id: itemId, collectionId },
    });
    if (res.count === 0) throw new NotFoundException('Элемент не найден');
  }

  async ensureShareToken(userId: string, id: string) {
    const col = await this.prisma.userCollection.findFirst({
      where: { id, userId },
      select: { id: true, shareToken: true },
    });
    if (!col) throw new NotFoundException('Подборка не найдена');
    if (col.shareToken) return { token: col.shareToken };
    const token = randomUUID().replace(/-/g, '');
    await this.prisma.userCollection.update({ where: { id }, data: { shareToken: token } });
    return { token };
  }

  async getPublicByToken(token: string) {
    const normalized = token.trim();
    if (!normalized || normalized.length < 16) throw new NotFoundException('Подборка не найдена');
    const col = await this.prisma.userCollection.findUnique({
      where: { shareToken: normalized },
      include: {
        items: { orderBy: { createdAt: 'desc' }, take: this.maxItems },
      },
    });
    if (!col) throw new NotFoundException('Подборка не найдена');
    const items = await Promise.all(
      col.items.map(async (it) => {
        if (it.kind === CollectionItemKind.BLOCK) {
          const b = await this.prisma.block.findUnique({
            where: { id: it.entityId },
            select: {
              id: true,
              name: true,
              slug: true,
              images: { select: { url: true }, orderBy: { sortOrder: 'asc' }, take: 1 },
              addresses: { select: { address: true }, orderBy: { sortOrder: 'asc' }, take: 1 },
            },
          });
          return {
            id: it.id,
            kind: it.kind,
            entityId: it.entityId,
            title: b?.name ?? `ЖК #${it.entityId}`,
            slug: b?.slug ?? null,
            price: null,
            imageUrl: b?.images[0]?.url ?? null,
            address: b?.addresses[0]?.address ?? null,
          };
        }
        const l = await this.prisma.listing.findUnique({
          where: { id: it.entityId },
          select: { id: true, kind: true, title: true, price: true, address: true },
        });
        return {
          id: it.id,
          kind: it.kind,
          entityId: it.entityId,
          title: l?.title ?? `Объявление #${it.entityId}`,
          listingKind: l?.kind ?? null,
          price: l?.price ?? null,
          imageUrl: null,
          address: l?.address ?? null,
        };
      }),
    );
    return { name: col.name, items };
  }

  async exportPdf(userId: string, id: string): Promise<Buffer> {
    const col = await this.getOne(userId, id);
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    doc.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));

    doc.fontSize(21).text(`Подборка: ${col.name}`);
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#666666').text(`Позиций: ${col.items.length}`);
    doc.fillColor('#000000');
    doc.moveDown();

    if (col.items.length === 0) {
      doc.fontSize(12).text('Подборка пустая.');
    } else {
      for (const [idx, item] of col.items.entries()) {
        doc.fontSize(12).text(`${idx + 1}. ${item.title}`);
        doc.fontSize(10).fillColor('#555555').text(item.kind === CollectionItemKind.BLOCK ? 'ЖК' : 'Объявление');
        if (item.kind === CollectionItemKind.BLOCK && item.slug) {
          doc.text(`URL: ${(process.env.PUBLIC_SITE_URL || 'https://yugaktsent.neeklo.ru').replace(/\/+$/, '')}/complex/${item.slug}`);
        } else if (item.kind === CollectionItemKind.LISTING) {
          doc.text(`URL: ${(process.env.PUBLIC_SITE_URL || 'https://yugaktsent.neeklo.ru').replace(/\/+$/, '')}/apartment/${item.entityId}`);
        }
        doc.fillColor('#000000');
        doc.moveDown(0.5);
      }
    }

    doc.moveDown();
    doc.fontSize(9).fillColor('#888888').text(`Сформировано: ${new Date().toLocaleString('ru-RU')}`);
    doc.end();

    return await new Promise<Buffer>((resolve, reject) => {
      doc.once('end', () => resolve(Buffer.concat(chunks)));
      doc.once('error', reject);
    });
  }
}

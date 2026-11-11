import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BuildersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Застройщики для фильтра каталога: только те, у кого есть ЖК с квартирами на сайте,
   * с числом таких ЖК — фильтр показывает «Застройщик (N)», пустых пунктов нет.
   */
  async findAll(regionId?: number) {
    const builders = await this.prisma.builder.findMany({
      where: regionId ? { regionId } : undefined,
      orderBy: { name: 'asc' },
      select: { id: true, name: true, regionId: true, externalId: true, crmId: true, dataSource: true },
    });
    if (builders.length === 0) return [];
    const blocks = await this.prisma.block.findMany({
      where: {
        builderId: { in: builders.map((b) => b.id) },
        listings: { some: { isPublished: true, status: { in: ['ACTIVE', 'RESERVED'] } } },
      },
      select: { builderId: true },
    });
    const counts = new Map<number, number>();
    for (const b of blocks) if (b.builderId != null) counts.set(b.builderId, (counts.get(b.builderId) ?? 0) + 1);
    return builders.filter((b) => counts.has(b.id)).map((b) => ({ ...b, blocksCount: counts.get(b.id) ?? 0 }));
  }

  async findOne(id: number) {
    return this.prisma.builder.findUniqueOrThrow({ where: { id } });
  }

  async findAllAdmin(regionId?: number, search?: string) {
    return this.prisma.builder.findMany({
      where: {
        ...(regionId ? { regionId } : {}),
        ...(search?.trim()
          ? { name: { contains: search.trim(), mode: 'insensitive' } }
          : {}),
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      include: {
        region: {
          select: { id: true, code: true, name: true },
        },
      },
    });
  }

  async createAdmin(dto: { regionId: number; name: string }) {
    const region = await this.prisma.feedRegion.findUnique({ where: { id: dto.regionId } });
    if (!region) throw new NotFoundException('Регион не найден');

    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Название не может быть пустым');

    return this.prisma.builder.create({
      data: {
        regionId: dto.regionId,
        name,
        dataSource: DataSource.MANUAL,
      },
      include: {
        region: {
          select: { id: true, code: true, name: true },
        },
      },
    });
  }

  async updateAdmin(id: number, dto: { regionId?: number; name?: string }) {
    const current = await this.prisma.builder.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Застройщик не найден');
    if (current.dataSource !== DataSource.MANUAL) {
      throw new ConflictException('Разрешено редактировать только ручных застройщиков');
    }

    if (dto.regionId !== undefined) {
      const region = await this.prisma.feedRegion.findUnique({ where: { id: dto.regionId } });
      if (!region) throw new NotFoundException('Регион не найден');
    }

    const name =
      dto.name !== undefined
        ? dto.name.trim()
        : undefined;
    if (name !== undefined && !name) {
      throw new BadRequestException('Название не может быть пустым');
    }

    return this.prisma.builder.update({
      where: { id },
      data: {
        ...(dto.regionId !== undefined ? { regionId: dto.regionId } : {}),
        ...(name !== undefined ? { name } : {}),
      },
      include: {
        region: {
          select: { id: true, code: true, name: true },
        },
      },
    });
  }

  async deleteAdmin(id: number) {
    const current = await this.prisma.builder.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Застройщик не найден');
    if (current.dataSource !== DataSource.MANUAL) {
      throw new ConflictException('Разрешено удалять только ручных застройщиков');
    }

    const [blocks, listings] = await Promise.all([
      this.prisma.block.count({ where: { builderId: id } }),
      this.prisma.listing.count({ where: { builderId: id } }),
    ]);
    if (blocks + listings > 0) {
      throw new ConflictException('Нельзя удалить: есть связанные ЖК или объявления');
    }

    await this.prisma.builder.delete({ where: { id } });
  }
}

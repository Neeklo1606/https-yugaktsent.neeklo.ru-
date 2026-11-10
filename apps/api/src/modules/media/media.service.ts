import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, promises as fs } from 'node:fs';
import { join } from 'node:path';
import { BadRequestException, Injectable, NotFoundException, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Express } from 'express';
import {
  countFilesUnder,
  diskUsageBytes,
  ensureMediaStorageDirs,
  isMediaRootWritable,
  MEDIA_STORAGE_SUBDIRS,
  resolveMediaRoot,
} from '../../common/media-storage.util';
import { PrismaService } from '../../prisma/prisma.service';
import { detectImageFormat, optimizeUploadedImage } from './image-optimize';

const PUBLIC_PREFIX = '/uploads/media/';
const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

@Injectable()
export class MediaService implements OnModuleInit {
  private readonly logger = new Logger(MediaService.name);
  private readonly mediaRoot: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.mediaRoot = resolveMediaRoot(this.config.get<string>('MEDIA_ROOT'));
  }

  get mediaRootPath(): string {
    return this.mediaRoot;
  }

  async onModuleInit() {
    ensureMediaStorageDirs(this.mediaRoot);
    await this.ensureSystemFolders();
  }

  /** Если миграции ещё не создали строки — создаём «Корзину» и «Загрузки» (идемпотентно). */
  private async ensureSystemFolders() {
    const hasTrash = await this.prisma.mediaFolder.findFirst({ where: { isTrash: true } });
    if (!hasTrash) {
      await this.prisma.mediaFolder.create({
        data: { name: 'Корзина', parentId: null, isTrash: true },
      });
    }
    const uploads = await this.prisma.mediaFolder.findFirst({
      where: { parentId: null, isTrash: false, name: 'Загрузки' },
    });
    if (!uploads) {
      await this.prisma.mediaFolder.create({
        data: { name: 'Загрузки', parentId: null, isTrash: false },
      });
    }
  }

  diskPathFromPublicUrl(url: string): string {
    if (!url.startsWith(PUBLIC_PREFIX)) {
      throw new BadRequestException('Некорректный URL медиа');
    }
    const name = url.slice(PUBLIC_PREFIX.length).split('/').join('');
    if (!name || name.includes('..')) throw new BadRequestException('Некорректный URL медиа');
    return join(this.mediaRoot, 'media', name);
  }

  async getTrashFolderId(): Promise<number> {
    const trash = await this.prisma.mediaFolder.findFirst({ where: { isTrash: true } });
    if (!trash) throw new BadRequestException('Системная папка «Корзина» не найдена');
    return trash.id;
  }

  async listFolders() {
    return this.prisma.mediaFolder.findMany({
      orderBy: [{ parentId: 'asc' }, { name: 'asc' }],
    });
  }

  async createFolder(parentId: number | null | undefined, rawName: string) {
    const name = rawName.trim();
    if (!name) throw new BadRequestException('Укажите имя папки');
    if (name === 'Корзина') throw new BadRequestException('Зарезервированное имя');
    const trashId = await this.getTrashFolderId();
    if (parentId === trashId) {
      throw new BadRequestException('Нельзя создавать папки внутри корзины');
    }
    if (parentId != null) {
      const parent = await this.prisma.mediaFolder.findUnique({ where: { id: parentId } });
      if (!parent) throw new BadRequestException('Родительская папка не найдена');
      if (parent.isTrash) throw new BadRequestException('Нельзя создавать папки внутри корзины');
    }
    try {
      return await this.prisma.mediaFolder.create({
        data: {
          name,
          parentId: parentId ?? null,
        },
      });
    } catch {
      throw new BadRequestException('Папка с таким именем уже существует');
    }
  }

  async deleteFolder(id: number) {
    const trashId = await this.getTrashFolderId();
    if (id === trashId) throw new BadRequestException('Нельзя удалить корзину');
    const folder = await this.prisma.mediaFolder.findUnique({
      where: { id },
      include: { _count: { select: { children: true, files: true } } },
    });
    if (!folder) throw new NotFoundException('Папка не найдена');
    if (folder.isTrash) throw new BadRequestException('Нельзя удалить корзину');
    if (folder._count.children > 0) {
      throw new BadRequestException('Сначала удалите вложенные папки');
    }
    if (folder._count.files > 0) {
      throw new BadRequestException('Папка не пуста');
    }
    await this.prisma.mediaFolder.delete({ where: { id } });
  }

  async listFiles(folderId: number | null) {
    return this.prisma.mediaFile.findMany({
      where: { folderId },
      orderBy: { id: 'desc' },
      take: 500,
    });
  }

  /** Extension comes only from the verified MIME, never from the client file name (audit B4). */
  private extFromMime(mime: string, _original?: string): string {
    switch (mime) {
      case 'image/jpeg':
        return '.jpg';
      case 'image/png':
        return '.png';
      case 'image/webp':
        return '.webp';
      case 'image/gif':
        return '.gif';
      default:
        return '.bin';
    }
  }

  async saveUploadedFile(
    file: Express.Multer.File,
    folderIdParam: string | undefined,
    uploadedBy: string | undefined,
  ) {
    if (!file?.buffer?.length) throw new BadRequestException('Файл не получен');
    let mime = (file.mimetype || '').toLowerCase();
    if (!IMAGE_MIMES.has(mime)) throw new BadRequestException('Допустимы только изображения (JPEG, PNG, WebP, GIF)');
    const detected = await detectImageFormat(file.buffer);
    if (!detected) throw new BadRequestException('Файл не является изображением JPEG, PNG, WebP или GIF');
    mime = detected.mime;
    const trashId = await this.getTrashFolderId();
    let folderId: number | null = null;
    if (folderIdParam != null && folderIdParam !== '') {
      const n = Number.parseInt(folderIdParam, 10);
      if (!Number.isFinite(n)) throw new BadRequestException('Некорректный folder_id');
      if (n === trashId) throw new BadRequestException('Нельзя загружать файлы прямо в корзину');
      const folder = await this.prisma.mediaFolder.findUnique({ where: { id: n } });
      if (!folder) throw new BadRequestException('Папка не найдена');
      if (folder.isTrash) throw new BadRequestException('Нельзя загружать файлы в корзину');
      folderId = n;
    } else {
      const uploads = await this.prisma.mediaFolder.findFirst({
        where: { parentId: null, isTrash: false, name: 'Загрузки' },
      });
      folderId = uploads?.id ?? null;
    }

    const storedName = `${randomUUID()}${this.extFromMime(mime, file.originalname)}`;
    const absDir = join(this.mediaRoot, 'media');
    mkdirSync(absDir, { recursive: true });
    const absPath = join(absDir, storedName);
    // Оригиналы с фотоаппарата весят мегабайты и тормозят выдачу — ужимаем до веб-размера
    const optimized = await optimizeUploadedImage(file.buffer, mime);
    if (optimized.changed) {
      this.logger.log(
        `Изображение ужато: ${(file.size / 1024).toFixed(0)} КБ → ${(optimized.buffer.length / 1024).toFixed(0)} КБ` +
          (optimized.width ? ` (${optimized.width}×${optimized.height})` : ''),
      );
    }
    await fs.writeFile(absPath, optimized.buffer);

    const url = `${PUBLIC_PREFIX}${storedName}`;
    const row = await this.prisma.mediaFile.create({
      data: {
        kind: 'PHOTO',
        url,
        originalFilename: file.originalname,
        sizeBytes: BigInt(optimized.buffer.length),
        uploadedBy: uploadedBy ?? null,
        folderId,
      },
    });
    return row;
  }

  /** Сохранить сгенерированное изображение (DALL-E и т.п.) в медиатеку. */
  async saveImageBuffer(opts: {
    buffer: Buffer;
    mime: string;
    originalFilename: string;
    folderId?: number;
    uploadedBy?: string;
  }) {
    const mime = (opts.mime || '').toLowerCase();
    if (!IMAGE_MIMES.has(mime)) {
      throw new BadRequestException('Недопустимый MIME сгенерированного изображения');
    }
    const trashId = await this.getTrashFolderId();
    let folderId: number | null = null;
    if (opts.folderId != null) {
      if (opts.folderId === trashId) throw new BadRequestException('Нельзя сохранять в корзину');
      const folder = await this.prisma.mediaFolder.findUnique({ where: { id: opts.folderId } });
      if (!folder) throw new BadRequestException('Папка не найдена');
      if (folder.isTrash) throw new BadRequestException('Нельзя сохранять в корзину');
      folderId = opts.folderId;
    } else {
      const uploads = await this.prisma.mediaFolder.findFirst({
        where: { parentId: null, isTrash: false, name: 'Загрузки' },
      });
      folderId = uploads?.id ?? null;
    }

    const detected = await detectImageFormat(opts.buffer);
    if (!detected) throw new BadRequestException('Сгенерированный файл не является изображением');
    const storedName = `${randomUUID()}${detected.ext}`;
    const absDir = join(this.mediaRoot, 'media');
    mkdirSync(absDir, { recursive: true });
    const absPath = join(absDir, storedName);
    await fs.writeFile(absPath, opts.buffer);

    const url = `${PUBLIC_PREFIX}${storedName}`;
    return this.prisma.mediaFile.create({
      data: {
        kind: 'PHOTO',
        url,
        originalFilename: opts.originalFilename,
        sizeBytes: BigInt(opts.buffer.length),
        uploadedBy: opts.uploadedBy ?? null,
        folderId,
      },
    });
  }

  async moveFileToTrash(id: number) {
    const trashId = await this.getTrashFolderId();
    const file = await this.prisma.mediaFile.findUnique({ where: { id } });
    if (!file) throw new NotFoundException('Файл не найден');
    if (file.folderId === trashId) throw new BadRequestException('Файл уже в корзине');
    return this.prisma.mediaFile.update({
      where: { id },
      data: {
        previousFolderId: file.folderId,
        folderId: trashId,
      },
    });
  }

  async restoreFile(id: number) {
    const trashId = await this.getTrashFolderId();
    const file = await this.prisma.mediaFile.findUnique({ where: { id } });
    if (!file) throw new NotFoundException('Файл не найден');
    if (file.folderId !== trashId) throw new BadRequestException('Восстановление только из корзины');
    return this.prisma.mediaFile.update({
      where: { id },
      data: {
        folderId: file.previousFolderId,
        previousFolderId: null,
      },
    });
  }

  async moveFile(id: number, targetFolderId: number | null | undefined) {
    const trashId = await this.getTrashFolderId();
    const file = await this.prisma.mediaFile.findUnique({ where: { id } });
    if (!file) throw new NotFoundException('Файл не найден');
    if (file.folderId === trashId) {
      throw new BadRequestException('Восстановите файл из корзины или удалите навсегда');
    }
    if (targetFolderId === trashId) {
      return this.moveFileToTrash(id);
    }
    if (targetFolderId != null) {
      const folder = await this.prisma.mediaFolder.findUnique({ where: { id: targetFolderId } });
      if (!folder) throw new BadRequestException('Папка не найдена');
      if (folder.isTrash) throw new BadRequestException('Используйте «В корзину»');
    }
    return this.prisma.mediaFile.update({
      where: { id },
      data: { folderId: targetFolderId ?? null, previousFolderId: null },
    });
  }

  async permanentDelete(id: number) {
    const trashId = await this.getTrashFolderId();
    const file = await this.prisma.mediaFile.findUnique({ where: { id } });
    if (!file) throw new NotFoundException('Файл не найден');
    if (file.folderId !== trashId) {
      throw new BadRequestException('Безвозвратное удаление только из корзины');
    }
    const disk = this.diskPathFromPublicUrl(file.url);
    await this.prisma.mediaFile.delete({ where: { id } });
    if (existsSync(disk)) await fs.unlink(disk).catch(() => undefined);
  }

  async emptyTrash() {
    const trashId = await this.getTrashFolderId();
    const files = await this.prisma.mediaFile.findMany({ where: { folderId: trashId } });
    for (const f of files) {
      const disk = this.diskPathFromPublicUrl(f.url);
      await this.prisma.mediaFile.delete({ where: { id: f.id } });
      if (existsSync(disk)) await fs.unlink(disk).catch(() => undefined);
    }
    return { removed: files.length };
  }

  /** Storage path + permissions (Iter 88). */
  async getStorageHealth() {
    const rootExists = existsSync(this.mediaRoot);
    const writable = rootExists && isMediaRootWritable(this.mediaRoot);
    const dirCounts: Record<string, number> = {};
    for (const sub of MEDIA_STORAGE_SUBDIRS) {
      dirCounts[sub] = await countFilesUnder(join(this.mediaRoot, sub), 3, 20_000);
    }
    const diskBytes = await diskUsageBytes(this.mediaRoot);
    const mediaDir = join(this.mediaRoot, 'media');
    const onDiskMedia = await countFilesUnder(mediaDir, 2, 50_000);
    const dbMedia = await this.prisma.mediaFile.count();
    let orphanFiles = Math.max(0, onDiskMedia - dbMedia);
    if (dbMedia > onDiskMedia * 2) orphanFiles = 0;

    return {
      mediaRoot: this.mediaRoot,
      rootExists,
      writable,
      dirCounts,
      diskUsageMb: diskBytes != null ? Math.round((diskBytes / 1024 / 1024) * 10) / 10 : null,
      onDiskMediaFiles: onDiskMedia,
      dbMediaFiles: dbMedia,
      orphanFilesEstimate: orphanFiles,
      healthy: rootExists && writable,
    };
  }

  /** Bounded disk check — DB rows pointing at missing files (Iter 84). */
  async getIntegritySnapshot(sampleSize = 200) {
    const [totalFiles, storage] = await Promise.all([
      this.prisma.mediaFile.count(),
      this.getStorageHealth(),
    ]);
    const sample = await this.prisma.mediaFile.findMany({
      take: sampleSize,
      orderBy: { id: 'desc' },
      select: { url: true },
    });
    let missingOnDisk = 0;
    const sampleMissingUrls: string[] = [];
    for (const row of sample) {
      try {
        const disk = this.diskPathFromPublicUrl(row.url);
        if (!existsSync(disk)) {
          missingOnDisk += 1;
          if (sampleMissingUrls.length < 5) sampleMissingUrls.push(row.url);
        }
      } catch {
        missingOnDisk += 1;
        if (sampleMissingUrls.length < 5) sampleMissingUrls.push(row.url);
      }
    }
    return {
      totalFiles,
      sampled: sample.length,
      missingOnDisk,
      sampleMissingUrls,
      missingRatio: sample.length ? missingOnDisk / sample.length : 0,
      storage,
    };
  }
}

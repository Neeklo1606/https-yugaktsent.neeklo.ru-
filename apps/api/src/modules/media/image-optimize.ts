import sharp from 'sharp';

/** Больше этой стороны изображения на сайте не показываются ни разу. */
export const MAX_IMAGE_SIDE = 1920;
/** Мельче этого ужимать нечего — отдаём как есть. */
const MIN_BYTES_TO_TOUCH = 300 * 1024;
/** Если выигрыш меньше, оставляем оригинал: качество терять незачем. */
const MIN_GAIN_RATIO = 0.95;

export type OptimizedImage = {
  buffer: Buffer;
  /** true — картинку пережали, false — вернули исходную */
  changed: boolean;
  width?: number;
  height?: number;
};

/**
 * Приводит загруженное изображение к разумному для веба размеру.
 * Формат и расширение не меняются, чтобы не ломать уже сохранённые ссылки.
 * Любая ошибка обработки не должна ронять загрузку — возвращаем оригинал.
 */
export async function optimizeUploadedImage(buffer: Buffer, mime: string): Promise<OptimizedImage> {
  // GIF может быть анимированным — не трогаем
  if (mime === 'image/gif') return { buffer, changed: false };

  try {
    const image = sharp(buffer, { failOn: 'none' });
    const meta = await image.metadata();
    const side = Math.max(meta.width ?? 0, meta.height ?? 0);
    const needsResize = side > MAX_IMAGE_SIDE;

    if (!needsResize && buffer.length < MIN_BYTES_TO_TOUCH) {
      return { buffer, changed: false, width: meta.width, height: meta.height };
    }

    let pipeline = image.rotate(); // учитываем EXIF-ориентацию
    if (needsResize) {
      pipeline = pipeline.resize({ width: MAX_IMAGE_SIDE, height: MAX_IMAGE_SIDE, fit: 'inside', withoutEnlargement: true });
    }

    if (mime === 'image/png') {
      pipeline = pipeline.png({ compressionLevel: 9, palette: true });
    } else if (mime === 'image/webp') {
      pipeline = pipeline.webp({ quality: 82 });
    } else {
      pipeline = pipeline.jpeg({ quality: 82, progressive: true, mozjpeg: true });
    }

    const out = await pipeline.toBuffer({ resolveWithObject: true });
    if (out.data.length >= buffer.length * MIN_GAIN_RATIO && !needsResize) {
      return { buffer, changed: false, width: meta.width, height: meta.height };
    }
    return {
      buffer: out.data,
      changed: true,
      width: out.info.width,
      height: out.info.height,
    };
  } catch {
    return { buffer, changed: false };
  }
}

const FORMAT_TO_MIME: Record<string, { mime: string; ext: string }> = {
  jpeg: { mime: 'image/jpeg', ext: '.jpg' },
  png: { mime: 'image/png', ext: '.png' },
  webp: { mime: 'image/webp', ext: '.webp' },
  gif: { mime: 'image/gif', ext: '.gif' },
};

/**
 * Определяет реальный формат по содержимому (magic bytes через sharp), а не по заголовку клиента.
 * Возвращает null, если это не JPEG/PNG/WebP/GIF — такой файл сохранять нельзя (аудит B4:
 * HTML/SVG под видом картинки давал хранимый XSS на нашем домене).
 */
export async function detectImageFormat(buffer: Buffer): Promise<{ mime: string; ext: string } | null> {
  try {
    const meta = await sharp(buffer, { failOn: 'error' }).metadata();
    if (!meta.format || !meta.width || !meta.height) return null;
    return FORMAT_TO_MIME[meta.format] ?? null;
  } catch {
    return null;
  }
}

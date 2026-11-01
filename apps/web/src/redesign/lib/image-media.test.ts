import { afterEach, describe, expect, it, vi } from 'vitest';
import { proxiedImageUrl } from './image-media';

describe('proxiedImageUrl', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('без флага ресайзера ничего не меняет', () => {
    vi.stubEnv('VITE_IMAGE_PROXY', '');
    expect(proxiedImageUrl('/uploads/media/a.jpg', 480)).toBeNull();
  });

  it('свои файлы без отдельного флага не трогаем', () => {
    vi.stubEnv('VITE_IMAGE_PROXY', '1');
    vi.stubEnv('VITE_IMAGE_PROXY_LOCAL', '');
    expect(proxiedImageUrl('/uploads/media/a.jpg', 480)).toBeNull();
  });

  it('фото Profitbase и наши файлы идут через ресайзер', () => {
    vi.stubEnv('VITE_IMAGE_PROXY', '1');
    vi.stubEnv('VITE_IMAGE_PROXY_LOCAL', '1');
    vi.stubEnv('VITE_PUBLIC_SITE_URL', 'https://yugaktsent.neeklo.ru');
    expect(proxiedImageUrl('https://pb2093.profitbase.ru/uploads/house/2093/a.jpg', 800)).toBe('/img/800/pb2093/uploads/house/2093/a.jpg');
    expect(proxiedImageUrl('/uploads/media/2026/a.png', 480)).toBe('/img/480/local/uploads/media/2026/a.png');
    expect(proxiedImageUrl('https://yugaktsent.neeklo.ru/uploads/media/a.jpg', 1280)).toBe('/img/1280/local/uploads/media/a.jpg');
  });

  it('чужие сайты и не картинки не трогаем', () => {
    vi.stubEnv('VITE_IMAGE_PROXY', '1');
    vi.stubEnv('VITE_IMAGE_PROXY_LOCAL', '1');
    vi.stubEnv('VITE_PUBLIC_SITE_URL', 'https://yugaktsent.neeklo.ru');
    expect(proxiedImageUrl('https://example.com/uploads/a.jpg', 480)).toBeNull();
    expect(proxiedImageUrl('/uploads/docs/a.pdf', 480)).toBeNull();
  });
});

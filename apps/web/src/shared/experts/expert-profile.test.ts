import { describe, expect, it } from 'vitest';
import {
  EXPERT_SEED,
  VLADISLAV_SLUG,
  expertCanonicalUrl,
  expertInitials,
  phoneHref,
  publicExpertView,
  type ExpertProfile,
} from './expert-profile';

const vlad = EXPERT_SEED.find((e) => e.slug === VLADISLAV_SLUG) as ExpertProfile;

describe('expert-profile', () => {
  it('канонический адрес абсолютный и не localhost', () => {
    const url = expertCanonicalUrl(VLADISLAV_SLUG);
    expect(url).toMatch(/^https:\/\//);
    expect(url).not.toContain('localhost');
    expect(url.endsWith('/experts/vladislav-goncharov')).toBe(true);
  });

  it('Telegram из данных заказчика — канал, а не личные сообщения', () => {
    const tg = vlad.links.find((l) => l.url.includes('t.me/ug_akcent'));
    expect(tg?.type).toBe('telegram_channel');
    expect(tg?.title).toMatch(/канал/i);
  });

  it('в публичной версии нет пустых гайдов, видео и скрытых ссылок', () => {
    const withJunk: ExpertProfile = {
      ...vlad,
      links: [...vlad.links, { id: 'x', type: 'dzen', title: 'Дзен', url: '', visible: true }],
      guides: [{ id: 'g', title: 'Гайд без файла', published: true }],
      videos: [{ id: 'v', title: 'Скрытое', url: 'https://youtu.be/x', priority: 1, visible: false }],
    };
    const view = publicExpertView(withJunk);
    expect(view.links.map((l) => l.id)).not.toContain('x');
    expect(view.guides).toHaveLength(0);
    expect(view.videos).toHaveLength(0);
  });

  it('телефоны превращаются в рабочие tel:-ссылки', () => {
    expect(phoneHref('8-800-234-57-15')).toBe('tel:88002345715');
    expect(phoneHref('+7 (918) 477-99-85')).toBe('tel:+79184779985');
  });

  it('инициалы для плашки без фото', () => {
    expect(expertInitials('Владислав Гончаров')).toBe('ВГ');
  });
});

describe('expert-seo.json для пререндера', () => {
  it('совпадает с данными экспертов: превью ссылки в мессенджере не разойдётся со страницей', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const rows = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'expert-seo.json'), 'utf8')) as {
      slug: string;
      title: string;
      description: string;
    }[];
    const published = EXPERT_SEED.filter((e) => e.published);
    expect(rows.map((r) => r.slug)).toEqual(published.map((e) => e.slug));
    for (const e of published) {
      const r = rows.find((x) => x.slug === e.slug);
      expect(r?.title).toBe(e.seo.title);
      expect(r?.description).toBe(e.seo.description);
    }
  });
});

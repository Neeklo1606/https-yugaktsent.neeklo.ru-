import { describe, expect, it } from 'vitest';
import { CLIENT_SOURCES, validateFeedUrl } from './data-sources';

describe('data-sources', () => {
  it('в исходных данных нет полных URL фидов — только маска', () => {
    for (const s of CLIENT_SOURCES) {
      expect(s.urlMasked).toMatch(/•••$/);
      expect(JSON.stringify(s)).not.toMatch(/https?:\/\//);
    }
  });

  it('пять записей, но четыре уникальных URL: две ссылаются на один Cian', () => {
    expect(CLIENT_SOURCES).toHaveLength(5);
    const groups = new Set(CLIENT_SOURCES.map((s) => s.urlGroup ?? s.id));
    expect(groups.size).toBe(4);
  });

  it('ни одна запись не изображает работающую синхронизацию', () => {
    for (const s of CLIENT_SOURCES) {
      expect(s.status).toBe('pending_backend');
      expect(s.lastSyncAt ?? null).toBeNull();
    }
  });

  it('валидация адреса: только https и не внутренняя сеть; наружу уходит маска без токена', () => {
    const ok = validateFeedUrl('https://pb2093.profitbase.ru/export/feed.xml?token=secret');
    expect(ok).toEqual({ ok: true, masked: 'pb2093.profitbase.ru/•••' });
    expect(validateFeedUrl('http://example.com/feed.xml').ok).toBe(false);
    expect(validateFeedUrl('https://127.0.0.1/feed').ok).toBe(false);
    expect(validateFeedUrl('https://192.168.1.10/feed').ok).toBe(false);
    expect(validateFeedUrl('просто текст').ok).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { FeedLinksService } from './feed-links.service';

describe('FeedLinksService.countLots', () => {
  it('counts Profitbase/JCAT offers', () => {
    expect(FeedLinksService.countLots('<realty-feed><offer internal-id="1"></offer><offer internal-id="2"/></realty-feed>')).toEqual({
      format: 'profitbase/jcat',
      count: 2,
    });
  });
  it('counts CIAN objects', () => {
    expect(FeedLinksService.countLots('<feed><feed_version>2</feed_version><object><ExternalId>1</ExternalId></object></feed>').count).toBe(1);
  });
  it('counts DomClick flats', () => {
    expect(FeedLinksService.countLots('<complexes><complex><flat><flat_id>1</flat_id></flat></complex></complexes>')).toEqual({ format: 'domclick', count: 1 });
  });
  it('reports unknown for empty files', () => {
    expect(FeedLinksService.countLots('<html></html>').count).toBe(0);
  });
});

describe('FeedLinksService.isPrivateHost', () => {
  it.each(['localhost', '127.0.0.1', '10.1.2.3', '192.168.0.5', '172.20.0.1', '169.254.169.254', '::1', 'api.internal'])('blocks %s', (h) => {
    expect(FeedLinksService.isPrivateHost(h)).toBe(true);
  });
  it.each(['pb19399.profitbase.ru', 'bx.sskuban.ru', '31.192.111.33'])('allows %s', (h) => {
    expect(FeedLinksService.isPrivateHost(h)).toBe(false);
  });
});

describe('FeedLinksService.overviewAdmin', () => {
  it('matches the block by exact name in the feed region and sums listings by status', async () => {
    const prisma = {
      feedLink: {
        findMany: async () => [
          { id: 1, regionId: 5, name: 'Фид Сердце', blockName: 'Сердце' },
          { id: 2, regionId: 5, name: 'Новый', blockName: null },
        ],
      },
      block: {
        findMany: async () => [
          { id: 10, slug: 'serdce', name: 'Сердце', regionId: 5, status: 'BUILDING', builder: { name: 'ССК' }, _count: { images: 7 } },
          { id: 11, slug: 'other', name: 'Сердце', regionId: 6, status: 'BUILDING', builder: null, _count: { images: 0 } },
        ],
      },
      listing: {
        groupBy: async () => [
          { blockId: 10, status: 'ACTIVE', _count: { _all: 163 } },
          { blockId: 10, status: 'SOLD', _count: { _all: 4 } },
        ],
      },
    };
    const svc = new FeedLinksService(prisma as never);
    const rows = await svc.overviewAdmin();
    expect(rows[0]).toEqual({
      feedLinkId: 1,
      block: { id: 10, slug: 'serdce', name: 'Сердце', status: 'BUILDING', builder: 'ССК', photos: 7 },
      listings: { active: 163, reserved: 0, sold: 4, total: 167 },
    });
    expect(rows[1].block).toBeNull();
  });
});

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

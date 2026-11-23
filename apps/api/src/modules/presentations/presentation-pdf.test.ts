import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
  formatPdfFooterContact,
  formatPdfHeaderAgentLine,
  listingPdfParamRows,
  resolveGeoPoint,
  yandexStaticMapImageUrl,
} from './presentation-pdf';
import type { ListingPresentationPayload } from './presentation.types';

const baseListing = (): ListingPresentationPayload => ({
  listingId: 1,
  kind: 'APARTMENT',
  kindLabel: 'Квартира',
  title: '2-комн. · 54 м²',
  description: null,
  price: 5_500_000,
  address: 'ул. Тестовая, 1',
  region: 'Белгород',
  district: null,
  builder: null,
  blockName: 'ЖК Тест',
  blockSlug: 'test',
  subtitle: '2-комн. · 54 м²',
  photoUrls: [],
  planUrls: [],
  latitude: null,
  longitude: null,
  generatedAt: new Date().toISOString(),
});

describe('presentation-pdf', () => {
  it('formats footer contact line', () => {
    assert.equal(
      formatPdfFooterContact({ name: 'Иван', phone: '+7 901 990-99-93', email: 'a@test.ru' }),
      'Иван · +7 901 990-99-93 · a@test.ru',
    );
  });

  it('formats header agent line', () => {
    assert.equal(formatPdfHeaderAgentLine({ name: 'Иван', phone: '+7 901', email: null }), 'Иван\n+7 901');
  });

  it('builds param rows with price', () => {
    const rows = listingPdfParamRows(baseListing());
    assert.ok(rows.some((r) => r.label === 'Цена' && r.value.includes('5')));
  });

  it('resolves geo from listing or block', () => {
    assert.deepEqual(resolveGeoPoint({ lat: 50.6, lng: 36.5 }), { lat: 50.6, lng: 36.5 });
    assert.deepEqual(resolveGeoPoint({ blockLat: 50.1, blockLng: 36.2 }), { lat: 50.1, lng: 36.2 });
    assert.equal(resolveGeoPoint({}), null);
  });

  it('builds yandex static map url', () => {
    const url = yandexStaticMapImageUrl(50.59, 36.58);
    assert.ok(url.includes('static-maps.yandex.ru'));
    assert.ok(url.includes('36.58'));
  });
});

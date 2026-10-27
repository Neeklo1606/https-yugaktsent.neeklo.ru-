import { describe, expect, it } from 'vitest';
import { auditBlocks, imageHost } from './data-quality';
import type { ApiBlockListRow } from '@/redesign/lib/blocks-from-api';

const full: ApiBlockListRow = {
  id: 1,
  slug: 'eden',
  name: 'Eden',
  status: 'BUILDING',
  description: 'Описание',
  latitude: 44.89,
  longitude: 37.31,
  addresses: [{ address: 'Анапа, ул. Мира, 1' }],
  images: [{ url: 'https://pb2093.profitbase.ru/a.jpg' }],
  builder: { name: 'Застройщик' },
  listingPriceMin: 7_537_500,
  buildings: [{ id: 1, name: '1', deadline: '2027-03-31' }],
};

describe('data-quality', () => {
  it('полный ЖК — без замечаний', () => {
    expect(auditBlocks([full])).toEqual([]);
  });

  it('ЖК без фото и адреса (как «Граф Толстой») — критично и с понятной причиной', () => {
    const issues = auditBlocks([{ ...full, id: 2, name: 'Граф Толстой', images: [], addresses: [], latitude: null, longitude: null }]);
    expect(issues[0]).toMatchObject({ kind: 'no_photos', severity: 'critical' });
    expect(issues.map((i) => i.kind)).toEqual(expect.arrayContaining(['no_address', 'no_coords']));
  });

  it('фото есть в базе, но не открывается у источника', () => {
    const issues = auditBlocks([full], new Set([1]));
    expect(issues).toEqual([expect.objectContaining({ kind: 'photo_unreachable', severity: 'critical' })]);
  });

  it('хост источника фото', () => {
    expect(imageHost('https://pb16100.tochno.profitbase.ru/x.jpg')).toBe('pb16100.tochno.profitbase.ru');
    expect(imageHost('not a url')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { ListingStatus } from '@prisma/client';
import { dedupeChessboardRows, buildBlockChessboardResponse } from './blocks-chessboard.util';
import { sanitizeBlockContent } from './block-content.util';

const row = (id: number, status: ListingStatus, floor: number, number: string | null, price = 5_000_000) => ({
  id,
  buildingId: null,
  price,
  status,
  apartment: {
    floor,
    number,
    areaTotal: 40,
    areaKitchen: 10,
    planUrl: null,
    buildingName: 'Литер 1',
    roomType: { name: '1-комнатная', nameOne: '1-к' },
    finishing: null,
  },
});

describe('dedupeChessboardRows', () => {
  it('проданный лот с тем же номером, что и в продаже, не дублирует ячейку', () => {
    const out = dedupeChessboardRows([
      row(1, ListingStatus.ACTIVE, 3, '12'),
      row(2, ListingStatus.SOLD, 3, '12'),
      row(3, ListingStatus.SOLD, 3, '13'),
    ]);
    expect(out.map((r) => r.id).sort()).toEqual([1, 3]);
  });

  it('снятый без номера пропускаем, проданный без номера оставляем', () => {
    const out = dedupeChessboardRows([
      row(1, ListingStatus.INACTIVE, 3, null),
      row(2, ListingStatus.SOLD, 4, null),
    ]);
    expect(out.map((r) => r.id)).toEqual([2]);
  });
});

describe('buildBlockChessboardResponse', () => {
  it('проданные идут в шахматку без цены и считаются в «продано»', () => {
    const res = buildBlockChessboardResponse(
      { id: 1, slug: 'x', name: 'X', buildings: [{ id: 10, name: 'Литер 1' }] },
      [row(1, ListingStatus.ACTIVE, 2, '5'), row(2, ListingStatus.SOLD, 3, '9')],
    );
    const b = res.buildings[0];
    expect(b.statusCounts).toEqual({ available: 1, reserved: 0, sold: 1 });
    const sold = b.grid.flat().find((c) => c.apartment?.id === '2')?.apartment;
    expect(sold?.status).toBe('sold');
    expect(sold?.price).toBe(0);
  });
});

describe('sanitizeBlockContent', () => {
  it('берёт только известные поля и безопасные ссылки', () => {
    const c = sanitizeBlockContent({
      videos: ['https://vk.com/video-1_2', 'javascript:alert(1)', 'https://vk.com/video-1_2'],
      masterplanUrl: '/uploads/a.jpg',
      faq: [{ q: 'Вопрос', a: 'Ответ' }, { q: '', a: 'x' }],
      evil: 'x',
    });
    expect(c).toEqual({
      videos: ['https://vk.com/video-1_2'],
      masterplanUrl: '/uploads/a.jpg',
      faq: [{ q: 'Вопрос', a: 'Ответ' }],
    });
  });
});

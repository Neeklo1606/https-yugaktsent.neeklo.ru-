import { describe, expect, it } from 'vitest';
import { buildComplexFaq, parseComplexContent, videoEmbed } from './complex-content';
import { buildChessRows, countChessCells, groupChessBuildings, shortChessPrice, splitBuildingName } from './chessboard-layout';

describe('videoEmbed', () => {
  it('VK', () => {
    expect(videoEmbed('https://vk.com/video-123_456')?.embedUrl).toBe('https://vkvideo.ru/video_ext.php?oid=-123&id=456&hd=2');
    expect(videoEmbed('https://vkvideo.ru/video-1_2')?.provider).toBe('vk');
  });
  it('YouTube', () => {
    expect(videoEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ')?.embedUrl).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(videoEmbed('https://youtu.be/dQw4w9WgXcQ')?.provider).toBe('youtube');
    expect(videoEmbed('https://youtube.com/shorts/dQw4w9WgXcQ')?.provider).toBe('youtube');
  });
  it('неизвестное — null', () => {
    expect(videoEmbed('https://example.com/v')).toBeNull();
    expect(videoEmbed('не ссылка')).toBeNull();
  });
});

describe('parseComplexContent', () => {
  it('терпит мусор', () => {
    expect(parseComplexContent(null).videos).toEqual([]);
    expect(parseComplexContent({ faq: [{ q: 'a', a: '' }, { q: 'b', a: 'c' }] }).faq).toEqual([{ q: 'b', a: 'c' }]);
  });
});

describe('buildComplexFaq', () => {
  it('вопрос появляется только при наличии данных', () => {
    const faq = buildComplexFaq({
      name: 'Тест', city: 'Анапа', builder: null, deadline: '4 кв. 2027', address: null,
      priceFromText: 'от 8,1 млн ₽', availableCount: 3, buildingsCount: 1, finishings: [], roomsText: null, housingType: 'flat',
    });
    const qs = faq.map((x) => x.q);
    expect(qs.some((q) => q.includes('застройщик'))).toBe(false);
    expect(qs.some((q) => q.includes('сдача'))).toBe(true);
    expect(qs.some((q) => q.includes('эскроу'))).toBe(true);
  });
});

describe('chessboard-layout', () => {
  it('литер и секция', () => {
    expect(splitBuildingName('Литер 1.1, секция 3')).toEqual({ group: 'Литер 1.1', section: 'Секция 3' });
    expect(splitBuildingName('Корпус 2')).toEqual({ group: 'Корпус 2', section: null });
    const g = groupChessBuildings([
      { id: 'a', name: 'Литер 1.1, секция 10', apartmentCount: 1 },
      { id: 'b', name: 'Литер 1.1, секция 2', apartmentCount: 1 },
      { id: 'c', name: 'Литер 9.1, секция 1', apartmentCount: 1 },
    ]);
    expect(g.map((x) => x.group)).toEqual(['Литер 1.1', 'Литер 9.1']);
    expect(g[0].items.map((x) => x.id)).toEqual(['b', 'a']);
  });
  it('пропущенные этажи заполняются пустыми окнами', () => {
    const apt = (id: string, floor: number) => ({
      id, number: '', floor, rooms: 1, roomLabel: '', area: 40, layoutFingerprint: '', price: 5e6, pricePerMeter: 0,
      finishing: '', status: 'available' as const, section: 1, planImage: null,
    });
    const rows = buildChessRows({
      floors: [5, 2], shaftCount: 2,
      grid: [[{ floor: 5, shaftIndex: 1, apartment: apt('1', 5) }, { floor: 5, shaftIndex: 2, apartment: null }],
             [{ floor: 2, shaftIndex: 1, apartment: apt('2', 2) }, { floor: 2, shaftIndex: 2, apartment: null }]],
    } as never);
    expect(rows.map((r) => r.floor)).toEqual([5, 4, 3, 2]);
    expect(countChessCells(rows)).toMatchObject({ available: 2, reserved: 0, soldOrClosed: 6, total: 8 });
  });
  it('короткая цена', () => {
    expect(shortChessPrice(9_540_000)).toBe('9,54 млн');
    expect(shortChessPrice(0)).toBe('');
  });
});

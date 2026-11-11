import { describe, expect, it } from 'vitest';
import { hasSmartFilters, parseSmartQuery, smartQueryLabel } from './smart-query';

describe('parseSmartQuery', () => {
  it('rooms and max price', () => {
    expect(parseSmartQuery('2к до 8 млн')).toEqual({ rooms: [2], priceMax: 8_000_000, rest: '' });
  });
  it('studio with area', () => {
    expect(parseSmartQuery('студия от 25 м2')).toEqual({ rooms: [0], areaMin: 25, rest: '' });
  });
  it('word rooms and fractional millions', () => {
    expect(parseSmartQuery('двушка до 7,5 млн')).toMatchObject({ rooms: [2], priceMax: 7_500_000 });
    expect(parseSmartQuery('трёхкомнатная квартира')).toMatchObject({ rooms: [3], rest: '' });
  });
  it('bare small number means millions', () => {
    expect(parseSmartQuery('однушка до 6')).toMatchObject({ rooms: [1], priceMax: 6_000_000 });
  });
  it('keeps complex name as text', () => {
    expect(parseSmartQuery('Долина 1к')).toEqual({ rooms: [1], rest: 'долина' });
    expect(parseSmartQuery('ЖК 18/3')).toMatchObject({ rest: 'жк 18/3' });
    expect(hasSmartFilters(parseSmartQuery('Sun Garden'))).toBe(false);
  });
  it('price range and multiple rooms', () => {
    expect(parseSmartQuery('1к 2к от 5 млн до 9 млн')).toMatchObject({ rooms: [1, 2], priceMin: 5_000_000, priceMax: 9_000_000 });
  });
  it('area range', () => {
    expect(parseSmartQuery('40-60 м²')).toMatchObject({ areaMin: 40, areaMax: 60 });
  });
  it('label', () => {
    expect(smartQueryLabel(parseSmartQuery('2к до 8 млн'))).toBe('2-комнатные · до 8 млн ₽');
  });
  it('евродвушка и евротрёшка — те же 2 и 3 комнаты, что в фильтре каталога', () => {
    expect(parseSmartQuery('евродвушка до 8 млн')).toMatchObject({ rooms: [2], priceMax: 8_000_000, rest: '' });
    expect(parseSmartQuery('евро-трёшка')).toMatchObject({ rooms: [3], rest: '' });
    expect(parseSmartQuery('2к до 15 млн')).toMatchObject({ rooms: [2], priceMax: 15_000_000, rest: '' });
  });
});

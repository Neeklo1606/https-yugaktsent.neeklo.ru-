import { afterEach, describe, expect, it } from 'vitest';
import { applyThemeOverrides, hexToHslTriplet, parseThemeOverrides } from './theme-engine';

describe('theme-engine', () => {
  afterEach(() => applyThemeOverrides({}));

  it('переводит HEX в тройку HSL для CSS-переменных', () => {
    expect(hexToHslTriplet('#165447')).toBe('167 58% 21%');
    expect(hexToHslTriplet('FFFFFF')).toBe('0 0% 100%');
    expect(hexToHslTriplet('nope')).toBeNull();
  });

  it('отбрасывает незнакомые ключи и мусорные цвета', () => {
    expect(parseThemeOverrides('{"primary":"#103E36","evil":"#000000","border":"red"}')).toEqual({ primary: '#103E36' });
    expect(parseThemeOverrides('not json')).toEqual({});
  });

  it('ставит и снимает переопределения на <html>', () => {
    const root = document.documentElement;
    applyThemeOverrides({ primary: '#14505E' });
    expect(root.style.getPropertyValue('--primary')).toBe('191 65% 22%');
    expect(root.style.getPropertyValue('--accent-foreground')).toBe('191 65% 22%');
    applyThemeOverrides({});
    expect(root.style.getPropertyValue('--primary')).toBe('');
  });

  it('радиусы — только пиксели в допустимых пределах', () => {
    expect(parseThemeOverrides('{"radius":"14px","radius-card":"99px","primary":"#165447"}')).toEqual({ radius: '14px', primary: '#165447' });
    const root = document.documentElement;
    applyThemeOverrides({ 'radius-card': '24px' });
    expect(root.style.getPropertyValue('--radius-card')).toBe('24px');
  });

  it('предпросмотр в контейнере не трогает <html>', () => {
    const box = document.createElement('div');
    applyThemeOverrides({ primary: '#26302F' }, box);
    expect(box.style.getPropertyValue('--primary')).not.toBe('');
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe('');
  });
});

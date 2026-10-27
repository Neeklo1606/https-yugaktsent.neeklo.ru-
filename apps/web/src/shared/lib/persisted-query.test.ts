import { afterEach, describe, expect, it, vi } from 'vitest';
import { persistedQueryOptions, readPersisted, writePersisted } from './persisted-query';

describe('persisted-query', () => {
  afterEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it('пишет и читает публичный справочник', () => {
    writePersisted('regions', [{ id: 9, code: 'anapa' }]);
    expect(readPersisted('regions')).toEqual([{ id: 9, code: 'anapa' }]);
  });

  it('данные из кэша считаются устаревшими — запрос в сеть всё равно уйдёт', () => {
    writePersisted('regions', [1]);
    const opts = persistedQueryOptions<number[]>('regions');
    expect(opts.initialData()).toEqual([1]);
    expect(opts.initialDataUpdatedAt).toBe(0);
  });

  it('старше недели и битые записи игнорируются', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T00:00:00Z'));
    writePersisted('x', 1);
    vi.setSystemTime(new Date('2026-10-20T00:00:00Z'));
    expect(readPersisted('x')).toBeUndefined();
    localStorage.setItem('yug_qcache:y', '{not json');
    expect(readPersisted('y')).toBeUndefined();
  });
});

import { useState, useCallback, useEffect } from 'react';
import { toast } from '@/components/ui/sonner';

/**
 * Сравнение выключено на публичной части по ТЗ (план сдачи, D9): кнопки и /compare скрыты.
 * Код и данные в localStorage сохранены — включить обратно можно этим флагом.
 */
export const COMPARE_ENABLED = false;

const STORAGE_KEY = 'lg_compare';
const MAX_ITEMS = 3;

/** В localStorage: slug ЖК ИЛИ ключ объявления `l:<listingId>`. */

function readStorage(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function useCompare() {
  const [ids, setIds] = useState<string[]>(readStorage);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  }, [ids]);

  const toggle = useCallback((id: string) => {
    setIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= MAX_ITEMS) {
        toast.message('В сравнении не более 3 объектов', {
          description: 'Уберите один объект, чтобы добавить новый',
        });
        return prev;
      }
      toast.success('Добавлено в сравнение');
      return [...prev, id];
    });
  }, []);

  const isCompared = useCallback((id: string) => ids.includes(id), [ids]);
  const clear = useCallback(() => setIds([]), []);
  const remove = useCallback((id: string) => setIds(prev => prev.filter(x => x !== id)), []);

  return { ids, toggle, isCompared, clear, remove, count: ids.length };
}

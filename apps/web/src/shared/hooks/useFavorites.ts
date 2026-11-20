import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from '@/components/ui/sonner';
import { conversionObsFavoriteToggle } from '@/redesign/lib/conversion-observability';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { optionalAuthQueryOptions } from '@/shared/lib/safe-query';
import { useAuth } from './useAuth';
import { apiDelete, apiGet, apiPost, ApiError } from '@/lib/api';

const GUEST_KEY = 'lg_favorites_guest_v2';
const MAX_ITEMS = 100;

export type FavoriteRow = {
  id: number;
  blockId: number | null;
  listingId: number | null;
  createdAt: string;
  notes?: string | null;
  priceChangePct?: number | null;
  hasPriceDrop?: boolean;
  block: { id: number; name: string; slug: string } | null;
  listing: {
    id: number;
    kind: string;
    price: unknown;
    status?: string;
    visibility?: string;
    isPublished?: boolean;
    updatedAt?: string;
    block?: { slug: string | null };
  } | null;
};

function readGuest(): { blockIds: number[]; listingIds: number[] } {
  try {
    const j = JSON.parse(localStorage.getItem(GUEST_KEY) || '{}') as {
      blockIds?: unknown;
      listingIds?: unknown;
    };
    return {
      blockIds: Array.isArray(j.blockIds) ? j.blockIds.filter((x): x is number => typeof x === 'number') : [],
      listingIds: Array.isArray(j.listingIds)
        ? j.listingIds.filter((x): x is number => typeof x === 'number')
        : [],
    };
  } catch {
    return { blockIds: [], listingIds: [] };
  }
}

const GUEST_EVENT = 'lg-favorites-guest-changed';

function writeGuest(v: { blockIds: number[]; listingIds: number[] }) {
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify(v));
  } catch {
    /* приватный режим — избранное живёт до перезагрузки */
  }
  // Каждая карточка держит свою копию useFavorites — сообщаем остальным (шапка, нижнее меню, «Избранное»).
  // В отложенной задаче: writeGuest вызывается из апдейтера setState, где нельзя обновлять другие компоненты.
  if (typeof window !== 'undefined') setTimeout(() => window.dispatchEvent(new Event(GUEST_EVENT)), 0);
}

function isApiErrorStatus(e: unknown, status: number): boolean {
  return e instanceof ApiError && e.status === status;
}

/** Числовой id блока из каталога API; для моков (`c1`) — null. */
export function parseApiBlockId(complexId: string): number | null {
  if (!/^\d+$/.test(complexId)) return null;
  const n = Number.parseInt(complexId, 10);
  return Number.isFinite(n) ? n : null;
}

export function useFavorites() {
  const { isAuthenticated, user } = useAuth();
  const queryClient = useQueryClient();
  const [guest, setGuest] = useState(readGuest);

  const listQuery = useQuery({
    queryKey: ['favorites', user?.id],
    queryFn: () => apiGet<FavoriteRow[]>('/favorites'),
    ...optionalAuthQueryOptions({ isAuthenticated }),
  });

  useEffect(() => {
    if (!isAuthenticated) {
      setGuest(readGuest());
    }
  }, [isAuthenticated]);

  useEffect(() => {
    const sync = () => setGuest(readGuest());
    const onStorage = (e: StorageEvent) => {
      if (e.key === GUEST_KEY) sync();
    };
    window.addEventListener(GUEST_EVENT, sync);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(GUEST_EVENT, sync);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    const g = readGuest();
    if (g.blockIds.length === 0 && g.listingIds.length === 0) return;
    let cancelled = false;
    void (async () => {
      for (const bid of g.blockIds) {
        if (cancelled) return;
        try {
          await apiPost(`/favorites/block/${bid}`);
        } catch (e) {
          if (!isApiErrorStatus(e, 409)) {
            /* ignore merge errors for individual ids */
          }
        }
      }
      for (const lid of g.listingIds) {
        if (cancelled) return;
        try {
          await apiPost(`/favorites/listing/${lid}`);
        } catch (e) {
          if (!isApiErrorStatus(e, 409)) {
            /* ignore */
          }
        }
      }
      if (cancelled) return;
      writeGuest({ blockIds: [], listingIds: [] });
      setGuest({ blockIds: [], listingIds: [] });
      await queryClient.invalidateQueries({ queryKey: ['favorites', user.id] });
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user?.id, queryClient]);

  const count = useMemo(() => {
    if (isAuthenticated) return listQuery.data?.length ?? 0;
    return guest.blockIds.length + guest.listingIds.length;
  }, [isAuthenticated, listQuery.data, guest.blockIds.length, guest.listingIds.length]);

  const isBlockFavorite = useCallback(
    (blockId: number) => {
      if (isAuthenticated) {
        return listQuery.data?.some((r) => r.blockId === blockId) ?? false;
      }
      return guest.blockIds.includes(blockId);
    },
    [isAuthenticated, listQuery.data, guest.blockIds],
  );

  const isListingFavorite = useCallback(
    (listingId: number) => {
      if (isAuthenticated) {
        return listQuery.data?.some((r) => r.listingId === listingId) ?? false;
      }
      return guest.listingIds.includes(listingId);
    },
    [isAuthenticated, listQuery.data, guest.listingIds],
  );

  const toggleBlock = useCallback(
    async (blockId: number) => {
      conversionObsFavoriteToggle();
      if (!isAuthenticated) {
        setGuest((prev) => {
          const has = prev.blockIds.includes(blockId);
          let next: { blockIds: number[]; listingIds: number[] };
          if (has) {
            next = { ...prev, blockIds: prev.blockIds.filter((id) => id !== blockId) };
          } else {
            const total = prev.blockIds.length + prev.listingIds.length;
            if (total >= MAX_ITEMS) return prev;
            next = { ...prev, blockIds: [...prev.blockIds, blockId] };
          }
          writeGuest(next);
          return next;
        });
        return;
      }
      const row = listQuery.data?.find((r) => r.blockId === blockId);
      if (row) {
        await apiDelete(`/favorites/${row.id}`);
        await queryClient.invalidateQueries({ queryKey: ['favorites', user?.id] });
        return;
      }
      try {
        await apiPost(`/favorites/block/${blockId}`);
      } catch (e) {
        if (!isApiErrorStatus(e, 409)) throw e;
      }
      await queryClient.invalidateQueries({ queryKey: ['favorites', user?.id] });
    },
    [isAuthenticated, listQuery.data, queryClient, user?.id],
  );

  const toggleListing = useCallback(
    async (listingId: number) => {
      conversionObsFavoriteToggle();
      if (!isAuthenticated) {
        setGuest((prev) => {
          const has = prev.listingIds.includes(listingId);
          let next: { blockIds: number[]; listingIds: number[] };
          if (has) {
            next = { ...prev, listingIds: prev.listingIds.filter((id) => id !== listingId) };
          } else {
            const total = prev.blockIds.length + prev.listingIds.length;
            if (total >= MAX_ITEMS) return prev;
            next = { ...prev, listingIds: [...prev.listingIds, listingId] };
          }
          writeGuest(next);
          return next;
        });
        return;
      }
      const row = listQuery.data?.find((r) => r.listingId === listingId);
      if (row) {
        await apiDelete(`/favorites/${row.id}`);
        await queryClient.invalidateQueries({ queryKey: ['favorites', user?.id] });
        return;
      }
      try {
        await apiPost(`/favorites/listing/${listingId}`);
      } catch (e) {
        if (!isApiErrorStatus(e, 409)) throw e;
      }
      await queryClient.invalidateQueries({ queryKey: ['favorites', user?.id] });
    },
    [isAuthenticated, listQuery.data, queryClient, user?.id],
  );

  const removeByFavoriteId = useCallback(
    async (favoriteId: number) => {
      await apiDelete(`/favorites/${favoriteId}`);
      await queryClient.invalidateQueries({ queryKey: ['favorites', user?.id] });
    },
    [queryClient, user?.id],
  );

  /** Совместимость: старый формат string[] в localStorage не используется. */
  const clear = useCallback(() => {
    writeGuest({ blockIds: [], listingIds: [] });
    setGuest({ blockIds: [], listingIds: [] });
    void queryClient.invalidateQueries({ queryKey: ['favorites', user?.id] });
  }, [queryClient, user?.id]);

  return {
    favorites: listQuery.data,
    /** Избранное гостя (localStorage) — без входа в аккаунт сервер о нём не знает */
    guestBlockIds: guest.blockIds,
    guestListingIds: guest.listingIds,
    isLoading: isAuthenticated && listQuery.isLoading,
    count,
    isBlockFavorite,
    isListingFavorite,
    toggleBlock,
    toggleListing,
    removeByFavoriteId,
    clear,
  };
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import RedesignHeader from '@/redesign/components/RedesignHeader';
import FooterSection from '@/components/FooterSection';
import { Heart, Printer, FolderPlus, GitCompare, Clock, MapPin } from 'lucide-react';
import { formatDisplayPrice as formatPrice } from '@/redesign/lib/display-price';
import { Button } from '@/components/ui/button';
import { useFavorites, type FavoriteRow } from '@/shared/hooks/useFavorites';
import { useAuth } from '@/shared/hooks/useAuth';
import { optionalAuthQueryOptions } from '@/shared/lib/safe-query';
import { apiGet, apiGetOrNull, apiPost } from '@/lib/api';
import { toast } from '@/components/ui/sonner';
import ListingCard, { type ApiListingCardRow } from '@/redesign/components/ListingCard';
import ComplexCard from '@/redesign/components/ComplexCard';
import SelectionInquiryBar from '@/redesign/components/SelectionInquiryBar';
import { COMPARE_ENABLED, useCompare } from '@/shared/hooks/useCompare';
import { mapApiBlockDetailToResidentialComplex, type ApiBlockDetail } from '@/redesign/lib/blocks-from-api';
import { cn } from '@/lib/utils';

const STALE_DAYS = 14;

function favoriteCompareKey(row: FavoriteRow): string | null {
  if (row.listingId != null) return `l:${row.listingId}`;
  if (row.block?.slug) return row.block.slug;
  return null;
}

function FavoriteStatusBadge({ row }: { row: FavoriteRow }) {
  const listing = row.listing;
  if (!listing) return null;

  const unpublished = listing.isPublished === false || listing.visibility !== 'PUBLIC';
  const sold = listing.status === 'SOLD' || listing.status === 'INACTIVE';
  const reserved = listing.status === 'RESERVED';

  if (sold) {
    return (
      <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
        Продано / снято
      </span>
    );
  }
  if (unpublished) {
    return (
      <span className="inline-flex items-center rounded-md bg-warning-soft text-warning px-2 py-0.5 text-[10px] font-medium">
        Не опубликовано
      </span>
    );
  }
  if (reserved) {
    return (
      <span className="inline-flex items-center rounded-md bg-accent text-accent-foreground px-2 py-0.5 text-[10px] font-medium">
        Бронь
      </span>
    );
  }
  if (row.hasPriceDrop && row.priceChangePct != null) {
    return (
      <span className="inline-flex items-center rounded-md bg-green-100 text-green-900 dark:bg-green-950/50 dark:text-green-200 px-2 py-0.5 text-[10px] font-medium">
        Цена ↓ {Math.abs(row.priceChangePct)}%
      </span>
    );
  }
  if (listing.updatedAt) {
    const ageMs = Date.now() - new Date(listing.updatedAt).getTime();
    if (ageMs > STALE_DAYS * 24 * 3_600_000) {
      return (
        <span className="inline-flex items-center gap-0.5 rounded-md border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
          <Clock className="w-3 h-3" />
          Давно не обновлялось
        </span>
      );
    }
  }
  return null;
}

const FavoriteBlockCard = ({ blockId, slug, name }: { blockId: number; slug?: string | null; name: string }) => {
  const slugOrId = slug && slug.trim() ? slug.trim() : String(blockId);

  const q = useQuery({
    queryKey: ['favorite-block', slugOrId],
    queryFn: () => apiGetOrNull<ApiBlockDetail>(`/blocks/${encodeURIComponent(slugOrId)}`),
  });

  if (q.isLoading) {
    return <div className="rounded-2xl border border-border bg-card h-[420px]" />;
  }

  const apiBlock = q.data;
  if (!apiBlock) {
    return (
      <Link
        to={`/complex/${slugOrId}`}
        className="block rounded-2xl border border-border bg-card p-4 hover:shadow-sm transition-shadow"
      >
        <div className="font-semibold text-sm line-clamp-2">{name}</div>
        <div className="text-xs text-muted-foreground mt-1">Жилой комплекс</div>
      </Link>
    );
  }

  const complex = mapApiBlockDetailToResidentialComplex(apiBlock, []);
  return <ComplexCard complex={complex} />;
};

const Favorites = () => {
  const { favorites, isLoading, removeByFavoriteId } = useFavorites();
  const { isAuthenticated } = useAuth();
  const qc = useQueryClient();
  const { ids: compareIds, toggle: toggleCompare, count: compareCount } = useCompare();
  const [savingCollection, setSavingCollection] = useState(false);
  const [addingItemId, setAddingItemId] = useState<number | null>(null);
  const rows = favorites ?? [];

  const listingCompareKeys = rows
    .map(favoriteCompareKey)
    .filter((k): k is string => k != null && k.startsWith('l:'));

  const collectionsQuery = useQuery({
    queryKey: ['collections'],
    queryFn: () => apiGet<Array<{ id: string; name: string }>>('/collections'),
    ...optionalAuthQueryOptions({ isAuthenticated }),
  });

  const ensureCollectionByName = async (rawName: string): Promise<{ id: string; name: string }> => {
    const name = rawName.trim();
    const existing = collectionsQuery.data?.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing;
    return apiPost<{ id: string; name: string }>('/collections', { name });
  };

  const saveFavoritesAsCollection = async () => {
    if (!isAuthenticated || rows.length === 0) return;
    const name = window.prompt('Название новой подборки (в неё войдут все текущие избранные):');
    if (!name?.trim()) return;
    setSavingCollection(true);
    try {
      const col = await apiPost<{ id: string }>('/collections', { name: name.trim() });
      let added = 0;
      for (const row of rows) {
        if (row.blockId != null) {
          try {
            await apiPost(`/collections/${col.id}/items`, { kind: 'BLOCK', entityId: row.blockId });
            added += 1;
          } catch {
            /* дубликат или конфликт */
          }
        }
        if (row.listingId != null) {
          try {
            await apiPost(`/collections/${col.id}/items`, { kind: 'LISTING', entityId: row.listingId });
            added += 1;
          } catch {
            /* */
          }
        }
      }
      void qc.invalidateQueries({ queryKey: ['collections'] });
      toast.success(`Подборка «${name.trim()}» создана (позиций: ${added})`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось создать подборку');
    } finally {
      setSavingCollection(false);
    }
  };

  const saveSingleFavoriteToCollection = async (row: (typeof rows)[number]) => {
    if (!isAuthenticated) return;
    const suggested = collectionsQuery.data?.[0]?.name ?? '';
    const name = window.prompt('В какую подборку сохранить объект? (введите название существующей или новой)', suggested);
    if (!name?.trim()) return;
    setAddingItemId(row.id);
    try {
      const col = await ensureCollectionByName(name);
      let added = 0;
      if (row.blockId != null) {
        try {
          await apiPost(`/collections/${col.id}/items`, { kind: 'BLOCK', entityId: row.blockId });
          added += 1;
        } catch {
          /* duplicate */
        }
      } else if (row.listingId != null) {
        try {
          await apiPost(`/collections/${col.id}/items`, { kind: 'LISTING', entityId: row.listingId });
          added += 1;
        } catch {
          /* duplicate */
        }
      }
      void qc.invalidateQueries({ queryKey: ['collections'] });
      if (added > 0) toast.success(`Добавлено в подборку «${col.name}»`);
      else toast.message(`Объект уже есть в подборке «${col.name}»`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось добавить в подборку');
    } finally {
      setAddingItemId(null);
    }
  };

  const addAllListingsToCompare = () => {
    let added = 0;
    for (const key of listingCompareKeys) {
      if (compareIds.includes(key)) continue;
      if (compareIds.length + added >= 3) break;
      toggleCompare(key);
      added += 1;
    }
    if (added === 0) {
      toast.message('Объекты уже в сравнении или лимит 3');
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24 lg:pb-0 print:pb-0">
      <div className="print:hidden">
        <RedesignHeader />
      </div>
      <div className="max-w-[1400px] mx-auto px-4 py-8 sm:py-12 print:py-4">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold">Избранное</h1>
          {rows.length > 0 && (
            <div className="print:hidden flex flex-wrap items-center gap-3">
              {COMPARE_ENABLED && listingCompareKeys.length >= 2 ? (
                <Link
                  to="/compare"
                  className="flex items-center gap-1.5 text-sm text-primary font-medium hover:underline"
                >
                  <GitCompare className="w-4 h-4" />
                  Сравнение{compareCount > 0 ? ` (${compareCount})` : ''}
                </Link>
              ) : null}
              {/* Подборки на сервере — только для сотрудников; гостю не показываем кнопку «войдите» */}
              {isAuthenticated ? (
                <button
                  type="button"
                  onClick={() => void saveFavoritesAsCollection()}
                  disabled={savingCollection}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  <FolderPlus className="w-4 h-4" />
                  {savingCollection ? 'Сохранение…' : 'В подборку'}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                <Printer className="w-4 h-4" /> Скачать подборку
              </button>
            </div>
          )}
        </div>
        {isLoading ? (
          <div className="flex justify-center py-20 text-muted-foreground text-sm">Загрузка…</div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16 sm:py-20 max-w-md mx-auto">
            <Heart className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Сохраняйте понравившиеся объекты</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Нажмите ♥ на карточке в каталоге или на странице квартиры, и объекты появятся здесь. Можно собрать
              подборку и отправить заявку одним кликом.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <Button asChild>
                <Link to="/catalog">
                  <MapPin className="w-4 h-4 mr-1.5" />
                  Открыть каталог
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/map">Карта объектов</Link>
              </Button>
            </div>
          </div>
        ) : (
          <>
            {COMPARE_ENABLED && listingCompareKeys.length >= 2 ? (
              <div className="print:hidden mb-4 rounded-xl border border-primary/20 bg-primary/5 p-3 flex flex-wrap items-center gap-2">
                <GitCompare className="w-4 h-4 text-primary shrink-0" />
                <p className="text-sm flex-1 min-w-[180px]">
                  {listingCompareKeys.length} объектов можно сравнить по цене и параметрам
                </p>
                <Button type="button" size="sm" variant="secondary" onClick={addAllListingsToCompare}>
                  Добавить в сравнение
                </Button>
                <Button type="button" size="sm" asChild>
                  <Link to="/compare">Открыть сравнение</Link>
                </Button>
              </div>
            ) : null}
            {rows.length >= 2 ? (
              <div className="hidden lg:block mb-6 rounded-xl border border-border bg-card p-4">
                <SelectionInquiryBar
                  source="favorites:selection"
                  contextFooter={`Избранное · ${rows.length} объектов`}
                />
              </div>
            ) : null}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-start">
              {rows.map((row) => {
                const block = row.block;
                const listing = row.listing as unknown as ApiListingCardRow | null;
                const compareKey = favoriteCompareKey(row);
                const inCompare = compareKey != null && compareIds.includes(compareKey);

                return (
                  <div key={row.id} className="relative">
                    <div className="absolute top-2 left-2 z-10 flex flex-wrap gap-1 max-w-[calc(100%-4rem)]">
                      <FavoriteStatusBadge row={row} />
                    </div>
                    {row.notes?.trim() ? (
                      <p className="text-[10px] text-muted-foreground px-1 mb-1 line-clamp-2" title={row.notes}>
                        {row.notes}
                      </p>
                    ) : null}

                    {row.blockId != null ? (
                      <FavoriteBlockCard
                        blockId={row.blockId}
                        slug={block?.slug}
                        name={block?.name ?? `ЖК #${row.blockId}`}
                      />
                    ) : listing ? (
                      <div className={cn((row.listing?.status === 'SOLD' || row.listing?.isPublished === false) && 'opacity-75')}>
                        <ListingCard listing={listing} />
                      </div>
                    ) : (
                      <div className="rounded-xl border border-border bg-card p-4">Неизвестный объект</div>
                    )}

                    <div className="print:hidden absolute bottom-2 right-2 z-10 flex items-center gap-1">
                      {COMPARE_ENABLED && compareKey?.startsWith('l:') ? (
                        <Button
                          type="button"
                          variant={inCompare ? 'default' : 'secondary'}
                          size="sm"
                          className="h-8 px-2 text-xs"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleCompare(compareKey);
                          }}
                        >
                          {inCompare ? 'В сравнении' : 'Сравнить'}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-8 px-2 text-xs"
                        disabled={!isAuthenticated || addingItemId === row.id}
                        title={!isAuthenticated ? 'Войдите в аккаунт' : undefined}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void saveSingleFavoriteToCollection(row);
                        }}
                      >
                        {addingItemId === row.id ? '…' : 'В подборку'}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="h-8 px-2 text-xs"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void removeByFavoriteId(row.id);
                        }}
                      >
                        Удалить
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
            {rows.length >= 1 ? (
              <SelectionInquiryBar
                sticky
                source="favorites:selection-sticky"
                contextFooter={`Избранное · ${rows.length} объектов`}
                className="print:hidden lg:hidden"
              />
            ) : null}
          </>
        )}
      </div>
      <div className="print:hidden">
        <FooterSection />
      </div>
    </div>
  );
};

export default Favorites;

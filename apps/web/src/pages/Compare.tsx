import { formatArea } from '@/redesign/lib/listing-format';
import { Link } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { useCompare } from '@/shared/hooks/useCompare';
import { useAuth } from '@/shared/hooks/useAuth';
import { useFavorites } from '@/shared/hooks/useFavorites';
import RedesignHeader from '@/redesign/components/RedesignHeader';
import FooterSection from '@/components/FooterSection';
import { Trash2, MapPin, Heart, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiGetOrNull } from '@/lib/api';
import type { ApiBlockDetail } from '@/redesign/lib/blocks-from-api';
import {
  PRICE_ON_REQUEST,
  formatPriceRangeSafe,
  formatPriceSafe,
  hasValidPrice,
} from '@/redesign/lib/display-price';
import SelectionInquiryBar from '@/redesign/components/SelectionInquiryBar';

const PLACEHOLDER = '/placeholder.svg';

const STATUS_LABEL: Record<string, string> = {
  BUILDING: 'Строится',
  COMPLETED: 'Сдан',
  PROJECT: 'Проект',
};

const DATA_SOURCE_LABEL: Record<string, string> = {
  FEED: 'Фид',
  MANUAL: 'Вручную',
};

const KIND_LABEL: Record<string, string> = {
  APARTMENT: 'Квартира',
  HOUSE: 'Дом',
  LAND: 'Участок',
  COMMERCIAL: 'Коммерция',
  PARKING: 'Парковка',
};

/** Упрощённый объект из GET /listings/:id для сравнения */
type CompareListingPayload = {
  id: number;
  kind: string;
  title?: string | null;
  price?: string | number | null;
  address?: string | null;
  region?: { name?: string } | null;
  district?: { name?: string } | null;
  block?: { slug?: string; name?: string } | null;
  apartment?: {
    areaTotal?: string | number | null;
    planUrl?: string | null;
    finishingPhotoUrl?: string | null;
    roomType?: { name?: string | null };
  } | null;
  house?: { areaTotal?: string | number | null; photoUrl?: string | null } | null;
  land?: { areaSotki?: string | number | null; photoUrl?: string | null } | null;
  commercial?: { area?: string | number | null; commercialType?: string | null } | null;
  parking?: { area?: string | number | null; parkingType?: string | null } | null;
  mediaFiles?: { url: string; kind: string }[];
};

function formatDateRu(iso: string | Date | null | undefined): string {
  if (iso == null || iso === '') return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

function formatDeadline(iso: string | Date | null | undefined): string {
  if (iso == null || iso === '') return '';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', { month: 'short', year: 'numeric' }).format(d);
}

function metroLine(b: ApiBlockDetail | undefined): string {
  if (!b?.subways?.length) return '—';
  return b.subways
    .slice(0, 4)
    .map((s) => {
      const name = s.subway?.name ?? '';
      const t = s.distanceTime != null ? `${s.distanceTime} мин` : '';
      return t ? `${name} (${t})` : name;
    })
    .filter(Boolean)
    .join(', ');
}

function addressLine(b: ApiBlockDetail | undefined): string {
  const list = b?.addresses?.map((a) => a.address).filter(Boolean) ?? [];
  if (!list.length) return '—';
  return list.slice(0, 2).join('; ');
}

function buildingsLine(b: ApiBlockDetail | undefined): string {
  const list = b?.buildings ?? [];
  if (!list.length) return '—';
  return list
    .slice(0, 5)
    .map((x) => {
      const parts = [x.name, x.queue].filter(Boolean).join(', ');
      const dl = formatDeadline(x.deadline);
      const tail = dl ? `, ${dl}` : '';
      return `${parts || 'Корпус'}${tail}`;
    })
    .join('; ');
}

function priceRange(b: ApiBlockDetail | undefined): string {
  if (!b) return PRICE_ON_REQUEST;
  return formatPriceRangeSafe(b.listingPriceMin, b.listingPriceMax);
}

const COMPARE_ROWS: { label: string; get: (b: ApiBlockDetail | undefined) => string }[] = [
  { label: 'Регион', get: (x) => x?.region?.name ?? '—' },
  { label: 'Район', get: (x) => x?.district?.name ?? '—' },
  { label: 'Статус ЖК', get: (x) => (x?.status ? STATUS_LABEL[x.status] ?? x.status : '—') },
  { label: 'Старт продаж', get: (x) => formatDateRu(x?.salesStartDate) },
  { label: 'Застройщик', get: (x) => x?.builder?.name ?? '—' },
  { label: 'Адрес', get: addressLine },
  { label: 'Метро', get: metroLine },
  { label: 'Квартир в продаже', get: (x) => (x?._count?.listings != null ? String(x._count.listings) : '—') },
  { label: 'Цена (квартиры)', get: priceRange },
  { label: 'Корпуса и сроки', get: buildingsLine },
  { label: 'Источник данных', get: (x) => (x?.dataSource ? DATA_SOURCE_LABEL[x.dataSource] ?? x.dataSource : '—') },
];

function listingHeroImage(l: CompareListingPayload | null | undefined): string {
  if (!l) return PLACEHOLDER;
  const mf = [...(l.mediaFiles ?? [])].sort((a, b) => (a.kind === 'PHOTO' ? -1 : 1));
  const photo = mf.find((m) => m.kind === 'PHOTO') ?? mf.find((m) => m.kind === 'PLAN');
  if (photo?.url) return photo.url;
  if (l.kind === 'APARTMENT' && l.apartment?.planUrl?.trim()) return l.apartment.planUrl.trim();
  if (l.kind === 'APARTMENT' && l.apartment?.finishingPhotoUrl?.trim()) return l.apartment.finishingPhotoUrl.trim();
  if (l.kind === 'HOUSE' && l.house?.photoUrl?.trim()) return l.house.photoUrl.trim();
  if (l.kind === 'LAND' && l.land?.photoUrl?.trim()) return l.land.photoUrl.trim();
  return PLACEHOLDER;
}

function listingTitleShort(l: CompareListingPayload): string {
  const t = l.title?.trim();
  if (t) return t;
  if (l.kind === 'APARTMENT' && l.apartment?.roomType?.name) {
    const a = l.apartment.areaTotal != null && Number(l.apartment.areaTotal) > 0 ? formatArea(Number(l.apartment.areaTotal)) : '';
    return [l.apartment.roomType.name, a].filter(Boolean).join(' · ');
  }
  return KIND_LABEL[l.kind] ?? l.kind ?? 'Объект';
}

function listingPriceShow(l: CompareListingPayload): string {
  return formatPriceSafe(l.price);
}

function listingDetailHref(l: CompareListingPayload): string {
  if (l.kind === 'APARTMENT' && l.block) return `/apartment/${l.id}`;
  return `/listing/${l.id}`;
}

function listingSpecLines(l: CompareListingPayload): { label: string; value: string }[] {
  const lines: { label: string; value: string }[] = [
    { label: 'Тип', value: KIND_LABEL[l.kind] ?? l.kind },
    { label: 'Регион', value: l.region?.name ?? '—' },
    { label: 'Район', value: l.district?.name ?? '—' },
    { label: 'Цена', value: listingPriceShow(l) },
    { label: 'Адрес', value: l.address?.trim() || '—' },
  ];
  if (l.kind === 'APARTMENT' && l.apartment) {
    const a = l.apartment;
    const area =
      a.areaTotal != null && Number(a.areaTotal) > 0 ? formatArea(Number(a.areaTotal)) : '—';
    lines.push({ label: 'Площадь', value: area });
  }
  if (l.kind === 'HOUSE' && l.house?.areaTotal != null && Number(l.house.areaTotal) > 0) {
    lines.push({ label: 'Дом м²', value: formatArea(Number(l.house.areaTotal)) });
  }
  if (l.kind === 'LAND' && l.land?.areaSotki != null && Number(l.land.areaSotki) > 0) {
    lines.push({ label: 'Участок сот.', value: `${Number(l.land.areaSotki)}` });
  }
  if (l.block?.name) lines.push({ label: 'ЖК', value: l.block.name });
  return lines;
}

type CompareFetched =
  | { kind: 'block'; raw: string; block: ApiBlockDetail | null }
  | { kind: 'listing'; raw: string; listing: CompareListingPayload | null; listingId: number };

const Compare = () => {
  const { ids, remove, clear } = useCompare();
  const { isAuthenticated } = useAuth();
  const { isBlockFavorite, toggleBlock } = useFavorites();

  const queries = useQueries({
    queries: ids.map((raw: string) => ({
      queryKey: ['compare', raw],
      queryFn: async (): Promise<CompareFetched> => {
        if (raw.startsWith('l:')) {
          const listingId = Number(raw.slice(2));
          if (!Number.isFinite(listingId))
            return { kind: 'listing', raw, listing: null, listingId };
          const listing = await apiGetOrNull<CompareListingPayload>(`/listings/${listingId}`);
          return { kind: 'listing', raw, listing, listingId };
        }
        const block = await apiGetOrNull<ApiBlockDetail>(`/blocks/${encodeURIComponent(raw)}`);
        return { kind: 'block', raw, block };
      },
      staleTime: 60_000,
    })),
    enabled: ids.length > 0,
  });

  const loading = queries.some((q) => q.isPending);
  const anyError = queries.some((q) => q.isError);

  const onlyBlockSlugs = ids.length > 0 && ids.every((id) => !id.startsWith('l:'));
  return (
    <div className="min-h-screen bg-background pb-24 lg:pb-0">
      <RedesignHeader />
      <div className="max-w-[1400px] mx-auto px-4 py-8 sm:py-12">
        <h1 className="text-2xl sm:text-3xl font-bold mb-6">Сравнение объектов</h1>
        {ids.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-muted-foreground mb-4 max-w-xl mx-auto text-sm leading-relaxed">
              Добавьте объявления («объект в сравнение» со страницы объявления или квартиры) или ЖК из каталога. До{' '}
              <span className="font-medium text-foreground">3</span> позиций.
            </p>
            <Link to="/catalog" className="text-primary font-medium hover:underline">
              Перейти в каталог
            </Link>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-muted-foreground">{ids.length} из 3</p>
              <button type="button" onClick={clear} className="text-sm text-destructive hover:underline">
                Очистить
              </button>
            </div>
            {loading ? (
              <p className="text-sm text-muted-foreground py-8">Загрузка данных…</p>
            ) : anyError ? (
              <p className="text-sm text-destructive py-4">Часть объектов не удалось загрузить. Проверьте ссылку или обновите страницу.</p>
            ) : null}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {ids.map((id, idx) => {
                const q = queries[idx];
                const slot = q?.data;
                if (!slot) {
                  return (
                    <div
                      key={id}
                      className="bg-card border border-dashed border-border rounded-xl flex items-center justify-center min-h-[200px] text-sm text-muted-foreground"
                    >
                      Загрузка…
                    </div>
                  );
                }

                if (slot.kind === 'block') {
                  const b = slot && slot.kind === 'block' ? slot.block : null;
                  const img = b?.images?.[0]?.url ?? PLACEHOLDER;
                  const priceMin = b?.listingPriceMin != null ? Math.round(Number(b.listingPriceMin)) : 0;
                  const district = b?.district?.name ?? '—';
                  const slug = b?.slug ?? id;

                  return (
                    <div key={id} className="bg-card border border-border rounded-xl overflow-hidden flex flex-col">
                      <div className="aspect-[16/10] bg-muted relative">
                        <img src={img} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div className="p-4 flex-1 flex flex-col">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          {b ? (
                            <Link to={`/complex/${slug}`} className="font-medium text-sm hover:text-primary line-clamp-2">
                              {b.name}
                            </Link>
                          ) : (
                            <p className="font-medium text-sm">ЖК {id.startsWith('l:') ? '' : `#${id}`}</p>
                          )}
                          <div className="flex items-center gap-0.5 shrink-0">
                            {b ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  void toggleBlock(b.id);
                                }}
                                className={cn(
                                  'p-1 rounded-md transition-colors',
                                  isBlockFavorite(b.id) ? 'text-red-500' : 'text-muted-foreground hover:text-red-500',
                                )}
                                aria-label={isBlockFavorite(b.id) ? 'Убрать из избранного' : 'В избранное'}
                                title={
                                  isAuthenticated
                                    ? isBlockFavorite(b.id)
                                      ? 'Убрать из избранного'
                                      : 'В избранное'
                                    : 'В избранное'
                                }
                              >
                                <Heart className={cn('w-4 h-4', isBlockFavorite(b.id) && 'fill-current')} />
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => remove(id)}
                              className="text-muted-foreground hover:text-destructive p-1"
                              aria-label="Убрать из сравнения"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        {!b && !q?.isPending ? (
                          <p className="text-xs text-muted-foreground">ЖК не найден</p>
                        ) : (
                          <>
                            <p className="text-xs text-muted-foreground mb-1">Жилой комплекс</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
                              <MapPin className="w-3 h-3 shrink-0" />
                              {district}
                            </p>
                            <p className="text-sm font-semibold text-primary mt-auto">
                              {formatPriceSafe(priceMin)}
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  );
                }

                const l = slot.listing;
                const img = listingHeroImage(l);
                const title = l ? listingTitleShort(l) : `#${slot.listingId}`;
                const href = l ? listingDetailHref(l) : '#';

                return (
                  <div key={id} className="bg-card border border-border rounded-xl overflow-hidden flex flex-col">
                    <div className="aspect-[16/10] bg-muted relative">
                      <Link to={href}>
                        <img src={img} alt="" className="w-full h-full object-cover" />
                      </Link>
                    </div>
                    <div className="p-4 flex-1 flex flex-col">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        {l ? (
                          <Link to={href} className="font-medium text-sm hover:text-primary line-clamp-3">
                            {title}
                          </Link>
                        ) : (
                          <p className="font-medium text-sm">Объявление #{slot.listingId}</p>
                        )}
                        <div className="flex items-center gap-0.5 shrink-0">
                          {l ? (
                            <Link
                              to={`/presentation/listing/${l.id}`}
                              className="p-1 rounded-md text-muted-foreground hover:text-primary"
                              title="Презентация"
                              aria-label="Презентация"
                            >
                              <FileText className="w-4 h-4" />
                            </Link>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => remove(id)}
                            className="text-muted-foreground hover:text-destructive p-1"
                            aria-label="Убрать из сравнения"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      {!l && !q?.isPending ? (
                        <p className="text-xs text-muted-foreground">Объект не найден</p>
                      ) : (
                        <>
                          <p className="text-xs text-muted-foreground mb-1">
                            {l ? KIND_LABEL[l.kind] ?? l.kind : '—'}
                          </p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
                            <MapPin className="w-3 h-3 shrink-0" />
                            {l?.region?.name ?? '—'}
                          </p>
                          <p className="text-sm font-semibold text-primary mt-auto">
                            {l ? listingPriceShow(l) : '—'}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {!loading && ids.length > 0 && onlyBlockSlugs && queries.every((q) => q.data?.kind === 'block') ? (
              <div className="mt-10">
                <h2 className="text-lg font-semibold mb-3">Параметры ЖК</h2>
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-sm border-collapse min-w-[640px]">
                    <thead>
                      <tr className="bg-muted/50 border-b border-border">
                        <th className="text-left font-medium p-3 w-[160px] sm:w-[200px] sticky left-0 bg-muted/50 z-[1] border-r border-border">
                          Параметр
                        </th>
                        {ids.map((id, idx) => {
                          const sd = queries[idx]?.data as { kind?: string; block?: ApiBlockDetail | null };
                          const b = sd?.kind === 'block' ? sd.block : null;
                          const slug = b?.slug ?? id;
                          return (
                            <th key={id} className="text-left font-medium p-3 min-w-[140px] align-bottom">
                              {b ? (
                                <Link to={`/complex/${slug}`} className="hover:text-primary line-clamp-2">
                                  {b.name}
                                </Link>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {COMPARE_ROWS.map((row) => (
                        <tr key={row.label} className="border-b border-border last:border-0">
                          <td className="p-3 text-muted-foreground sticky left-0 bg-background z-[1] border-r border-border text-xs sm:text-sm">
                            {row.label}
                          </td>
                          {ids.map((id, idx) => (
                            <td key={`${row.label}-${id}`} className="p-3 align-top text-xs sm:text-sm">
                              {row.get((queries[idx]?.data as Extract<CompareFetched, { kind: 'block' }> | undefined)?.block)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : !loading && ids.length > 0 ? (
              <div className="mt-10">
                <h2 className="text-lg font-semibold mb-3">Параметры</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {queries.map((q, idx) => {
                    const slot = q.data as CompareFetched | undefined;
                    const rid = ids[idx];
                    if (!slot) {
                      return (
                        <div key={rid} className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground bg-card text-center">
                          Загрузка
                        </div>
                      );
                    }
                    if (slot.kind === 'block') {
                      const b = slot && slot.kind === 'block' ? slot.block : null;
                      const slug = b?.slug ?? rid;
                      return (
                        <div key={rid} className="rounded-xl border border-border p-4 text-sm bg-card">
                          <p className="font-medium mb-2">
                            {b ? (
                              <Link to={`/complex/${slug}`} className="hover:text-primary">
                                {b.name}
                              </Link>
                            ) : (
                              rid
                            )}
                          </p>
                          <dl className="space-y-1.5 text-xs">
                            {COMPARE_ROWS.slice(0, 10).map((row) => (
                              <div key={row.label} className="flex justify-between gap-2 border-b border-dashed border-border/60 pb-1">
                                <dt className="text-muted-foreground shrink-0">{row.label}</dt>
                                <dd className="text-right">{row.get(b)}</dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                      );
                    }
                    const list = slot.listing;
                    return (
                      <div key={slot.raw} className="rounded-xl border border-border p-4 text-sm bg-card">
                        <p className="font-medium mb-2">
                          {list ? (
                            <Link to={listingDetailHref(list)} className="hover:text-primary">
                              {listingTitleShort(list)}
                            </Link>
                          ) : (
                            `Объект #${slot.listingId}`
                          )}
                        </p>
                        {list ? (
                          <dl className="space-y-1.5 text-xs">
                            {listingSpecLines(list).map((row) => (
                              <div key={row.label} className="flex justify-between gap-2 border-b border-dashed border-border/60 pb-1">
                                <dt className="text-muted-foreground shrink-0">{row.label}</dt>
                                <dd className="text-right">{row.value}</dd>
                              </div>
                            ))}
                          </dl>
                        ) : (
                          <p className="text-xs text-muted-foreground">Нет данных</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {ids.length >= 1 ? (
              <>
                <div className="hidden lg:block mt-8 rounded-xl border border-border bg-card p-4">
                  <SelectionInquiryBar
                    source="compare:selection"
                    contextFooter={`Сравнение · ${ids.length} объектов`}
                  />
                </div>
                <SelectionInquiryBar
                  sticky
                  source="compare:selection-sticky"
                  contextFooter={`Сравнение · ${ids.length} объектов`}
                  className="lg:hidden"
                />
              </>
            ) : null}
          </div>
        )}
      </div>
      <FooterSection />
    </div>
  );
};

export default Compare;

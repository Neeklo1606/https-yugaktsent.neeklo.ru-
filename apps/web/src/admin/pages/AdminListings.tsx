import { manualFieldsLabel } from '@/admin/components/ManualLockBanner';
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Loader2, ChevronLeft, ChevronRight, ExternalLink, Pencil, Trash2, Plus,
  Building, TreePine, Trees, Hammer, ParkingSquare, Search, X, DoorOpen,
  Lock,
} from 'lucide-react';
import { formatApiValidationError } from '@lg/shared';
import { apiGet, apiDelete, apiPatch, ApiError } from '@/lib/api';
import { adminAuthQueryOptions } from '@/shared/lib/admin-auth-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/shared/hooks/useAuth';
import { cn } from '@/lib/utils';
import { listingStatusClass, listingStatusLabel, listingStatusOptions, type ListingStatus } from '@/admin/lib/listingStatus';
import {
  LISTING_VISIBILITY_LABEL,
  listingVisibilityClass,
} from '@/admin/lib/listingVisibility';
import AdminListingsFilterPanel from '@/admin/components/AdminListingsFilterPanel';
import {
  apiKindForAdminTab,
  applyExtendedFiltersToParams,
  EMPTY_EXTENDED_FILTERS,
  type AdminListingsExtendedFilters,
} from '@/admin/lib/admin-listings-filters';

type Kind = 'APARTMENT' | 'ROOM' | 'HOUSE' | 'LAND' | 'COMMERCIAL' | 'PARKING';
type Source = 'all' | 'feed' | 'manual' | 'donor';

type ListingRow = {
  id: number;
  kind?: string;
  price: string | number | null;
  address?: string | null;
  dataSource?: string;
  externalId?: string | null;
  status?: string;
  visibility?: string;
  isPublished?: boolean;
  manualFields?: string[];
  isStale?: boolean;
  lastActivityAt?: string | null;
  blockId?: number | null;
  region?: { id: number; code?: string; name?: string } | null;
  block?: { id: number; slug: string; name: string } | null;
  ownerUser?: { id: string; fullName: string | null; email: string | null } | null;
  apartment: {
    areaTotal: string | number | null;
    floor: number | null;
    planUrl?: string | null;
    blockAddress?: string | null;
    roomType: { name: string } | null;
  } | null;
  house: { houseType: string | null; areaTotal: string | number | null; floorsCount: number | null; photoUrl?: string | null } | null;
  land: { areaSotki: string | number | null; landCategory: string | null; hasCommunications: boolean | null } | null;
  commercial: { commercialType: string | null; area: string | number | null; floor: number | null } | null;
  parking: { parkingType: string | null; area: string | number | null; floor: number | null; number: string | null } | null;
};

type Paginated = {
  data: ListingRow[];
  meta: { page: number; per_page: number; total: number; total_pages: number };
};

type RegionRow = { id: number; code: string; name: string };
type AgentRow = { id: string; fullName: string | null; email: string | null; role: string };
type StatusGroup = 'all' | 'active' | 'inactive' | 'archive';

const STATUS_GROUPS: Array<{ key: StatusGroup; label: string; statuses?: ListingStatus[] }> = [
  { key: 'all', label: 'Все' },
  { key: 'active', label: 'Активные', statuses: ['ACTIVE', 'RESERVED'] },
  { key: 'inactive', label: 'Снятые с публикации', statuses: ['INACTIVE'] },
  { key: 'archive', label: 'Архив', statuses: ['SOLD', 'DRAFT'] },
];
const KIND_TABS: { key: Kind; label: string; icon: typeof Building; manualPath: string }[] = [
  { key: 'APARTMENT',  label: 'Квартиры',     icon: Building,      manualPath: '/admin/listings/manual/new' },
  { key: 'ROOM',       label: 'Комнаты',     icon: DoorOpen,      manualPath: '/admin/listings/wizard/new?kind=ROOM' },
  { key: 'HOUSE',      label: 'Дома',          icon: TreePine,      manualPath: '/admin/listings/manual-house/new' },
  { key: 'LAND',       label: 'Участки',       icon: Trees,         manualPath: '/admin/listings/manual-land/new' },
  { key: 'COMMERCIAL', label: 'Коммерция',     icon: Hammer,        manualPath: '/admin/listings/manual-commercial/new' },
  { key: 'PARKING',    label: 'Паркинг',       icon: ParkingSquare, manualPath: '/admin/listings/manual-parking/new' },
];

const SOURCE_TABS: { key: Source; label: string }[] = [
  { key: 'all',    label: 'Все источники' },
  { key: 'feed',   label: 'Из фида (FEED)' },
  { key: 'manual', label: 'Ручные (MANUAL)' },
  { key: 'donor',  label: 'Авангард (donor)' },
];

function listingThumbUrl(r: ListingRow): string | null {
  const apt = r.apartment?.planUrl?.trim();
  if (apt) return apt;
  const house = r.house?.photoUrl?.trim();
  if (house) return house;
  return null;
}

function listingAddressLine(r: ListingRow): string {
  const direct = r.address?.trim();
  if (direct) return direct;
  const blockAddr = r.apartment?.blockAddress?.trim();
  if (blockAddr) return blockAddr;
  if (r.block?.name) return r.block.name;
  return '—';
}

function parseApiErrorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    return formatApiValidationError(e.message, e.status) || fallback;
  }
  if (e instanceof Error && e.message.trim()) return e.message;
  return fallback;
}

function publicLinkFor(kind: Kind, id: number): string {
  return kind === 'APARTMENT' || kind === 'ROOM' ? `/apartment/${id}` : `/listing/${id}`;
}

function manualEditPath(kind: Kind, id: number): string {
  switch (kind) {
    case 'APARTMENT':
    case 'ROOM':
      return `/admin/listings/manual/${id}/edit`;
    case 'HOUSE':      return `/admin/listings/manual-house/${id}/edit`;
    case 'LAND':       return `/admin/listings/manual-land/${id}/edit`;
    case 'COMMERCIAL': return `/admin/listings/manual-commercial/${id}/edit`;
    case 'PARKING':    return `/admin/listings/manual-parking/${id}/edit`;
  }
}

export default function AdminListings() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canManageManual = user?.role === 'admin' || user?.role === 'editor' || user?.role === 'agent';
  const canPublish = user?.role === 'admin' || user?.role === 'editor';
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [visibilityFilter, setVisibilityFilter] = useState<string>('all');
  const [staleOnly, setStaleOnly] = useState(false);
  const canGovern = user?.role === 'admin' || user?.role === 'editor' || user?.role === 'manager';

  const [kind, setKind] = useState<Kind>('APARTMENT');
  const [source, setSource] = useState<Source>('all');
  const [statusGroup, setStatusGroup] = useState<StatusGroup>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | ListingStatus>('all');
  const [regionId, setRegionId] = useState<number | 'all'>('all');
  const [search, setSearch] = useState('');
  const [extendedFilters, setExtendedFilters] = useState<AdminListingsExtendedFilters>(EMPTY_EXTENDED_FILTERS);
  const [page, setPage] = useState(1);
  const perPage = 30;

  const { data: regions } = useQuery({
    queryKey: ['admin-regions'],
    queryFn: () => apiGet<RegionRow[]>('/regions'),
    staleTime: 60 * 60 * 1000,
  });

  const { data: agents } = useQuery({
    queryKey: ['admin', 'listings', 'agents'],
    queryFn: () => apiGet<AgentRow[]>('/admin/listings/agents'),
    ...adminAuthQueryOptions({ enabled: canManageManual, staleTime: 60_000 }),
  });

  const queryKey = useMemo(
    () => [
      'admin',
      'listings',
      regionId,
      page,
      source,
      kind,
      statusGroup,
      statusFilter,
      search.trim(),
      ownerFilter,
      visibilityFilter,
      staleOnly,
      extendedFilters,
    ],
    [regionId, page, source, kind, statusGroup, statusFilter, search, ownerFilter, visibilityFilter, staleOnly, extendedFilters],
  );

  const queryString = useMemo(() => {
    const apiKind = apiKindForAdminTab(kind);
    const sp = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
      kind: apiKind,
      admin_view: 'true',
    });
    if (kind === 'ROOM') sp.set('apartment_category', 'room');
    if (kind === 'APARTMENT') sp.set('apartment_category', 'standard');
    if (regionId !== 'all') sp.set('region_id', String(regionId));
    if (source === 'feed') sp.set('data_source', 'FEED');
    if (source === 'manual') sp.set('data_source', 'MANUAL');
    if (source === 'donor') sp.set('external_id_prefix', 'donor:');
    if (visibilityFilter !== 'all') sp.set('visibility', visibilityFilter);
    if (ownerFilter !== 'all') sp.set('owner_user_id', ownerFilter);
    if (staleOnly) sp.set('stale_only', 'true');
    if (user?.role === 'agent') sp.set('scope', 'owned');
    if (statusFilter !== 'all') {
      sp.set('status', statusFilter);
    } else {
      const group = STATUS_GROUPS.find((x) => x.key === statusGroup);
      if (group?.statuses?.length) sp.set('statuses', group.statuses.join(','));
    }
    if (search.trim()) sp.set('search', search.trim());
    applyExtendedFiltersToParams(sp, extendedFilters, kind);
    return sp.toString();
  }, [page, perPage, kind, regionId, source, statusGroup, statusFilter, search, visibilityFilter, ownerFilter, staleOnly, user?.role, extendedFilters]);

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => apiGet<Paginated>(`/admin/listings?${queryString}`),
    ...adminAuthQueryOptions({ staleTime: 20_000 }),
  });

  const { data: kindCountsByRegion } = useQuery({
    queryKey: ['admin', 'listings-kind-counts', regionId],
    queryFn: () => {
      const sp = new URLSearchParams();
      if (regionId !== 'all') sp.set('region_id', String(regionId));
      return apiGet<Record<string, number>>(`/stats/listing-kind-counts?${sp}`);
    },
    enabled: regionId !== 'all',
    staleTime: 60_000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/admin/listings/${id}`),
    onSuccess: async () => {
      toast.success('Объявление удалено');
      await qc.invalidateQueries({ queryKey: ['admin', 'listings'] });
    },
    onError: (e: unknown) => toast.error(parseApiErrorMessage(e, 'Ошибка удаления')),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: { status?: ListingStatus; isPublished?: boolean } }) =>
      apiPatch(`/admin/listings/${id}`, patch),
    onSuccess: async () => {
      toast.success('Объявление обновлено');
      await qc.invalidateQueries({ queryKey: ['admin', 'listings'] });
    },
    onError: (e: unknown) => toast.error(parseApiErrorMessage(e, 'Ошибка обновления')),
  });

  const transferMutation = useMutation({
    mutationFn: ({ id, targetUserId }: { id: number; targetUserId: string }) =>
      apiPatch(`/admin/listings/${id}/transfer`, { targetUserId }),
    onSuccess: async () => {
      toast.success('Объект передан сотруднику');
      await qc.invalidateQueries({ queryKey: ['admin', 'listings'] });
    },
    onError: (e: unknown) => toast.error(parseApiErrorMessage(e, 'Ошибка передачи объекта')),
  });

  const lifecycleMutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: string }) =>
      apiPatch(`/admin/listings/${id}/lifecycle`, { action }),
    onSuccess: async () => {
      toast.success('Видимость обновлена');
      await qc.invalidateQueries({ queryKey: ['admin', 'listings'] });
      await qc.invalidateQueries({ queryKey: ['admin', 'my-listings'] });
    },
    onError: (e: unknown) => toast.error(parseApiErrorMessage(e, 'Ошибка lifecycle')),
  });

  const assignMutation = useMutation({
    mutationFn: ({ id, ownerUserId }: { id: number; ownerUserId: string }) =>
      apiPatch(`/admin/listings/${id}/assign`, { ownerUserId }),
    onSuccess: async () => {
      toast.success('Владелец назначен');
      await qc.invalidateQueries({ queryKey: ['admin', 'listings'] });
    },
    onError: (e: unknown) => toast.error(parseApiErrorMessage(e, 'Ошибка назначения')),
  });

  const rows = data?.data ?? [];
  const meta = data?.meta;

  const KindIcon = (KIND_TABS.find((t) => t.key === kind) ?? KIND_TABS[0]).icon;

  const setKindAndReset = (k: Kind) => {
    setKind(k);
    setExtendedFilters(EMPTY_EXTENDED_FILTERS);
    setPage(1);
  };
  const setSourceAndReset = (s: Source) => { setSource(s); setPage(1); };
  const setStatusGroupAndReset = (g: StatusGroup) => {
    setStatusGroup(g);
    setStatusFilter('all');
    setPage(1);
  };

  return (
    <div className="p-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex items-center gap-3">
          <KindIcon className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Объявления</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Все объекты — из фидов и добавленные вручную. Используйте фильтры по региону, типу и источнику.
            </p>
          </div>
        </div>

        {/* Filters bar */}
        <div className="flex flex-wrap gap-2 items-center">
          <Select
            value={String(regionId)}
            onValueChange={(v) => {
              setRegionId(v === 'all' ? 'all' : Number(v));
              setExtendedFilters((prev) => ({
                ...prev,
                blockId: 'all',
                districtKey: 'all',
                builderId: 'all',
              }));
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 w-[200px] text-xs">
              <SelectValue placeholder="Регион" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все регионы</SelectItem>
              {(regions ?? []).map((r) => (
                <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as 'all' | ListingStatus); setStatusGroup('all'); setPage(1); }}>
            <SelectTrigger className="h-9 w-[160px] text-xs">
              <SelectValue placeholder="Статус" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              {listingStatusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {canGovern ? (
            <Select value={visibilityFilter} onValueChange={(v) => { setVisibilityFilter(v); setPage(1); }}>
              <SelectTrigger className="h-9 w-[150px] text-xs">
                <SelectValue placeholder="Видимость" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Вся видимость</SelectItem>
                {Object.entries(LISTING_VISIBILITY_LABEL).map(([k, label]) => (
                  <SelectItem key={k} value={k}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

          {canGovern && (agents?.length ?? 0) > 0 ? (
            <Select value={ownerFilter} onValueChange={(v) => { setOwnerFilter(v); setPage(1); }}>
              <SelectTrigger className="h-9 w-[180px] text-xs">
                <SelectValue placeholder="Владелец" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все владельцы</SelectItem>
                {(agents ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.fullName || a.email || a.id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

          {canGovern ? (
            <label className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border text-xs cursor-pointer select-none">
              <input
                type="checkbox"
                checked={staleOnly}
                onChange={(e) => { setStaleOnly(e.target.checked); setPage(1); }}
                className="rounded"
              />
              Устаревшие 30+ дн.
            </label>
          ) : null}

          <div className="flex flex-wrap gap-1">
            {STATUS_GROUPS.map((group) => (
              <button
                key={group.key}
                type="button"
                onClick={() => setStatusGroupAndReset(group.key)}
                className={cn(
                  'h-9 rounded-lg border px-3 text-xs font-medium transition-colors',
                  statusGroup === group.key && statusFilter === 'all'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted',
                )}
              >
                {group.label}
              </button>
            ))}
          </div>

          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Поиск по ЖК, адресу"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="h-9 pl-8 pr-8 text-xs"
            />
            {search ? (
              <button
                type="button"
                onClick={() => { setSearch(''); setPage(1); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Очистить поиск"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : null}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {canManageManual ? (
              <>
                <Button type="button" asChild>
                  <Link to="/admin/listings/wizard/new">
                    <Plus className="w-4 h-4 mr-2" />
                    Создать
                  </Link>
                </Button>
              </>
            ) : null}
          </div>
        </div>

        <AdminListingsFilterPanel
          kind={kind}
          regionId={regionId}
          filters={extendedFilters}
          onChange={setExtendedFilters}
          onPageReset={() => setPage(1)}
        />
      </div>

      {/* Type tabs */}
      <div className="flex flex-wrap gap-2 mb-3">
        {KIND_TABS.map((t) => {
          const Icon = t.icon;
          const cnt = kindCountsByRegion?.[t.key];
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setKindAndReset(t.key)}
              className={cn(
                'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                kind === t.key
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card text-foreground border-border hover:bg-muted/60',
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
              {regionId !== 'all' && cnt != null ? (
                <span className={cn('opacity-70', kind === t.key ? '' : 'text-muted-foreground')}>· {cnt}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Source tabs */}
      <div className="flex gap-2 mb-4 border-b">
        {SOURCE_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              source === t.key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setSourceAndReset(t.key)}
          >
            {t.label}
          </button>
        ))}
        <div className="ml-auto self-center text-xs text-muted-foreground pr-2">
          {meta ? `Найдено: ${meta.total}` : ''}
        </div>
      </div>

      {/* Body */}
      {isLoading && (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && rows.length === 0 && (
        <div className="border rounded-2xl p-8 text-center text-muted-foreground text-sm">
          Нет записей по выбранным фильтрам
        </div>
      )}

      {rows.length > 0 && (
        <div className="bg-background border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-3 py-3 font-medium w-12">Фото</th>
                  <th className="px-4 py-3 font-medium min-w-[140px]">Адрес</th>
                  <th className="px-4 py-3 font-medium">ID</th>
                  <th className="px-4 py-3 font-medium">Регион</th>
                  <th className="px-4 py-3 font-medium">Источник</th>
                  <th className="px-4 py-3 font-medium">
                    {kind === 'APARTMENT' || kind === 'ROOM' ? 'Комн.' : kind === 'LAND' ? 'Категория' : 'Тип'}
                  </th>
                  <th className="px-4 py-3 font-medium">Площадь</th>
                  <th className="px-4 py-3 font-medium">
                    {kind === 'APARTMENT' || kind === 'ROOM' ? 'Этаж' : kind === 'HOUSE' ? 'Этажей' : kind === 'LAND' ? 'Комм.' : kind === 'COMMERCIAL' ? 'Этаж' : 'Место'}
                  </th>
                  <th className="px-4 py-3 font-medium">Статус</th>
                  <th className="px-4 py-3 font-medium">Видимость</th>
                  {canGovern ? <th className="px-4 py-3 font-medium">Владелец</th> : null}
                  <th className="px-4 py-3 font-medium text-center">Публ.</th>
                  <th className="px-4 py-3 font-medium text-right">Цена</th>
                  <th className="px-4 py-3 font-medium text-center">Сайт</th>
                  <th className="px-4 py-3 font-medium text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => {
                  const priceN = r.price != null ? Number(r.price) : 0;
                  const area = kind === 'APARTMENT' || kind === 'ROOM' ? Number(r.apartment?.areaTotal ?? NaN)
                    : kind === 'HOUSE' ? Number(r.house?.areaTotal ?? NaN)
                    : kind === 'LAND' ? Number(r.land?.areaSotki ?? NaN)
                    : kind === 'COMMERCIAL' ? Number(r.commercial?.area ?? NaN)
                    : Number(r.parking?.area ?? NaN);
                  const isManual = (r.dataSource ?? '').toUpperCase() === 'MANUAL';
                  const inactive = r.status === 'INACTIVE' || !r.isPublished;
                  return (
                    <tr key={r.id} className={cn('hover:bg-muted/40', inactive && 'bg-red-50/40')}>
                      <td className="px-3 py-2">
                        {listingThumbUrl(r) ? (
                          <img
                            src={listingThumbUrl(r)!}
                            alt=""
                            className="w-10 h-10 rounded object-cover bg-muted"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded bg-muted" />
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs max-w-[200px] truncate" title={listingAddressLine(r)}>
                        {r.manualFields?.length ? (
                          <Lock
                            className="mr-1 inline h-3.5 w-3.5 text-amber-600"
                            aria-label={`Изменено вручную: ${manualFieldsLabel(r.manualFields)}`}
                          >
                            <title>{`Изменено вручную: ${manualFieldsLabel(r.manualFields)} — фид не перезаписывает`}</title>
                          </Lock>
                        ) : null}
                        {listingAddressLine(r)}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground text-xs">{r.id}</td>
                      <td className="px-4 py-2 text-xs">{r.region?.name ?? '—'}</td>
                      <td className="px-4 py-2 text-xs">{r.dataSource ?? '—'}</td>
                      <td className="px-4 py-2">
                        {kind === 'APARTMENT' || kind === 'ROOM' ? (r.apartment?.roomType?.name ?? '—')
                          : kind === 'HOUSE' ? (r.house?.houseType ?? '—')
                          : kind === 'LAND' ? (r.land?.landCategory ?? '—')
                          : kind === 'COMMERCIAL' ? (r.commercial?.commercialType ?? '—')
                          : (r.parking?.parkingType ?? '—')}
                      </td>
                      <td className="px-4 py-2">
                        {Number.isFinite(area) ? `${area} ${kind === 'LAND' ? 'сот.' : 'м²'}` : '—'}
                      </td>
                      <td className="px-4 py-2">
                        {kind === 'APARTMENT' || kind === 'ROOM' ? (r.apartment?.floor ?? '—')
                          : kind === 'HOUSE' ? (r.house?.floorsCount ?? '—')
                          : kind === 'LAND' ? (r.land?.hasCommunications == null ? '—' : r.land.hasCommunications ? 'Да' : 'Нет')
                          : kind === 'COMMERCIAL' ? (r.commercial?.floor ?? '—')
                          : (r.parking?.number ?? '—')}
                      </td>
                      <td className="px-4 py-2">
                        <select
                          className={cn('h-8 rounded-md border px-2 text-xs font-medium', listingStatusClass(r.status))}
                          value={(r.status ?? 'DRAFT') as ListingStatus}
                          disabled={updateMutation.isPending || !canManageManual}
                          onChange={(e) =>
                            updateMutation.mutate({ id: r.id, patch: { status: e.target.value as ListingStatus } })
                          }
                        >
                          {listingStatusOptions.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                        {inactive ? (
                          <div className="mt-1 text-[10px] text-red-700">
                            {r.status === 'INACTIVE' ? listingStatusLabel('INACTIVE') : 'Не опубликовано'}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={cn(
                            'text-[10px] px-2 py-0.5 rounded-full font-medium',
                            listingVisibilityClass(r.visibility ?? 'PUBLIC'),
                          )}
                        >
                          {LISTING_VISIBILITY_LABEL[r.visibility as keyof typeof LISTING_VISIBILITY_LABEL] ??
                            r.visibility ??
                            '—'}
                        </span>
                        {r.isStale ? (
                          <div className="mt-1 text-[10px] text-amber-700">30+ дн. без активности</div>
                        ) : null}
                        {isManual && canManageManual ? (
                          <select
                            className="mt-1 h-7 w-full max-w-[120px] rounded-md border px-1 text-[10px]"
                            defaultValue=""
                            disabled={lifecycleMutation.isPending}
                            onChange={(e) => {
                              const action = e.target.value;
                              e.currentTarget.value = '';
                              if (!action) return;
                              lifecycleMutation.mutate({ id: r.id, action });
                            }}
                          >
                            <option value="">Lifecycle…</option>
                            <option value="publish">Опубликовать</option>
                            <option value="hide">Скрыть</option>
                            <option value="archive">Архив</option>
                            <option value="republish">Republish</option>
                          </select>
                        ) : null}
                      </td>
                      {canGovern ? (
                        <td className="px-4 py-2 text-xs max-w-[140px] truncate">
                          {isManual
                            ? r.ownerUser?.fullName || r.ownerUser?.email || '—'
                            : '—'}
                        </td>
                      ) : null}
                      <td className="px-4 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={Boolean(r.isPublished)}
                          disabled={updateMutation.isPending || !canPublish}
                          onChange={(e) =>
                            updateMutation.mutate({ id: r.id, patch: { isPublished: e.target.checked } })
                          }
                        />
                      </td>
                      <td className="px-4 py-2 text-right font-medium">
                        {priceN > 0 ? `${(priceN / 1_000_000).toFixed(1)} млн` : 'Цена по запросу'}
                      </td>
                      <td className="px-4 py-2 text-center">
                        <Link
                          to={publicLinkFor(kind, r.id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary inline-flex justify-center"
                          title="Открыть на сайте"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        {isManual && canManageManual ? (
                          <>
                            <Link
                              to={manualEditPath(kind, r.id)}
                              className="inline-flex p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground mr-1"
                              title="Править"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Link>
                            <button
                              type="button"
                              className="p-1.5 rounded-lg hover:bg-muted text-destructive"
                              title="Удалить"
                              disabled={deleteMutation.isPending}
                              onClick={() => {
                                if (window.confirm(`Удалить объявление #${r.id}?`)) deleteMutation.mutate(r.id);
                              }}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            {(agents?.length ?? 0) > 0 ? (
                              canGovern ? (
                                <select
                                  className="ml-1 h-7 max-w-[150px] rounded-lg border bg-background px-1.5 text-[11px]"
                                  defaultValue=""
                                  disabled={assignMutation.isPending}
                                  title="Назначить владельца (manager+)"
                                  onChange={(e) => {
                                    const ownerUserId = e.target.value;
                                    e.currentTarget.value = '';
                                    if (!ownerUserId) return;
                                    const target = agents?.find((a) => a.id === ownerUserId);
                                    const label = target?.fullName || target?.email || 'сотруднику';
                                    if (window.confirm(`Назначить объявление #${r.id} сотруднику ${label}?`)) {
                                      assignMutation.mutate({ id: r.id, ownerUserId });
                                    }
                                  }}
                                >
                                  <option value="">Назначить…</option>
                                  {(agents ?? []).map((agent) => (
                                    <option key={agent.id} value={agent.id}>
                                      {agent.fullName || agent.email || agent.role}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <select
                                  className="ml-1 h-7 max-w-[150px] rounded-lg border bg-background px-1.5 text-[11px]"
                                  defaultValue=""
                                  disabled={transferMutation.isPending}
                                  title="Передать объект другому сотруднику"
                                  onChange={(e) => {
                                    const targetUserId = e.target.value;
                                    e.currentTarget.value = '';
                                    if (!targetUserId) return;
                                    const target = agents?.find((a) => a.id === targetUserId);
                                    const label = target?.fullName || target?.email || 'сотруднику';
                                    if (window.confirm(`Передать объявление #${r.id} сотруднику ${label}?`)) {
                                      transferMutation.mutate({ id: r.id, targetUserId });
                                    }
                                  }}
                                >
                                  <option value="">Передать…</option>
                                  {(agents ?? []).map((agent) => (
                                    <option key={agent.id} value={agent.id}>
                                      {agent.fullName || agent.email || agent.role}
                                    </option>
                                  ))}
                                </select>
                              )
                            ) : null}
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">Из фида</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {meta && meta.total_pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t text-sm">
              <span className="text-muted-foreground">
                Стр. {meta.page} из {meta.total_pages} · {meta.total} шт.
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-1.5 rounded-lg border hover:bg-muted disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= meta.total_pages}
                  className="p-1.5 rounded-lg border hover:bg-muted disabled:opacity-40"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

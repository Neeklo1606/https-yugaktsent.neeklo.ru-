import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { apiDelete, apiGet, apiPatch, apiPost, ApiError } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';

type FeedRegion = { id: number; code: string; name: string };
type BuildingType = { id: number; name: string };
type BlockOption = { id: number; name: string; regionId: number };
type BuildingAddress = { id: number; street: string | null; house: string | null; housing: string | null };

type BuildingRow = {
  id: number;
  regionId: number;
  blockId: number;
  name: string | null;
  queue: string | null;
  deadline: string | null;
  subsidy: boolean;
  dataSource: 'FEED' | 'MANUAL';
  block: { id: number; name: string; regionId: number };
  region: FeedRegion;
  buildingType: BuildingType | null;
  addresses: BuildingAddress[];
};

type BuildingOptions = {
  regions: FeedRegion[];
  buildingTypes: BuildingType[];
  blocks: BlockOption[];
};

type DraftMap = Record<
  number,
  {
    name?: string | null;
    queue?: string | null;
    deadline?: string | null;
    subsidy?: boolean;
    buildingTypeId?: number | null;
  }
>;

export default function AdminBuildings() {
  const qc = useQueryClient();
  const [regionIdFilter, setRegionIdFilter] = useState<number | ''>('');
  const [blockIdFilter, setBlockIdFilter] = useState<number | ''>('');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<DraftMap>({});

  const [newRegionId, setNewRegionId] = useState<number | ''>('');
  const [newBlockId, setNewBlockId] = useState<number | ''>('');
  const [newBuildingTypeId, setNewBuildingTypeId] = useState<number | ''>('');
  const [newName, setNewName] = useState('');
  const [newQueue, setNewQueue] = useState('');
  const [newDeadline, setNewDeadline] = useState('');
  const [newSubsidy, setNewSubsidy] = useState(false);

  const listQuery = useMemo(() => {
    const p = new URLSearchParams();
    if (regionIdFilter !== '') p.set('region_id', String(regionIdFilter));
    if (blockIdFilter !== '') p.set('block_id', String(blockIdFilter));
    if (search.trim()) p.set('search', search.trim());
    return p.toString();
  }, [regionIdFilter, blockIdFilter, search]);

  const optionsQuery = useMemo(() => {
    const p = new URLSearchParams();
    if (newRegionId !== '') p.set('region_id', String(newRegionId));
    return p.toString();
  }, [newRegionId]);

  const filterOptionsQuery = useMemo(() => {
    const p = new URLSearchParams();
    if (regionIdFilter !== '') p.set('region_id', String(regionIdFilter));
    return p.toString();
  }, [regionIdFilter]);

  const { data: options, isLoading: optionsLoading } = useQuery({
    queryKey: ['admin', 'buildings', 'options', optionsQuery],
    queryFn: () => apiGet<BuildingOptions>(`/admin/buildings/options${optionsQuery ? `?${optionsQuery}` : ''}`),
    staleTime: 60_000,
  });

  const { data: filterOptions } = useQuery({
    queryKey: ['admin', 'buildings', 'filter-options', filterOptionsQuery],
    queryFn: () => apiGet<BuildingOptions>(`/admin/buildings/options${filterOptionsQuery ? `?${filterOptionsQuery}` : ''}`),
    staleTime: 60_000,
  });

  const { data: rows = [], isLoading, error } = useQuery({
    queryKey: ['admin', 'buildings', listQuery],
    queryFn: () => apiGet<BuildingRow[]>(`/admin/buildings${listQuery ? `?${listQuery}` : ''}`),
    staleTime: 10_000,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (newRegionId === '') throw new Error('Выберите регион');
      if (newBlockId === '') throw new Error('Выберите ЖК');
      return apiPost<BuildingRow>('/admin/buildings', {
        regionId: newRegionId,
        blockId: newBlockId,
        buildingTypeId: newBuildingTypeId === '' ? null : newBuildingTypeId,
        name: newName.trim() || null,
        queue: newQueue.trim() || null,
        deadline: newDeadline || null,
        subsidy: newSubsidy,
      });
    },
    onSuccess: async () => {
      setNewBlockId('');
      setNewBuildingTypeId('');
      setNewName('');
      setNewQueue('');
      setNewDeadline('');
      setNewSubsidy(false);
      toast.success('Корпус создан');
      await qc.invalidateQueries({ queryKey: ['admin', 'buildings'] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Ошибка создания'),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const entries = Object.entries(draft);
      for (const [id, patch] of entries) {
        if (!Object.keys(patch).length) continue;
        await apiPatch(`/admin/buildings/${id}`, patch);
      }
    },
    onSuccess: async () => {
      setDraft({});
      toast.success('Изменения сохранены');
      await qc.invalidateQueries({ queryKey: ['admin', 'buildings'] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Ошибка сохранения'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/admin/buildings/${id}`),
    onSuccess: async () => {
      toast.success('Корпус удалён');
      await qc.invalidateQueries({ queryKey: ['admin', 'buildings'] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Ошибка удаления'),
  });

  const getRow = (r: BuildingRow) => {
    const patch = draft[r.id] ?? {};
    return {
      ...r,
      name: patch.name ?? r.name,
      queue: patch.queue ?? r.queue,
      deadline: patch.deadline ?? (r.deadline ? r.deadline.slice(0, 10) : null),
      subsidy: patch.subsidy ?? r.subsidy,
      buildingTypeId: patch.buildingTypeId ?? (r.buildingType?.id ?? null),
    };
  };

  return (
    <div className="p-6 max-w-7xl space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold inline-flex items-center gap-2">
          <Building className="w-6 h-6 text-primary" />
          Корпуса
        </h1>
        <Button
          type="button"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || Object.keys(draft).length === 0}
          className="inline-flex items-center gap-2"
        >
          {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Сохранить
        </Button>
      </div>

      <div className="rounded-xl border p-3 grid grid-cols-1 md:grid-cols-4 gap-2">
        <select
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={regionIdFilter}
          onChange={(e) => {
            const v = e.target.value;
            setRegionIdFilter(v ? Number(v) : '');
            setBlockIdFilter('');
          }}
        >
          <option value="">Все регионы</option>
          {(filterOptions?.regions ?? []).map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={blockIdFilter}
          onChange={(e) => {
            const v = e.target.value;
            setBlockIdFilter(v ? Number(v) : '');
          }}
        >
          <option value="">Все ЖК</option>
          {(filterOptions?.blocks ?? []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <Input
          placeholder="Поиск по названию корпуса"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9"
        />
        <Button
          type="button"
          variant="outline"
          className="h-9"
          onClick={() => {
            setRegionIdFilter('');
            setBlockIdFilter('');
            setSearch('');
          }}
        >
          Сброс
        </Button>
      </div>

      <div className="rounded-xl border p-3 grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Регион</label>
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={newRegionId}
            onChange={(e) => {
              const v = e.target.value;
              setNewRegionId(v ? Number(v) : '');
              setNewBlockId('');
            }}
            disabled={optionsLoading}
          >
            <option value="">Выберите регион</option>
            {(options?.regions ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="text-xs text-muted-foreground mb-1 block">ЖК</label>
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={newBlockId}
            onChange={(e) => {
              const v = e.target.value;
              setNewBlockId(v ? Number(v) : '');
            }}
            disabled={optionsLoading || newRegionId === ''}
          >
            <option value="">Выберите ЖК</option>
            {(options?.blocks ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Тип</label>
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={newBuildingTypeId}
            onChange={(e) => {
              const v = e.target.value;
              setNewBuildingTypeId(v ? Number(v) : '');
            }}
          >
            <option value="">—</option>
            {(options?.buildingTypes ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Название</label>
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Корпус 1" />
        </div>
        <Button type="button" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
          {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Добавить
        </Button>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error instanceof ApiError ? error.message : 'Ошибка загрузки'}
        </div>
      ) : null}

      <div className="rounded-xl border overflow-x-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left p-3 font-medium w-20">ID</th>
                <th className="text-left p-3 font-medium">Название / ЖК</th>
                <th className="text-left p-3 font-medium w-44">Тип</th>
                <th className="text-left p-3 font-medium w-36">Срок сдачи</th>
                <th className="text-left p-3 font-medium w-28">Субсидия</th>
                <th className="text-left p-3 font-medium w-28">Источник</th>
                <th className="text-right p-3 font-medium w-16"> </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const row = getRow(r);
                const editable = r.dataSource === 'MANUAL';
                return (
                  <tr key={r.id} className="border-b last:border-0 align-top">
                    <td className="p-3 font-mono text-xs">{r.id}</td>
                    <td className="p-3 space-y-1">
                      <Input
                        value={row.name ?? ''}
                        placeholder="Без названия"
                        disabled={!editable}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            [r.id]: { ...prev[r.id], name: e.target.value || null },
                          }))
                        }
                      />
                      <div className="text-xs text-muted-foreground">{r.region.name} / {r.block.name}</div>
                    </td>
                    <td className="p-3">
                      <select
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-60"
                        disabled={!editable}
                        value={row.buildingTypeId ?? ''}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            [r.id]: {
                              ...prev[r.id],
                              buildingTypeId: e.target.value ? Number(e.target.value) : null,
                            },
                          }))
                        }
                      >
                        <option value="">—</option>
                        {(options?.buildingTypes ?? []).map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-3">
                      <Input
                        type="date"
                        value={row.deadline ?? ''}
                        disabled={!editable}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            [r.id]: { ...prev[r.id], deadline: e.target.value || null },
                          }))
                        }
                      />
                    </td>
                    <td className="p-3">
                      <label className="inline-flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={row.subsidy}
                          disabled={!editable}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              [r.id]: { ...prev[r.id], subsidy: e.target.checked },
                            }))
                          }
                        />
                        Да
                      </label>
                    </td>
                    <td className="p-3">
                      <span
                        className={`text-xs px-2 py-1 rounded ${
                          r.dataSource === 'MANUAL'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {r.dataSource}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={!editable || deleteMutation.isPending}
                        onClick={() => {
                          if (!window.confirm(`Удалить корпус #${r.id}?`)) return;
                          deleteMutation.mutate(r.id);
                        }}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 ? (
                <tr>
                  <td className="p-8 text-center text-muted-foreground" colSpan={7}>
                    Нет корпусов
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

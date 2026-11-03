import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HardHat, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { apiDelete, apiGet, apiPatch, apiPost, ApiError } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';

type FeedRegion = {
  id: number;
  code: string;
  name: string;
};

type BuilderRow = {
  id: number;
  regionId: number;
  externalId: string | null;
  crmId: string | null;
  name: string;
  dataSource: 'FEED' | 'MANUAL';
  createdAt: string;
  updatedAt: string;
  region: FeedRegion;
};

type DraftMap = Record<number, { name?: string; regionId?: number }>;

export default function AdminBuilders() {
  const qc = useQueryClient();
  const [regionIdFilter, setRegionIdFilter] = useState<number | ''>('');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<DraftMap>({});
  const [newName, setNewName] = useState('');
  const [newRegionId, setNewRegionId] = useState<number | ''>('');

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (regionIdFilter !== '') p.set('region_id', String(regionIdFilter));
    if (search.trim()) p.set('search', search.trim());
    return p.toString();
  }, [regionIdFilter, search]);

  const { data: regions = [], isLoading: regionsLoading } = useQuery({
    queryKey: ['admin', 'regions', 'for-builders'],
    queryFn: () => apiGet<FeedRegion[]>('/admin/regions'),
    staleTime: 60_000,
  });

  const { data: builders = [], isLoading, error } = useQuery({
    queryKey: ['admin', 'builders', query],
    queryFn: () => apiGet<BuilderRow[]>(`/admin/builders${query ? `?${query}` : ''}`),
    staleTime: 10_000,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (newRegionId === '') throw new Error('Выберите регион');
      const name = newName.trim();
      if (!name) throw new Error('Введите название застройщика');
      return apiPost<BuilderRow>('/admin/builders', { regionId: newRegionId, name });
    },
    onSuccess: async () => {
      toast.success('Застройщик создан');
      setNewName('');
      await qc.invalidateQueries({ queryKey: ['admin', 'builders'] });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : 'Ошибка создания');
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const entries = Object.entries(draft);
      for (const [id, patch] of entries) {
        if (!Object.keys(patch).length) continue;
        await apiPatch<BuilderRow>(`/admin/builders/${id}`, patch);
      }
    },
    onSuccess: async () => {
      setDraft({});
      toast.success('Изменения сохранены');
      await qc.invalidateQueries({ queryKey: ['admin', 'builders'] });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : 'Ошибка сохранения');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/admin/builders/${id}`),
    onSuccess: async () => {
      toast.success('Застройщик удалён');
      await qc.invalidateQueries({ queryKey: ['admin', 'builders'] });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : 'Ошибка удаления');
    },
  });

  const getRow = (row: BuilderRow) => {
    const patch = draft[row.id] ?? {};
    return {
      ...row,
      name: patch.name ?? row.name,
      regionId: patch.regionId ?? row.regionId,
    };
  };

  return (
    <div className="p-6 max-w-6xl space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold inline-flex items-center gap-2">
          <HardHat className="w-6 h-6 text-primary" />
          Застройщики
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
          }}
          disabled={regionsLoading}
        >
          <option value="">Все регионы</option>
          {regions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <Input
          placeholder="Поиск по названию"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 md:col-span-2"
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setRegionIdFilter('');
            setSearch('');
          }}
          className="h-9"
        >
          Сброс
        </Button>
      </div>

      <div className="rounded-xl border p-3 grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
        <div className="md:col-span-2">
          <label className="text-xs text-muted-foreground mb-1 block">Название</label>
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Новый застройщик" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Регион</label>
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={newRegionId}
            onChange={(e) => {
              const v = e.target.value;
              setNewRegionId(v ? Number(v) : '');
            }}
            disabled={regionsLoading}
          >
            <option value="">Выберите регион</option>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <Button
          type="button"
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
          className="inline-flex items-center gap-2"
        >
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
                <th className="text-left p-3 font-medium w-24">ID</th>
                <th className="text-left p-3 font-medium">Название</th>
                <th className="text-left p-3 font-medium w-56">Регион</th>
                <th className="text-left p-3 font-medium w-40">Источник</th>
                <th className="text-right p-3 font-medium w-20"> </th>
              </tr>
            </thead>
            <tbody>
              {builders.map((b) => {
                const row = getRow(b);
                const editable = b.dataSource === 'MANUAL';
                return (
                  <tr key={b.id} className="border-b last:border-0">
                    <td className="p-3 font-mono text-xs">{b.id}</td>
                    <td className="p-3">
                      <Input
                        value={row.name}
                        disabled={!editable}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            [b.id]: { ...prev[b.id], name: e.target.value },
                          }))
                        }
                      />
                    </td>
                    <td className="p-3">
                      <select
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-60"
                        value={row.regionId}
                        disabled={!editable}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            [b.id]: { ...prev[b.id], regionId: Number(e.target.value) },
                          }))
                        }
                      >
                        {regions.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-3">
                      <span
                        className={`text-xs px-2 py-1 rounded ${
                          b.dataSource === 'MANUAL'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {b.dataSource}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={!editable || deleteMutation.isPending}
                        onClick={() => {
                          if (!window.confirm(`Удалить застройщика «${b.name}»?`)) return;
                          deleteMutation.mutate(b.id);
                        }}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {builders.length === 0 ? (
                <tr>
                  <td className="p-8 text-center text-muted-foreground" colSpan={5}>
                    Нет застройщиков
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

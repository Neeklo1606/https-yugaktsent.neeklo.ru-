import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminBuilders from '@/admin/pages/AdminBuilders';
import AdminRegions from '@/admin/pages/AdminRegions';
import { cn } from '@/lib/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookA, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { apiDelete, apiGet, apiPatch, apiPost, ApiError } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/shared/hooks/useAuth';

type RefKind = 'room-types' | 'finishings' | 'building-types';
type RefItem = {
  id: number;
  name: string;
  externalId: string | null;
  crmId: string | number | null;
  nameOne?: string | null;
};

type DraftMap = Record<
  number,
  {
    name?: string;
    externalId?: string;
    crmId?: string;
    nameOne?: string;
  }
>;

const kindLabel: Record<RefKind, string> = {
  'room-types': 'Комнатность',
  finishings: 'Отделка',
  'building-types': 'Типы корпусов',
};

function ReferenceLists() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canManage = user?.role === 'admin';
  const [kind, setKind] = useState<RefKind>('room-types');
  const [draft, setDraft] = useState<DraftMap>({});
  const [newName, setNewName] = useState('');
  const [newExternalId, setNewExternalId] = useState('');
  const [newCrmId, setNewCrmId] = useState('');
  const [newNameOne, setNewNameOne] = useState('');

  const isRoomTypes = kind === 'room-types';

  const { data: items = [], isLoading, error } = useQuery({
    queryKey: ['admin', 'reference', kind],
    queryFn: () => apiGet<RefItem[]>(`/admin/reference/${kind}`),
    staleTime: 10_000,
  });

  const createPayload = useMemo(() => ({
    name: newName.trim(),
    externalId: newExternalId.trim() || null,
    crmId: newCrmId.trim() || null,
    ...(isRoomTypes ? { nameOne: newNameOne.trim() || null } : {}),
  }), [isRoomTypes, newCrmId, newExternalId, newName, newNameOne]);

  const createMutation = useMutation({
    mutationFn: () => {
      if (!createPayload.name) throw new Error('Введите name');
      return apiPost(`/admin/reference/${kind}`, createPayload);
    },
    onSuccess: async () => {
      setNewName('');
      setNewExternalId('');
      setNewCrmId('');
      setNewNameOne('');
      toast.success('Элемент добавлен');
      await qc.invalidateQueries({ queryKey: ['admin', 'reference', kind] });
      await qc.invalidateQueries({ queryKey: ['reference'] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Ошибка создания'),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const entries = Object.entries(draft);
      for (const [id, d] of entries) {
        if (!Object.keys(d).length) continue;
        const row = items.find((i) => i.id === Number(id));
        if (!row) continue;
        await apiPatch(`/admin/reference/${kind}/${id}`, {
          name: (d.name ?? row.name).trim(),
          externalId: (d.externalId ?? row.externalId ?? '').trim() || null,
          crmId: (d.crmId ?? String(row.crmId ?? '')).trim() || null,
          ...(isRoomTypes
            ? { nameOne: (d.nameOne ?? (row.nameOne ?? '')).trim() || null }
            : {}),
        });
      }
    },
    onSuccess: async () => {
      setDraft({});
      toast.success('Изменения сохранены');
      await qc.invalidateQueries({ queryKey: ['admin', 'reference', kind] });
      await qc.invalidateQueries({ queryKey: ['reference'] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Ошибка сохранения'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/admin/reference/${kind}/${id}`),
    onSuccess: async () => {
      toast.success('Элемент удалён');
      await qc.invalidateQueries({ queryKey: ['admin', 'reference', kind] });
      await qc.invalidateQueries({ queryKey: ['reference'] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Ошибка удаления'),
  });

  const rowValue = (row: RefItem) => {
    const d = draft[row.id] ?? {};
    return {
      name: d.name ?? row.name,
      externalId: d.externalId ?? (row.externalId ?? ''),
      crmId: d.crmId ?? String(row.crmId ?? ''),
      nameOne: d.nameOne ?? (row.nameOne ?? ''),
    };
  };

  return (
    <div className="p-6 max-w-6xl space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold inline-flex items-center gap-2">
          <BookA className="w-6 h-6 text-primary" />
          Комнатность, отделка, корпуса
        </h1>
        <Button
          type="button"
          onClick={() => saveMutation.mutate()}
          disabled={!canManage || saveMutation.isPending || Object.keys(draft).length === 0}
          className="inline-flex items-center gap-2"
          title={!canManage ? 'Редактирование справочников доступно только администратору' : undefined}
        >
          {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Сохранить
        </Button>
      </div>

      <div className="rounded-xl border p-3 flex flex-wrap gap-2">
        {(Object.keys(kindLabel) as RefKind[]).map((k) => (
          <Button
            key={k}
            type="button"
            variant={k === kind ? 'default' : 'outline'}
            onClick={() => {
              setKind(k);
              setDraft({});
            }}
            className="h-8"
          >
            {kindLabel[k]}
          </Button>
        ))}
      </div>

      <div className="rounded-xl border p-3 grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">name</label>
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} disabled={!canManage} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">external_id</label>
          <Input value={newExternalId} onChange={(e) => setNewExternalId(e.target.value)} disabled={!canManage} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">crm_id</label>
          <Input value={newCrmId} onChange={(e) => setNewCrmId(e.target.value)} disabled={!canManage} />
        </div>
        {isRoomTypes ? (
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">name_one</label>
            <Input value={newNameOne} onChange={(e) => setNewNameOne(e.target.value)} disabled={!canManage} />
          </div>
        ) : (
          <div />
        )}
        <Button type="button" onClick={() => createMutation.mutate()} disabled={!canManage || createMutation.isPending}>
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
                <th className="text-left p-3 font-medium w-16">ID</th>
                <th className="text-left p-3 font-medium">name</th>
                <th className="text-left p-3 font-medium">external_id</th>
                <th className="text-left p-3 font-medium">crm_id</th>
                {isRoomTypes ? <th className="text-left p-3 font-medium">name_one</th> : null}
                <th className="text-right p-3 font-medium w-16"> </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const v = rowValue(item);
                return (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="p-3 font-mono text-xs">{item.id}</td>
                    <td className="p-3">
                      <Input
                        value={v.name}
                        disabled={!canManage}
                        onChange={(e) =>
                          setDraft((prev) => ({ ...prev, [item.id]: { ...prev[item.id], name: e.target.value } }))
                        }
                      />
                    </td>
                    <td className="p-3">
                      <Input
                        value={v.externalId}
                        disabled={!canManage}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            [item.id]: { ...prev[item.id], externalId: e.target.value },
                          }))
                        }
                      />
                    </td>
                    <td className="p-3">
                      <Input
                        value={v.crmId}
                        disabled={!canManage}
                        onChange={(e) =>
                          setDraft((prev) => ({ ...prev, [item.id]: { ...prev[item.id], crmId: e.target.value } }))
                        }
                      />
                    </td>
                    {isRoomTypes ? (
                      <td className="p-3">
                        <Input
                          value={v.nameOne}
                          disabled={!canManage}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              [item.id]: { ...prev[item.id], nameOne: e.target.value },
                            }))
                          }
                        />
                      </td>
                    ) : null}
                    <td className="p-3 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={!canManage || deleteMutation.isPending}
                        onClick={() => {
                          if (!window.confirm(`Удалить элемент #${item.id}?`)) return;
                          deleteMutation.mutate(item.id);
                        }}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 ? (
                <tr>
                  <td className="p-8 text-center text-muted-foreground" colSpan={isRoomTypes ? 6 : 5}>
                    Нет данных
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


const HUB_TABS = [
  { key: 'builders', label: 'Застройщики' },
  { key: 'regions', label: 'Города' },
  { key: 'lists', label: 'Комнатность, отделка, корпуса' },
] as const;
type HubTab = (typeof HUB_TABS)[number]['key'];

/**
 * Справочники одним экраном (как в CRM LiveGrid): застройщики, города и списки,
 * из которых собираются фильтры каталога и карточки квартир.
 */
export default function AdminReference() {
  const [sp, setSp] = useSearchParams();
  const raw = sp.get('tab');
  const tab: HubTab = HUB_TABS.some((t) => t.key === raw) ? (raw as HubTab) : 'builders';
  return (
    <div>
      <div className="px-6 pt-6">
        <h1 className="text-2xl font-bold inline-flex items-center gap-2">
          <BookA className="w-6 h-6 text-primary" />
          Справочники
        </h1>
        <div role="tablist" aria-label="Справочники" className="mt-4 flex flex-wrap gap-1 border-b">
          {HUB_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setSp((prev) => {
                const next = new URLSearchParams(prev);
                next.set('tab', t.key);
                return next;
              }, { replace: true })}
              className={cn(
                '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                tab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'builders' ? <AdminBuilders /> : tab === 'regions' ? <AdminRegions /> : <ReferenceLists />}
    </div>
  );
}

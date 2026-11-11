import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ImagePlus, Loader2, Plus, Save } from 'lucide-react';
import { apiGet, apiPost, apiPostForm, apiUrl, getAccessToken } from '@/lib/api';
import { toast } from '@/components/ui/sonner';

type BlockDetail = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  regionId: number;
  status: string;
  isPromoted?: boolean;
  salesStartDate?: string | null;
  builderId?: number | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  addresses?: { address: string }[];
  images?: { url: string; kind?: string }[];
};

type RegionOpt = { id: number; name: string; code: string; isEnabled?: boolean };
type BuilderOpt = { id: number; name: string; regionId: number };

const numOrEmpty = (v: unknown) => (v == null || v === '' ? '' : String(Number(v)));

async function apiPutJson<T>(path: string, body: unknown): Promise<T> {
  const token = getAccessToken();
  const res = await fetch(apiUrl(path), {
    method: 'PUT',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

export default function AdminBlockEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isNew = id === 'new' || !id;

  const [form, setForm] = useState({
    regionId: 1,
    name: '',
    slug: '',
    description: '',
    status: 'BUILDING',
    isPromoted: false,
    salesStartDate: '' as string,
    builderId: '' as number | '',
    address: '',
    latitude: '',
    longitude: '',
    cover: '',
  });
  const [newBuilder, setNewBuilder] = useState('');
  const [uploading, setUploading] = useState(false);

  const { data: regions = [] } = useQuery({
    queryKey: ['admin', 'regions', 'block-editor'],
    queryFn: () => apiGet<RegionOpt[]>('/admin/regions'),
    staleTime: 60_000,
  });
  const { data: builders = [] } = useQuery({
    queryKey: ['admin', 'builders', 'block-editor', form.regionId],
    queryFn: () => apiGet<BuilderOpt[]>(`/admin/builders?region_id=${form.regionId}`),
    staleTime: 30_000,
  });

  const { data: block, isLoading } = useQuery({
    queryKey: ['admin', 'block', id],
    queryFn: () => apiGet<BlockDetail>(`/admin/blocks/${id}`),
    enabled: !isNew && !!id,
  });

  useEffect(() => {
    if (!block) return;
    const sd = block.salesStartDate;
    const salesStartDate =
      sd && !Number.isNaN(new Date(sd).getTime())
        ? new Date(sd).toISOString().slice(0, 10)
        : '';
    setForm({
      regionId: block.regionId,
      name: block.name,
      slug: block.slug,
      description: block.description ?? '',
      status: block.status,
      isPromoted: !!block.isPromoted,
      salesStartDate,
      builderId: block.builderId ?? '',
      address: block.addresses?.[0]?.address ?? '',
      latitude: numOrEmpty(block.latitude),
      longitude: numOrEmpty(block.longitude),
      cover: block.images?.find((i) => i.kind === 'RENDER')?.url ?? block.images?.[0]?.url ?? '',
    });
  }, [block]);

  const addBuilder = useMutation({
    mutationFn: () => apiPost<BuilderOpt>('/admin/builders', { regionId: form.regionId, name: newBuilder.trim() }),
    onSuccess: (b) => {
      setNewBuilder('');
      setForm((f) => ({ ...f, builderId: b.id }));
      qc.invalidateQueries({ queryKey: ['admin', 'builders'] });
      toast.success(`Застройщик «${b.name}» добавлен`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Не удалось добавить застройщика'),
  });

  const uploadCover = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiPostForm<{ url: string }>('/admin/media/upload', fd);
      // Обложка хранится абсолютной ссылкой (так её ждёт API обложек)
      const url = res.url.startsWith('/') ? `${window.location.origin}${res.url}` : res.url;
      setForm((f) => ({ ...f, cover: url }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось загрузить фото');
    } finally {
      setUploading(false);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        regionId: form.regionId,
        name: form.name.trim(),
        slug: form.slug.trim() || undefined,
        description: form.description.trim() || undefined,
        status: form.status,
        isPromoted: form.isPromoted,
        salesStartDate: form.salesStartDate.trim() ? form.salesStartDate.trim() : null,
        builderId: form.builderId === '' ? null : form.builderId,
        address: form.address,
        ...(form.latitude.trim() && form.longitude.trim()
          ? { latitude: Number(form.latitude.replace(',', '.')), longitude: Number(form.longitude.replace(',', '.')) }
          : {}),
      };
      const saved = isNew
        ? await apiPost<BlockDetail>('/admin/blocks', payload)
        : await apiPutJson<BlockDetail>(`/admin/blocks/${id}`, payload);
      const prevCover = block?.images?.find((i) => i.kind === 'RENDER')?.url ?? block?.images?.[0]?.url ?? '';
      if (form.cover.trim() && form.cover.trim() !== prevCover) {
        await apiPutJson(`/admin/blocks/${saved.id}/cover`, { url: form.cover.trim() });
      }
      return saved;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ['admin', 'blocks'] });
      qc.invalidateQueries({ queryKey: ['admin', 'block'] });
      toast.success('ЖК сохранён');
      navigate(`/admin/blocks/${row.id}`);
    },
  });

  if (!isNew && isLoading) {
    return (
      <div className="p-6 flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <Link
        to="/admin/blocks"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        К списку ЖК
      </Link>

      <h1 className="text-2xl font-bold mb-6">{isNew ? 'Новый ЖК' : `Редактирование: ${form.name}`}</h1>

      <div className="space-y-4 bg-background border rounded-2xl p-6">
        <div>
          <label className="text-xs text-muted-foreground font-medium" htmlFor="be-region">Город</label>
          <select
            id="be-region"
            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-background disabled:opacity-60"
            value={form.regionId}
            disabled={!isNew}
            title={!isNew ? 'Город ЖК меняется вместе с его квартирами — переносом занимается разработчик' : undefined}
            onChange={(e) => setForm((f) => ({ ...f, regionId: Number(e.target.value), builderId: '' }))}
          >
            {regions.length === 0 ? <option value={form.regionId}>#{form.regionId}</option> : null}
            {regions.filter((r) => r.isEnabled !== false || r.id === form.regionId).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium">Название *</label>
          <input
            type="text"
            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium">Slug (пусто — сгенерировать)</label>
          <input
            type="text"
            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
            value={form.slug}
            onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium">Статус</label>
          <select
            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
          >
            <option value="BUILDING">Строится</option>
            <option value="COMPLETED">Сдан</option>
            <option value="PROJECT">Проект</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium">Описание</label>
          <textarea
            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm min-h-[120px]"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium" htmlFor="be-builder">Застройщик</label>
          <select
            id="be-builder"
            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-background"
            value={form.builderId}
            onChange={(e) => setForm((f) => ({ ...f, builderId: e.target.value ? Number(e.target.value) : '' }))}
          >
            <option value="">— не указан —</option>
            {builders.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              className="flex-1 border rounded-lg px-3 py-1.5 text-sm"
              placeholder="Новый застройщик"
              value={newBuilder}
              onChange={(e) => setNewBuilder(e.target.value)}
            />
            <button
              type="button"
              disabled={!newBuilder.trim() || addBuilder.isPending}
              onClick={() => addBuilder.mutate()}
              className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50"
            >
              <Plus className="h-4 w-4" aria-hidden /> Добавить
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Застройщик появится в фильтре каталога, когда у него есть квартиры в продаже.</p>
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium" htmlFor="be-address">Адрес</label>
          <input
            id="be-address"
            type="text"
            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="Анапа, ул. Терская, 88"
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground font-medium" htmlFor="be-lat">Широта</label>
            <input id="be-lat" inputMode="decimal" className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" placeholder="44.8956" value={form.latitude} onChange={(e) => setForm((f) => ({ ...f, latitude: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-medium" htmlFor="be-lng">Долгота</label>
            <input id="be-lng" inputMode="decimal" className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" placeholder="37.3163" value={form.longitude} onChange={(e) => setForm((f) => ({ ...f, longitude: e.target.value }))} />
          </div>
          <p className="col-span-2 -mt-1 text-[11px] text-muted-foreground">Точка ЖК на карте сайта. Координаты можно скопировать из Яндекс.Карт (правый клик → «Что здесь?»).</p>
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium" htmlFor="be-cover">Обложка</label>
          <div className="mt-1 flex items-start gap-3">
            {form.cover ? <img src={form.cover} alt="" className="h-20 w-28 shrink-0 rounded-lg border object-cover" /> : null}
            <div className="flex-1 space-y-2">
              <input id="be-cover" type="url" className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="https://…" value={form.cover} onChange={(e) => setForm((f) => ({ ...f, cover: e.target.value }))} />
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ImagePlus className="h-4 w-4" aria-hidden />}
                Загрузить фото
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => void uploadCover(e.target.files?.[0])} />
              </label>
            </div>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.isPromoted}
            onChange={(e) => setForm((f) => ({ ...f, isPromoted: e.target.checked }))}
          />
          Продвигаемый на главной
        </label>
        <div>
          <label className="text-xs text-muted-foreground font-medium">
            Старт продаж (дата) — для блока «Старт продаж» на главной
          </label>
          <input
            type="date"
            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
            value={form.salesStartDate}
            onChange={(e) => setForm((f) => ({ ...f, salesStartDate: e.target.value }))}
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Очистите поле и сохраните, чтобы сбросить дату. Диапазон дат на главной задаётся в «Главная (блоки)» → «Окно дней».
          </p>
        </div>

        <button
          type="button"
          disabled={!form.name.trim() || saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50"
        >
          {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Сохранить
        </button>
        {saveMutation.isError && (
          <p className="text-sm text-destructive">Ошибка сохранения. Проверьте права (роль editor+) и данные.</p>
        )}
      </div>
    </div>
  );
}

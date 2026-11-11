import ManualLockBanner from '@/admin/components/ManualLockBanner';
import { useEffect, useMemo, useState } from 'react';
import { resolveRoomListingTypeIds } from '@lg/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ImageIcon, Loader2, Plus, X } from 'lucide-react';
import { apiGet, apiPatch, apiPost, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import MediaPickerDialog from '@/admin/components/MediaPickerDialog';
import SellerFields, {
  emptySellerForm,
  normalizeSellerForm,
  sellerFormFromApi,
  type ApiSeller,
  type SellerForm,
} from '@/admin/components/SellerFields';
import { listingStatusOptions, type ListingStatus } from '@/admin/lib/listingStatus';

type RegionRow = { id: number; code: string; name: string };
type RefOpt = { id: number; name: string; nameOne?: string | null; crmId?: string | number | null };
type ApartmentUiKind = 'APARTMENT' | 'ROOM';

export default function AdminManualListing() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isNew = /\/admin\/listings\/manual\/new\/?$/.test(pathname);
  const editM = pathname.match(/\/admin\/listings\/manual\/(\d+)\/edit\/?$/);
  const editNumericId = editM ? Number.parseInt(editM[1], 10) : null;

  const [regionId, setRegionId] = useState<number | ''>('');
  const [blockId, setBlockId] = useState('');
  const [price, setPrice] = useState('');
  const [status, setStatus] = useState<ListingStatus>('DRAFT');
  const [isPublished, setIsPublished] = useState(false);
  const [areaTotal, setAreaTotal] = useState('');
  const [areaKitchen, setAreaKitchen] = useState('');
  const [floor, setFloor] = useState('');
  const [floorsTotal, setFloorsTotal] = useState('');
  const [roomTypeId, setRoomTypeId] = useState('');
  const [finishingId, setFinishingId] = useState('');
  const [planUrl, setPlanUrl] = useState('');
  const [finishingPhotoUrl, setFinishingPhotoUrl] = useState('');
  const [extraPhotoUrls, setExtraPhotoUrls] = useState<string[]>([]);
  const [blockAddress, setBlockAddress] = useState('');
  const [buildingName, setBuildingName] = useState('');
  const [number, setNumber] = useState('');
  const [marketSegment, setMarketSegment] = useState<'auto' | 'NEW_BUILDING' | 'SECONDARY'>('auto');
  const [uiKind, setUiKind] = useState<ApartmentUiKind>('APARTMENT');
  const [seller, setSeller] = useState<SellerForm>(emptySellerForm);
  const [formError, setFormError] = useState('');

  const [picker, setPicker] = useState<null | 'plan' | 'finishing' | 'extra'>(null);

  const { data: regions } = useQuery({
    queryKey: ['regions'],
    queryFn: () => apiGet<RegionRow[]>('/regions'),
    staleTime: 60 * 60 * 1000,
  });

  const regionIdDefault =
    regions?.find((r) => (r.code ?? '').toLowerCase() === 'msk')?.id ?? regions?.[0]?.id;

  const { data: roomTypes } = useQuery({
    queryKey: ['reference', 'room-types'],
    queryFn: () => apiGet<RefOpt[]>('/reference/room-types'),
    staleTime: 60 * 60 * 1000,
  });

  const { data: finishings } = useQuery({
    queryKey: ['reference', 'finishings'],
    queryFn: () => apiGet<RefOpt[]>('/reference/finishings'),
    staleTime: 60 * 60 * 1000,
  });

  const roomListingTypeIds = useMemo(() => resolveRoomListingTypeIds(roomTypes), [roomTypes]);

  const selectableRoomTypes = useMemo(() => {
    if (!roomTypes?.length) return [];
    if (uiKind === 'ROOM') {
      return roomTypes.filter((rt) => roomListingTypeIds.includes(rt.id));
    }
    return roomTypes.filter((rt) => !roomListingTypeIds.includes(rt.id));
  }, [roomTypes, roomListingTypeIds, uiKind]);

  useEffect(() => {
    if (regionId === '' && regionIdDefault != null && isNew) setRegionId(regionIdDefault);
  }, [regionIdDefault, regionId, isNew]);

  const { data: editListing, isLoading: editLoading } = useQuery({
    queryKey: ['listing', 'admin-edit', editNumericId],
    queryFn: () => apiGet<Record<string, unknown>>(`/listings/${editNumericId}`),
    enabled: !isNew && editNumericId != null,
    staleTime: 0,
  });

  useEffect(() => {
    if (!editListing || editNumericId == null) return;
    const src = (editListing.dataSource as string | undefined)?.toUpperCase();
    if (src !== 'MANUAL') {
      setFormError('Редактирование только для объявлений с источником MANUAL');
      return;
    }
    const apt = editListing.apartment as Record<string, unknown> | undefined;
    setRegionId(Number(editListing.regionId) || regionIdDefault || '');
    setBlockId(editListing.blockId != null ? String(editListing.blockId) : '');
    setPrice(editListing.price != null ? String(editListing.price) : '');
    setStatus((editListing.status as ListingStatus) || 'DRAFT');
    setIsPublished(Boolean(editListing.isPublished));
    setSeller(sellerFormFromApi(editListing.seller as ApiSeller));
    const inferredKind =
      editListing.wizardUiKind === 'ROOM' || editListing.wizardUiKind === 'APARTMENT'
        ? (editListing.wizardUiKind as ApartmentUiKind)
        : 'APARTMENT';
    setUiKind(inferredKind);

    if (apt) {
      setAreaTotal(apt.areaTotal != null ? String(apt.areaTotal) : '');
      setAreaKitchen(apt.areaKitchen != null ? String(apt.areaKitchen) : '');
      setFloor(apt.floor != null ? String(apt.floor) : '');
      setFloorsTotal(apt.floorsTotal != null ? String(apt.floorsTotal) : '');
      const rtId =
        apt.roomTypeId ??
        (typeof apt.roomType === 'object' && apt.roomType && 'id' in apt.roomType
          ? (apt.roomType as { id: number }).id
          : undefined);
      setRoomTypeId(rtId != null ? String(rtId) : '');
      const finId =
        apt.finishingId ??
        (typeof apt.finishing === 'object' && apt.finishing && 'id' in apt.finishing
          ? (apt.finishing as { id: number }).id
          : undefined);
      setFinishingId(finId != null ? String(finId) : '');
      setPlanUrl(typeof apt.planUrl === 'string' ? apt.planUrl : '');
      setFinishingPhotoUrl(typeof apt.finishingPhotoUrl === 'string' ? apt.finishingPhotoUrl : '');
      const extra = apt.extraPhotoUrls;
      if (Array.isArray(extra)) {
        setExtraPhotoUrls(extra.filter((u): u is string => typeof u === 'string'));
      } else {
        setExtraPhotoUrls([]);
      }
      setBlockAddress(typeof apt.blockAddress === 'string' ? apt.blockAddress : '');
      setBuildingName(typeof apt.buildingName === 'string' ? apt.buildingName : '');
      setNumber(typeof apt.number === 'string' ? apt.number : '');
      const ms =
        apt.marketSegment === 'NEW_BUILDING' || apt.marketSegment === 'SECONDARY'
          ? (apt.marketSegment as 'NEW_BUILDING' | 'SECONDARY')
          : undefined;
      setMarketSegment(ms ?? 'auto');
    }
  }, [editListing, editNumericId, regionIdDefault]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const rid = typeof regionId === 'number' ? regionId : Number(regionId);
      if (!Number.isFinite(rid)) throw new Error('Выберите регион');
      const p = Number(price.replace(/\s/g, '').replace(',', '.'));
      if (!Number.isFinite(p) || p < 1) throw new Error('Укажите цену');
      const at = Number(areaTotal.replace(',', '.'));
      if (!Number.isFinite(at) || at <= 0) throw new Error('Укажите общую площадь');
      const bid = blockId.trim() ? Number.parseInt(blockId.trim(), 10) : undefined;
      if (blockId.trim() && !Number.isFinite(bid)) throw new Error('Некорректный ID ЖК');

      const apartment: Record<string, unknown> = { areaTotal: at };
      const ak = areaKitchen.trim() ? Number(areaKitchen.replace(',', '.')) : undefined;
      if (ak !== undefined && Number.isFinite(ak)) apartment.areaKitchen = ak;
      const fl = floor.trim() ? Number.parseInt(floor.trim(), 10) : undefined;
      if (fl !== undefined && Number.isFinite(fl)) apartment.floor = fl;
      const ft = floorsTotal.trim() ? Number.parseInt(floorsTotal.trim(), 10) : undefined;
      if (ft !== undefined && Number.isFinite(ft)) apartment.floorsTotal = ft;
      const rt = roomTypeId.trim() ? Number.parseInt(roomTypeId.trim(), 10) : undefined;
      if (rt !== undefined && Number.isFinite(rt)) apartment.roomTypeId = rt;
      const fn = finishingId.trim() ? Number.parseInt(finishingId.trim(), 10) : undefined;
      if (fn !== undefined && Number.isFinite(fn)) apartment.finishingId = fn;
      if (planUrl.trim()) apartment.planUrl = planUrl.trim();
      if (finishingPhotoUrl.trim()) apartment.finishingPhotoUrl = finishingPhotoUrl.trim();
      if (extraPhotoUrls.length) apartment.extraPhotoUrls = extraPhotoUrls;
      else if (!isNew) apartment.extraPhotoUrls = [];

      if (blockAddress.trim()) apartment.blockAddress = blockAddress.trim();
      if (buildingName.trim()) apartment.buildingName = buildingName.trim();
      if (number.trim()) apartment.number = number.trim();
      if (marketSegment !== 'auto') apartment.marketSegment = marketSegment;

      const sellerPayload = normalizeSellerForm(seller);

      if (!isNew && editNumericId != null) {
        const patch: Record<string, unknown> = {
          price: p,
          status,
          isPublished,
          apartment,
          wizardUiKind: uiKind,
        };
        if (blockId.trim() === '') patch.blockId = null;
        else patch.blockId = bid;
        if (sellerPayload) patch.seller = sellerPayload;
        return apiPatch(`/admin/listings/${editNumericId}/manual-apartment`, patch);
      }

      const body: Record<string, unknown> = {
        regionId: rid,
        price: p,
        status,
        isPublished,
        apartment,
        wizardUiKind: uiKind,
      };
      if (bid != null) body.blockId = bid;
      if (sellerPayload) body.seller = sellerPayload;
      return apiPost('/admin/listings/manual-apartment', body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'listings'] });
      navigate('/admin/listings');
    },
    onError: (e: unknown) => {
      let msg = 'Ошибка сохранения';
      if (e instanceof ApiError) {
        try {
          const j = JSON.parse(e.message) as { message?: string | string[] };
          if (Array.isArray(j.message)) msg = j.message.join(', ');
          else if (typeof j.message === 'string') msg = j.message;
          else if (e.message) msg = e.message;
        } catch {
          if (e.message) msg = e.message;
        }
      } else if (e instanceof Error) msg = e.message;
      setFormError(msg);
    },
  });

  const routeOk = isNew || (editNumericId != null && Number.isFinite(editNumericId));
  if (!routeOk) {
    return (
      <div className="p-6">
        <p className="text-sm text-destructive">Некорректный адрес страницы</p>
        <Link to="/admin/listings" className="text-primary text-sm mt-2 inline-block">
          ← К списку
        </Link>
      </div>
    );
  }

  if (!isNew && editLoading && !editListing) {
    return (
      <div className="p-6 flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const manualFields = Array.isArray(editListing?.manualFields) ? (editListing.manualFields as string[]) : [];

  return (
    <div className="p-6 max-w-3xl">
      {!isNew && editNumericId != null ? <ManualLockBanner listingId={editNumericId} fields={manualFields} /> : null}
      <div className="flex items-center gap-3 mb-6">
        <Button type="button" variant="ghost" size="icon" asChild>
          <Link to="/admin/listings" aria-label="Назад">
            <ArrowLeft className="w-5 h-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">
            {isNew
              ? uiKind === 'ROOM'
                ? 'Новая комната'
                : 'Новая ручная квартира'
              : `Редактировать #${editNumericId}`}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Фото планировки, отделки и галерея — только из{' '}
            <Link to="/admin/media" className="text-primary underline-offset-2 hover:underline">
              медиатеки
            </Link>
            .
            {!isNew && editNumericId != null ? (
              <>
                {' '}
                <Link
                  to={`/admin/listings/wizard/${editNumericId}/edit`}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  Открыть в мастере
                </Link>
                {' '}
                (дом, участок и др.).
              </>
            ) : null}
          </p>
        </div>
      </div>

      <div className="space-y-3 bg-background border rounded-2xl p-6">
        {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
        <div className="space-y-1">
          <Label>Регион</Label>
          <select
            className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
            value={regionId === '' ? '' : String(regionId)}
            onChange={(e) => setRegionId(e.target.value ? Number(e.target.value) : '')}
            disabled={!isNew}
          >
            {(regions ?? []).map((reg) => (
              <option key={reg.id} value={reg.id}>
                {reg.name} ({reg.code})
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label>Тип объекта</Label>
          <select
            className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
            value={uiKind}
            onChange={(e) => {
              const next = e.target.value as ApartmentUiKind;
              setUiKind(next);
              if (next === 'ROOM' && roomListingTypeIds[0] != null) {
                setRoomTypeId(String(roomListingTypeIds[0]));
              } else if (next === 'APARTMENT' && roomTypeId && roomListingTypeIds.includes(Number(roomTypeId))) {
                setRoomTypeId('');
              }
            }}
          >
            <option value="APARTMENT">Квартира</option>
            <option value="ROOM">Комната</option>
          </select>
          <p className="text-xs text-muted-foreground">
            Смена квартиры на комнату и обратно. Для дома, участка или коммерции —{' '}
            <Link to="/admin/listings/wizard/new" className="text-primary underline-offset-2 hover:underline">
              мастер добавления
            </Link>
            .
          </p>
        </div>
        <div className="space-y-1">
          <Label>ID ЖК (необязательно)</Label>
          <Input value={blockId} onChange={(e) => setBlockId(e.target.value)} placeholder="Напр. 123" />
        </div>
        <div className="space-y-1">
          <Label>Тип рынка</Label>
          <select
            className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
            value={marketSegment}
            onChange={(e) => setMarketSegment(e.target.value as typeof marketSegment)}
          >
            <option value="auto">По умолчанию (есть ЖК — новостройка, нет — вторичка)</option>
            <option value="NEW_BUILDING">Новостройка</option>
            <option value="SECONDARY">Вторичка</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label>Цена, ₽</Label>
            <Input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="12500000" />
          </div>
          <div className="space-y-1">
            <Label>Статус</Label>
            <select
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background h-10"
              value={status}
              onChange={(e) => setStatus(e.target.value as ListingStatus)}
            >
              {listingStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
          Публиковать на сайте
        </label>
        <div className="space-y-1">
          <Label>{uiKind === 'ROOM' ? 'Площадь комнаты, м² *' : 'Площадь квартиры, м² *'}</Label>
          <Input value={areaTotal} onChange={(e) => setAreaTotal(e.target.value)} placeholder="54.2" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label>Кухня, м²</Label>
            <Input value={areaKitchen} onChange={(e) => setAreaKitchen(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Этаж</Label>
            <Input value={floor} onChange={(e) => setFloor(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1">
          <Label>Этажей в доме</Label>
          <Input value={floorsTotal} onChange={(e) => setFloorsTotal(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label>{uiKind === 'ROOM' ? 'Категория' : 'Комнатность (справочник)'}</Label>
            {uiKind === 'ROOM' ? (
              <Input
                readOnly
                value={selectableRoomTypes[0]?.name ?? 'Комната'}
                className="bg-muted/40"
              />
            ) : (
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background h-10"
                value={roomTypeId}
                onChange={(e) => setRoomTypeId(e.target.value)}
              >
                <option value="">—</option>
                {selectableRoomTypes.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="space-y-1">
            <Label>Отделка</Label>
            <select
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background h-10"
              value={finishingId}
              onChange={(e) => setFinishingId(e.target.value)}
            >
              <option value="">—</option>
              {(finishings ?? []).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-2 border-t pt-4 mt-2">
          <Label>Планировка (медиа)</Label>
          <div className="flex flex-wrap items-center gap-2">
            {planUrl ? (
              <img src={planUrl} alt="" className="h-16 w-16 object-cover rounded-lg border" />
            ) : (
              <span className="text-xs text-muted-foreground">Не выбрано</span>
            )}
            <Button type="button" variant="outline" size="sm" onClick={() => setPicker('plan')}>
              <ImageIcon className="w-4 h-4 mr-1" />
              Выбрать
            </Button>
            {planUrl ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setPlanUrl('')}>
                Сброс
              </Button>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Фото отделки (медиа)</Label>
          <div className="flex flex-wrap items-center gap-2">
            {finishingPhotoUrl ? (
              <img src={finishingPhotoUrl} alt="" className="h-16 w-16 object-cover rounded-lg border" />
            ) : (
              <span className="text-xs text-muted-foreground">Не выбрано</span>
            )}
            <Button type="button" variant="outline" size="sm" onClick={() => setPicker('finishing')}>
              <ImageIcon className="w-4 h-4 mr-1" />
              Выбрать
            </Button>
            {finishingPhotoUrl ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setFinishingPhotoUrl('')}>
                Сброс
              </Button>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Дополнительные фото (вид из окна и т.д.)</Label>
          <div className="flex flex-wrap gap-2 mb-2">
            {extraPhotoUrls.map((u) => (
              <div key={u} className="relative h-16 w-16 rounded-lg border overflow-hidden group">
                <img src={u} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white"
                  onClick={() => setExtraPhotoUrls((prev) => prev.filter((x) => x !== u))}
                  aria-label="Убрать"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setPicker('extra')}>
            <Plus className="w-4 h-4 mr-1" />
            Добавить из медиа
          </Button>
        </div>

        <div className="space-y-1">
          <Label>Адрес объекта</Label>
          <Input value={blockAddress} onChange={(e) => setBlockAddress(e.target.value)} placeholder="г. Москва, ул. ..." />
        </div>
        <div className="space-y-1">
          <Label>Корпус / литер (текст)</Label>
          <Input value={buildingName} onChange={(e) => setBuildingName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>{uiKind === 'ROOM' ? 'Номер комнаты' : 'Номер квартиры'}</Label>
          <Input value={number} onChange={(e) => setNumber(e.target.value)} />
        </div>

        <SellerFields value={seller} onChange={setSeller} />

        <div className="flex gap-2 pt-4 border-t">
          <Button type="button" variant="outline" asChild>
            <Link to="/admin/listings">Отмена</Link>
          </Button>
          <Button
            type="button"
            disabled={saveMutation.isPending}
            onClick={() => {
              setFormError('');
              saveMutation.mutate();
            }}
          >
            {saveMutation.isPending ? 'Сохранение…' : 'Сохранить'}
          </Button>
        </div>
      </div>

      <MediaPickerDialog
        open={picker != null}
        onOpenChange={(o) => !o && setPicker(null)}
        title={
          picker === 'plan'
            ? 'Планировка'
            : picker === 'finishing'
              ? 'Фото отделки'
              : 'Дополнительные фото'
        }
        multiple={picker === 'extra'}
        onPick={(items) => {
          const urls = items.map((i) => i.url);
          if (picker === 'plan') setPlanUrl(urls[0] ?? '');
          else if (picker === 'finishing') setFinishingPhotoUrl(urls[0] ?? '');
          else if (picker === 'extra') {
            setExtraPhotoUrls((prev) => {
              const set = new Set(prev);
              for (const u of urls) set.add(u);
              return Array.from(set);
            });
          }
          setPicker(null);
        }}
      />
    </div>
  );
}

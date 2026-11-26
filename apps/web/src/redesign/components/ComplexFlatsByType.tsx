import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChessboardBuildingMatrix } from '@/redesign/lib/chessboard-api';
import { deadlineQuarter, shortChessPrice, splitBuildingName } from '@/redesign/lib/chessboard-layout';
import { cachedImageUrl, getSafeImageUrl } from '@/redesign/lib/image-media';

type Flat = {
  id: string;
  rooms: number;
  area: number;
  floor: number;
  price: number;
  number: string;
  reserved: boolean;
  house: string;
  deadline: string | null;
  planImage: string | null;
};

const TYPE_DEFS = [
  { key: 0, title: 'Студии' },
  { key: 1, title: '1-комнатные' },
  { key: 2, title: '2-комнатные' },
  { key: 3, title: '3-комнатные' },
  { key: 4, title: '4 комнаты и больше' },
];

const fmtArea = (v: number) => v.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
const fmtRub = (v: number) => `${Math.round(v).toLocaleString('ru-RU')} ₽`;

function offersWord(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'предложение';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'предложения';
  return 'предложений';
}

const PAGE = 20;

type SortKey = 'price' | 'area' | 'floor';

/**
 * «Списком» по всему ЖК, как каталог у застройщика: строка на тип квартир — площади, цены,
 * сколько в продаже. Строка раскрывается списком квартир (по 20, «Показать ещё»).
 * Данные — из шахматки (все квартиры), а не из первой порции списка.
 */
const ComplexFlatsByType = ({
  boards,
  roomFilter,
  housingType,
}: {
  boards: ChessboardBuildingMatrix[];
  roomFilter?: number | null;
  housingType?: string | null;
}) => {
  const flats = useMemo(() => {
    const out: Flat[] = [];
    for (const b of boards) {
      const { group, section } = splitBuildingName(b.name);
      const house = section ? `${group}, ${section.toLowerCase()}` : group;
      const deadline = deadlineQuarter(b.deadline);
      for (const row of b.grid)
        for (const c of row) {
          const a = c.apartment;
          if (!a || a.status === 'sold') continue;
          out.push({
            id: a.id,
            rooms: a.rooms,
            area: a.area,
            floor: a.floor,
            price: a.price,
            number: a.number,
            reserved: a.status === 'reserved',
            house,
            deadline,
            planImage: a.planImage,
          });
        }
    }
    return out;
  }, [boards]);

  const groups = useMemo(
    () =>
      TYPE_DEFS.map((t) => {
        const list = flats.filter((f) => (t.key >= 4 ? f.rooms >= 4 : f.rooms === t.key));
        const prices = list.map((f) => f.price).filter((p) => p > 0);
        const areas = list.map((f) => f.area).filter((a) => a > 0);
        return {
          ...t,
          list,
          priceMin: prices.length ? Math.min(...prices) : 0,
          priceMax: prices.length ? Math.max(...prices) : 0,
          areaMin: areas.length ? Math.min(...areas) : 0,
          areaMax: areas.length ? Math.max(...areas) : 0,
        };
      }).filter((g) => g.list.length > 0),
    [flats],
  );

  const [open, setOpen] = useState<number | null>(null);
  const [shown, setShown] = useState(PAGE);
  const [sort, setSort] = useState<SortKey>('price');
  const effectiveOpen = open ?? (roomFilter != null ? roomFilter : null);

  if (!groups.length) {
    return <p className="rounded-2xl border border-border/70 bg-card p-6 text-center text-sm text-muted-foreground">Свободных квартир сейчас нет</p>;
  }

  const unit = housingType === 'aparthotel' ? 'апартаменты' : 'квартиры';

  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
      <div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)_40px] gap-4 border-b border-border/60 px-5 py-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground md:grid">
        <span>Тип</span>
        <span>Площадь</span>
        <span>Цена</span>
        <span>В продаже</span>
        <span />
      </div>
      {groups.map((g) => {
        const isOpen = effectiveOpen === g.key;
        const sorted = isOpen
          ? [...g.list].sort((a, b) =>
              sort === 'price' ? (a.price || Infinity) - (b.price || Infinity) : sort === 'area' ? a.area - b.area : a.floor - b.floor,
            )
          : [];
        return (
          <div key={g.key} className="border-b border-border/60 last:border-b-0">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => {
                setOpen(isOpen ? -1 : g.key);
                setShown(PAGE);
              }}
              className={cn(
                'grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-4 text-left transition-colors hover:bg-muted/40 sm:px-5 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)_40px]',
                isOpen && 'bg-muted/30',
              )}
            >
              <span className="text-[16px] font-semibold">{g.title}</span>
              <ChevronDown className={cn('h-5 w-5 justify-self-end text-muted-foreground transition-transform md:order-last', isOpen && 'rotate-180')} aria-hidden />
              <span className="col-span-2 text-[14px] text-muted-foreground md:col-span-1 md:text-foreground">
                {g.areaMin === g.areaMax ? `${fmtArea(g.areaMin)} м²` : `${fmtArea(g.areaMin)}–${fmtArea(g.areaMax)} м²`}
              </span>
              <span className="col-span-2 text-[15px] font-semibold tabular-nums md:col-span-1">
                {g.priceMin ? (g.priceMin === g.priceMax ? shortChessPrice(g.priceMin) : `${shortChessPrice(g.priceMin)} – ${shortChessPrice(g.priceMax)}`) : 'по запросу'}
              </span>
              <span className="col-span-2 text-[14px] text-muted-foreground md:col-span-1">
                {g.list.length.toLocaleString('ru-RU')} {offersWord(g.list.length)}
              </span>
            </button>
            {isOpen ? (
              <div className="border-t border-border/50 bg-background px-2 pb-3 pt-2 sm:px-4">
                <div className="mb-2 flex flex-wrap items-center gap-1.5 px-2 text-[13px] text-muted-foreground">
                  Сортировка:
                  {(
                    [
                      ['price', 'по цене'],
                      ['area', 'по площади'],
                      ['floor', 'по этажу'],
                    ] as [SortKey, string][]
                  ).map(([k, l]) => (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={sort === k}
                      onClick={() => setSort(k)}
                      className={cn('min-h-9 rounded-lg px-2.5 font-medium', sort === k ? 'bg-primary/10 text-primary' : 'hover:text-foreground')}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <ul className="divide-y divide-border/50">
                  {sorted.slice(0, shown).map((f) => (
                    <li key={f.id}>
                      <Link
                        to={`/apartment/${f.id}`}
                        className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-muted/50"
                      >
                        <span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40">
                          {f.planImage ? (
                            <img src={cachedImageUrl(getSafeImageUrl(f.planImage))} alt="" loading="lazy" className="max-h-full max-w-full object-contain p-1" />
                          ) : null}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[15px] font-medium">
                            {fmtArea(f.area)} м² · {f.floor} этаж
                            {f.reserved ? <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">бронь</span> : null}
                          </span>
                          <span className="block truncate text-[13px] text-muted-foreground">
                            {f.house}
                            {f.number ? ` · № ${f.number}` : ''}
                            {f.deadline ? ` · сдача ${f.deadline}` : ''}
                          </span>
                        </span>
                        <span className="text-right">
                          <span className="block text-[15px] font-semibold tabular-nums">{f.price ? fmtRub(f.price) : 'по запросу'}</span>
                          {f.price && f.area ? (
                            <span className="block text-[12px] tabular-nums text-muted-foreground">{fmtRub(f.price / f.area)}/м²</span>
                          ) : null}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                {sorted.length > shown ? (
                  <button
                    type="button"
                    onClick={() => setShown((n) => n + PAGE * 2)}
                    className="mt-2 w-full rounded-xl border border-border py-3 text-[14px] font-medium hover:border-primary/50"
                  >
                    Показать ещё · осталось {(sorted.length - shown).toLocaleString('ru-RU')}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
      <p className="px-5 py-3 text-[12px] text-muted-foreground">Все свободные {unit} ЖК по данным застройщика. Нажмите на тип, чтобы увидеть список.</p>
    </div>
  );
};

export default ComplexFlatsByType;

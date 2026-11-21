import { memo } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { ChessboardBuildingMatrix } from '@/redesign/lib/chessboard-api';
import type { Apartment } from '@/redesign/data/types';

type Props = {
  matrix: ChessboardBuildingMatrix;
  isHidden: (apt: Apartment) => boolean;
  roomLabel: (rooms: number) => string;
};

function shortPrice(price: number): string {
  if (!price || price <= 0) return 'по запросу';
  if (price >= 1_000_000) {
    const m = Math.round((price / 1_000_000) * 10) / 10;
    return `${String(m).replace('.', ',')} млн`;
  }
  return `${Math.round(price / 1000)} тыс.`;
}

function area(a: number): string {
  return `${String(Math.round(a * 10) / 10).replace('.', ',')} м²`;
}

/**
 * Шахматка «по этажам»: строка этажа — только реальные квартиры, без пустых клеток.
 * Для ЖК, где в фиде есть лишь свободные лоты (сетка заполнена на 10–30 %), сетка 56×19
 * выглядела пустой; здесь каждый этаж — ряд компактных плашек «2-к · 54 м² · 18,9 млн».
 */
const ChessboardFloorList = memo(function ChessboardFloorList({ matrix, isHidden, roomLabel }: Props) {
  const rows = matrix.floors
    .map((floor, i) => ({
      floor,
      apts: (matrix.grid[i] ?? [])
        .map((c) => c.apartment)
        .filter((a): a is NonNullable<typeof a> => Boolean(a))
        .map((a) => ({ ...a, hidden: isHidden({ ...a, complexId: '', buildingId: '', kitchenArea: 0, totalFloors: 1, finishing: a.finishing as Apartment['finishing'], planImage: a.planImage ?? '', section: a.section } as Apartment) }))
        .sort((a, b) => a.price - b.price),
    }))
    .filter((r) => r.apts.some((a) => !a.hidden));

  if (rows.length === 0) {
    return <p className="p-6 text-center text-sm text-muted-foreground">Нет квартир по выбранным фильтрам</p>;
  }

  return (
    <ol className="max-h-[min(70vh,640px)] divide-y divide-border/60 overflow-y-auto overscroll-contain">
      {rows.map(({ floor, apts }) => (
        <li key={floor} className="flex gap-2 px-2.5 py-2 sm:gap-3 sm:px-4 sm:py-2.5">
          <div className="w-8 shrink-0 pt-1.5 text-[13px] font-semibold tabular-nums text-muted-foreground sm:w-12">
            {floor}
            <span className="ml-0.5 hidden text-[11px] font-normal sm:inline">эт.</span>
          </div>
          <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
            {apts
              .filter((a) => !a.hidden)
              .map((a) => {
                const sold = a.status === 'sold';
                const reserved = a.status === 'reserved';
                const label = `${roomLabel(a.rooms)}, ${area(a.area)}, ${floor} этаж, ${shortPrice(a.price)}${reserved ? ', бронь' : sold ? ', продана' : ''}`;
                const body = (
                  <>
                    <span className="font-semibold">{a.rooms === 0 ? 'Ст' : `${a.rooms}к`}</span>
                    <span className="text-muted-foreground">{area(a.area)}</span>
                    <span className="font-semibold tabular-nums">{shortPrice(a.price)}</span>
                  </>
                );
                const cls = cn(
                  'inline-flex h-8 items-center gap-1 rounded-lg border px-2 text-[12px] transition-[border-color,box-shadow,transform] duration-150 sm:h-9 sm:gap-1.5 sm:px-2.5 sm:text-[13px]',
                  sold
                    ? 'border-transparent bg-muted text-muted-foreground line-through'
                    : reserved
                      ? 'border-amber-300/70 bg-amber-50 text-foreground dark:bg-amber-500/10'
                      : 'border-border bg-background hover:-translate-y-px hover:border-primary/50 hover:shadow-sm',
                );
                return sold ? (
                  <span key={a.id} className={cls} aria-label={label}>
                    {body}
                  </span>
                ) : (
                  <Link key={a.id} to={`/apartment/${a.id}`} className={cls} aria-label={label} title={label}>
                    {body}
                  </Link>
                );
              })}
          </div>
        </li>
      ))}
    </ol>
  );
});

export default ChessboardFloorList;

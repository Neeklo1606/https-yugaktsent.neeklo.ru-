import { useEffect, useId, useState } from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '@/lib/utils';
import {
  POSITION_MAX,
  formatRubles,
  normalizePriceRange,
  parseRubles,
  positionToPrice,
  priceToPosition,
} from '@/redesign/lib/price-scale';

type Props = {
  min?: number;
  max?: number;
  /** Вызывается один раз на действие: отпустили ручку, ушли из поля или нажали Enter */
  onChange: (min?: number, max?: number) => void;
  /** Ползунок под полями. На компактной панели главной — только поля */
  showSlider?: boolean;
  label?: string;
  /** Подпись над полями видна только скринридеру */
  hideLabel?: boolean;
  inputClassName?: string;
  className?: string;
};

const positionsOf = (min?: number, max?: number): [number, number] => [
  min != null ? priceToPosition(min) : 0,
  max != null ? priceToPosition(max) : POSITION_MAX,
];

/**
 * Единый фильтр цены для главной, каталога и карты: поля «от / до» в рублях + ползунок.
 *
 * Значение наружу уходит только по завершении действия, поэтому ввод цифр и
 * перетаскивание не перезапрашивают каталог на каждый символ или пиксель.
 * Ручки ходят по нелинейной шкале (price-scale.ts), не выходят за трек и не меняются местами.
 */
const PriceRangeField = ({ min, max, onChange, showSlider = true, label = 'Цена, ₽', hideLabel = false, inputClassName, className }: Props) => {
  const uid = useId();
  const [draftMin, setDraftMin] = useState(() => formatRubles(min));
  const [draftMax, setDraftMax] = useState(() => formatRubles(max));
  const [pos, setPos] = useState<[number, number]>(() => positionsOf(min, max));

  // Сброс фильтров, кнопка «назад», чипы — подхватываем значение снаружи
  useEffect(() => {
    setDraftMin(formatRubles(min));
    setDraftMax(formatRubles(max));
    setPos(positionsOf(min, max));
  }, [min, max]);

  const commit = (rawMin?: number, rawMax?: number) => {
    const next = normalizePriceRange(rawMin, rawMax);
    setDraftMin(formatRubles(next.min));
    setDraftMax(formatRubles(next.max));
    setPos(positionsOf(next.min, next.max));
    if (next.min !== min || next.max !== max) onChange(next.min, next.max);
  };

  const commitInputs = () => commit(parseRubles(draftMin), parseRubles(draftMax));

  /** Позиция ручки → цена; крайние позиции значат «без ограничения» */
  const fromPositions = ([a, b]: [number, number]) => ({
    min: a <= 0 ? undefined : positionToPrice(a),
    max: b >= POSITION_MAX ? undefined : positionToPrice(b),
  });

  const input = (which: 'min' | 'max') => (
    <div className="relative min-w-0">
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground" aria-hidden>
        {which === 'min' ? 'от' : 'до'}
      </span>
      <input
        id={`${uid}-${which}`}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        enterKeyHint="done"
        aria-label={`${label}: ${which === 'min' ? 'от' : 'до'}`}
        className={cn(
          'h-11 w-full min-w-0 rounded-lg border border-input bg-card pl-8 pr-3 text-[15px] tabular-nums text-foreground outline-none transition-[border-color,box-shadow] focus:border-focus focus:ring-[3px] focus:ring-focus/20',
          inputClassName,
        )}
        value={which === 'min' ? draftMin : draftMax}
        onChange={(e) => {
          const text = e.target.value.replace(/[^\d\s]/g, '');
          const n = parseRubles(text);
          if (which === 'min') {
            setDraftMin(text);
            setPos(([, b]) => [Math.min(n != null ? priceToPosition(n) : 0, b), b]);
          } else {
            setDraftMax(text);
            setPos(([a]) => [a, Math.max(n != null ? priceToPosition(n) : POSITION_MAX, a)]);
          }
        }}
        onBlur={commitInputs}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commitInputs();
          }
        }}
      />
    </div>
  );

  return (
    <fieldset className={cn('min-w-0', className)}>
      <legend className={cn('mb-1.5 block text-[13px] font-medium text-muted-foreground', hideLabel && 'sr-only')}>{label}</legend>
      <div className="grid grid-cols-2 gap-2">
        {input('min')}
        {input('max')}
      </div>
      {showSlider ? (
        <div className="px-2.5 pt-3">
          <SliderPrimitive.Root
            className="relative flex h-6 w-full touch-none select-none items-center"
            min={0}
            max={POSITION_MAX}
            step={1}
            value={pos}
            minStepsBetweenThumbs={10}
            aria-label={label}
            onValueChange={(next) => {
              const pair: [number, number] = [next[0] ?? 0, next[1] ?? POSITION_MAX];
              setPos(pair);
              const live = fromPositions(pair);
              setDraftMin(formatRubles(live.min));
              setDraftMax(formatRubles(live.max));
            }}
            onValueCommit={(next) => {
              const live = fromPositions([next[0] ?? 0, next[1] ?? POSITION_MAX]);
              commit(live.min, live.max);
            }}
          >
            <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-border">
              <SliderPrimitive.Range className="absolute h-full bg-primary" />
            </SliderPrimitive.Track>
            {(['от', 'до'] as const).map((side, i) => (
              <SliderPrimitive.Thumb
                key={side}
                aria-label={`${label}: ${side}`}
                aria-valuetext={formatRubles(positionToPrice(pos[i])) + ' ₽'}
                className="relative block h-6 w-6 rounded-full border-2 border-primary bg-background shadow-[0_1px_4px_rgba(0,0,0,0.18)] transition-shadow before:absolute before:-inset-2.5 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:shadow-[0_2px_8px_rgba(0,0,0,0.25)]"
              />
            ))}
          </SliderPrimitive.Root>
          {/* Опорные точки шкалы: средняя метка стоит там же, где 20 млн на треке */}
          <div className="relative mt-1 h-4 text-[12px] tabular-nums text-muted-foreground" aria-hidden>
            <span className="absolute left-0">0</span>
            <span className="absolute left-[60%] -translate-x-1/2">20 млн</span>
            <span className="absolute right-0">150 млн+</span>
          </div>
        </div>
      ) : null}
    </fieldset>
  );
};

export default PriceRangeField;

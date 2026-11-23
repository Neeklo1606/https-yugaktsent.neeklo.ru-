import { cn } from '@/lib/utils';
import { HOUSING_OPTIONS, type HousingType } from '@/redesign/lib/catalog-housing';

type Props = {
  value: HousingType | null;
  onChange: (next: HousingType | null) => void;
  className?: string;
};

const TABS: ReadonlyArray<{ value: HousingType | null; label: string; hint: string }> = [
  { value: null, label: 'Все', hint: 'Все типы жилья' },
  ...HOUSING_OPTIONS,
];

/**
 * Тип жилья над выдачей: квартиры в ЖК / апартаменты / коттеджи.
 * Сегментный переключатель как у «Рынок» — те же токены и размеры.
 */
const CatalogHousingTabs = ({ value, onChange, className }: Props) => (
  <div
    role="tablist"
    aria-label="Тип жилья"
    className={cn(
      'flex w-full max-w-full overflow-x-auto rounded-lg bg-surface-soft p-1 [scrollbar-width:none] sm:inline-flex sm:w-auto',
      className,
    )}
  >
    {TABS.map((tab) => {
      const selected = value === tab.value;
      return (
        <button
          key={tab.value ?? 'all'}
          type="button"
          role="tab"
          aria-selected={selected}
          title={tab.hint}
          onClick={() => {
            if (!selected) onChange(tab.value);
          }}
          className={cn(
            'h-9 flex-1 shrink-0 whitespace-nowrap rounded-md px-1 text-[13px] font-medium transition-colors min-[400px]:px-3 min-[400px]:text-[14px] sm:flex-none sm:px-4',
            selected ? 'bg-card text-foreground shadow-card' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {tab.label}
        </button>
      );
    })}
  </div>
);

export default CatalogHousingTabs;

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
 * Компактные табы с подчёркиванием — главный выбор над выдачей, визуально отличается
 * от сегмента «ЖК / Квартиры списком». Высота 44 px — палец не промахивается.
 */
const CatalogHousingTabs = ({ value, onChange, className }: Props) => (
  <div
    role="tablist"
    aria-label="Тип жилья"
    className={cn(
      '-mx-4 flex max-w-[calc(100%+2rem)] gap-5 overflow-x-auto border-b border-border px-4 [scrollbar-width:none] [mask-image:linear-gradient(to_right,#000_calc(100%-40px),transparent)] sm:[mask-image:none] sm:mx-0 sm:max-w-full sm:px-0',
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
            '-mb-px h-11 shrink-0 whitespace-nowrap border-b-2 text-[15px] font-medium transition-colors',
            selected ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          {tab.label}
        </button>
      );
    })}
  </div>
);

export default CatalogHousingTabs;

import { useState } from 'react';
import { Home, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ConsultationFlow from '@/redesign/components/ConsultationFlow';
import type { ConsultationContext } from '@/redesign/lib/conversion-cta';
import type { HousingType } from '@/redesign/lib/catalog-housing';

type Props = {
  housing: HousingType;
  regionName?: string | null;
  /** Показать все типы жилья */
  onShowAll: () => void;
};

const COPY: Record<HousingType, { title: string; text: string }> = {
  cottage: {
    title: 'Коттеджные посёлки скоро появятся',
    text: 'Оставьте заявку — подберём вручную.',
  },
  aparthotel: {
    title: 'Апартаментов по этим условиям пока нет',
    text: 'Оставьте заявку — подберём апартаменты вручную.',
  },
  flat: {
    title: 'Квартир по этим условиям пока нет',
    text: 'Оставьте заявку — подберём квартиру вручную.',
  },
};

/** Пустая выдача по типу жилья: вместо «ничего не нашлось» — заявка на ручной подбор. */
const CatalogHousingEmpty = ({ housing, regionName, onShowAll }: Props) => {
  const [open, setOpen] = useState(false);
  const copy = COPY[housing];
  const context: ConsultationContext = {
    surface: 'catalog',
    source: `catalog:housing:${housing}`,
    requestType: 'SELECTION',
    title: 'Подобрать вручную',
    contextFooter: `Каталог · ${copy.title.toLowerCase()}${regionName ? ` · ${regionName}` : ''}`,
  };

  return (
    <div className="rounded-card border border-border bg-card px-5 py-12 text-center">
      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-surface-soft">
        <Home className="h-6 w-6 text-primary" aria-hidden />
      </div>
      <p className="mb-1 text-[17px] font-semibold text-foreground">{copy.title}</p>
      <p className="mx-auto mb-5 max-w-[420px] text-[14px] text-muted-foreground">{copy.text}</p>
      <div className="flex flex-col items-center justify-center gap-2 sm:flex-row">
        <Button onClick={() => setOpen(true)}>
          <MessageCircle className="h-4 w-4" aria-hidden />
          Оставить заявку
        </Button>
        <Button variant="outline" onClick={onShowAll}>
          Показать все типы
        </Button>
      </div>
      <ConsultationFlow open={open} onOpenChange={setOpen} context={context} />
    </div>
  );
};

export default CatalogHousingEmpty;

import { formatArea } from '@/redesign/lib/listing-format';
import { Link } from 'react-router-dom';
import { Building2, Layers, MapPin, Paintbrush, Ruler, ChefHat } from 'lucide-react';
import type { Apartment, Building, ResidentialComplex } from '@/redesign/data/types';
import { cn } from '@/lib/utils';

type SpecItem = {
  icon: typeof Layers;
  label: string;
  value: string;
};

type Props = {
  apartment: Apartment;
  building: Building;
  complex: ResidentialComplex;
  roomLabel: string;
};

function clean(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = String(value).trim();
  if (!t || t === '—' || t === 'undefined') return null;
  return t;
}

const ApartmentCharacteristics = ({ apartment, building, complex, roomLabel }: Props) => {
  const primary: SpecItem[] = [
    { icon: Layers, label: 'Комнатность', value: roomLabel },
    { icon: Ruler, label: 'Общая площадь', value: formatArea(apartment.area) },
    apartment.kitchenArea > 0 ? { icon: ChefHat, label: 'Кухня', value: formatArea(apartment.kitchenArea) } : null,
    apartment.floor > 0
      ? { icon: Building2, label: 'Этаж', value: `${apartment.floor} из ${apartment.totalFloors}` }
      : null,
    { icon: Paintbrush, label: 'Отделка', value: apartment.finishing },
  ].filter((x): x is SpecItem => x != null);

  const objectRows = [
    { label: 'Корпус', value: clean(building.name) },
    { label: 'Секция', value: apartment.section > 0 ? String(apartment.section) : null },
    { label: 'Номер', value: clean(apartment.number) },
    { label: 'Срок сдачи', value: clean(building.deadline) },
    { label: 'Застройщик', value: clean(complex.builder) },
  ].filter((r) => r.value);

  const locationRows = [
    { label: 'ЖК', value: complex.name, href: `/complex/${complex.slug}` },
    { label: 'Адрес', value: clean(complex.address) },
    // Метро не выводим (ТЗ v3); район подписываем как «Локация»
    { label: 'Локация', value: clean(complex.district) },
  ].filter((r): r is { label: string; value: string; href?: string } => Boolean(r?.value));

  return (
    <section id="characteristics" className="scroll-mt-32 space-y-4">
      <div>
        <h2 className="text-lg sm:text-xl font-bold">Характеристики</h2>
        <p className="text-sm text-muted-foreground mt-1">Основные параметры объекта</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {primary.map((item) => (
          <div key={item.label} className="rounded-xl border border-border bg-card p-3 sm:p-4">
            <item.icon className="h-4 w-4 text-muted-foreground mb-2" />
            <p className="text-[11px] text-muted-foreground">{item.label}</p>
            <p className="text-sm font-semibold mt-0.5 capitalize">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <p className="px-4 py-3 text-sm font-semibold border-b border-border bg-muted/20">Объект</p>
          {objectRows.map((row, i) => (
            <div
              key={row.label}
              className={cn(
                'flex justify-between gap-4 px-4 py-2.5 text-sm',
                i > 0 && 'border-t border-border',
              )}
            >
              <span className="text-muted-foreground">{row.label}</span>
              <span className="font-medium text-right">{row.value}</span>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <p className="px-4 py-3 text-sm font-semibold border-b border-border bg-muted/20 flex items-center gap-1.5">
            <MapPin className="h-4 w-4" />
            Расположение
          </p>
          {locationRows.map((row, i) => (
            <div
              key={row.label}
              className={cn(
                'flex justify-between gap-4 px-4 py-2.5 text-sm',
                i > 0 && 'border-t border-border',
              )}
            >
              <span className="text-muted-foreground shrink-0">{row.label}</span>
              {'href' in row && row.href ? (
                <Link to={row.href} className="font-medium text-primary hover:underline text-right">
                  {row.value}
                </Link>
              ) : (
                <span className="font-medium text-right">{row.value}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ApartmentCharacteristics;

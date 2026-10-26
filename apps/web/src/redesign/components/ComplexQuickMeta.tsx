import { Link } from 'react-router-dom';
import { MapPin, Building2 } from 'lucide-react';
import type { ResidentialComplex } from '@/redesign/data/types';

type Props = {
  complex: ResidentialComplex;
  districtCatalogUrl?: string | null;
  subwayCatalogUrl?: string | null;
  className?: string;
};

export default function ComplexQuickMeta({ complex, districtCatalogUrl, className = '' }: Props) {
  const rows: { icon: typeof MapPin; label: string; value: React.ReactNode }[] = [];

  if (complex.address && complex.address !== '—') {
    rows.push({ icon: MapPin, label: 'Адрес', value: complex.address });
  }
  // Метро в Анапе нет и в ТЗ оно запрещено — не выводим, даже если пришло из фида
  if (complex.district && complex.district !== '—') {
    rows.push({
      icon: MapPin,
      label: 'Локация',
      value: districtCatalogUrl ? (
        <Link to={districtCatalogUrl} className="hover:text-primary hover:underline">
          {complex.district}
        </Link>
      ) : (
        complex.district
      ),
    });
  }
  if (complex.builder && complex.builder !== '—') {
    rows.push({ icon: Building2, label: 'Застройщик', value: complex.builder });
  }

  if (rows.length === 0) return null;

  return (
    <div className={`mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-x-6 ${className}`}>
      {rows.map((r) => (
        <div key={r.label} className="flex gap-2 text-sm min-w-0">
          <r.icon className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground leading-none mb-0.5">{r.label}</p>
            <p className="text-foreground/90 leading-snug truncate">{r.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

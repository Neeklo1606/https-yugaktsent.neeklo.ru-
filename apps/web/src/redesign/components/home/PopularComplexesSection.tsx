import { Link } from 'react-router-dom';
import { ArrowRight, MapPin } from 'lucide-react';
import SnapRail from '@/redesign/components/home/SnapRail';
import ComplexOfferCard from '@/redesign/components/ComplexOfferCard';
import type { ResidentialComplex } from '@/redesign/data/types';

/*
 * «Популярные ЖК» — по согласованному референсу (LiveGrid): ровная сетка одинаковых карточек,
 * 4 в ряд на широком экране. Карточка: фото-карусель с точками и «сердечком», название,
 * срок сдачи и адрес, цены «от» по комнатности с отточием, «Квартир N», тег «Новостройки».
 * Метро по ТЗ не используем — вместо строки с метро срок сдачи.
 * Все цифры из каталога: нет данных — строки нет.
 */

type Props = {
  complexes: ResidentialComplex[];
  cityFallback?: string;
  onCoverError: (id: string) => void;
};

const PopularComplexesSection = ({ complexes, cityFallback, onCoverError }: Props) => {
  if (complexes.length === 0) return null;

  return (
    <section className="container-page section-y max-sm:pt-5" aria-labelledby="popular-title">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 sm:mb-5 lg:mb-7">
        <h2 id="popular-title" className="text-section-title max-sm:text-[1.375rem]">
          Популярные ЖК
        </h2>
        <div className="flex items-center gap-2">
          <Link
            to="/map"
            className="hidden h-11 items-center gap-2 rounded-xl border border-primary/70 px-4 text-[15px] font-semibold text-primary transition-colors hover:bg-primary/5 sm:inline-flex"
          >
            <MapPin className="h-4 w-4" aria-hidden />
            На карте
          </Link>
          <Link
            to="/catalog?type=apartments&market=new"
            className="inline-flex h-11 items-center gap-1.5 rounded-xl text-[15px] font-semibold text-primary transition-colors hover:bg-primary/5 max-sm:-mr-2 max-sm:px-2 sm:gap-2 sm:border sm:border-primary/70 sm:px-4"
          >
            <span className="sm:hidden">Все</span>
            <span className="max-sm:hidden">Все предложения</span>
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>

      <SnapRail label="Популярные жилые комплексы" desktopCols={3} wideCols={4}>
        {complexes.map((c, i) => (
          <ComplexOfferCard key={c.id} complex={c} cityFallback={cityFallback} priority={i === 0} onCoverError={() => onCoverError(c.id)} />
        ))}
      </SnapRail>
    </section>
  );
};

export default PopularComplexesSection;

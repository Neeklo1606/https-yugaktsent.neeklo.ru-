import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { ApiConnectionStrip } from '@/components/ApiConnectionStrip';
import RedesignHeader from '@/redesign/components/RedesignHeader';
import HeroBanner from '@/redesign/components/hero/HeroBanner';
import QuickSearch from '@/redesign/components/home/QuickSearch';
import FeaturedComplexCard from '@/redesign/components/home/FeaturedComplexCard';
import SnapRail from '@/redesign/components/home/SnapRail';
import BuyObjectSection from '@/redesign/components/home/BuyObjectSection';
import HomeAboutSection from '@/redesign/components/home/HomeAboutSection';
import LatestNews from '@/components/LatestNews';
import LeadHighlightSection from '@/redesign/components/LeadHighlightSection';
import FooterSection from '@/components/FooterSection';
import { mapApiBlockListRowToResidentialComplex } from '@/redesign/lib/blocks-from-api';
import { useHomeBlocks } from '@/redesign/hooks/useHomeBlocks';
import { useDefaultRegionId } from '@/redesign/hooks/useDefaultRegionId';

/**
 * Главная (ТЗ redesign v3, 4.2–4.8): первый экран → быстрый поиск → популярные ЖК →
 * купить квартиру → о компании с экспертом → новости → заявка → подвал.
 * Сняты с главной: «Горячие предложения» и «Старт продаж» (дублировали ЖК и показывали
 * карточки без фото), квиз (вызывается кнопкой «Подобрать объект»), карта (есть в нижнем меню).
 */
const RedesignIndex = () => {
  const blocks = useHomeBlocks();
  const { data: regionId, rows: regionRows } = useDefaultRegionId();
  const cityName = regionRows?.find((r) => r.id === regionId)?.name;

  // ЖК, у которых фото битое на стороне источника: на главной их не показываем (ТЗ v3, 4.4)
  const [brokenCovers, setBrokenCovers] = useState<ReadonlySet<string>>(() => new Set());
  const markBroken = useCallback((id: string) => setBrokenCovers((prev) => (prev.has(id) ? prev : new Set(prev).add(id))), []);

  const candidates = useMemo(() => {
    const rows = blocks.data?.data ?? [];
    // В подборку — только ЖК с квартирами в продаже и с настоящим фото. Без фото — в каталоге, не здесь
    const pool = rows.filter((b) => (b._count?.listings ?? 0) > 0 && (b.images?.length ?? 0) > 0);
    const promoted = pool.filter((b) => b.isPromoted);
    return (promoted.length >= 3 ? promoted : pool)
      .slice()
      .sort((a, z) => (z._count?.listings ?? 0) - (a._count?.listings ?? 0))
      .slice(0, 8)
      .map(mapApiBlockListRowToResidentialComplex);
  }, [blocks.data]);
  const featured = candidates.filter((c) => !brokenCovers.has(c.id)).slice(0, 6);

  return (
    <div className="min-h-screen bg-background pb-mobile-nav">
      <RedesignHeader />
      <ApiConnectionStrip />
      <main id="main">
      <HeroBanner />
      <QuickSearch />

      {featured.length > 0 && (
        <section className="container-page section-y" aria-labelledby="popular-title">
          <div className="mb-4 flex items-end justify-between gap-4 lg:mb-6">
            <h2 id="popular-title" className="text-section-title">
              Популярные ЖК
            </h2>
            <Link to="/catalog?type=apartments&market=new" className="inline-flex shrink-0 items-center gap-1 text-[15px] font-medium text-primary hover:underline underline-offset-4">
              Все ЖК
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <SnapRail label="Популярные жилые комплексы" desktopCols={featured.length >= 3 ? 3 : 2}>
            {featured.map((c, i) => (
              <FeaturedComplexCard key={c.id} complex={c} cityFallback={cityName} priority={i === 0} onCoverError={() => markBroken(c.id)} />
            ))}
          </SnapRail>
        </section>
      )}

      <BuyObjectSection />
      <HomeAboutSection />
      <LatestNews />
      <LeadHighlightSection />
      </main>
      <FooterSection />
    </div>
  );
};

export default RedesignIndex;

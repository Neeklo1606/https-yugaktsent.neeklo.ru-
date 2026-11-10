import { useCallback, useMemo, useState } from 'react';
import { ApiConnectionStrip } from '@/components/ApiConnectionStrip';
import RedesignHeader from '@/redesign/components/RedesignHeader';
import HeroBanner from '@/redesign/components/hero/HeroBanner';
import QuickSearch from '@/redesign/components/home/QuickSearch';
import PopularComplexesSection from '@/redesign/components/home/PopularComplexesSection';
import BuyObjectSection from '@/redesign/components/home/BuyObjectSection';
import HomeApartmentsSection from '@/redesign/components/home/HomeApartmentsSection';
import HomeAboutSection from '@/redesign/components/home/HomeAboutSection';
import LatestNews from '@/components/LatestNews';
import LeadHighlightSection from '@/redesign/components/LeadHighlightSection';
import FooterSection from '@/components/FooterSection';
import { mapApiBlockListRowToResidentialComplex } from '@/redesign/lib/blocks-from-api';
import { useHomeBlocks } from '@/redesign/hooks/useHomeBlocks';
import { useDefaultRegionId } from '@/redesign/hooks/useDefaultRegionId';

/**
 * Главная: первый экран → быстрый поиск → популярные ЖК → квартиры в продаже →
 * купить квартиру по комнатности → о компании с экспертом → новости → заявка → подвал.
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
      .slice(0, 12)
      .map(mapApiBlockListRowToResidentialComplex);
  }, [blocks.data]);
  const featured = candidates.filter((c) => !brokenCovers.has(c.id)).slice(0, 7);

  return (
    <div className="min-h-screen bg-background pb-mobile-nav">
      <RedesignHeader />
      <ApiConnectionStrip />
      <main id="main">
      <HeroBanner />
      <QuickSearch />

      <PopularComplexesSection complexes={featured} cityFallback={cityName} onCoverError={markBroken} />

      <HomeApartmentsSection />
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

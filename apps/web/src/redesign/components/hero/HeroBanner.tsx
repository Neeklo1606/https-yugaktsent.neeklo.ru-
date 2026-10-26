import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import StableMediaFrame from '@/redesign/components/StableMediaFrame';
import ConsultationFlow from '@/redesign/components/ConsultationFlow';
import { useSiteSettings, settingOptional } from '@/redesign/hooks/useSiteSettings';
import { useSiteBrand } from '@/redesign/hooks/useSiteBrand';
import { parseHomeBanners, visibleHomeBanners, type HomeBanner } from '@/redesign/lib/home-banners';
import { useHomeBlocks } from '@/redesign/hooks/useHomeBlocks';
import { formatDisplayPrice } from '@/redesign/lib/display-price';
import { btnClass } from '@/redesign/lib/button-styles';
import { usePrefersReducedMotion } from '@/shared/hooks/usePrefersReducedMotion';

const AUTOPLAY_MS = 6500;
/** Ниже этого сдвига палец считаем дрожанием, а не свайпом */
const SWIPE_THRESHOLD_PX = 50;

function isExternal(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

/**
 * Первый экран: слайдер комплексов. На телефоне невысокий, чтобы сразу под ним был поиск.
 * Слайды заводятся в админке («Главная: баннеры»), текст лежит на тёмном
 * градиенте слева — читаемость не зависит от того, какое фото загрузили.
 */
const HeroBanner = () => {
  const { data: settings, isLoading: settingsLoading } = useSiteSettings();
  const { shortName } = useSiteBrand();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [consultOpen, setConsultOpen] = useState(false);
  const touchStartX = useRef<number | null>(null);

  // Пока баннеры не заведены в админке, листать нечего. Вместо пустого
  // экрана показываем жилые комплексы с их настоящими фото: это реальные
  // данные каталога, а не выдуманная заглушка. Запрос общий с блоком
  // «Популярные ЖК» — он уже в кэше, второй раз в сеть не ходим.
  const { data: blocksData, isLoading: blocksLoading } = useHomeBlocks();
  /** Слайды с битым фото у источника: пропускаем, а не показываем заглушку на первом экране */
  const [brokenSlides, setBrokenSlides] = useState<ReadonlySet<string>>(() => new Set());

  const slides = useMemo<HomeBanner[]>(() => {
    const fromSettings = visibleHomeBanners(parseHomeBanners(settingOptional(settings, 'home_banners')));
    if (fromSettings.length > 0) return fromSettings;

    const withPhoto = (blocksData?.data ?? []).filter((b) => b.images?.[0]?.url && b.slug && !brokenSlides.has(b.slug));
    if (withPhoto.length > 0) {
      return withPhoto.slice(0, 5).map((b) => {
        const priceFrom = formatDisplayPrice(b.listingPriceMin ?? null);
        return {
          id: b.slug,
          image: b.images![0].url,
          tag: 'Новостройки Анапы',
          title: b.name,
          subtitle: priceFrom ? `Квартиры ${priceFrom.toLowerCase().startsWith('от') ? '' : 'от '}${priceFrom}` : '',
          buttonText: 'Смотреть комплекс',
          buttonLink: `/complex/${b.slug}`,
          consultButtonText: '',
          enabled: true,
        } satisfies HomeBanner;
      });
    }

    // Ни баннеров, ни фото у комплексов — один экран из общих настроек.
    return [
      {
        id: 'default',
        image: settingOptional(settings, 'about_platform_image') ?? '',
        tag: '',
        title: settingOptional(settings, 'site_title') ?? shortName,
        subtitle: settingOptional(settings, 'meta_description') ?? '',
        buttonText: 'Открыть каталог',
        buttonLink: '/catalog',
        consultButtonText: 'Получить консультацию',
        enabled: true,
      },
    ];
  }, [settings, shortName, blocksData, brokenSlides]);

  const total = slides.length;
  const go = useCallback((next: number) => setIndex(((next % total) + total) % total), [total]);
  const reducedMotion = usePrefersReducedMotion();
  /** Слайды, чьё фото уже можно грузить: текущий и следующий. Остальные не конкурируют с первым кадром */
  const [warmed, setWarmed] = useState<Set<number>>(() => new Set([0, 1]));

  useEffect(() => {
    if (index >= total) setIndex(0);
    setWarmed((prev) => (prev.has(index) && prev.has((index + 1) % total) ? prev : new Set([...prev, index, (index + 1) % total])));
  }, [index, total]);

  useEffect(() => {
    if (total < 2 || paused || consultOpen || reducedMotion) return;
    const t = setInterval(() => setIndex((prev) => (prev + 1) % total), AUTOPLAY_MS);
    return () => clearInterval(t);
  }, [total, paused, consultOpen, reducedMotion]);

  const active = slides[Math.min(index, total - 1)];
  const heroHeight = 'h-[clamp(420px,64svh,540px)] sm:h-[clamp(480px,70svh,640px)] lg:h-[min(calc(100svh-72px),720px)]';
  // Пока не знаем, что показывать, держим место той же высоты: без запасного слайда и прыжка вёрстки
  if (settingsLoading || blocksLoading) {
    return <section aria-busy="true" aria-label="Загрузка" className={cn('relative w-full animate-pulse bg-graphite', heroHeight)} />;
  }
  if (!active) return null;

  /** Фото ни на одном слайде — растягивать на высоту экрана нечего. */
  const hasAnyImage = slides.some((s) => Boolean(s.image));
  /** Слайд-комплекс без баннера из админки: второе действие — подбор, а не абстрактная консультация */
  const secondaryLabel = active.consultButtonText || 'Подобрать объект';

  const primaryCta = active.buttonText && active.buttonLink
    ? isExternal(active.buttonLink)
      ? (
        <a href={active.buttonLink} target="_blank" rel="noopener noreferrer" className={btnClass('inverse', { className: 'w-full sm:w-auto sm:px-6' })}>
          {active.buttonText}
          <ArrowRight />
        </a>
      )
      : (
        <Link to={active.buttonLink} className={btnClass('inverse', { className: 'w-full sm:w-auto sm:px-6' })}>
          {active.buttonText}
          <ArrowRight />
        </Link>
      )
    : null;

  return (
    <section
      className={cn(
        'relative w-full overflow-hidden bg-graphite',
        // Телефон: заметно ниже прежнего «во весь экран» — смысл и кнопки видны сразу, ниже уже поиск
        hasAnyImage ? heroHeight : 'min-h-[380px] lg:min-h-[520px]',
      )}
      aria-roledescription="carousel"
      aria-label="Жилые комплексы"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const start = touchStartX.current;
        touchStartX.current = null;
        if (start == null || total < 2) return;
        const delta = (e.changedTouches[0]?.clientX ?? start) - start;
        if (Math.abs(delta) < SWIPE_THRESHOLD_PX) return;
        go(delta < 0 ? index + 1 : index - 1);
      }}
    >
      {/* Слайды лежат стопкой и меняются прозрачностью: высота не скачет */}
      {slides.map((slide, i) => (
        <div
          key={slide.id}
          aria-hidden={i !== index}
          className={cn(
            'absolute inset-0 transition-opacity duration-500 ease-out',
            i === index ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
        >
          {slide.image && warmed.has(i) ? (
            <StableMediaFrame
              src={slide.image}
              altContext={slide.title || 'Баннер'}
              decorative
              loading={i === 0 ? 'eager' : 'lazy'}
              fetchPriority={i === 0 ? 'high' : 'low'}
              fixedHeightClass="h-full w-full"
              className="h-full w-full"
              onImageError={() => {
                if (!slide.buttonLink?.startsWith('/complex/')) return;
                setBrokenSlides((prev) => new Set(prev).add(slide.id));
              }}
            />
          ) : null}
        </div>
      ))}

      {/* Скрим: на телефоне снизу (там текст), на десктопе — слева */}
      <div className="absolute inset-0 bg-gradient-to-t from-graphite/90 via-graphite/45 to-graphite/5 lg:bg-gradient-to-r lg:from-graphite/80 lg:via-graphite/40 lg:to-transparent" aria-hidden />

      <div className="container-page relative z-10 flex h-full flex-col justify-end pb-12 lg:justify-center lg:pb-0">
        <div className="max-w-[680px]">
          {active.tag ? <p className="text-overline mb-2 text-white/75 lg:mb-3">{active.tag}</p> : null}
          {active.title ? <h1 className="text-display text-white">{active.title}</h1> : null}
          {active.subtitle ? (
            <p className="mt-2 max-w-[560px] text-[16px] leading-snug text-white/85 tabular-nums sm:mt-3 sm:text-lg">{active.subtitle}</p>
          ) : null}

          {/* Телефон: одна главная кнопка и тихая текстовая вторая — не две равные плашки */}
          <div className="mt-5 flex flex-col gap-1 sm:mt-7 sm:flex-row sm:gap-3">
            {primaryCta}
            <button
              type="button"
              onClick={() => setConsultOpen(true)}
              className={cn(
                btnClass('inverseOutline', { className: 'sm:px-6' }),
                'max-sm:border-transparent max-sm:bg-transparent max-sm:backdrop-blur-none max-sm:underline max-sm:underline-offset-4',
              )}
            >
              {secondaryLabel}
            </button>
          </div>
        </div>
      </div>

      {total > 1 ? (
        <div className="absolute bottom-6 right-4 z-20 flex items-center gap-1 sm:right-5 lg:bottom-auto lg:right-8 lg:top-1/2 lg:-translate-y-1/2 lg:flex-col">
          <button type="button" aria-label="Предыдущий комплекс" onClick={() => go(index - 1)} className="hidden h-11 w-11 items-center justify-center rounded-full border border-white/30 bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/25 lg:flex">
            <ChevronLeft className="h-5 w-5 lg:rotate-90" />
          </button>
          <p className="min-w-[3.25rem] text-center text-[13px] font-medium tabular-nums text-white/85" aria-live="polite">
            {index + 1} / {total}
          </p>
          <button type="button" aria-label="Следующий комплекс" onClick={() => go(index + 1)} className="hidden h-11 w-11 items-center justify-center rounded-full border border-white/30 bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/25 lg:flex">
            <ChevronRight className="h-5 w-5 lg:rotate-90" />
          </button>
        </div>
      ) : null}

      <ConsultationFlow
        open={consultOpen}
        onOpenChange={setConsultOpen}
        context={{ surface: 'home', source: 'hero', title: active.consultButtonText || 'Подобрать объект', requestType: active.consultButtonText ? 'CONSULTATION' : 'SELECTION' }}
      />
    </section>
  );
};

export default HeroBanner;

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { complexMinPrice } from '@/redesign/lib/card-visual';
import { mapApiBlockListRowToResidentialComplex } from '@/redesign/lib/blocks-from-api';
import { btnClass } from '@/redesign/lib/button-styles';
import { usePrefersReducedMotion } from '@/shared/hooks/usePrefersReducedMotion';
import { SERVICE_AREA_GENITIVE } from '@/shared/lib/service-area';
import { useHomeBlocksTotals } from '@/redesign/hooks/useHomeBlocks';

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
const HeroBanner = ({ search }: { search?: ReactNode }) => {
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
        // «от» считаем той же функцией, что карточки ЖК и каталог — цена везде одна
        const minPrice = complexMinPrice(mapApiBlockListRowToResidentialComplex(b));
        const priceFrom = minPrice != null ? formatDisplayPrice(minPrice) : null;
        return {
          id: b.slug,
          image: b.images![0].url,
          // Город берём у самого ЖК: раньше у всех слайдов было «Новостройки Анапы», в том числе у майкопских
          tag: b.region?.name ? `Новостройки · ${b.region.name}` : 'Новостройки',
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
  /**
   * Слайды, чьё фото уже можно грузить. Сначала только текущий — он и есть LCP;
   * следующий подтягиваем через паузу, чтобы он не делил канал с первым кадром.
   */
  const [warmed, setWarmed] = useState<Set<number>>(() => new Set([0]));

  useEffect(() => {
    if (index >= total) setIndex(0);
    setWarmed((prev) => (prev.has(index) ? prev : new Set([...prev, index])));
    if (total < 2) return;
    const t = window.setTimeout(() => {
      const next = (index + 1) % total;
      setWarmed((prev) => (prev.has(next) ? prev : new Set([...prev, next])));
    }, 2500);
    return () => window.clearTimeout(t);
  }, [index, total]);

  useEffect(() => {
    if (total < 2 || paused || consultOpen || reducedMotion) return;
    const t = setInterval(() => setIndex((prev) => (prev + 1) % total), AUTOPLAY_MS);
    return () => clearInterval(t);
  }, [total, paused, consultOpen, reducedMotion]);

  const active = slides[Math.min(index, total - 1)];
  const totals = useHomeBlocksTotals();
  const heroSubline = totals
    ? `${totals.cities.join(', ')} · ${totals.complexes} ЖК и ${totals.flats.toLocaleString('ru-RU')} квартир от застройщиков`
    : 'Анапа, Новороссийск, Краснодар, Майкоп — квартиры от застройщиков';
  /**
   * Высота от видимой высоты экрана (svh — без прыжков панели Safari), а не фиксированные пиксели.
   * На десктопе первый экран = шапка 72 px + баннер + панель поиска (наезжает на баннер на 48 px,
   * сама ~160 px): баннер = 100svh − 196 px, чтобы поиск целиком помещался без прокрутки.
   * На телефоне баннер ~треть экрана (240–300 px): под ним компактный поиск и уже первые карточки ЖК —
   * объекты видны без прокрутки (аудит 19.11, сравнение с ЦИАН).
   */
  const heroHeight =
    'h-[clamp(240px,36svh,300px)] sm:h-[clamp(420px,60svh,560px)] lg:h-[clamp(560px,calc(100svh-72px),820px)]';
  /**
   * Десктоп (20.11): поиск по центру баннера на весь экран, как у Аякса; слайд ЖК — строкой внизу слева.
   * Телефон и планшет: прежняя раскладка, поиск под баннером (variant="below").
   */
  const centerSearch = search ? (
    <div className="pointer-events-none absolute inset-0 z-30 hidden lg:flex lg:flex-col lg:items-center lg:justify-center lg:px-8">
      <div className="pointer-events-auto flex w-full flex-col items-center gap-5 text-center">
        <div>
          <p className="text-display text-white">Квартиры в новостройках юга</p>
          <p className="mt-2 text-lg text-white/85 tabular-nums">{heroSubline}</p>
        </div>
        {search}
      </div>
    </div>
  ) : null;
  // Пока не знаем, что показывать, держим место той же высоты: без запасного слайда и прыжка вёрстки
  if (settingsLoading || blocksLoading) {
    return (
      <section aria-busy="true" aria-label="Загрузка" className={cn('relative w-full bg-graphite', heroHeight)}>
        <div className="absolute inset-0 animate-pulse bg-graphite" aria-hidden />
        {centerSearch}
      </section>
    );
  }
  if (!active) return null;

  /** Фото ни на одном слайде — растягивать на высоту экрана нечего. */
  const hasAnyImage = slides.some((s) => Boolean(s.image));
  /** Слайд-комплекс без баннера из админки: второе действие — подбор, а не абстрактная консультация */
  const secondaryLabel = active.consultButtonText || 'Подобрать объект';

  const primaryCta = active.buttonText && active.buttonLink
    ? isExternal(active.buttonLink)
      ? (
        <a href={active.buttonLink} target="_blank" rel="noopener noreferrer" className={btnClass('inverse', { className: 'max-sm:h-11 max-sm:px-4 sm:px-6' })}>
          {active.buttonText}
          <ArrowRight />
        </a>
      )
      : (
        <Link to={active.buttonLink} className={btnClass('inverse', { className: 'max-sm:h-11 max-sm:px-4 sm:px-6' })}>
          {active.buttonText}
          <ArrowRight />
        </Link>
      )
    : null;

  return (
    <section
      className={cn(
        // overflow-hidden только у слоя слайдов: подсказки поиска выпадают за край баннера
        'relative w-full bg-graphite',
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
      <div className="absolute inset-0 overflow-hidden">
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
              sizes="100vw"
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
      </div>

      {/* Скрим: на телефоне снизу (там текст); на десктопе ровное затемнение — по центру поиск и заголовок */}
      <div className={cn('absolute inset-0 bg-gradient-to-t from-graphite/90 via-graphite/45 to-graphite/5', search ? 'lg:bg-none lg:bg-graphite/55' : 'lg:bg-gradient-to-r lg:from-graphite/80 lg:via-graphite/40 lg:to-transparent')} aria-hidden />

      <div className={cn('container-page relative z-10 flex h-full flex-col justify-end pb-9 sm:pb-12 lg:justify-center lg:pb-0', search && 'lg:hidden')}>
        <div className="max-w-[680px]">
          {active.tag ? <p className="text-overline mb-1 text-white/75 sm:mb-2 lg:mb-3">{active.tag}</p> : null}
          {/* Один стабильный H1 страницы для поиска и скринридеров; заголовок слайда меняется каждые несколько секунд */}
          <h1 className="sr-only">Новостройки {SERVICE_AREA_GENITIVE} — агентство недвижимости {shortName}</h1>
          {active.title ? <p className="text-display line-clamp-2 text-white max-sm:text-[1.625rem]" aria-live="off">{active.title}</p> : null}
          {active.subtitle ? (
            <p className="mt-1 max-w-[560px] text-[15px] leading-snug text-white/85 tabular-nums sm:mt-3 sm:text-lg">{active.subtitle}</p>
          ) : null}

          {/* Телефон: компактная главная кнопка и рядом тихая текстовая вторая — в одну строку */}
          <div className="mt-3 flex flex-row flex-wrap items-center gap-x-3 gap-y-1 sm:mt-7 sm:gap-3">
            {primaryCta}
            <button
              type="button"
              onClick={() => setConsultOpen(true)}
              className={cn(
                btnClass('inverseOutline', { className: 'sm:px-6' }),
                'max-sm:h-11 max-sm:border-transparent max-sm:bg-transparent max-sm:px-0 max-sm:text-[14px] max-sm:backdrop-blur-none max-sm:underline max-sm:underline-offset-4',
              )}
            >
              {secondaryLabel}
            </button>
          </div>
        </div>
      </div>

      {centerSearch}

      {/* Десктоп с поиском по центру: текущий ЖК — тихой строкой внизу слева */}
      {search ? (
        <div className="absolute bottom-6 left-0 right-0 z-20 hidden lg:block">
          <div className="container-page flex items-end justify-between gap-6">
            {active.buttonLink ? (
              <Link
                to={active.buttonLink}
                className="group inline-flex max-w-[620px] items-center gap-3 rounded-xl bg-graphite/55 px-4 py-2.5 text-white backdrop-blur-sm transition-colors hover:bg-graphite/75"
              >
                <span className="min-w-0">
                  {active.tag ? <span className="block text-[12px] text-white/70">{active.tag}</span> : null}
                  <span className="block truncate text-[17px] font-semibold">
                    {active.title}
                    {active.subtitle ? <span className="font-normal text-white/80"> · {active.subtitle}</span> : null}
                  </span>
                </span>
                <ArrowRight className="h-5 w-5 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            ) : <span />}
          </div>
        </div>
      ) : null}

      {total > 1 ? (
        <div
          className={cn(
            'absolute right-4 top-3 z-20 flex items-center gap-1 sm:bottom-6 sm:right-5 sm:top-auto',
            // С поиском по центру стрелки справа налезали на карточку на 1024 px — уводим вниз, в строку с ЖК
            search ? 'lg:right-8' : 'lg:bottom-auto lg:right-8 lg:top-1/2 lg:-translate-y-1/2 lg:flex-col',
          )}
        >
          <button type="button" aria-label="Предыдущий комплекс" onClick={() => go(index - 1)} className="hidden h-11 w-11 items-center justify-center rounded-full border border-white/30 bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/25 lg:flex">
            <ChevronLeft className={cn('h-5 w-5', !search && 'lg:rotate-90')} />
          </button>
          <p className="min-w-[3.25rem] rounded-full text-center text-[13px] font-medium tabular-nums text-white/85 max-sm:bg-graphite/45 max-sm:px-2 max-sm:py-0.5 max-sm:backdrop-blur-sm" aria-live="polite">
            {index + 1} / {total}
          </p>
          <button type="button" aria-label="Следующий комплекс" onClick={() => go(index + 1)} className="hidden h-11 w-11 items-center justify-center rounded-full border border-white/30 bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/25 lg:flex">
            <ChevronRight className={cn('h-5 w-5', !search && 'lg:rotate-90')} />
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

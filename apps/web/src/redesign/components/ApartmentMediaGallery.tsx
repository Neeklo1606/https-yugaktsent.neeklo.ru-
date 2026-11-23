import { useCallback, useEffect, useMemo, useState } from 'react';
import { cachedImageUrl } from '@/redesign/lib/image-media';
import { ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import StableMediaFrame from '@/redesign/components/StableMediaFrame';
import { prefersReducedMotion } from '@/redesign/lib/map-sidebar-scroll-utils';

export type MediaTab = 'plan' | 'photos' | 'finishing';

export type MediaItem = {
  src: string;
  label: string;
  tab: MediaTab;
};

type Props = {
  planSrc?: string | null;
  finishingSrc?: string | null;
  gallerySrcs?: string[];
  title: string;
};

function isValidSrc(src?: string | null): src is string {
  return Boolean(src && !src.endsWith('/placeholder.svg'));
}

const ApartmentMediaGallery = ({ planSrc, finishingSrc, gallerySrcs = [], title }: Props) => {
  const items = useMemo(() => {
    const list: MediaItem[] = [];
    if (isValidSrc(planSrc)) list.push({ src: planSrc, label: 'Планировка', tab: 'plan' });
    gallerySrcs.filter(isValidSrc).forEach((src, i) => {
      list.push({ src, label: `Фото ${i + 1}`, tab: 'photos' });
    });
    if (isValidSrc(finishingSrc)) list.push({ src: finishingSrc, label: 'Отделка', tab: 'finishing' });
    return list;
  }, [planSrc, finishingSrc, gallerySrcs]);

  const tabs = useMemo(() => {
    const set = new Set<MediaTab>();
    items.forEach((it) => set.add(it.tab));
    const order: MediaTab[] = ['plan', 'photos', 'finishing'];
    return order.filter((t) => set.has(t));
  }, [items]);

  const [activeTab, setActiveTab] = useState<MediaTab>(() => tabs[0] ?? 'plan');
  const [indexInTab, setIndexInTab] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const tabItems = useMemo(() => items.filter((it) => it.tab === activeTab), [items, activeTab]);

  useEffect(() => {
    if (!tabs.includes(activeTab) && tabs[0]) setActiveTab(tabs[0]);
  }, [tabs, activeTab]);

  useEffect(() => {
    setIndexInTab(0);
  }, [activeTab]);

  const current = tabItems[indexInTab] ?? tabItems[0] ?? items[0];

  const prev = useCallback(() => {
    if (tabItems.length <= 1) return;
    setIndexInTab((i) => (i - 1 + tabItems.length) % tabItems.length);
  }, [tabItems.length]);

  const next = useCallback(() => {
    if (tabItems.length <= 1) return;
    setIndexInTab((i) => (i + 1) % tabItems.length);
  }, [tabItems.length]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false);
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxOpen, prev, next]);

  const tabLabel: Record<MediaTab, string> = {
    plan: 'План',
    photos: 'Фото',
    finishing: 'Отделка',
  };

  if (items.length === 0) {
    return (
      <section id="gallery" className="scroll-mt-28 rounded-2xl border border-border bg-card overflow-hidden">
        <StableMediaFrame
          src={null}
          altContext={title}
          aspect="16/9"
          fallback="branded"
          className="w-full"
        />
      </section>
    );
  }

  const animate = !prefersReducedMotion();

  return (
    <>
      {/* С ПК тянется на высоту карточки справа — первый экран без «ступеньки» */}
      <section id="gallery" className="scroll-mt-28 rounded-2xl border border-border bg-card overflow-hidden lg:flex lg:h-full lg:flex-col">
        {tabs.length > 1 ? (
          <div className="flex gap-1 border-b border-border bg-muted/30 p-1.5">
            {tabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors sm:text-sm',
                  activeTab === tab
                    ? 'bg-background shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {tabLabel[tab]}
                {tab === 'photos' && gallerySrcs.length > 0 ? (
                  <span className="ml-1 text-muted-foreground">({gallerySrcs.length})</span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}

        <div
          className={cn(
            'relative aspect-[4/3] max-h-[min(520px,70vh)] sm:aspect-[16/10] lg:aspect-auto lg:max-h-none lg:min-h-[420px] lg:flex-1',
            // Планировки — на белом фоне: серые поля вокруг белой картинки выглядели как рамка
            activeTab === 'plan' ? 'bg-white dark:bg-muted' : 'bg-muted',
          )}
        >
          {current ? (
            <>
              <StableMediaFrame
                src={current.src}
                altContext={current.label}
                aspect="none"
                fallback="branded"
                loading="eager"
                fetchPriority={indexInTab === 0 ? 'high' : undefined}
                className="h-full w-full"
                imgClassName={cn(
                  'h-full w-full',
                  activeTab === 'plan' ? 'object-contain p-4 sm:p-8' : 'object-cover',
                )}
              />
              <button
                type="button"
                onClick={() => setLightboxOpen(true)}
                className="absolute top-3 right-3 flex items-center gap-1 rounded-lg border border-border/70 bg-background/90 h-9 px-3 text-xs font-medium backdrop-blur-sm hover:bg-background"
              >
                <Maximize2 className="h-3.5 w-3.5" />
                На весь экран
              </button>
              {tabItems.length > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={prev}
                    className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-2 backdrop-blur-sm hover:bg-background"
                    aria-label="Предыдущее"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={next}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-2 backdrop-blur-sm hover:bg-background"
                    aria-label="Следующее"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {tabItems.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setIndexInTab(i)}
                        className={cn(
                          'h-2 rounded-full transition-all',
                          i === indexInTab ? 'w-5 bg-primary' : 'w-2 bg-primary/40',
                          !animate && 'transition-none',
                        )}
                        aria-label={`Слайд ${i + 1}`}
                      />
                    ))}
                  </div>
                </>
              ) : null}
            </>
          ) : null}
        </div>
        {tabItems.length > 1 ? (
          <div className="flex gap-1.5 overflow-x-auto border-t border-border/60 bg-muted/20 p-2 scrollbar-hide">
            {tabItems.map((item, i) => (
              <button
                key={`${item.src}-${i}`}
                type="button"
                onClick={() => setIndexInTab(i)}
                className={cn(
                  'relative h-12 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition-all sm:h-14 sm:w-20',
                  i === indexInTab ? 'border-primary' : 'border-transparent opacity-70 hover:opacity-100',
                )}
                aria-label={item.label}
              >
                <img src={cachedImageUrl(item.src)} alt="" className="h-full w-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {lightboxOpen && current ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 cursor-zoom-out"
            aria-label="Закрыть"
            onClick={() => setLightboxOpen(false)}
          />
          <div className="relative z-10 max-h-full w-full max-w-5xl rounded-2xl bg-background p-3 shadow-2xl">
            <div className="mb-2 flex items-center justify-between gap-3 px-1">
              <p className="text-sm font-medium">{current.label}</p>
              <button type="button" className="text-sm text-muted-foreground hover:text-foreground" onClick={() => setLightboxOpen(false)}>
                Закрыть
              </button>
            </div>
            <img src={cachedImageUrl(current.src)} alt={current.label} className="max-h-[82vh] w-full rounded-xl object-contain" />
          </div>
        </div>
      ) : null}
    </>
  );
};

export default ApartmentMediaGallery;

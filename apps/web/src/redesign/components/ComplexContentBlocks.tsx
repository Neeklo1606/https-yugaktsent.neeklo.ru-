import { useState } from 'react';
import { ChevronDown, Maximize2, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { videoEmbed } from '@/redesign/lib/complex-content';

/**
 * Генплан: интерактивный 3D, если застройщик дал ссылку на него, иначе картинка.
 * 3D грузим по нажатию — тяжёлый iframe не должен тормозить страницу.
 */
export function ComplexMasterplan({ name, imageUrl, url3d }: { name: string; imageUrl: string | null; url3d: string | null }) {
  const [show3d, setShow3d] = useState(false);
  if (url3d && (show3d || !imageUrl)) {
    return show3d ? (
      <div className="overflow-hidden rounded-2xl border border-border/70 bg-muted">
        <iframe
          title={`Генплан ЖК «${name}» в 3D`}
          src={url3d}
          className="aspect-[16/10] w-full border-0"
          loading="lazy"
          allow="fullscreen; xr-spatial-tracking"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
    ) : (
      <button
        type="button"
        onClick={() => setShow3d(true)}
        className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-border/70 bg-brand-soft text-[15px] font-semibold text-primary"
      >
        <Maximize2 className="h-6 w-6" aria-hidden />
        Открыть 3D-генплан
      </button>
    );
  }
  if (!imageUrl) return null;
  return (
    <figure className="space-y-2">
      <a
        href={imageUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="group relative block overflow-hidden rounded-2xl border border-border/70 bg-muted"
        aria-label="Открыть генплан крупно"
      >
        <img src={imageUrl} alt={`Генеральный план ЖК «${name}»`} loading="lazy" decoding="async" className="max-h-[560px] w-full object-contain" />
        <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-1.5 text-[12px] font-medium shadow-sm">
          <Maximize2 className="h-3.5 w-3.5" aria-hidden /> Крупно
        </span>
      </a>
      {url3d ? (
        <button type="button" onClick={() => setShow3d(true)} className="text-[13px] font-medium text-primary hover:underline">
          Открыть 3D-генплан
        </button>
      ) : null}
    </figure>
  );
}

/** Видеообзоры: плеер VK / YouTube / Rutube по нажатию, остальное — ссылкой */
export function ComplexVideos({ name, videos }: { name: string; videos: string[] }) {
  const [playing, setPlaying] = useState<number | null>(null);
  const items = videos.map((url) => ({ url, embed: videoEmbed(url) }));
  if (!items.length) return null;
  return (
    <div className={cn('grid gap-4', items.length > 1 && 'md:grid-cols-2')}>
      {items.map((v, i) =>
        v.embed ? (
          <div key={v.url} className="overflow-hidden rounded-2xl border border-border/70 bg-black">
            {playing === i ? (
              <iframe
                title={`Видеообзор ЖК «${name}»${items.length > 1 ? ` — ${i + 1}` : ''}`}
                src={`${v.embed.embedUrl}${v.embed.embedUrl.includes('?') ? '&' : '?'}autoplay=1`}
                className="aspect-video w-full border-0"
                allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <button
                type="button"
                onClick={() => setPlaying(i)}
                className="flex aspect-video w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-neutral-800 to-neutral-950 text-white"
                aria-label={`Смотреть видеообзор ЖК «${name}»`}
              >
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/15 backdrop-blur">
                  <Play className="ml-1 h-7 w-7 fill-white" aria-hidden />
                </span>
                <span className="text-[14px] font-medium">
                  Видеообзор{items.length > 1 ? ` ${i + 1}` : ''} ·{' '}
                  {v.embed.provider === 'vk' ? 'VK Видео' : v.embed.provider === 'youtube' ? 'YouTube' : 'Rutube'}
                </span>
              </button>
            )}
          </div>
        ) : (
          <a
            key={v.url}
            href={v.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-4 text-[15px] font-medium hover:border-primary/50"
          >
            <Play className="h-5 w-5 text-primary" aria-hidden /> Смотреть видеообзор
          </a>
        ),
      )}
    </div>
  );
}

/** Частые вопросы — раскрывающиеся строки, первые открыты не все, чтобы блок не был простынёй */
export function ComplexFaq({ items }: { items: { q: string; a: string }[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? items : items.slice(0, 6);
  return (
    <div className="space-y-3">
      <div className="divide-y divide-border/70 rounded-2xl border border-border/70 bg-card">
        {visible.map((x, i) => (
          <details key={i} className="group px-4 sm:px-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-[15px] font-medium [&::-webkit-details-marker]:hidden">
              {x.q}
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <p className="pb-4 text-[14px] leading-relaxed text-muted-foreground">{x.a}</p>
          </details>
        ))}
      </div>
      {items.length > visible.length ? (
        <button type="button" onClick={() => setShowAll(true)} className="text-[14px] font-medium text-primary hover:underline">
          Ещё вопросы ({items.length - visible.length})
        </button>
      ) : null}
    </div>
  );
}

import { useState } from 'react';
import { Play } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = { videoId: string; title: string; className?: string };

/**
 * Видео без цены для первой загрузки: до клика это картинка-превью,
 * тяжёлый iframe YouTube подключается только по нажатию (ТЗ v3, 4.7 и 7).
 */
const LazyYouTube = ({ videoId, title, className }: Props) => {
  const [active, setActive] = useState(false);
  return (
    <div className={cn('relative aspect-video overflow-hidden rounded-card bg-graphite', className)}>
      {active ? (
        <iframe
          className="absolute inset-0 h-full w-full"
          src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&rel=0`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <button type="button" onClick={() => setActive(true)} className="group absolute inset-0 h-full w-full" aria-label={`Смотреть видео: ${title}`}>
          <img
            src={`https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100"
          />
          <span className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-foreground shadow-overlay transition-transform group-hover:scale-105">
            <Play className="ml-1 h-7 w-7" fill="currentColor" aria-hidden />
          </span>
        </button>
      )}
    </div>
  );
};

export default LazyYouTube;

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { expertInitials, expertPhotoSources } from './expert-profile';

type Props = {
  name: string;
  photoUrl?: string;
  className?: string;
  /** Ширина портрета в макете — для выбора копии из srcset */
  sizes?: string;
  /** Портрет на первом экране страницы эксперта — грузим сразу */
  priority?: boolean;
};

/**
 * Портрет эксперта. Пока заказчик не прислал фото — спокойная плашка с инициалами:
 * чужое лицо или стоковое фото вместо реального человека недопустимо.
 */
const ExpertAvatar = ({ name, photoUrl, className, sizes = '160px', priority = false }: Props) => {
  const [failed, setFailed] = useState(false);
  const showPhoto = !!photoUrl && !failed;
  const sources = expertPhotoSources(photoUrl);
  return (
    <div
      className={cn(
        'relative shrink-0 overflow-hidden rounded-card bg-surface-soft ring-1 ring-inset ring-border',
        className,
      )}
    >
      {showPhoto ? (
        <picture>
          {sources.webp ? <source type="image/webp" srcSet={sources.webp} sizes={sizes} /> : null}
          <img
            src={photoUrl}
            srcSet={sources.jpg}
            sizes={sources.jpg ? sizes : undefined}
            alt={name}
            width={1280}
            height={1920}
            className="h-full w-full object-cover object-top"
            onError={() => setFailed(true)}
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : undefined}
            decoding="async"
          />
        </picture>
      ) : (
        <span
          aria-label={`${name}: фото появится позже`}
          role="img"
          className="flex h-full w-full items-center justify-center text-[clamp(1.5rem,6vw,2.25rem)] font-semibold tracking-tight text-primary"
        >
          {expertInitials(name)}
        </span>
      )}
    </div>
  );
};

export default ExpertAvatar;

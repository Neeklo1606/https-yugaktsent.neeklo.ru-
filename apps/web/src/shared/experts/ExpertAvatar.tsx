import { useState } from 'react';
import { cn } from '@/lib/utils';
import { expertInitials } from './expert-profile';

type Props = { name: string; photoUrl?: string; className?: string };

/**
 * Портрет эксперта. Пока заказчик не прислал фото — спокойная плашка с инициалами:
 * чужое лицо или стоковое фото вместо реального человека недопустимо.
 */
const ExpertAvatar = ({ name, photoUrl, className }: Props) => {
  const [failed, setFailed] = useState(false);
  const showPhoto = !!photoUrl && !failed;
  return (
    <div
      className={cn(
        'relative shrink-0 overflow-hidden rounded-card bg-surface-soft ring-1 ring-inset ring-border',
        className,
      )}
    >
      {showPhoto ? (
        <img
          src={photoUrl}
          alt={name}
          className="h-full w-full object-cover object-top"
          onError={() => setFailed(true)}
          decoding="async"
        />
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

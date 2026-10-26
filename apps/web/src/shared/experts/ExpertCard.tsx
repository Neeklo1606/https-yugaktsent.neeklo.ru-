import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import ExpertAvatar from './ExpertAvatar';
import { expertPath, type ExpertProfile } from './expert-profile';

type Props = {
  expert: ExpertProfile;
  /** row — строка для блока «О компании» на главной; card — карточка в сетке «Команда» */
  variant?: 'row' | 'card';
  className?: string;
};

/** Карточка эксперта: вся карточка — ссылка на его персональную страницу */
const ExpertCard = ({ expert, variant = 'card', className }: Props) => (
  <Link
    to={expertPath(expert.slug)}
    className={cn(
      'surface-card group flex gap-4 p-4 transition-[box-shadow,border-color] hover:border-primary/30 hover:shadow-raised sm:p-5',
      variant === 'card' ? 'flex-row items-center sm:flex-col sm:items-start' : 'flex-row items-center',
      className,
    )}
  >
    <ExpertAvatar
      name={expert.fullName}
      photoUrl={expert.photoUrl}
      className={variant === 'card' ? 'h-20 w-20 sm:h-auto sm:w-full sm:aspect-[4/5]' : 'h-16 w-16'}
    />
    <div className="min-w-0 flex-1">
      <p className="text-[17px] font-semibold leading-snug text-foreground">{expert.fullName}</p>
      <p className="mt-1 line-clamp-2 text-[14px] leading-snug text-muted-foreground">{expert.role}</p>
      {expert.experience ? <p className="mt-2 text-[13px] font-medium text-foreground/80">{expert.experience}</p> : null}
      <span className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-medium text-primary">
        Персональная страница
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </span>
    </div>
  </Link>
);

export default ExpertCard;

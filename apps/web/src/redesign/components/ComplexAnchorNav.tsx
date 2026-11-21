import { cn } from '@/lib/utils';

export type ComplexSection = { id: string; label: string };

type Props = {
  sections: ComplexSection[];
  activeId: string;
  onNavigate: (id: string) => void;
  /** Справа на десктопе: цена и кнопка — вместо длинной боковой колонки */
  aside?: React.ReactNode;
};

const ComplexAnchorNav = ({ sections, activeId, onNavigate, aside }: Props) => {
  if (sections.length === 0) return null;

  return (
    <nav
      // Шапка: 64 px на телефоне, 72 px + граница на десктопе — меню не должно уходить под неё
      className="sticky top-16 z-30 -mx-4 mb-5 flex items-center gap-4 border-b border-border/60 bg-background/95 px-4 backdrop-blur-md lg:top-[73px]"
      aria-label="Разделы комплекса"
    >
      <div className="flex min-w-0 flex-1 gap-0 overflow-x-auto scrollbar-hide">
        {sections.map(({ id, label }) => {
          const active = activeId === id;
          return (
            <a
              key={id}
              href={`#${id}`}
              onClick={(e) => {
                e.preventDefault();
                onNavigate(id);
              }}
              className={cn(
                'relative shrink-0 px-3.5 py-3.5 text-[14px] font-medium transition-colors whitespace-nowrap select-none',
                active
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground/80',
              )}
            >
              {label}
              <span
                className={cn(
                  'absolute bottom-0 left-3 right-3 h-[2px] rounded-full bg-primary transition-all duration-200 origin-center',
                  active ? 'opacity-100 scale-x-100' : 'opacity-0 scale-x-0',
                )}
                aria-hidden
              />
            </a>
          );
        })}
      </div>
      {aside ? <div className="hidden shrink-0 items-center gap-3 py-1.5 lg:flex">{aside}</div> : null}
    </nav>
  );
};

export default ComplexAnchorNav;

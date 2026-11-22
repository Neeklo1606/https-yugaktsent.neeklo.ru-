import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Building2, ExternalLink, Hash, Plus, Search } from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import { apiGet } from '@/lib/api';
import { adminNavForRole } from '@/admin/lib/admin-nav';
import { useAuth } from '@/shared/hooks/useAuth';

type BlockHit = { id: number; name: string; slug: string };

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * Быстрый поиск по админке (⌘K / Ctrl+K): разделы меню, частые действия, ЖК по названию
 * и переход к квартире по номеру. Как поиск в современных приложениях — без мыши.
 */
export default function AdminCommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const sections = useMemo(() => adminNavForRole(user?.role).flatMap((g) => g.items), [user?.role]);
  const term = q.trim();
  const isNumber = /^\d{1,7}$/.test(term);

  const { data: blocks = [] } = useQuery({
    queryKey: ['admin', 'palette', 'blocks', term],
    queryFn: async () => (await apiGet<{ data: BlockHit[] }>(`/blocks?search=${encodeURIComponent(term)}&per_page=6`)).data,
    enabled: open && term.length >= 2 && !isNumber,
    staleTime: 30_000,
  });

  const go = (to: string, external = false) => {
    setOpen(false);
    setQ('');
    if (external) window.open(to, '_blank', 'noopener');
    else navigate(to);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-9 min-w-[260px] items-center gap-2 rounded-lg border bg-muted/40 px-3 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground md:inline-flex"
        aria-label="Быстрый поиск по админке"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">Поиск: раздел, ЖК, № квартиры</span>
        <kbd className="rounded border bg-background px-1.5 py-0.5 text-[11px] font-medium">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-xl border hover:bg-muted md:hidden"
        aria-label="Быстрый поиск по админке"
      >
        <Search className="h-5 w-5" />
      </button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        // Точное вхождение слова, а не буквы вразброс: «серд» не должно находить «Эксперты»
        filter={(value, search) => (value.toLowerCase().includes(search.trim().toLowerCase()) ? 1 : 0)}
      >
        <CommandInput value={q} onValueChange={setQ} placeholder="Раздел, название ЖК или номер квартиры…" />
        <CommandList>
          <CommandEmpty>Ничего не нашлось</CommandEmpty>
          {isNumber ? (
            <CommandGroup heading="Квартира">
              <CommandItem value={`site-${term}`} onSelect={() => go(`/apartment/${term}`, true)}>
                <Hash className="mr-2 h-4 w-4" />
                Открыть квартиру № {term} на сайте
              </CommandItem>
            </CommandGroup>
          ) : null}
          {blocks.length > 0 ? (
            <CommandGroup heading="Жилые комплексы">
              {blocks.map((b) => (
                <CommandItem key={b.id} value={`block-${b.id}-${b.name}`} onSelect={() => go(`/admin/blocks/${b.id}`)}>
                  <Building2 className="mr-2 h-4 w-4" />
                  {b.name}
                  <CommandShortcut
                    onClick={(e) => {
                      e.stopPropagation();
                      go(`/complex/${b.slug}`, true);
                    }}
                  >
                    на сайте ↗
                  </CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          <CommandGroup heading="Разделы">
            {sections.map((s) => (
              <CommandItem key={s.to} value={`${s.label} ${s.to}`} onSelect={() => go(s.to)}>
                <s.icon className="mr-2 h-4 w-4" />
                {s.label}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Действия">
            <CommandItem value="добавить фид новый фид" onSelect={() => go('/admin/data-sources#add-feed')}>
              <Plus className="mr-2 h-4 w-4" />
              Добавить фид
            </CommandItem>
            <CommandItem value="добавить новость написать новость" onSelect={() => go('/admin/news')}>
              <Plus className="mr-2 h-4 w-4" />
              Написать новость
            </CommandItem>
            <CommandItem value="открыть сайт главная" onSelect={() => go('/', true)}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Открыть сайт
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}

import { Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Menu, MessageCircle, Phone, Send, Users, X, Youtube } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSiteSettings, settingOptional } from '@/redesign/hooks/useSiteSettings';
import { useSiteBrand } from '@/redesign/hooks/useSiteBrand';
import { telHref } from '@/lib/contact-links';
import MobileTabBar from '@/redesign/components/MobileTabBar';
import ConsultationFlow from '@/redesign/components/ConsultationFlow';
import { btnClass } from '@/redesign/lib/button-styles';

/** Пять пунктов меню по согласованным макетам. */
const NAV_ITEMS: { label: string; href: string; match: (path: string, search: string) => boolean }[] = [
  {
    label: 'Каталог недвижимости',
    href: '/catalog',
    match: (p, s) => p.startsWith('/catalog') && !s.includes('market=new'),
  },
  {
    label: 'Новостройки',
    href: '/catalog?type=apartments&market=new',
    match: (p, s) => p.startsWith('/catalog') && s.includes('market=new'),
  },
  { label: 'О компании', href: '/about', match: (p) => p.startsWith('/about') },
  { label: 'Новости', href: '/news', match: (p) => p.startsWith('/news') },
  { label: 'Контакты', href: '/contacts', match: (p) => p.startsWith('/contacts') },
];

/** Только в мобильном меню: в шапке десктопа хватает пяти пунктов */
const MOBILE_EXTRA_ITEMS: typeof NAV_ITEMS = [
  { label: 'Карта', href: '/map', match: (p) => p.startsWith('/map') },
  { label: 'Избранное', href: '/favorites', match: (p) => p.startsWith('/favorites') },
];

const RedesignHeader = () => {
  const { data: siteSettings } = useSiteSettings();
  const { shortName, logoUrl } = useSiteBrand();
  const location = useLocation();

  const [menuOpen, setMenuOpen] = useState(false);
  const [leadOpen, setLeadOpen] = useState(false);

  // Ссылки на каналы заполняет заказчик в админке; пустые — иконку не рисуем.
  const telegramUrl = settingOptional(siteSettings, 'telegram_url');
  const youtubeUrl = settingOptional(siteSettings, 'youtube_url');
  const vkUrl = settingOptional(siteSettings, 'vk_url');
  const maxUrl = settingOptional(siteSettings, 'max_url');
  const phoneMain = settingOptional(siteSettings, 'phone_main');

  // Навигация по ссылке из выехавшей панели не должна оставлять её открытой
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  const isActive = (item: (typeof NAV_ITEMS)[number]) => item.match(location.pathname, location.search);

  /**
   * Каналы связи: рисуем только те, у которых в настройках заполнен адрес.
   * Иконка, ведущая в никуда, хуже отсутствующей.
   */
  const SOCIALS: { url?: string; label: string; icon: typeof Send }[] = [
    { url: telegramUrl, label: 'Telegram', icon: Send },
    { url: maxUrl, label: 'MAX', icon: MessageCircle },
    { url: vkUrl, label: 'ВКонтакте', icon: Users },
    { url: youtubeUrl, label: 'YouTube', icon: Youtube },
  ];

  const filledSocials = SOCIALS.filter((s) => s.url);

  const socials = (
    <>
      {filledSocials.map(({ url, label, icon: Icon }) => (
        <a
          key={label}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          title={label}
          className="flex h-9 w-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted hover:text-primary"
        >
          <Icon className="h-[18px] w-[18px]" />
        </a>
      ))}
    </>
  );

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 shadow-sm backdrop-blur-md">
        <div className="container-page flex h-16 items-center gap-4 lg:h-[72px]">
          {/* В самом логотипе уже есть название — подписывать его ещё раз незачем */}
          <Link to="/" className="flex shrink-0 items-center" aria-label={shortName}>
            <img
              src={logoUrl}
              alt={shortName}
              width={194}
              height={48}
              className="h-10 w-auto lg:h-12"
              decoding="async"
            />
          </Link>

          <nav className="mx-auto hidden items-center gap-1 lg:flex" aria-label="Основное меню">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                aria-current={isActive(item) ? 'page' : undefined}
                className={cn(
                  'rounded-lg px-3 py-2 text-[15px] font-medium transition-colors',
                  isActive(item)
                    ? 'bg-primary/10 text-primary'
                    : 'text-foreground hover:bg-muted hover:text-primary',
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1 lg:gap-2">
            {phoneMain ? (
              <>
                <a
                  href={telHref(phoneMain)}
                  className="hidden items-center gap-2 whitespace-nowrap px-2 text-[15px] font-semibold text-foreground transition-colors hover:text-primary xl:inline-flex"
                >
                  <Phone className="h-4 w-4 shrink-0" aria-hidden />
                  {phoneMain}
                </a>
                <a
                  href={telHref(phoneMain)}
                  aria-label={`Позвонить ${phoneMain}`}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted hover:text-primary xl:hidden"
                >
                  <Phone className="h-[18px] w-[18px]" />
                </a>
              </>
            ) : null}

            <div className="hidden items-center gap-1 lg:flex">{socials}</div>

            <button
              type="button"
              onClick={() => setLeadOpen(true)}
              className={cn(btnClass('primary'), 'hidden h-10 px-5 lg:inline-flex')}
            >
              Оставить заявку
            </button>

            <button
              type="button"
              aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-11 w-11 items-center justify-center rounded-xl transition-colors hover:bg-muted lg:hidden"
            >
              {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </header>

      {menuOpen ? (
        <div className="fixed inset-0 top-16 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Закрыть меню"
            className="absolute inset-0 bg-foreground/30"
            onClick={() => setMenuOpen(false)}
          />
          <nav
            className="absolute inset-x-0 top-0 max-h-[calc(100vh-4rem)] overflow-y-auto border-b border-border bg-background px-4 pb-6 pt-3 shadow-lg"
            aria-label="Мобильное меню"
          >
            <div className="flex flex-col">
              {[...NAV_ITEMS, ...MOBILE_EXTRA_ITEMS].map((item) => (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    'flex min-h-[52px] items-center rounded-xl px-4 text-[17px] font-medium transition-colors',
                    isActive(item) ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted',
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setLeadOpen(true);
              }}
              className={cn(btnClass('primary'), 'mt-4 h-12 w-full')}
            >
              Оставить заявку
            </button>

            {phoneMain ? (
              <a
                href={telHref(phoneMain)}
                className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-border text-base font-semibold text-foreground"
              >
                <Phone className="h-4 w-4 shrink-0" aria-hidden />
                {phoneMain}
              </a>
            ) : null}

            {filledSocials.length > 0 ? (
              <div className="mt-5 border-t border-border pt-4">
                <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Мы в соцсетях
                </p>
                <div className="flex flex-col">
                  {filledSocials.map(({ url, label, icon: Icon }) => (
                    <a
                      key={label}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-h-[48px] items-center gap-3 rounded-xl px-2 text-[15px] font-medium text-foreground transition-colors hover:bg-muted"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-primary">
                        <Icon className="h-[18px] w-[18px]" />
                      </span>
                      {label}
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </nav>
        </div>
      ) : null}

      <MobileTabBar />

      <ConsultationFlow
        open={leadOpen}
        onOpenChange={setLeadOpen}
        context={{ surface: 'home', source: 'header', title: 'Оставить заявку' }}
      />
    </>
  );
};

export default RedesignHeader;

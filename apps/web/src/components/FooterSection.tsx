import React from 'react';
import { Link } from 'react-router-dom';
import { Phone, Mail, MapPin, Clock, MessageCircle, Send, Users, Youtube } from 'lucide-react';
import { cn } from '@/lib/utils';
import { settingOptional, useSiteSettings } from '@/redesign/hooks/useSiteSettings';
import { useSiteBrand } from '@/redesign/hooks/useSiteBrand';
import { telHref, yandexMapsHref } from '@/lib/contact-links';
import { typo } from '@/shared/lib/typography';
import {
  FOOTER_CATALOG_LINKS,
  FOOTER_COMPANY_LINKS,
  FOOTER_LEGAL_LINKS,
} from '@/components/footer-constants';

const footerLinkClass =
  'inline-flex min-h-[40px] items-center text-sm leading-snug text-primary-foreground/70 transition-colors hover:text-primary-foreground lg:min-h-[32px]';

const FooterNavColumn = ({
  title,
  links,
  wrapOnMobile = false,
}: {
  title: string;
  links: readonly { label: string; to: string }[];
  /** На телефоне — строкой с переносом, а не столбиком: длинные подписи документов не растягивают подвал */
  wrapOnMobile?: boolean;
}) => (
  <div>
    <h3 className="mb-1 text-[13px] font-semibold text-primary-foreground/50">
      {title}
    </h3>
    <ul className={wrapOnMobile ? 'flex flex-wrap gap-x-5 lg:flex-col lg:gap-x-0' : 'flex flex-col'}>
      {links.map((l) => (
        <li key={l.label}>
          <Link to={l.to} className={footerLinkClass}>
            {typo(l.label)}
          </Link>
        </li>
      ))}
    </ul>
  </div>
);

type FooterProps = {
  /** Страница с нижним меню на телефоне: запас под меню — внутри подвала, без белой полосы под ним */
  reserveMobileNav?: boolean;
};

const FooterSection = React.forwardRef<HTMLElement, FooterProps>(({ reserveMobileNav = false }, ref) => {
  const { data: s } = useSiteSettings();
  const { shortName, logoLightUrl, tagline } = useSiteBrand();

  const phoneMain = settingOptional(s, 'phone_main');
  const phoneHref = phoneMain ? telHref(phoneMain) : null;
  const phoneSecondary = settingOptional(s, 'phone_secondary');
  const emailVal = settingOptional(s, 'email') ?? settingOptional(s, 'contacts_email');
  const addressVal = settingOptional(s, 'address') ?? settingOptional(s, 'contacts_address');
  const telegramUrl = settingOptional(s, 'telegram_url');
  const youtubeUrl = settingOptional(s, 'youtube_url');
  const vkUrl = settingOptional(s, 'vk_url');
  const maxUrl = settingOptional(s, 'max_url');
  const inn = settingOptional(s, 'inn');
  const ogrn = settingOptional(s, 'ogrn');

  /** Каналы связи: рисуем только заполненные, иконка в никуда хуже отсутствующей */
  const SOCIAL_LINKS = [
    { url: telegramUrl, label: 'Telegram', Icon: Send },
    { url: maxUrl, label: 'MAX', Icon: MessageCircle },
    { url: vkUrl, label: 'ВКонтакте', Icon: Users },
    { url: youtubeUrl, label: 'YouTube', Icon: Youtube },
  ].filter((x): x is { url: string; label: string; Icon: typeof Send } => Boolean(x.url));

  const officeLat = settingOptional(s, 'office_lat');
  const officeLng = settingOptional(s, 'office_lng');

  const mapsUrl = yandexMapsHref({ address: addressVal ?? '', officeLat, officeLng });

  const whWeekday = settingOptional(s, 'work_hours_weekdays');
  const whWeekend = settingOptional(s, 'work_hours_weekend');
  const whSingle = settingOptional(s, 'work_hours') ?? settingOptional(s, 'contacts_work_hours');
  const hourLines = [whWeekday, whWeekend].filter(Boolean) as string[];
  if (hourLines.length === 0 && whSingle?.trim()) hourLines.push(whSingle);

  const copyrightYear = settingOptional(s, 'copyright_year') ?? '2026';

  const contactLinkClass =
    'inline-flex min-h-[40px] items-center gap-2.5 text-sm text-primary-foreground/80 transition-colors hover:text-primary-foreground lg:min-h-[32px]';

  return (
    /* Фон задаёт сам .bg-footer-gradient (index.css): bg-* классы рядом через cn не ставим —
       tailwind-merge считает их конфликтующими и выкидывает один из них */
    <footer ref={ref} className={cn('bg-footer-gradient text-primary-foreground', reserveMobileNav && 'pb-mobile-nav')}>
      <div className="container-page py-8 lg:py-10">
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1.25fr)_repeat(3,minmax(0,0.85fr))] lg:gap-x-8">
          {/* Бренд и соцсети */}
          <div className="col-span-2 lg:col-span-1">
            <Link to="/" className="inline-flex items-center" aria-label={shortName}>
              <img
                src={logoLightUrl}
                alt={shortName}
                width={194}
                height={48}
                className="h-10 w-auto max-w-[220px] object-contain object-left"
              />
            </Link>
            {tagline ? (
              <p className="mt-2 max-w-[300px] text-sm leading-relaxed text-primary-foreground/60">
                {typo(tagline)}
              </p>
            ) : null}

            {SOCIAL_LINKS.length > 0 ? (
              <div className="mt-4 flex items-center gap-2">
                {SOCIAL_LINKS.map(({ url, label, Icon }) => (
                  <a
                    key={label}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    title={label}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-foreground/10 text-primary-foreground/80 transition-colors hover:bg-primary-foreground/20 hover:text-primary-foreground"
                  >
                    <Icon className="h-[18px] w-[18px]" />
                  </a>
                ))}
              </div>
            ) : null}
          </div>

          {/* Контакты: только то, что заполнено в настройках сайта */}
          <div className="col-span-2 lg:col-span-1">
            <h3 className="mb-1 text-[13px] font-semibold text-primary-foreground/50">Контакты</h3>
            <div className="flex flex-col">
              {phoneMain && phoneHref ? (
                <a href={phoneHref} className={cn(contactLinkClass, 'text-base font-semibold')}>
                  <Phone className="h-4 w-4 shrink-0 text-primary-foreground/50" aria-hidden />
                  {phoneMain}
                </a>
              ) : null}
              {phoneSecondary ? (
                <a href={telHref(phoneSecondary)} className={cn(contactLinkClass, 'text-base font-semibold')}>
                  <Phone className="h-4 w-4 shrink-0 text-primary-foreground/50" aria-hidden />
                  {phoneSecondary}
                </a>
              ) : null}
              {emailVal ? (
                <a href={`mailto:${emailVal}`} className={cn(contactLinkClass, 'break-all')}>
                  <Mail className="h-4 w-4 shrink-0 text-primary-foreground/50" aria-hidden />
                  {emailVal}
                </a>
              ) : null}
              {addressVal ? (
                <p className={cn(contactLinkClass, 'items-start py-1.5 hover:text-primary-foreground/80')}>
                  <MapPin className="mt-[3px] h-4 w-4 shrink-0 text-primary-foreground/50" aria-hidden />
                  <span className="whitespace-pre-line">
                    {addressVal}
                    {mapsUrl ? (
                      <>
                        <br />
                        {/* Вместо тяжёлого iframe с картой — ссылка: подвал не растягивается на экран */}
                        <a
                          href={mapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary-foreground/60 underline underline-offset-4 transition-colors hover:text-primary-foreground"
                        >
                          Открыть в Яндекс Картах
                        </a>
                      </>
                    ) : null}
                  </span>
                </p>
              ) : null}
              {hourLines.length > 0 ? (
                <p className={cn(contactLinkClass, 'hover:text-primary-foreground/80')}>
                  <Clock className="h-4 w-4 shrink-0 text-primary-foreground/50" aria-hidden />
                  <span>{hourLines.join(' · ')}</span>
                </p>
              ) : null}
            </div>
          </div>

          <FooterNavColumn title="Недвижимость" links={FOOTER_CATALOG_LINKS} />
          <FooterNavColumn title="Компания" links={FOOTER_COMPANY_LINKS} />
          <div className="col-span-2 lg:col-span-1">
            <FooterNavColumn title="Документы" links={FOOTER_LEGAL_LINKS} wrapOnMobile />
          </div>
        </div>
      </div>

      <div className="border-t border-primary-foreground/10">
        <div className="container-page flex flex-col gap-2 py-4 text-xs leading-relaxed text-primary-foreground/70 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <p>
            © {copyrightYear} {shortName}
            {inn ? ` · ИНН ${inn}` : ''}
            {ogrn ? ` · ОГРН ${ogrn}` : ''}
          </p>
          <p className="max-w-[560px] sm:text-right">
            {typo('Информация на сайте не является публичной офертой. Цены и наличие уточняйте у менеджера.')}
          </p>
        </div>
      </div>
    </footer>
  );
});

FooterSection.displayName = 'FooterSection';

export default FooterSection;

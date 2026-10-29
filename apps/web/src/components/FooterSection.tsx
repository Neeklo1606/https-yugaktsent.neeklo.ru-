import React from 'react';
import { Link } from 'react-router-dom';
import { Phone, Mail, MapPin, Clock, MessageCircle, Send, Users, Youtube } from 'lucide-react';
import { cn } from '@/lib/utils';
import { settingOptional, useSiteSettings } from '@/redesign/hooks/useSiteSettings';
import { useSiteBrand } from '@/redesign/hooks/useSiteBrand';
import { telHref, yandexMapsHref, yandexMapWidgetSrc } from '@/lib/contact-links';
import { typo } from '@/shared/lib/typography';
import {
  FOOTER_CATALOG_LINKS,
  FOOTER_COMPANY_LINKS,
  FOOTER_LEGAL_LINKS,
} from '@/components/footer-constants';

const footerLinkClass =
  'inline-flex min-h-[38px] items-center text-sm text-primary-foreground/70 transition-colors hover:text-primary-foreground';

const FooterNavColumn = ({
  title,
  links,
}: {
  title: string;
  links: readonly { label: string; to: string }[];
}) => (
  <div>
    <h3 className="mb-1 text-[13px] font-semibold text-primary-foreground/50">
      {title}
    </h3>
    <ul className="flex flex-col">
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

const FooterSection = React.forwardRef<HTMLElement>((_, ref) => {
  const { data: s } = useSiteSettings();
  const { shortName, logoLightUrl, tagline } = useSiteBrand();

  const phoneMain = settingOptional(s, 'phone_main');
  const phoneHref = phoneMain ? telHref(phoneMain) : null;
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

  // Виджет карты — только по реальному адресу или координатам офиса из настроек
  const mapWidgetSrc = yandexMapWidgetSrc({ officeLat, officeLng, address: addressVal ?? '' });

  const contactLinkClass =
    'inline-flex min-h-[38px] items-center gap-2.5 text-sm text-primary-foreground/80 transition-colors hover:text-primary-foreground';

  return (
    <footer ref={ref} className="bg-foreground text-primary-foreground">
      <div className="container-page py-8 sm:py-12 lg:py-16">
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-10 lg:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,0.9fr))] lg:gap-8">
          {/* Бренд и контакты */}
          <div className="col-span-2 lg:col-span-1">
            <Link to="/" className="inline-flex items-center" aria-label={shortName}>
              <img
                src={logoLightUrl}
                alt={shortName}
                width={194}
                height={48}
                className="h-11 w-auto max-w-[230px] object-contain object-left"
              />
            </Link>
            {tagline ? (
              <p className="mt-3 max-w-[300px] text-sm leading-relaxed text-primary-foreground/60">
                {typo(tagline)}
              </p>
            ) : null}

            <div className="mt-5 flex flex-col">
              {phoneMain && phoneHref ? (
                <a href={phoneHref} className={cn(contactLinkClass, 'text-base font-semibold')}>
                  <Phone className="h-4 w-4 shrink-0 text-primary-foreground/50" aria-hidden />
                  {phoneMain}
                </a>
              ) : null}
              {emailVal ? (
                <a href={`mailto:${emailVal}`} className={contactLinkClass}>
                  <Mail className="h-4 w-4 shrink-0 text-primary-foreground/50" aria-hidden />
                  {emailVal}
                </a>
              ) : null}
              {addressVal ? (
                mapsUrl ? (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(contactLinkClass, 'items-start whitespace-pre-line py-2')}
                  >
                    <MapPin className="mt-[3px] h-4 w-4 shrink-0 text-primary-foreground/50" aria-hidden />
                    <span className="underline-offset-4 hover:underline">{addressVal}</span>
                  </a>
                ) : (
                  <p className={cn(contactLinkClass, 'items-start whitespace-pre-line py-2')}>
                    <MapPin className="mt-[3px] h-4 w-4 shrink-0 text-primary-foreground/50" aria-hidden />
                    <span>{addressVal}</span>
                  </p>
                )
              ) : null}
              {hourLines.length > 0 ? (
                <p className={contactLinkClass}>
                  <Clock className="h-4 w-4 shrink-0 text-primary-foreground/50" aria-hidden />
                  <span>{hourLines.join(' · ')}</span>
                </p>
              ) : null}
            </div>

            {SOCIAL_LINKS.length > 0 ? (
              <div className="mt-5 flex items-center gap-2">
                {SOCIAL_LINKS.map(({ url, label, Icon }) => (
                  <a
                    key={label}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    title={label}
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-foreground/10 text-primary-foreground/80 transition-colors hover:bg-primary-foreground/20 hover:text-primary-foreground"
                  >
                    <Icon className="h-[18px] w-[18px]" />
                  </a>
                ))}
              </div>
            ) : null}
          </div>

          <FooterNavColumn title="Недвижимость" links={FOOTER_CATALOG_LINKS} />
          <FooterNavColumn title="Компания" links={FOOTER_COMPANY_LINKS} />
          <div className="col-span-2 lg:col-span-1">
            <FooterNavColumn title="Документы" links={FOOTER_LEGAL_LINKS} />
          </div>
        </div>

        {mapWidgetSrc && mapsUrl ? (
          <div className="mt-6 lg:mt-12">
            {/* Карта-iframe весит как вся страница: на телефоне только ссылка */}
            <div className="hidden h-[320px] w-full overflow-hidden rounded-card border border-primary-foreground/10 lg:block">
              <iframe
                title={`Офис ${shortName} на Яндекс Картах`}
                src={mapWidgetSrc}
                className="h-full w-full border-0"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(footerLinkClass, 'text-xs')}
            >
              Открыть в Яндекс Картах
            </a>
          </div>
        ) : null}
      </div>

      <div className="border-t border-primary-foreground/10">
        <div className="container-page flex flex-col gap-3 py-6 text-xs leading-relaxed text-primary-foreground/70 sm:flex-row sm:items-center sm:justify-between">
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

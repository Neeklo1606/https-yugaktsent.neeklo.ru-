import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, ArrowUpRight, Copy, MapPin, Phone, PlayCircle, QrCode, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { btnClass } from '@/redesign/lib/button-styles';
import { useSiteBrand } from '@/redesign/hooks/useSiteBrand';
import { useEntitySeoMeta } from '@/shared/hooks/useEntitySeoMeta';
import ConsultationFlow from '@/redesign/components/ConsultationFlow';
import NotFound from '@/pages/NotFound';
import ExpertAvatar from '@/shared/experts/ExpertAvatar';
import ExpertLinkIcon from '@/shared/experts/ExpertLinkIcon';
import ExpertQrDialog from '@/shared/experts/ExpertQrDialog';
import { useExpert } from '@/shared/experts/useExpert';
import {
  expertCanonicalUrl,
  expertPath,
  phoneHref,
  publicExpertView,
  type ExpertLink,
  absoluteSiteUrl,
} from '@/shared/experts/expert-profile';

const SITE_URL =
  (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.replace(/\/+$/, '') || 'https://yugaktsent.neeklo.ru';

/** Секция страницы: заголовок H2 и содержимое, без декоративных обёрток */
const Section = ({ id, title, children, className }: { id?: string; title: string; children: React.ReactNode; className?: string }) => (
  <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className={cn('pt-10 lg:pt-12', className)}>
    <h2 id={id ? `${id}-title` : undefined} className="mb-4 text-[22px] font-semibold leading-tight tracking-tight lg:text-2xl">
      {title}
    </h2>
    {children}
  </section>
);

const LinkRow = ({ link }: { link: ExpertLink }) => (
  <a
    href={link.url}
    target="_blank"
    rel="noopener noreferrer"
    className="group flex min-h-[64px] items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-soft focus-visible:bg-surface-soft"
  >
    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-soft text-primary">
      <ExpertLinkIcon type={link.type} />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-[15px] font-medium text-foreground">{link.title}</span>
      {link.handle ? <span className="block truncate text-[13px] text-muted-foreground">{link.handle}</span> : null}
    </span>
    <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
  </a>
);

const ExpertPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const expert = useExpert(slug);
  const { shortName, logoUrl } = useSiteBrand();
  const [qrOpen, setQrOpen] = useState(false);
  const [leadOpen, setLeadOpen] = useState(false);

  const canonical = slug ? expertCanonicalUrl(slug) : '';

  useEntitySeoMeta(
    expert && expert.published
      ? {
          title: expert.seo.title,
          description: expert.seo.description,
          pathname: expertPath(expert.slug),
          imageUrl: expert.photoUrl ? absoluteSiteUrl(expert.photoUrl) : `${SITE_URL}/og-yugaktsent.jpg`,
          jsonLd: {
            '@context': 'https://schema.org',
            '@type': 'Person',
            name: expert.fullName,
            jobTitle: expert.role,
            url: canonical,
            image: expert.photoUrl ? absoluteSiteUrl(expert.photoUrl) : undefined,
            worksFor: { '@type': 'RealEstateAgent', name: shortName, url: SITE_URL },
            address: expert.address ? { '@type': 'PostalAddress', streetAddress: expert.address, addressCountry: 'RU' } : undefined,
            telephone: expert.phones.map((p) => p.value),
            sameAs: expert.links.filter((l) => l.visible).map((l) => l.url),
          },
        }
      : null,
  );

  const view = useMemo(() => (expert ? publicExpertView(expert) : null), [expert]);

  if (!expert || !expert.published || !view) return <NotFound />;

  const maxLink = view.links.find((l) => l.type === 'max');
  const tgDirect = view.links.find((l) => l.type === 'telegram');
  const tgChannel = view.links.find((l) => l.type === 'telegram_channel');
  const youtube = view.links.find((l) => l.type === 'youtube');
  // Канал — не личка: подписываем честно, а личную ссылку ставим, только когда заказчик её даст
  const telegramCta = tgDirect
    ? { href: tgDirect.url, label: 'Написать в Telegram' }
    : tgChannel
      ? { href: tgChannel.url, label: 'Telegram-канал' }
      : null;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(canonical);
      toast.success('Ссылка скопирована', { description: canonical });
    } catch {
      toast.error('Не удалось скопировать', { description: canonical });
    }
  };

  const mapsHref = expert.address ? `https://yandex.ru/maps/?text=${encodeURIComponent(expert.address)}` : null;

  return (
    <div className="min-h-screen bg-background">
      {/* Своя компактная шапка: страница живёт как цифровая визитка, но в бренде сайта */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1120px] items-center justify-between gap-3 px-4 sm:px-5 lg:h-16 lg:px-8">
          <Link to="/" aria-label={`${shortName}: на главную`} className="flex items-center">
            <img src={logoUrl} alt={shortName} width={160} height={40} className="h-8 w-auto lg:h-10" decoding="async" />
          </Link>
          <Link to="/" className={btnClass('secondary', { size: 'sm' })}>
            <ArrowLeft />
            На сайт
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[1120px] px-4 pb-16 sm:px-5 lg:grid lg:grid-cols-[380px_minmax(0,1fr)] lg:gap-16 lg:px-8 lg:pb-24">
        {/* Профиль: на мобильном — компактный первый экран, на десктопе — липкая колонка */}
        <aside className="pt-6 lg:sticky lg:top-24 lg:self-start lg:pt-12">
          <div className="flex items-start gap-4 lg:block">
            <ExpertAvatar
              name={expert.fullName}
              photoUrl={expert.photoUrl}
              priority
              sizes="(min-width: 1024px) 380px, 104px"
              className="h-[104px] w-[88px] sm:h-[124px] sm:w-[104px] lg:h-[460px] lg:w-full"
            />
            <div className="min-w-0 lg:mt-6">
              <h1 className="text-[28px] font-semibold leading-[1.1] tracking-tight sm:text-[32px] lg:text-[40px]">
                {expert.fullName}
              </h1>
              <p className="mt-2 text-[15px] leading-snug text-muted-foreground">{expert.role}</p>
            </div>
          </div>

          {(expert.experience || expert.city) && (
            <ul className="mt-4 flex flex-wrap gap-2" aria-label="Коротко">
              {expert.experience ? (
                <li className="rounded-full bg-surface-soft px-3 py-1.5 text-[13px] font-medium text-foreground">{expert.experience}</li>
              ) : null}
              {expert.city ? (
                <li className="rounded-full bg-surface-soft px-3 py-1.5 text-[13px] font-medium text-foreground">{expert.city}</li>
              ) : null}
            </ul>
          )}

          <div className="mt-5 grid gap-2.5">
            {maxLink ? (
              <a href={maxLink.url} target="_blank" rel="noopener noreferrer" className={btnClass('primary', { className: 'w-full' })}>
                <ExpertLinkIcon type="max" className="h-4 w-4" />
                Написать в MAX
              </a>
            ) : null}
            {telegramCta ? (
              <a href={telegramCta.href} target="_blank" rel="noopener noreferrer" className={btnClass('secondary', { className: 'w-full' })}>
                <ExpertLinkIcon type="telegram" className="h-4 w-4" />
                {telegramCta.label}
              </a>
            ) : null}
          </div>

          <div className="mt-3 flex gap-2">
            <button type="button" onClick={copyLink} className={btnClass('ghost', { className: '!h-10 !px-3 rounded-lg no-underline hover:bg-surface-soft hover:no-underline text-[14px]' })}>
              <Copy />
              Скопировать ссылку
            </button>
            <button type="button" onClick={() => setQrOpen(true)} className={btnClass('ghost', { className: '!h-10 !px-3 rounded-lg hover:bg-surface-soft hover:no-underline text-[14px]' })}>
              <QrCode />
              QR-код
            </button>
          </div>
        </aside>

        <div className="min-w-0">
          <Section id="about" title="Знакомство" className="pt-8 lg:pt-12">
            <div className="space-y-3 text-[16px] leading-relaxed text-foreground/90 lg:text-[17px]">
              <p className="text-foreground">{expert.intro}</p>
              {expert.about.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </Section>

          {expert.projects.length > 0 && (
            <Section id="projects" title="Рубрики">
              <ul className="grid gap-3">
                {expert.projects.map((pr) => (
                  <li key={pr.id} className="surface-card flex gap-4 p-4 sm:p-5">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-surface-soft text-primary">
                      <PlayCircle className="h-5 w-5" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-[16px] font-semibold leading-snug">{pr.title}</h3>
                      <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">{pr.description}</p>
                      {youtube && view.videos.length === 0 ? (
                        <a
                          href={youtube.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-medium text-primary hover:underline underline-offset-4"
                        >
                          Смотреть видеообзоры на YouTube
                          <ArrowUpRight className="h-4 w-4" aria-hidden />
                        </a>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {view.videos.length > 0 && (
            <Section id="videos" title="Видеообзоры">
              <ul className="grid gap-3 sm:grid-cols-2">
                {view.videos.map((v) => (
                  <li key={v.id}>
                    <a
                      href={v.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="surface-card group block overflow-hidden transition-shadow hover:shadow-raised"
                    >
                      <div className="relative aspect-video bg-surface-soft">
                        {v.previewUrl ? (
                          <img src={v.previewUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                        ) : null}
                        <PlayCircle className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 text-primary" aria-hidden />
                      </div>
                      <p className="p-4 text-[15px] font-medium leading-snug">{v.title}</p>
                    </a>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {view.links.length > 0 && (
            <Section id="channels" title="Каналы">
              <div className="surface-card divide-y divide-border overflow-hidden">
                {view.links.map((l) => (
                  <LinkRow key={l.id} link={l} />
                ))}
              </div>
            </Section>
          )}

          {/* Без настоящих файлов секция не показывается: ложных кнопок «Скачать» не будет */}
          {view.guides.length > 0 && (
            <Section id="guides" title="Полезные гайды">
              <ul className="grid gap-3">
                {view.guides.map((g) => (
                  <li key={g.id}>
                    <a href={g.fileUrl} target="_blank" rel="noopener noreferrer" className="surface-card flex items-center gap-4 p-4 hover:bg-surface-soft">
                      <FileText className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-medium">{g.title}</span>
                        {g.description ? <span className="block text-[13px] text-muted-foreground">{g.description}</span> : null}
                      </span>
                      <span className="text-[13px] font-medium text-primary">PDF</span>
                    </a>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section id="consultation" title="Личная консультация">
            <div className="rounded-card bg-primary p-5 text-primary-foreground sm:p-6">
              <p className="max-w-[46ch] text-[16px] leading-relaxed text-primary-foreground/90">
                Подбор новостройки, ипотека и инвестиции в недвижимость Юга. Напишите удобным способом или оставьте заявку — перезвоним.
              </p>
              <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
                {maxLink ? (
                  <a href={maxLink.url} target="_blank" rel="noopener noreferrer" className={btnClass('inverse', { className: 'sm:flex-1' })}>
                    Написать в MAX
                  </a>
                ) : null}
                <button type="button" onClick={() => setLeadOpen(true)} className={btnClass('inverseOutline', { className: 'sm:flex-1' })}>
                  Оставить заявку
                </button>
              </div>
            </div>
          </Section>

          {(view.phones.length > 0 || expert.address) && (
            <Section id="contacts" title="Контакты">
              <div className="surface-card divide-y divide-border overflow-hidden">
                {view.phones.map((ph) => (
                  <a key={ph.id} href={phoneHref(ph.value)} className="flex min-h-[64px] items-center gap-3 px-4 py-3 hover:bg-surface-soft">
                    <Phone className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[16px] font-semibold tabular-nums text-foreground">{ph.value}</span>
                      <span className="block text-[13px] text-muted-foreground">
                        {ph.label}
                        {ph.note ? ` · ${ph.note}` : ''}
                      </span>
                    </span>
                  </a>
                ))}
                {expert.address ? (
                  <a
                    href={mapsHref ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-[64px] items-center gap-3 px-4 py-3 hover:bg-surface-soft"
                  >
                    <MapPin className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium text-foreground">{expert.address}</span>
                      <span className="block text-[13px] text-muted-foreground">Открыть в Яндекс Картах</span>
                    </span>
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  </a>
                ) : null}
              </div>
            </Section>
          )}

          <footer className="mt-12 flex flex-col gap-2 border-t border-border pt-6 text-[13px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>© {new Date().getFullYear()} {shortName}</span>
            <Link to="/" className="font-medium text-primary hover:underline underline-offset-4">
              Каталог новостроек Анапы
            </Link>
          </footer>
        </div>
      </main>

      <ExpertQrDialog
        open={qrOpen}
        onOpenChange={setQrOpen}
        url={canonical}
        fileName={`qr-${expert.slug}.png`}
        title={`QR-код: ${expert.fullName}`}
      />
      <ConsultationFlow
        open={leadOpen}
        onOpenChange={setLeadOpen}
        context={{
          surface: 'expert',
          source: `expert:${expert.slug}`,
          title: `Консультация: ${expert.fullName}`,
          requestType: 'CONSULTATION',
          contextFooter: `Страница эксперта: ${canonical}`,
        }}
      />
    </div>
  );
};

export default ExpertPage;

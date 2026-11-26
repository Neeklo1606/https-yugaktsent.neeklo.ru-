import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Printer, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import RedesignHeader from '@/redesign/components/RedesignHeader';
import FooterSection from '@/components/FooterSection';
import DownloadPdfButton from '@/shared/components/DownloadPdfButton';
import { apiGetOrNull } from '@/lib/api';
import { settingOptional, useSiteSettings } from '@/redesign/hooks/useSiteSettings';
import { useSiteBrand } from '@/redesign/hooks/useSiteBrand';
import { telHref } from '@/lib/contact-links';
import { typo } from '@/shared/lib/typography';

type ApiPresentation = {
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  address: string | null;
  metro: string | null;
  builder: string | null;
  deadline: string | null;
  availableApartments: number;
  priceFrom: number | null;
  priceTo: number | null;
  roomMix: Array<{ label: string; count: number; priceFrom: number | null }>;
  generatedAt: string;
};

const money = (v: number) =>
  `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(v)} ₽`;

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen bg-background">
    <RedesignHeader />
    <div className="mx-auto max-w-[760px] px-4 py-16 text-center text-sm text-muted-foreground">
      {children}
    </div>
    <FooterSection reserveMobileNav />
  </div>
);

/** Ячейка факта: пустые значения не рисуем, прочерков не придумываем. */
const Fact = ({ label, value }: { label: string; value: string | null }) =>
  value ? (
    <div className="border-t border-border py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1.5 text-[15px] font-medium leading-snug">{typo(value)}</p>
    </div>
  ) : null;

const Presentation = () => {
  const { slug } = useParams<{ slug: string }>();
  const { data: s } = useSiteSettings();
  const { shortName } = useSiteBrand();
  const phone = settingOptional(s, 'phone_main');

  const blockQuery = useQuery({
    queryKey: ['presentation', slug],
    queryFn: () => apiGetOrNull<ApiPresentation>(`/presentations/${encodeURIComponent(slug || '')}`),
    enabled: Boolean(slug),
  });

  if (!slug) return <Shell>Не указан ЖК</Shell>;
  if (blockQuery.isPending) return <Shell>Загрузка…</Shell>;

  const p = blockQuery.data;
  if (!p) {
    return (
      <Shell>
        <p>Комплекс не найден</p>
        <Link to="/catalog" className="mt-2 inline-block text-primary">
          В каталог
        </Link>
      </Shell>
    );
  }

  const priceLine =
    p.priceFrom != null
      ? p.priceTo != null && p.priceTo !== p.priceFrom
        ? `от ${money(p.priceFrom)}`
        : money(p.priceFrom)
      : null;

  return (
    <div className="min-h-screen bg-background">
      <div className="print:hidden">
        <RedesignHeader />
      </div>

      <article className="mx-auto max-w-[880px] px-4 py-8 print:max-w-none print:px-0 print:py-0">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Button variant="outline" size="sm" asChild>
            <Link to={`/complex/${p.slug}`}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Страница ЖК
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <DownloadPdfButton
              apiPath={`/presentations/${encodeURIComponent(p.slug)}/pdf`}
              filename={`${p.slug}-prezentaciya.pdf`}
            />
            <Button type="button" size="sm" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" />
              Печать
            </Button>
          </div>
        </div>

        {/* Обложка: имя комплекса поверх фотографии, как в печатной версии */}
        <header className="relative overflow-hidden rounded-[24px] bg-graphite print:rounded-none">
          {p.imageUrl ? (
            <img
              src={p.imageUrl}
              alt=""
              className="h-[280px] w-full object-cover sm:h-[360px]"
              loading="eager"
            />
          ) : (
            <div className="h-[220px] w-full sm:h-[260px]" />
          )}
          <div className="absolute inset-x-0 bottom-0 top-1/3 bg-gradient-to-t from-graphite via-graphite/70 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-6 sm:p-9">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
              Презентация комплекса · {shortName}
            </p>
            <h1 className="mt-3 text-2xl font-bold leading-tight text-white sm:text-4xl">{p.name}</h1>
            {p.address ? (
              <p className="mt-2 text-sm text-white/75 sm:text-base">{typo(p.address)}</p>
            ) : null}
          </div>
        </header>

        {(priceLine || p.availableApartments > 0) && (
          <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
            {priceLine ? (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Стоимость
                </p>
                <p className="mt-1 text-3xl font-bold text-primary sm:text-4xl">{priceLine}</p>
                {p.priceTo != null && p.priceTo !== p.priceFrom ? (
                  <p className="mt-1 text-sm text-muted-foreground">до {money(p.priceTo)}</p>
                ) : null}
              </div>
            ) : null}
            {p.availableApartments > 0 ? (
              <div className="text-right">
                <p className="text-3xl font-bold sm:text-4xl">{p.availableApartments}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {typo('квартир в продаже')}
                </p>
              </div>
            ) : null}
          </div>
        )}

        <div className="mt-8 grid gap-x-10 sm:grid-cols-2">
          <Fact label="Застройщик" value={p.builder} />
          <Fact label="Срок сдачи" value={p.deadline} />
          <Fact label="Адрес" value={p.address} />
          <Fact label="Транспорт" value={p.metro} />
        </div>

        {p.roomMix.length > 0 ? (
          <section className="mt-10">
            <h2 className="text-lg font-bold">Квартиры в продаже</h2>
            <div className="mt-4 overflow-hidden rounded-2xl border border-border">
              {p.roomMix.map((row, i) => (
                <div
                  key={row.label}
                  className={`flex items-center justify-between gap-4 px-5 py-3.5 text-[15px] ${
                    i % 2 === 0 ? 'bg-muted/40' : 'bg-card'
                  }`}
                >
                  <span className="font-medium">{row.label}</span>
                  <span className="text-sm text-muted-foreground">{row.count} шт.</span>
                  <span className="font-semibold text-primary">
                    {row.priceFrom != null ? `от ${money(row.priceFrom)}` : 'цена по запросу'}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {p.description?.trim() ? (
          <section className="mt-10">
            <h2 className="text-lg font-bold">О комплексе</h2>
            <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-muted-foreground">
              {typo(p.description.trim())}
            </p>
          </section>
        ) : null}

        <section className="mt-10 rounded-[24px] bg-graphite p-6 text-white sm:p-9 print:hidden">
          <h2 className="text-xl font-bold sm:text-2xl">{typo('Подобрать квартиру в этом ЖК')}</h2>
          <p className="mt-2 max-w-[460px] text-sm leading-relaxed text-white/70">
            {typo('Покажем свободные планировки, актуальные цены и условия от застройщика.')}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to={`/complex/${p.slug}`}
              className="inline-flex h-12 items-center rounded-xl bg-white px-6 text-[15px] font-semibold text-graphite transition-colors hover:bg-white/90"
            >
              Смотреть квартиры
            </Link>
            {phone ? (
              <a
                href={telHref(phone)}
                className="inline-flex h-12 items-center rounded-xl border border-white/25 px-6 text-[15px] font-medium text-white/90 transition-colors hover:bg-white/10"
              >
                {phone}
              </a>
            ) : null}
          </div>
        </section>
      </article>

      <div className="print:hidden">
        <FooterSection reserveMobileNav />
      </div>
    </div>
  );
};

export default Presentation;

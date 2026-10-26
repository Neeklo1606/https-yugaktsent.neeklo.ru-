import { Link } from 'react-router-dom';
import { ArrowRight, FileCheck2, Handshake, KeyRound, Percent } from 'lucide-react';
import RedesignHeader from '@/redesign/components/RedesignHeader';
import FooterSection from '@/components/FooterSection';
import LeadHighlightSection from '@/redesign/components/LeadHighlightSection';
import { useSiteSettings, settingOptional } from '@/redesign/hooks/useSiteSettings';
import { useSiteBrand } from '@/redesign/hooks/useSiteBrand';
import aboutMain from '@/assets/about-main.jpg';
import ExpertCard from '@/shared/experts/ExpertCard';
import { useExperts } from '@/shared/experts/useExpert';

/**
 * Показатели агентства — только из настроек сайта, которые заполняет заказчик.
 * Запасных цифр нет: неподтверждённые «2300+ сделок» на витрине недопустимы (ТЗ v3, 4.7).
 * Нужные ключи перечислены в docs/BACKEND_TODO.md.
 */
const STAT_KEYS = [
  { key: 'about_stat_founded', caption: 'год основания' },
  { key: 'about_stat_deals', caption: 'закрытых сделок' },
  { key: 'about_stat_experts', caption: 'экспертов' },
  { key: 'about_stat_developers', caption: 'застройщика' },
] as const;

const TRUST_CARDS: { icon: typeof FileCheck2; title: string; text: string }[] = [
  {
    icon: FileCheck2,
    title: 'Юридическая чистота',
    text: 'Проверяем документы застройщика и объекта до того, как вы внесёте деньги.',
  },
  {
    icon: Handshake,
    title: 'Сопровождение',
    text: 'Ведём сделку от первого просмотра до получения ключей, без передачи между менеджерами.',
  },
  {
    icon: KeyRound,
    title: 'Прямые контракты',
    text: 'Работаем с застройщиками Анапы напрямую, цена та же, что в отделе продаж.',
  },
  {
    icon: Percent,
    title: 'Помощь с ипотекой',
    text: 'Подбираем банк и помогаем собрать документы на одобрение.',
  },
];

export default function AboutCompany() {
  const { data: settings } = useSiteSettings();
  const { shortName } = useSiteBrand();

  const heroImage = settingOptional(settings, 'about_platform_image') || aboutMain;
  const stats = STAT_KEYS.flatMap((s) => {
    const value = settingOptional(settings, s.key);
    return value ? [{ caption: s.caption, value }] : [];
  });
  const team = useExperts().filter((e) => e.published && e.showOnTeamPage);

  return (
    <div className="min-h-screen bg-background pb-16 lg:pb-0">
      <RedesignHeader />

      {/* Первый экран: фото под тёмным градиентом, заголовок и показатели */}
      <section className="relative overflow-hidden">
        <img
          src={heroImage}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
          loading="eager"
          decoding="async"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-graphite/95 via-graphite/75 to-graphite/55" aria-hidden />

        <div className="container-page relative z-10 py-16 sm:py-20 lg:py-28">
          <span className="inline-flex rounded-full border border-white/30 px-4 py-1.5">
            <span className="text-overline text-white/85">О компании</span>
          </span>

          <h1 className="text-display mt-6 max-w-[840px] text-white">
            Агентство недвижимости с характером Анапы
          </h1>

          <p className="mt-5 max-w-[620px] text-base leading-relaxed text-white/80 sm:text-lg">
            {shortName} работает на побережье Анапы. Знаем, чем отличается вид на море от
            «вида на море в рекламе», и какие застройщики держат сроки.
          </p>

          {stats.length > 0 && (
          <ul className="mt-10 grid grid-cols-2 gap-3 sm:mt-14 sm:gap-4 lg:grid-cols-4">
            {stats.map((s) => (
              <li
                key={s.caption}
                className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm sm:p-5"
              >
                <div className="text-2xl font-bold leading-none tabular-nums text-white sm:text-3xl">
                  {s.value}
                </div>
                <div className="mt-2 text-xs leading-snug text-white/70 sm:text-sm">{s.caption}</div>
              </li>
            ))}
          </ul>
          )}
        </div>
      </section>

      {team.length > 0 && (
        <section className="section-y pb-0" aria-labelledby="about-team-title">
          <div className="container-page">
            <h2 id="about-team-title" className="text-section-title">
              Команда
            </h2>
            <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:mt-8 lg:grid-cols-4">
              {team.map((e) => (
                <li key={e.slug}>
                  <ExpertCard expert={e} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="section-y" aria-labelledby="about-trust-title">
        <div className="container-page">
          <h2 id="about-trust-title" className="text-section-title">
            Почему нам доверяют
          </h2>

          <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TRUST_CARDS.map(({ icon: Icon, title, text }) => (
              <li
                key={title}
                className="surface-card p-6 transition-shadow hover:shadow-raised"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-soft">
                  <Icon className="h-5 w-5 text-primary" aria-hidden />
                </span>
                <h3 className="mt-5 text-base font-bold leading-snug">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section-y bg-mint" aria-labelledby="about-history-title">
        <div className="container-page grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,380px)_1fr] lg:gap-16">
          <div>
            <p className="text-overline text-primary">Наш подход</p>
            <h2 id="about-history-title" className="text-section-title mt-3">
              Знаем побережье изнутри
            </h2>
          </div>

          {/* Без цифр и дат: история компании появится, когда заказчик её подтвердит */}
          <div className="space-y-4 text-sm leading-relaxed text-mint-foreground/80 sm:text-base">
            <p>
              В команде — специалисты по подбору, ипотечные брокеры и сопровождение сделок.
              Работаем с новостройками Анапы и всего Юга.
            </p>
            <p>
              Знаем, где заканчивается городская застройка и начинается санаторная зона,
              какие дома сдаются в срок и в каких корпусах шумно летом.
            </p>
          </div>
        </div>
      </section>

      <section className="section-y" aria-labelledby="about-office-title">
        <div className="container-page">
          <div className="flex flex-col items-start gap-6 rounded-[24px] border border-border bg-card p-8 sm:p-10 lg:flex-row lg:items-center lg:justify-between lg:p-12">
            <div>
              <h2 id="about-office-title" className="text-section-title">
                Приезжайте на чашечку кофе
              </h2>
              <p className="mt-3 max-w-[560px] text-sm leading-relaxed text-muted-foreground sm:text-base">
                Покажем подборку на большом экране, разберём планировки и ответим на вопросы
                по документам. Консультация и кофе бесплатные.
              </p>
            </div>

            <Link
              to="/contacts"
              className="inline-flex h-12 shrink-0 items-center gap-2 rounded-xl bg-primary px-6 text-[15px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Адрес и контакты
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <LeadHighlightSection source="about:selection" />
      <FooterSection />
    </div>
  );
}

import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, FileCheck2, Handshake, Landmark, Youtube } from 'lucide-react';
import { useSiteSettings, settingOptional } from '@/redesign/hooks/useSiteSettings';
import { useSiteBrand } from '@/redesign/hooks/useSiteBrand';
import ExpertCard from '@/shared/experts/ExpertCard';
import { useExperts } from '@/shared/experts/useExpert';
import LazyYouTube from '@/shared/components/LazyYouTube';
import { youTubeVideoId } from '@/shared/lib/youtube';

/** Без цифр: годы, сделки и отзывы появятся, только когда их подтвердит заказчик (ТЗ v3, 4.7) */
const PROOFS = [
  { icon: FileCheck2, title: 'Проверка документов', text: 'Смотрим разрешения застройщика и документы объекта до задатка.' },
  { icon: Landmark, title: 'Ипотека', text: 'Кредитный брокер в команде: подберём банк и программу.' },
  { icon: Handshake, title: 'Сопровождение', text: 'Ведём сделку от первого показа до ключей.' },
];

/** Ключ настройки сайта со ссылкой на ролик о компании */
export const ABOUT_VIDEO_SETTING_KEY = 'about_youtube_url';

/**
 * «О компании» на главной: короткий лид, три тезиса, эксперт и видео.
 * Видео — ролик из настроек сайта; пока его нет, ведём на канал эксперта, а не в пустоту.
 */
const HomeAboutSection = () => {
  const { data: settings } = useSiteSettings();
  const { shortName } = useSiteBrand();
  const expert = useExperts().find((e) => e.published && e.showOnTeamPage);
  const videoId = youTubeVideoId(settingOptional(settings, ABOUT_VIDEO_SETTING_KEY));
  const channel = expert?.links.find((l) => l.visible && l.type === 'youtube');

  return (
    <section className="section-y bg-surface-soft" aria-labelledby="home-about-title">
      <div className="container-page grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
        <div>
          <p className="text-overline text-primary">О компании</p>
          <h2 id="home-about-title" className="text-section-title mt-2">
            {shortName}: новостройки Анапы и всего Юга
          </h2>
          <p className="text-lead mt-3 max-w-[540px]">
            Подбираем квартиру под задачу и бюджет, помогаем с ипотекой и сопровождаем сделку. Цены и наличие в каталоге обновляются из фидов застройщиков.
          </p>

          <ul className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            {PROOFS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3 rounded-card bg-card p-4 xl:flex-col">
                <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                <div>
                  <p className="text-[15px] font-semibold leading-snug">{title}</p>
                  <p className="mt-0.5 text-[14px] leading-snug text-muted-foreground">{text}</p>
                </div>
              </li>
            ))}
          </ul>

          <Link to="/about" className="mt-5 inline-flex h-11 items-center gap-1.5 text-[15px] font-medium text-primary hover:underline underline-offset-4">
            Подробнее о компании
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>

        <div className="grid content-start gap-4">
          {videoId ? (
            <LazyYouTube videoId={videoId} title={`${shortName}: о компании`} />
          ) : channel ? (
            <a
              href={channel.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-4 rounded-card bg-graphite p-5 text-graphite-foreground transition-colors hover:bg-graphite/90 sm:p-6"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/10">
                <Youtube className="h-6 w-6" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-semibold">Видеообзоры новостроек Анапы</span>
                <span className="block text-[14px] text-white/70">YouTube-канал {channel.handle ?? ''}</span>
              </span>
              <ArrowUpRight className="h-5 w-5 shrink-0 opacity-70 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
            </a>
          ) : null}
          {expert ? (
            <div>
              <p className="mb-2 text-[13px] font-medium text-muted-foreground">Ваш эксперт</p>
              <ExpertCard expert={expert} variant="row" />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
};

export default HomeAboutSection;

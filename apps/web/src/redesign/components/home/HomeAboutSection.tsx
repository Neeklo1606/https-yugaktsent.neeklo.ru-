import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Check, Youtube } from 'lucide-react';
import { useSiteSettings, settingOptional } from '@/redesign/hooks/useSiteSettings';
import { useSiteBrand } from '@/redesign/hooks/useSiteBrand';
import { btnClass } from '@/redesign/lib/button-styles';
import ExpertAvatar from '@/shared/experts/ExpertAvatar';
import { expertPath } from '@/shared/experts/expert-profile';
import { useExperts } from '@/shared/experts/useExpert';
import { prefetchHandlers } from '@/shared/lib/route-prefetch';
import LazyYouTube from '@/shared/components/LazyYouTube';
import { youTubeVideoId } from '@/shared/lib/youtube';

/** Без цифр: годы, сделки и отзывы появятся, только когда их подтвердит заказчик */
const PROOFS = ['Проверяем документы застройщика до задатка', 'Подбираем ипотеку: кредитный брокер в команде', 'Сопровождаем сделку до ключей'];

/** Ключ настройки сайта со ссылкой на ролик о компании */
export const ABOUT_VIDEO_SETTING_KEY = 'about_youtube_url';

/**
 * «О компании» на главной: портрет эксперта и короткий текст вместо стены абзацев.
 * Портрет — только настоящее фото эксперта (без него — плашка с инициалами, не чужое лицо).
 * Видео — ролик из настроек сайта; пока его нет, ведём на канал эксперта.
 */
const HomeAboutSection = () => {
  const { data: settings } = useSiteSettings();
  const { shortName } = useSiteBrand();
  const expert = useExperts().find((e) => e.published && e.showOnTeamPage);
  const videoId = youTubeVideoId(settingOptional(settings, ABOUT_VIDEO_SETTING_KEY));
  const channel = expert?.links.find((l) => l.visible && l.type === 'youtube');

  return (
    <section className="section-y bg-surface-soft" aria-labelledby="home-about-title">
      <div className="container-page grid items-center gap-8 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
        {expert ? (
          <figure className="relative mx-auto w-full max-w-[440px] md:max-w-none">
            <ExpertAvatar
              name={expert.fullName}
              photoUrl={expert.photoUrl}
              sizes="(min-width: 768px) 40vw, 90vw"
              className="aspect-[4/5] w-full rounded-sheet"
            />
            <figcaption className="absolute inset-x-3 bottom-3 rounded-card bg-card/95 px-4 py-3 shadow-card backdrop-blur-sm">
              <span className="block text-[16px] font-semibold leading-snug text-foreground">{expert.fullName}</span>
              <span className="block text-[13px] leading-snug text-muted-foreground">
                {expert.role}
                {expert.experience ? ` · ${expert.experience.toLowerCase()}` : ''}
              </span>
            </figcaption>
          </figure>
        ) : null}

        <div className="min-w-0">
          <p className="text-overline text-primary">О компании</p>
          <h2 id="home-about-title" className="text-section-title mt-2 max-w-[560px]">
            {shortName}: новостройки Анапы и всего Юга
          </h2>
          <p className="text-lead mt-3 max-w-[560px]">
            Подбираем квартиру под задачу и бюджет, помогаем с ипотекой и сопровождаем сделку. Цены и наличие обновляются из фидов застройщиков.
          </p>

          {expert?.summary ? (
            <blockquote className="mt-6 max-w-[560px] border-l-2 border-primary pl-4 text-[16px] leading-relaxed text-foreground">
              <span className="font-semibold">{expert.fullName}</span> — {expert.summary.charAt(0).toLowerCase() + expert.summary.slice(1)}
            </blockquote>
          ) : null}

          <ul className="mt-6 grid gap-2.5">
            {PROOFS.map((text) => (
              <li key={text} className="flex items-start gap-2.5 text-[15px] leading-snug text-foreground">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Check className="h-3.5 w-3.5" aria-hidden />
                </span>
                {text}
              </li>
            ))}
          </ul>

          <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            {expert ? (
              <Link to={expertPath(expert.slug)} {...prefetchHandlers('/experts/')} className={btnClass('primary', { className: 'sm:px-6' })}>
                Страница эксперта
                <ArrowRight />
              </Link>
            ) : null}
            {channel && !videoId ? (
              <a href={channel.url} target="_blank" rel="noopener noreferrer" className={btnClass('secondary', { className: 'sm:px-5' })}>
                <Youtube />
                Видеообзоры на YouTube
                <ArrowUpRight className="opacity-60" />
              </a>
            ) : null}
            <Link to="/about" className="inline-flex h-11 items-center justify-center gap-1.5 px-1 text-[15px] font-medium text-primary underline-offset-4 hover:underline">
              Подробнее о компании
            </Link>
          </div>

          {videoId ? (
            <div className="mt-7 max-w-[560px]">
              <LazyYouTube videoId={videoId} title={`${shortName}: о компании`} />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
};

export default HomeAboutSection;

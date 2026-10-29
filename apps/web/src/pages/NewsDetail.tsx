import { Link, useParams } from 'react-router-dom';
import { ChevronRight, Calendar, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import DOMPurify from 'dompurify';
import Header from '@/redesign/components/RedesignHeader';
import FooterSection from '@/components/FooterSection';
import ContactsSection from '@/components/ContactsSection';
import { apiGetOrNull } from '@/lib/api';
import complex1 from '@/assets/complex-1.jpg';
import { useEntitySeoMeta } from '@/shared/hooks/useEntitySeoMeta';

interface NewsArticle {
  id: number;
  slug: string;
  title: string;
  body: string | null;
  imageUrl: string | null;
  source: string | null;
  sourceUrl: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt?: string;
  seoTitle?: string | null;
  seoDescription?: string | null;
}

const NewsDetail = () => {
  const { slug } = useParams();

  const { data: article, isLoading } = useQuery({
    queryKey: ['news', 'detail', slug],
    queryFn: () => apiGetOrNull<NewsArticle>(`/news/${slug}`),
    enabled: !!slug,
    staleTime: 60_000,
  });

  const bodyHtml = useMemo(() => {
    if (!article?.body) return '';
    return DOMPurify.sanitize(article.body, { USE_PROFILES: { html: true } });
  }, [article?.body]);

  // SEO из админки (поля «SEO-заголовок» и «SEO-описание» новости), иначе — заголовок и начало текста
  const seo = useMemo(() => {
    if (!article) return null;
    const plain = (article.body ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const description = article.seoDescription?.trim() || plain.slice(0, 160) || article.title;
    const published = article.publishedAt ?? article.createdAt;
    const image = article.imageUrl?.startsWith('/') ? `${window.location.origin}${article.imageUrl}` : article.imageUrl;
    return {
      title: article.seoTitle?.trim() || article.title,
      description,
      pathname: `/news/${article.slug}`,
      imageUrl: image,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'NewsArticle',
        headline: article.title,
        description,
        datePublished: published,
        dateModified: article.updatedAt ?? published,
        ...(image ? { image: [image] } : {}),
      },
    };
  }, [article]);
  useEntitySeoMeta(seo);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background pb-16 lg:pb-0">
        <Header />
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="min-h-screen bg-background pb-16 lg:pb-0">
        <Header />
        <div className="max-w-[1400px] mx-auto px-4 py-20 text-center">
          <h1 className="text-2xl font-bold mb-2">Статья не найдена</h1>
          <p className="text-muted-foreground mb-4">Возможно, она была удалена или ещё не опубликована.</p>
          <Link to="/news" className="text-primary hover:underline text-sm font-medium">Все новости</Link>
        </div>
        <FooterSection />
      </div>
    );
  }

  const date = new Date(article.publishedAt ?? article.createdAt);
  const heroSrc = article.imageUrl || complex1;

  return (
    <div className="min-h-screen bg-background pb-16 lg:pb-0">
      <Header />

      <div className="max-w-[1400px] mx-auto px-4 pt-4 pb-2">
        <nav className="flex items-center gap-1.5 text-sm text-muted-foreground flex-wrap">
          <Link to="/" className="hover:text-foreground transition-colors">Главная</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <Link to="/news" className="hover:text-foreground transition-colors">Новости</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-foreground font-medium line-clamp-1">{article.title}</span>
        </nav>
      </div>

      <article className="max-w-[900px] mx-auto px-4 py-6">
        <div className="rounded-2xl overflow-hidden aspect-[16/9] mb-6">
          <img src={heroSrc} alt="" className="w-full h-full object-cover" />
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold mb-3">{article.title}</h1>

        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-6">
          <span className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4" />
            {date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })}
          </span>
          {article.source && (
            <span>
              Источник:{' '}
              {article.sourceUrl ? (
                <a href={article.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{article.source}</a>
              ) : (
                article.source
              )}
            </span>
          )}
        </div>

        {article.body && (
          <div
            className="prose prose-sm max-w-none text-foreground leading-relaxed [&_a]:text-primary [&_p]:mb-3"
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
          />
        )}
      </article>

      <ContactsSection />
      <FooterSection />
    </div>
  );
};

export default NewsDetail;

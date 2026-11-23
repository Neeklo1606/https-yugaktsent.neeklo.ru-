import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

/**
 * Каркас первого экрана страницы объекта (галерея + карточка) — пока грузятся данные.
 * Повторяет раскладку RedesignComplex / RedesignApartment, чтобы при подмене страница не прыгала.
 */
export function ObjectPageSkeleton({ label }: { label: string }) {
  return (
    <div className="max-w-[1400px] mx-auto px-4 pt-4 pb-16" role="status" aria-label={label}>
      <div className="h-4 w-48 rounded shimmer mb-4" />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="aspect-[4/3] lg:aspect-auto lg:h-[520px] rounded-2xl shimmer" />
        <div className="rounded-2xl border border-border p-5 space-y-4">
          <div className="flex gap-2">
            <div className="h-6 w-20 rounded-full shimmer" />
            <div className="h-6 w-24 rounded-full shimmer" />
          </div>
          <div className="h-7 w-4/5 rounded shimmer" />
          <div className="h-4 w-3/5 rounded shimmer" />
          <div className="h-9 w-1/2 rounded shimmer" />
          <div className="space-y-2 pt-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-4 w-full rounded shimmer" />
            ))}
          </div>
          <div className="h-11 w-full rounded-xl shimmer" />
        </div>
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** Объекта нет (404): заголовок страницы для скринридеров и поиска + путь дальше. */
export function PageNotFound({ title, text }: { title: string; text?: string }) {
  return (
    <div className="max-w-[1400px] mx-auto px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground mt-1">
        {text ?? 'Возможно, объект уже продан или ссылка устарела.'}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Button asChild className="min-h-11">
          <Link to="/catalog">Смотреть каталог</Link>
        </Button>
        <Button asChild variant="secondary" className="min-h-11">
          <Link to="/">На главную</Link>
        </Button>
      </div>
    </div>
  );
}

/** Сбой сети или сервера — не «не найдено»: даём повторить, не уводя со страницы. */
export function PageLoadError({ onRetry, retrying }: { onRetry: () => void; retrying?: boolean }) {
  return (
    <div className="max-w-[1400px] mx-auto px-4 py-16 text-center" role="alert">
      <p className="font-medium">Не удалось загрузить страницу</p>
      <p className="text-sm text-muted-foreground mt-1">Проверьте интернет и попробуйте ещё раз.</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Button type="button" onClick={onRetry} disabled={retrying} className="min-h-11">
          {retrying ? 'Загружаем…' : 'Повторить'}
        </Button>
        <Button asChild variant="secondary" className="min-h-11">
          <Link to="/catalog">В каталог</Link>
        </Button>
      </div>
    </div>
  );
}

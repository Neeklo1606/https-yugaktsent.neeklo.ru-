import { Link } from 'react-router-dom';
import { ArrowRight, ExternalLink, Loader2, UserRound } from 'lucide-react';
import ExpertAvatar from '@/shared/experts/ExpertAvatar';
import { useAdminExperts } from '@/shared/experts/useExpert';
import { expertPath } from '@/shared/experts/expert-profile';

/** Контент → Команда и эксперты: список карточек с переходом в редактор */
export default function AdminExperts() {
  const { experts, saved, isPending, isError, error, refetch } = useAdminExperts();

  return (
    <div className="max-w-4xl p-4 sm:p-6">
      <div className="mb-5">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <UserRound className="h-6 w-6 text-primary" />
          Эксперты
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Персональные страницы сотрудников: биография, каналы, видео, гайды, контакты и QR для визиток.
        </p>
      </div>

      {isPending ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Загружаем…
        </p>
      ) : null}
      {isError ? (
        <div className="mb-5 rounded-card border border-destructive/25 bg-destructive/5 p-4 text-sm" role="alert">
          <p className="font-semibold text-destructive">Не удалось загрузить экспертов с сервера</p>
          <p className="mt-1 text-muted-foreground">{error instanceof Error ? error.message : 'Ошибка сети'}</p>
          <button type="button" onClick={() => void refetch()} className="mt-2 text-primary underline">
            Повторить
          </button>
        </div>
      ) : null}

      <ul className="grid gap-3">
        {(experts ?? []).map((e) => (
          <li key={e.slug} className="surface-card flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
            <ExpertAvatar name={e.fullName} photoUrl={e.photoUrl} className="h-14 w-14" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{e.fullName}</p>
              <p className="truncate text-sm text-muted-foreground">{e.role}</p>
              <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                <span className={e.published ? 'rounded-full bg-success/10 px-2 py-0.5 text-success' : 'rounded-full bg-muted px-2 py-0.5 text-muted-foreground'}>
                  {e.published ? 'Опубликована' : 'Черновик'}
                </span>
                {e.showOnTeamPage ? <span className="rounded-full bg-surface-soft px-2 py-0.5">На странице «Команда»</span> : null}
                {!saved ? <span className="rounded-full bg-surface-soft px-2 py-0.5 text-muted-foreground">Исходные данные</span> : null}
                <span className="rounded-full bg-surface-soft px-2 py-0.5 font-mono">{expertPath(e.slug)}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <a
                href={expertPath(e.slug)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-soft"
              >
                <ExternalLink className="h-4 w-4" />
                Открыть
              </a>
              <Link
                to={`/admin/experts/${e.slug}`}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
              >
                Редактировать
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-xs text-muted-foreground">
        Правки сохраняются на сервере и сразу видны всем посетителям. Добавление новых экспертов пока не предусмотрено: адрес страницы закреплён за QR-кодами.
      </p>
    </div>
  );
}

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle2, ExternalLink, ImageOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDataQuality } from '@/admin/hooks/useDataQuality';
import { ISSUE_LABEL, imageHost, type DataIssue, type DataIssueKind } from '@/admin/lib/data-quality';

type Props = {
  /** compact — виджет «Требует внимания» на обзоре; full — полный медиа-аудит */
  variant?: 'compact' | 'full';
  className?: string;
};

function objectsLabel(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  const w = m10 === 1 && m100 !== 11 ? 'объект' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'объекта' : 'объектов';
  return `${n.toLocaleString('ru-RU')} ${w}`;
}

const ORDER: DataIssueKind[] = ['no_photos', 'photo_unreachable', 'no_price', 'no_coords', 'no_address', 'no_deadline', 'no_builder', 'no_description'];

/**
 * «Требует внимания» (ТЗ v3, 6.4): что мешает витрине выглядеть законченной.
 * Данные — реальные, из публичного каталога; чинить — в источнике или в карточке ЖК.
 */
const DataQualityPanel = ({ variant = 'full', className }: Props) => {
  const { rows, issues, isLoading, isError, probing } = useDataQuality();

  const byKind = useMemo(() => {
    const m = new Map<DataIssueKind, DataIssue[]>();
    for (const i of issues) m.set(i.kind, [...(m.get(i.kind) ?? []), i]);
    return ORDER.filter((k) => m.has(k)).map((k) => ({ kind: k, items: m.get(k)! }));
  }, [issues]);
  const critical = issues.filter((i) => i.severity === 'critical');

  if (isLoading) {
    return (
      <section className={cn('surface-card flex items-center gap-2 p-5 text-sm text-muted-foreground', className)}>
        <Loader2 className="h-4 w-4 animate-spin" /> Проверяем данные каталога…
      </section>
    );
  }
  if (isError) {
    return (
      <section className={cn('surface-card p-5 text-sm text-muted-foreground', className)}>
        Не удалось получить каталог для проверки.
      </section>
    );
  }

  if (variant === 'compact') {
    return (
      <section className={cn('surface-card p-5', className)} aria-labelledby="attention-title">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="attention-title" className="flex items-center gap-2 text-base font-semibold">
              {critical.length ? <AlertTriangle className="h-5 w-5 text-warning" /> : <CheckCircle2 className="h-5 w-5 text-success" />}
              Требует внимания
            </h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {rows.length} ЖК в каталоге · {issues.length ? `${issues.length} замечаний` : 'замечаний нет'}
              {probing ? ' · проверяем фото…' : ''}
            </p>
          </div>
          <Link to="/admin/data-sources#quality" className="inline-flex shrink-0 items-center gap-1 text-[14px] font-medium text-primary hover:underline">
            Подробнее <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        {byKind.length ? (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {byKind.slice(0, 6).map(({ kind, items }) => (
              <li key={kind} className={cn('rounded-lg px-3 py-2.5 text-[14px]', items[0].severity === 'critical' ? 'bg-warning-soft' : 'bg-surface-soft')}>
                <span className="font-semibold tabular-nums">{items.length}</span> · {ISSUE_LABEL[kind]}
                <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">{items.map((i) => i.blockName).join(', ')}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    );
  }

  return (
    <section id="quality" className={cn('scroll-mt-20', className)} aria-labelledby="quality-title">
      <h2 id="quality-title" className="text-lg font-semibold">Медиа и качество данных</h2>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Проверка по публичному каталогу: {rows.length} ЖК. Фото проверяются загрузкой в браузере.{probing ? ' Идёт проверка фото…' : ''}
      </p>

      <div className="mt-4 overflow-hidden rounded-card border border-border bg-card">
        <table className="w-full text-left text-[14px]">
          <thead className="bg-surface-soft text-[12px] text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">ЖК</th>
              <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Фото</th>
              <th className="px-4 py-2.5 font-medium">Замечания</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((b) => {
              const own = issues.filter((i) => i.blockId === b.id);
              const host = imageHost(b.images?.[0]?.url);
              const photoIssue = own.find((i) => i.kind === 'no_photos' || i.kind === 'photo_unreachable');
              return (
                <tr key={b.id} className="align-top">
                  <td className="px-4 py-3">
                    <a href={`/complex/${b.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium hover:text-primary">
                      {b.name}
                      <ExternalLink className="h-3.5 w-3.5 opacity-60" />
                    </a>
                    <span className="block text-[12px] text-muted-foreground">{objectsLabel(b._count?.listings ?? 0)}</span>
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    {photoIssue ? (
                      <span className="inline-flex items-center gap-1.5 text-warning">
                        <ImageOff className="h-4 w-4" />
                        {photoIssue.kind === 'no_photos' ? 'нет в фиде' : 'не грузится'}
                      </span>
                    ) : (
                      <span className="text-success">{b.images?.length ?? 0} шт.</span>
                    )}
                    {host ? <span className="block text-[12px] text-muted-foreground">{host}</span> : null}
                  </td>
                  <td className="px-4 py-3">
                    {own.length ? (
                      <ul className="flex flex-wrap gap-1.5">
                        {own.map((i) => (
                          <li key={i.kind} className={cn('rounded-full px-2 py-0.5 text-[12px]', i.severity === 'critical' ? 'bg-warning-soft text-warning' : 'bg-surface-soft text-foreground')}>
                            {i.message}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-success">В порядке</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[12px] text-muted-foreground">
        Чужие фото в замену не подставляются: ЖК без фото не попадает в подборки главной и показывается в каталоге с нейтральной заглушкой.
      </p>
    </section>
  );
};

export default DataQualityPanel;

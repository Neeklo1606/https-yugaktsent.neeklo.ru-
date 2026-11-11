import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import RedesignHeader from '@/redesign/components/RedesignHeader';
import FooterSection from '@/components/FooterSection';
import { useSiteContacts } from '@/shared/hooks/useSiteContacts';

/** Дата редакции юридических документов сайта. Меняется вместе с их текстом. */
export const LEGAL_EDITION = '11 ноября 2026 г.';

export const LEGAL_DOCS = [
  { to: '/privacy', label: 'Политика обработки персональных данных' },
  { to: '/personal-data-consent', label: 'Согласие на обработку персональных данных' },
  { to: '/cookies', label: 'Cookie и аналитика' },
  { to: '/terms', label: 'Пользовательское соглашение' },
] as const;

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Сведения об операторе — только из настроек сайта. Если реквизиты не заполнены,
 * честно пишем, что они уточняются, а не подставляем выдуманные.
 */
export function OperatorRequisites() {
  const { brandName, legalEntity, inn, ogrn, legalAddress, address, email, phone } = useSiteContacts();
  const rows: [string, string | undefined][] = [
    ['Оператор', legalEntity],
    ['ИНН', inn],
    ['ОГРН / ОГРНИП', ogrn],
    ['Адрес', legalAddress ?? address],
    ['Электронная почта для обращений', email],
    ['Телефон', phone],
  ];
  const missing = !legalEntity || !inn;
  return (
    <div className="rounded-card border border-border bg-card p-4 text-sm">
      <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[220px_1fr]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-foreground">{v ?? <span className="text-muted-foreground">уточняется</span>}</dd>
          </div>
        ))}
      </dl>
      {missing ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Сайт агентства недвижимости «{brandName}». Полные реквизиты оператора публикуются после их
          подтверждения. До этого обращения по персональным данным принимаются по контактам выше
          и на странице <Link to="/contacts" className="underline underline-offset-2">«Контакты»</Link>.
        </p>
      ) : null}
    </div>
  );
}

export default function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background pb-16 lg:pb-0">
      <RedesignHeader />
      <main className="mx-auto max-w-[800px] px-4 py-8 sm:py-12">
        <h1 className="mb-2 text-2xl font-bold sm:text-3xl">{title}</h1>
        <p className="mb-8 text-sm text-muted-foreground">Редакция от {LEGAL_EDITION}</p>
        <div className="space-y-6 text-[15px] leading-relaxed text-muted-foreground [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1">
          {children}
        </div>
        <nav aria-label="Документы" className="mt-10 border-t border-border pt-6">
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {LEGAL_DOCS.map((d) => (
              <li key={d.to} className="list-none">
                <Link to={d.to} className="text-primary underline-offset-2 hover:underline">{d.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </main>
      <FooterSection />
    </div>
  );
}

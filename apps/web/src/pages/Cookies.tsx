import { Link } from 'react-router-dom';
import RedesignHeader from '@/redesign/components/RedesignHeader';
import FooterSection from '@/components/FooterSection';
import { useSiteContacts } from '@/shared/hooks/useSiteContacts';

/** Что сайт хранит в браузере — по факту кода, без выдуманных сервисов */
const STORED: { what: string; why: string }[] = [
  { what: 'Избранное', why: 'Список сохранённых объектов, чтобы он не пропадал между визитами. Регистрация не нужна.' },
  { what: 'Выбранный город', why: 'Чтобы каталог и главная сразу открывались в вашем регионе.' },
  { what: 'Недавно просмотренное', why: 'Чтобы быстро вернуться к объектам, которые вы уже смотрели.' },
  { what: 'Справочники каталога', why: 'Копия списков городов и фильтров, чтобы страницы открывались быстрее.' },
  { what: 'Вход сотрудника', why: 'Только для сотрудников агентства в служебном разделе: держит сеанс входа.' },
];

const Cookies = () => {
  const { brandName, siteDomain, legalEntity, email, phone } = useSiteContacts();
  const operator = legalEntity ?? brandName;
  const contactParts = [email, phone].filter(Boolean).join(', ');

  return (
    <div className="min-h-screen bg-background pb-16 lg:pb-0">
      <RedesignHeader />
      <div className="max-w-[800px] mx-auto px-4 py-8 sm:py-12">
        <h1 className="text-2xl sm:text-3xl font-bold mb-8">Политика использования cookie</h1>
        <div className="prose prose-sm max-w-none text-muted-foreground space-y-6">
          <section>
            <h2 className="text-lg font-bold text-foreground">1. Что это</h2>
            <p>
              Cookie и локальное хранилище браузера — небольшие файлы и записи, которые сайт
              {siteDomain ? ` ${siteDomain}` : ''} сохраняет на вашем устройстве. Оператор сайта — {operator}.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-foreground">2. Что мы храним и зачем</h2>
            <ul className="list-disc pl-5 space-y-2">
              {STORED.map((row) => (
                <li key={row.what}>
                  <span className="font-medium text-foreground">{row.what}.</span> {row.why}
                </li>
              ))}
            </ul>
            <p>
              Эти данные нужны для работы сайта, остаются в вашем браузере и не передаются третьим лицам.
              Рекламных cookie сайт не использует.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-foreground">3. Аналитика</h2>
            <p>
              Если на сайте подключены сервисы веб-аналитики (например, Яндекс Метрика), они используют
              cookie для обезличенной статистики посещений: какие страницы смотрят и откуда приходят.
              Эти данные помогают делать сайт удобнее.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-foreground">4. Как отключить</h2>
            <p>
              Cookie и локальное хранилище можно удалить или запретить в настройках браузера. Сайт продолжит
              работать, но избранное, выбранный город и история просмотров перестанут сохраняться.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-foreground">5. Персональные данные</h2>
            <p>
              Как мы обрабатываем имя и телефон из форм заявок, описано в{' '}
              <Link to="/privacy" className="text-primary underline underline-offset-2">политике конфиденциальности</Link>.
              {contactParts ? ` Вопросы можно задать: ${contactParts}.` : ''}
            </p>
          </section>
        </div>
      </div>
      <FooterSection />
    </div>
  );
};

export default Cookies;

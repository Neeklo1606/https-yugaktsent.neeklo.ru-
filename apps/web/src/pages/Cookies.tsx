import { Link } from 'react-router-dom';
import LegalLayout, { LegalSection } from '@/pages/legal/LegalLayout';
import { COOKIE_NOTICE_STORAGE_KEY } from '@/shared/components/CookieBanner';
import { useSiteSettings, settingOptional } from '@/redesign/hooks/useSiteSettings';
import { ANALYTICS_CONSENT_KEY, writeAnalyticsConsent } from '@/shared/lib/analytics-consent';

/** Раздел «Аналитика» зависит от «Интеграций»: счётчик подключён — описываем его и даём отказаться */
function AnalyticsSection() {
  const { data: settings } = useSiteSettings();
  const metrika = settingOptional(settings, 'yandex_metrika_id');
  if (!metrika) {
    return (
      <p>
        Сейчас счётчики посещаемости (например, Яндекс Метрика) на сайте не установлены. Если они
        появятся, эта страница будет обновлена до их подключения, а посетитель сможет отказаться от
        аналитических cookie, не теряя доступа к сайту.
      </p>
    );
  }
  return (
    <>
      <p>
        Сайт использует Яндекс Метрику (ООО «Яндекс»), чтобы считать посещения и понимать, какие страницы полезны.
        Счётчик включается только после вашего согласия в баннере cookie («Принять») и не загружается, если вы выбрали
        «Только нужные». Метрика получает обезличенные данные о визите: страницы, источник перехода, тип устройства.
        Запись выбора — <code>{ANALYTICS_CONSENT_KEY}</code>.
      </p>
      <p>
        <button type="button" className="text-primary underline underline-offset-2" onClick={() => writeAnalyticsConsent('no')}>
          Отказаться от аналитики
        </button>{' '}
        — после перезагрузки страницы счётчик больше не загрузится.
      </p>
    </>
  );
}

/**
 * Инвентаризация того, что сайт хранит в браузере и какие сторонние сервисы загружает —
 * по факту кода (grep localStorage/sessionStorage, внешние домены). Счётчиков аналитики и
 * рекламных пикселей на сайте нет; при их подключении нужен выбор посетителя и обновление страницы.
 */
const STORAGE: { name: string; purpose: string; term: string }[] = [
  { name: 'lg_favorites_guest_v2', purpose: 'Избранные квартиры и ЖК', term: 'Пока вы не очистите браузер' },
  { name: 'lg_region_id', purpose: 'Выбранный город', term: 'Пока вы не очистите браузер' },
  { name: 'lg_browse_history_v1', purpose: 'Недавно просмотренные объекты', term: 'Пока вы не очистите браузер' },
  { name: 'yug_qcache:*', purpose: 'Копия справочников каталога, чтобы страницы открывались быстрее', term: 'До суток' },
  { name: COOKIE_NOTICE_STORAGE_KEY, purpose: 'Отметка, что вы закрыли уведомление о cookie', term: 'Пока вы не очистите браузер' },
  { name: 'lg_inquiry_threads', purpose: 'Номер вашей заявки, чтобы показать её статус на этом устройстве', term: 'Пока вы не очистите браузер' },
  { name: 'yug_utm_v1', purpose: 'Метки рекламной кампании, с которой вы пришли (без личных данных)', term: 'До закрытия вкладки' },
  { name: 'chunk_reload_at', purpose: 'Перезагрузка страницы после обновления сайта', term: 'До закрытия вкладки' },
  { name: 'lg_access_token, lg_refresh_token, lg_user', purpose: 'Сеанс входа — только у сотрудников агентства в служебном разделе', term: 'До выхода или окончания сеанса' },
];

const THIRD_PARTY: { name: string; where: string; data: string }[] = [
  {
    name: 'Яндекс Карты (ООО «Яндекс», Россия)',
    where: 'Карта каталога, страницы ЖК и «Контакты»',
    data: 'При показе карты браузер загружает её с серверов Яндекса; Яндекс получает IP-адрес и может установить свои cookie по своим правилам',
  },
  {
    name: 'YouTube (Google LLC)',
    where: 'Видео о компании',
    data: 'Видео не загружается, пока вы не нажмёте «Смотреть». После нажатия проигрыватель открывается в режиме youtube-nocookie.com',
  },
];

const Cookies = () => (
  <LegalLayout title="Cookie и аналитика">
    <LegalSection title="1. Что сайт хранит в браузере">
      <p>
        Сайт не использует рекламные cookie и счётчики аналитики. В браузере хранятся только записи,
        без которых не работают избранное, выбор города и служебный раздел. Они не передаются третьим
        лицам и не используются для рекламы.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-foreground">
              <th className="py-2 pr-3 font-semibold">Запись</th>
              <th className="py-2 pr-3 font-semibold">Зачем</th>
              <th className="py-2 font-semibold">Срок</th>
            </tr>
          </thead>
          <tbody className="align-top">
            {STORAGE.map((r) => (
              <tr key={r.name} className="border-b border-border">
                <td className="py-2 pr-3 font-mono text-xs text-foreground">{r.name}</td>
                <td className="py-2 pr-3">{r.purpose}</td>
                <td className="py-2">{r.term}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </LegalSection>

    <LegalSection title="2. Сторонние сервисы">
      <ul>
        {THIRD_PARTY.map((t) => (
          <li key={t.name}>
            <span className="font-medium text-foreground">{t.name}.</span> {t.where}. {t.data}.
          </li>
        ))}
      </ul>
    </LegalSection>

    <LegalSection title="3. Аналитика">
      <AnalyticsSection />
    </LegalSection>

    <LegalSection title="4. Как удалить или запретить">
      <p>
        Записи можно удалить в настройках браузера («Очистить данные сайтов»). Сайт продолжит работать,
        но избранное, выбранный город и история просмотров сбросятся.
      </p>
    </LegalSection>

    <LegalSection title="5. Персональные данные">
      <p>
        Как обрабатываются имя и телефон из форм заявок, описано в{' '}
        <Link to="/privacy" className="underline underline-offset-2">Политике обработки персональных данных</Link>.
      </p>
    </LegalSection>
  </LegalLayout>
);

export default Cookies;

import RedesignHeader from '@/redesign/components/RedesignHeader';
import FooterSection from '@/components/FooterSection';
import { Link } from 'react-router-dom';
import { useSiteContacts } from '@/shared/hooks/useSiteContacts';
import { typo } from '@/shared/lib/typography';

/**
 * Пользовательское соглашение. Текст общий для информационного сайта
 * агентства: реквизиты подставляются из настроек, выдуманных нет.
 */
const Terms = () => {
  const { brandName, siteDomain, legalEntity, email, phone } = useSiteContacts();
  const operator = legalEntity ?? brandName;
  const site = siteDomain ? `«${siteDomain}»` : 'настоящий сайт';
  const contactParts = [email, phone].filter(Boolean).join(', ');

  return (
    <div className="min-h-screen bg-background pb-16 lg:pb-0">
      <RedesignHeader />
      <div className="mx-auto max-w-[800px] px-4 py-8 sm:py-12">
        <h1 className="mb-3 text-2xl font-bold sm:text-3xl">Пользовательское соглашение</h1>
        <p className="mb-8 text-sm text-muted-foreground">
          {typo(`Условия использования сайта ${operator}.`)}
        </p>

        <div className="space-y-6 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="mb-2 text-lg font-bold text-foreground">1. Предмет соглашения</h2>
            <p>
              {typo(
                `Соглашение регулирует отношения между ${operator} (далее Оператор) и посетителем сайта ${site} (далее Пользователь). Начало использования сайта означает согласие с условиями в полном объёме.`,
              )}
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-bold text-foreground">2. Назначение сайта</h2>
            <p>
              {typo(
                'Сайт носит информационный характер и предназначен для ознакомления с объектами недвижимости, подбора вариантов и обращения за консультацией.',
              )}
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-bold text-foreground">3. Статус размещённых сведений</h2>
            <p>
              {typo(
                'Описания объектов, планировки, сроки сдачи и цены публикуются на основании данных застройщиков и обновляются автоматически. Эти сведения не являются публичной офертой по статье 437 Гражданского кодекса РФ. Актуальную стоимость, наличие и условия приобретения необходимо уточнять у менеджера перед заключением договора.',
              )}
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-bold text-foreground">4. Обязанности пользователя</h2>
            <p>
              {typo(
                'Пользователь обязуется предоставлять достоверные данные в формах обратной связи, не предпринимать действий, нарушающих работу сайта, и не использовать его содержимое для автоматизированного сбора данных без письменного разрешения Оператора.',
              )}
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-bold text-foreground">5. Интеллектуальная собственность</h2>
            <p>
              {typo(
                'Оформление сайта, тексты, подборки и структура каталога принадлежат Оператору. Копирование материалов в коммерческих целях без согласия Оператора не допускается. Изображения объектов принадлежат правообладателям и используются для информирования покупателей.',
              )}
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-bold text-foreground">6. Персональные данные</h2>
            <p>
              {typo('Порядок обработки персональных данных описан в отдельном документе: ')}
              <Link to="/privacy" className="text-primary underline-offset-4 hover:underline">
                Политика обработки персональных данных
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-bold text-foreground">7. Ответственность</h2>
            <p>
              {typo(
                'Оператор не несёт ответственности за решения, принятые Пользователем на основании информации сайта без предварительной проверки у менеджера, а также за временную недоступность сайта по причинам, не зависящим от Оператора.',
              )}
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-bold text-foreground">8. Изменение условий</h2>
            <p>
              {typo(
                'Оператор вправе изменять соглашение. Новая редакция вступает в силу с момента публикации на сайте.',
              )}
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-bold text-foreground">9. Контакты</h2>
            <p>
              {typo('По вопросам, связанным с работой сайта, обращайтесь')}
              {contactParts ? `: ${contactParts}.` : ' через раздел «Контакты».'}
            </p>
          </section>
        </div>
      </div>
      <FooterSection />
    </div>
  );
};

export default Terms;

import { Check } from 'lucide-react';
import LeadForm from '@/shared/components/LeadForm';
import { typo } from '@/shared/lib/typography';

type Props = {
  /** Метка источника заявки: с какой страницы пришла */
  source?: string;
};

/**
 * Лид-блок «Получите подборку»: тёмная панель слева, карточка формы справа.
 * Держим компактным, чтобы весь блок помещался в один экран без прокрутки:
 * форма должна быть видна одновременно с заголовком.
 */
const LeadHighlightSection = ({ source = 'home:selection' }: Props) => (
  <section className="section-y" aria-labelledby="lead-highlight-title">
    <div className="container-page">
      <div className="overflow-hidden rounded-sheet bg-graphite">
        <div className="grid items-center gap-0 lg:grid-cols-[1fr_minmax(360px,440px)]">
          <div className="flex flex-col justify-center p-5 pb-1 sm:p-9 lg:p-12">
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-white">
              <Check className="h-3.5 w-3.5 shrink-0" />
              <span className="text-overline">Персональный подбор</span>
            </span>

            <h2 id="lead-highlight-title" className="text-section-title mt-4 text-white">
              {typo('Получите подборку объектов под ваш бюджет')}
            </h2>

            <p className="mt-3 max-w-[470px] text-[15px] leading-relaxed text-white/70">
              {typo(
                'Расскажите о задаче, и мы пришлём несколько точных вариантов от прямых застройщиков Анапы с проверенными документами.',
              )}
            </p>
          </div>

          <div className="p-4 sm:p-6 lg:py-6 lg:pl-0 lg:pr-6">
            <div className="rounded-card bg-card p-4 shadow-overlay sm:p-6">
              <h3 className="text-lg font-bold leading-tight">Оставьте контакты</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {typo('Менеджер перезвонит и уточнит детали.')}
              </p>

              <div className="mt-4">
                <LeadForm
                  embedded
                  title=""
                  source={source}
                  requestType="SELECTION"
                  submitLabel="Получить подборку"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
);

export default LeadHighlightSection;

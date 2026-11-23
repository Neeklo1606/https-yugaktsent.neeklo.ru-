import { useState } from 'react';
import { Check } from 'lucide-react';
import RedesignHeader from '@/redesign/components/RedesignHeader';
import FooterSection from '@/components/FooterSection';
import ConsultationFlow from '@/redesign/components/ConsultationFlow';
import MortgageCalculator from '@/redesign/components/mortgage/MortgageCalculator';
import LeadForm from '@/shared/components/LeadForm';
import { useSiteSettings } from '@/redesign/hooks/useSiteSettings';
import { useDefaultRegionId } from '@/redesign/hooks/useDefaultRegionId';
import { typo } from '@/shared/lib/typography';

const HOW_WE_HELP = [
  'Подберём программу и банк под ваш доход и семью — семейная, IT или базовая ипотека.',
  'Сравним условия банков и подскажем, где одобрение вероятнее.',
  'Проверим документы застройщика и квартиры до сделки.',
  'Сопроводим сделку до регистрации.',
];

const RedesignMortgage = () => {
  const [leadOpen, setLeadOpen] = useState(false);
  const [calcSummary, setCalcSummary] = useState<string | undefined>();

  return (
    <div className="min-h-screen bg-background">
      <RedesignHeader />
      <main id="main">
        <section className="container-page pb-8 pt-6 sm:pt-10 lg:pb-12">
          <h1 className="text-section-title">{typo('Ипотека на новостройки юга')}</h1>
          <p className="text-lead mt-2 max-w-[640px]">
            {typo('Посчитайте платёж и оставьте заявку — подберём банк и программу с лучшей ставкой.')}
          </p>

          <MortgageCalculator
            className="mt-6 lg:mt-8"
            title="Рассчитайте платёж"
            onLead={(summary) => {
              setCalcSummary(summary);
              setLeadOpen(true);
            }} />
        </section>

        <section className="container-page pb-10 lg:pb-16" aria-labelledby="mortgage-help-title">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)] lg:gap-10">
            <div>
              <h2 id="mortgage-help-title" className="text-title">
                Как мы помогаем
              </h2>
              <ul className="mt-4 grid gap-3">
                {HOW_WE_HELP.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-[15px] leading-relaxed">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Check className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    {typo(item)}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
              <h2 className="text-lg font-bold leading-tight">Подобрать ипотеку</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {typo('Оставьте телефон — специалист перезвонит и рассчитает условия в банках.')}
              </p>
              <div className="mt-4">
                <LeadForm embedded title="" source="Ипотека" requestType="MORTGAGE" submitLabel="Подобрать ипотеку" />
              </div>
            </div>
          </div>
        </section>
      </main>
      <FooterSection reserveMobileNav />

      <ConsultationFlow
        open={leadOpen}
        onOpenChange={setLeadOpen}
        context={{ surface: 'home', source: 'Ипотека: калькулятор', requestType: 'MORTGAGE', title: 'Подобрать ипотеку', contextFooter: calcSummary }}
      />
    </div>
  );
};

export default RedesignMortgage;

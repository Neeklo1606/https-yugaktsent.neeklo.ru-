import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { usePhoneAction } from '@/redesign/hooks/usePhoneAction';
import {
  CONVERSION_CTA,
  CONVERSION_CTA_ICON,
  type ConsultationContext,
} from '@/redesign/lib/conversion-cta';
import { conversionObsCtaClick } from '@/redesign/lib/conversion-observability';
import { Send } from 'lucide-react';
import { useSiteSettings, settingOptional } from '@/redesign/hooks/useSiteSettings';

type Props = {
  context: ConsultationContext;
  disabled?: boolean;
  className?: string;
  /** stack — колонка (сайдбар, карта); row — в ряд на широких экранах; bar — нижняя панель телефона */
  layout?: 'row' | 'stack' | 'bar';
  size?: 'default' | 'sm';
  /** Primary consultation label override */
  consultationLabel?: string;
  /** Show phone button (default true) */
  showPhone?: boolean;
  onConsultation: (ctx: ConsultationContext) => void;
};

function consultationLabelContent(
  fullLabel: string,
  layout: 'row' | 'stack' | 'bar',
): ReactNode {
  const shortLabel =
    fullLabel === CONVERSION_CTA.viewing ? CONVERSION_CTA.viewingShort : fullLabel;

  if (layout === 'stack' || shortLabel === fullLabel) {
    return fullLabel;
  }

  return (
    <>
      <span className="sm:hidden">{fullLabel}</span>
      <span className="hidden sm:inline">{shortLabel}</span>
    </>
  );
}

const ConversionCTABar = ({
  context,
  disabled = false,
  className,
  layout = 'stack',
  size = 'default',
  consultationLabel,
  showPhone = true,
  onConsultation,
}: Props) => {
  const { handlePhoneClick, isAvailable } = usePhoneAction();
  const { data: settings } = useSiteSettings();
  // Канал связи из настроек сайта; пока его нет — кнопку не показываем, а не ведём в никуда
  const telegramUrl = settingOptional(settings, 'telegram_url');
  const PhoneIcon = CONVERSION_CTA_ICON.phone;
  const ConsultIcon = CONVERSION_CTA_ICON.consultation;
  const btnSize = size === 'sm' ? 'sm' : 'default';

  const consultLabel =
    consultationLabel ??
    (context.requestType === 'CALLBACK'
      ? CONVERSION_CTA.callback
      : context.sold
        ? CONVERSION_CTA.consultation
        : CONVERSION_CTA.viewing);

  const openConsult = (ctx: ConsultationContext) => {
    conversionObsCtaClick('consultation', ctx.surface);
    onConsultation(ctx);
  };

  const callPhone = () =>
    handlePhoneClick({
      context,
      onFallbackConsultation: (fallbackCtx) => onConsultation(fallbackCtx),
    });

  // Нижняя панель телефона: одна строка — главное действие и две иконки (ТЗ v3, 4.6)
  if (layout === 'bar') {
    return (
      <div className={cn('flex items-stretch gap-2', className)}>
        <Button type="button" variant="primary" className="min-w-0 flex-1" disabled={disabled} onClick={() => openConsult(context)}>
          <span className="truncate">{consultLabel}</span>
        </Button>
        {showPhone ? (
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="h-12 w-12 shrink-0"
            disabled={disabled || context.sold}
            onClick={callPhone}
            aria-label={CONVERSION_CTA.phone}
            title={!isAvailable ? 'Телефон недоступен, откроется форма обратного звонка' : CONVERSION_CTA.phone}
          >
            <PhoneIcon />
          </Button>
        ) : null}
        {telegramUrl ? (
          <Button variant="secondary" size="icon" className="h-12 w-12 shrink-0" asChild>
            <a href={telegramUrl} target="_blank" rel="noopener noreferrer" aria-label="Написать в Telegram" title="Telegram">
              <Send />
            </a>
          </Button>
        ) : null}
      </div>
    );
  }

  const btnClass = cn(
    'w-full min-w-0 whitespace-normal text-center leading-snug',
    layout === 'row' && 'sm:flex-1',
  );

  return (
    <div
      className={cn(
        'flex flex-col gap-2',
        layout === 'row' && 'sm:flex-row sm:items-stretch',
        className,
      )}
    >
      <Button
        type="button"
        variant="primary"
        size={btnSize}
        className={btnClass}
        disabled={disabled}
        onClick={() => openConsult(context)}
        title={consultLabel}
      >
        <ConsultIcon className="shrink-0" />
        {consultationLabelContent(consultLabel, layout)}
      </Button>
      {showPhone ? (
        <Button
          type="button"
          variant="secondary"
          size={btnSize}
          className={btnClass}
          disabled={disabled || context.sold}
          onClick={callPhone}
          title={!isAvailable ? 'Телефон недоступен, откроется форма обратного звонка' : undefined}
        >
          <PhoneIcon className="shrink-0" />
          {CONVERSION_CTA.phone}
        </Button>
      ) : null}
      {telegramUrl ? (
        <Button variant="secondary" size={btnSize} className={btnClass} asChild>
          <a href={telegramUrl} target="_blank" rel="noopener noreferrer">
            <Send className="shrink-0" />
            Telegram
          </a>
        </Button>
      ) : null}
    </div>
  );
};

export default ConversionCTABar;

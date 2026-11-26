import { useId } from 'react';
import { Link } from 'react-router-dom';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export type PrivacyConsentProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  error?: string | null;
  className?: string;
  /** Override auto-generated id when multiple blocks appear in one form. */
  id?: string;
};

const PrivacyConsent = ({
  checked,
  onCheckedChange,
  error,
  className,
  id: idProp,
}: PrivacyConsentProps) => {
  const autoId = useId();
  const id = idProp ?? `privacy-consent${autoId}`;
  const errorId = `${id}-error`;

  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-start gap-2.5">
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={(value) => onCheckedChange(value === true)}
          // Квадрат 18 px (не круг — не путать с радиокнопкой), зона нажатия на телефоне — 42 px
          className="relative mt-0.5 h-[18px] w-[18px] rounded-[4px] after:absolute after:-inset-3 after:content-['']"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        <Label
          htmlFor={id}
          className="text-xs sm:text-sm text-neutral-500 font-normal leading-snug cursor-pointer"
        >
          Даю{' '}
          <Link
            to="/personal-data-consent"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 transition-colors hover:text-primary"
            onClick={(e) => e.stopPropagation()}
          >
            согласие на обработку персональных данных
          </Link>{' '}
          и подтверждаю, что ознакомлен(а) с{' '}
          <Link
            to="/privacy"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 transition-colors hover:text-primary"
            onClick={(e) => e.stopPropagation()}
          >
            политикой обработки персональных данных
          </Link>
        </Label>
      </div>
      {error ? (
        <p id={errorId} className="text-xs text-destructive pl-6" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
};

/** Подсказка под неактивной кнопкой отправки: почему её нельзя нажать */
export const ConsentSubmitHint = ({
  show,
  id,
  className,
}: {
  show: boolean;
  id?: string;
  className?: string;
}) =>
  show ? (
    <p id={id} className={cn('text-center text-xs text-muted-foreground', className)}>
      Отметьте согласие на обработку данных
    </p>
  ) : null;

export default PrivacyConsent;
